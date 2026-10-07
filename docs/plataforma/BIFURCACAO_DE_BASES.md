# Bifurcação de bases — um sistema, mais de um Oracle

**Situação:** desenho aprovado em conversa em 07/10/2026; **aguardando revisão escrita** antes
do plano de implementação. Todo o trabalho vive na branch `feat/bifurcacao-de-bases` e **não
sobe** até ser testado de ponta a ponta.

Hoje o sistema fala com um Oracle só, o da Época. Esta spec faz o **login escolher a base**
(Época Distribuição ou Minas Rural, e uma terceira quando vier), trocando host, porta, usuário
e credencial do banco, e carregando junto as regras que mudam de uma base para outra.

---

## 1. O que precisa ser verdade

> **Nenhuma apuração, login ou detalhamento roda na base errada** — nem por token trocado,
> cookie antigo, cache do navegador, ou duas pessoas com a mesma matrícula em bases
> diferentes. A matrícula `144` da Época e a `144` do Minas Rural são pessoas diferentes.

E o corolário que protege o que já funciona: **a Época não muda.** Cada passo da entrega deixa
a Época produzindo exatamente o que produz hoje.

## 2. Decisões tomadas

| Decisão | Escolha | Por quê |
|---|---|---|
| Trocar de base | **exige novo login** | o token carrega uma base só; não existe estado em que a tela mostra uma e a API consulta outra. É o que o Delphi faz hoje |
| Onde a base é resolvida | **uma API, base dentro do token assinado** | o cookie já é `HttpOnly`; o cliente não consegue alterá-lo. Descartadas: uma API por base (dobra hospedagem) e base em cabeçalho a cada chamada (o cliente decide cada consulta) |
| Diferenças entre bases | **objeto `RegrasDaBase` tipado**, vindo da configuração | uma lista legível do que difere; uma terceira base entra sem mexer em consulta. O Delphi usa `if bBaseMRURAL` espalhado — é como nasceram os 8 `1601` fixos |
| Filiais do Minas Rural | **todas**, inclusive a `2` e as `**FECHOU**` | a consulta do Delphi mora no `.dfm`, que não veio. Compara-se com a lista da tela dele e esconde-se só o que a 9815 esconde |
| Regras do Minas Rural | **sobe com os valores da Época**, e liga-se uma de cada vez | o interruptor serve de instrumento de medição — ver §9 |

---

## 3. O registro de bases e a conexão

**Configuração.** O que não é segredo vai no `appsettings.json`; a string de conexão fica em
`ConnectionStrings`, que o git ignora:

```json
"Bases": {
  "Epoca":      { "Rotulo": "Época Distribuição", "Regras": { "SecaoSemCusto": 1601, "AgrupaIcms": false } },
  "MinasRural": { "Rotulo": "Minas Rural",        "Regras": { "SecaoSemCusto": 1601, "AgrupaIcms": false } }
},
"ConnectionStrings": { "OracleEpoca": "…", "OracleMinasRural": "…" }
```

A chave da conexão é `"Oracle" + id`. A `OracleEpoca` que já existe nos ambientes **continua
valendo sem alteração**; só se acrescenta a do Minas Rural. Os valores do Minas Rural acima
estão **propositalmente iguais aos da Época** (§9).

**`RegistroDeBases`** é um singleton montado no boot, só com as bases que **têm** string de
conexão. Quem não configurou o Minas Rural simplesmente não o vê no login, e a API sobe do
mesmo jeito. A lista fechada é o que impede o login de aceitar uma base inventada.

**A conexão.** A fábrica deixa de ler uma string fixa e recebe a base. Cada base tem o seu pool
do ODP.NET, porque o pool já é por string de conexão. Os repositórios pedem a base a um
`IBaseAtual` (escopo de requisição), que lê o claim do token. **Sem claim, a consulta não
roda** — não existe "a Época por padrão".

## 4. O login e o token

- **`GET /api/auth/bases`** (público) devolve `[{ id, rotulo }]`. Sem host, usuário nem string
  de conexão.
- **`POST /api/auth/login`** ganha `base`, **obrigatória**. Vazia ou fora do registro, é erro
  claro; **nunca cai na Época por omissão**. O `AutenticacaoRepository` recebe a base por
  parâmetro (ainda não há token) e as consultas de credencial e de filiais rodam naquela base,
  então a permissão da 9815 (`PCCONTRO`, `PCCONTROI`, `PCLIB`) sai do cadastro de lá.
- **O token** ganha o claim `base`; o `UsuarioDto` devolve `{ id, rotulo }`. Na validação do
  JWT, token **sem** o claim, ou com base que saiu da configuração, é recusado — o que resolve
  os tokens emitidos antes desta mudança.
- **A identidade é o par `(base, matrícula)`.** Todo log de login registra a base.
- **A mensagem de credencial inválida diz a base**: *"Usuário ou senha incorretos na base
  Minas Rural."* O rótulo é público, e o engano mais provável agora é escolher a base errada.
  Os motivos mais finos (inativo, sem senha) só aparecem depois de a senha provada, como hoje.
- **O cookie é único.** Entrar numa base substitui a sessão anterior.

## 5. As regras por base

Cada campo corresponde a um literal que hoje está fixo no código. Não há campo "por
precaução".

| Campo | Hoje no código | Época | Minas Rural — **o que o fonte indica**, e não o valor de partida (§3 e §9) |
|---|---|---|---|
| `SecaoSemCusto` | `1601` em 8 lugares | 1601 | 1401 |
| `AgrupaIcms` | não existe | não | sim |
| `FiliaisForaDoFiltro` | `NOT IN ('20','31','35','91')` | esses quatro | nenhuma, por ora |
| `FiliaisForaDaPermissao` | `NOT IN (2, 99)` no `PCLIB` | 2 e 99 | nenhuma, por ora |

**Como entram no SQL.** Os `1601` estão em cinco constantes (`FaturamentoPorMes`,
`ReceitaPorCliente`, `DevolucaoPorMotivo`, `NotasDaDevolucao`, `ImpostoPorProduto`), todas
passando por `string.Format`. Cada literal vira um marcador (`@@SECAO_SEM_CUSTO@@`) e uma
função só, `regras.Aplicar(sql)`, troca todos **antes** do `Format`. **Marcador que sobrar dá
erro de sintaxe no Oracle** em vez de manter o `1601` calado. Os valores vêm de configuração
tipada, e **no boot os códigos de filial são validados como só dígitos** — a configuração não
pode virar porta de injeção.

**O ICMS** usa um fragmento compartilhado, como o `NoCentroDeVerbas` do filtro por fornecedor:
a mesma expressão de conta entra nas quatro consultas de despesa **e** no detalhamento de
lançamentos, tanto no `PCLANC` quanto no rateio (o Delphi faz nos dois). É a lição da
divergência 4: apuração e duplo clique escritos em separado acabam discordando. Com
`AgrupaIcms` desligado o fragmento é só `codconta`, e o SQL é o de hoje.

## 6. O front

| Onde | Hoje | O risco |
|---|---|---|
| Cache do React Query | filiais com chave `["dre-gerencial","filiais", matricula]` | a matrícula `144` das duas bases dividiria a mesma entrada |
| `useOrdemSalva` | uma chave por **análise**, sem pessoa e sem base | a ordem salva na Época seria aplicada às linhas do Minas Rural |
| `detalheAberto` | guarda o detalhe pelo id | a página impressa não diz de que base veio |

- **Login.** Um `<select>` **Base de dados**, alimentado por `/bases`; a seleção inicial é a
  última usada naquele navegador (com `try/catch`) e, sem ela, a primeira. Se a lista não
  carregar, o botão fica desabilitado com a razão dita. Os controles de exibição continuam
  presentes, nos dois temas.
- **A base fica sempre à vista:** selo de texto (não depende de cor) no menu do usuário e no
  cabeçalho da apuração. **No papel, na tela cheia e na página de detalhe ele acompanha a
  lista de filiais** — um DRE impresso circula semanas depois, e "qual empresa?" é a primeira
  pergunta. O nome do arquivo do Excel também leva a base.
- **Cache:** `queryClient.clear()` ao entrar e ao sair; chave que depende de pessoa passa a ser
  `(base, matrícula)`.
- **Armazenamento local:** a ordem salva ganha a base na chave, e a **chave antiga conta como
  da Época** — ninguém perde a ordem que já tem. O detalhe aberto carrega a base dentro do
  objeto. Tema e leitura ampliada **não** entram: são preferência da pessoa.
- **Defesa em dobro:** a apuração e o detalhamento devolvem `base { id, rotulo }`, e o front
  **recusa renderizar** se ela diferir da base da sessão.

## 7. Erros e segurança

| Situação | Resposta | O que a pessoa lê |
|---|---|---|
| `base` ausente ou fora da lista | 400 | *Escolha uma base de dados da lista.* |
| Banco da base não responde | 503 | *A base Minas Rural não respondeu. Tente de novo ou avise a TI.* |
| Token sem claim `base`, ou base removida | 401 | *Sua sessão é anterior a esta atualização. Entre de novo.* |

**Falha de infraestrutura nunca vira "senha incorreta"** — isso manda a pessoa mexer na senha.
O log guarda a base e o código `ORA-`, nunca a string de conexão.

- A base só nasce em dois lugares: o corpo do login, uma vez, e o claim assinado.
- `IBaseAtual.Base` **lança** se não houver claim: as consultas falham fechadas.
- Nenhuma conexão é reaproveitada entre requisições; pools separados por string.
- Credenciais só em `ConnectionStrings` (ignorado pelo git) ou variável de ambiente.

## 8. Testes

1. **SQL idêntico na Época, byte a byte.** Um script guarda o SQL de cada consulta como está na
   `main` e confere que, com as regras da Época, o texto gerado é o mesmo. Um segundo varre as
   consultas e **falha se sobrar `1601` ou `1401` literal**.
2. **Registro e configuração:** base desconhecida, base sem string de conexão (não aparece no
   login), código de filial com letra (derruba o boot).
3. **Sem credencial** (rodáveis sem senha): `/bases`, login sem base, login com base inventada.
4. **Com credencial, rodados por quem tem a senha:** entrar em cada base, apurar o mesmo
   período nas duas, conferir que o `base` da resposta bate com o da sessão e que os totais
   diferem, e olhar o papel.
5. **Medição contra a 9815 do Minas Rural** antes de ligar qualquer regra (§9).
6. As validações existentes (`dc12` a `dc85`) continuam passando.

## 9. A ordem de entrega — a Época nunca fica quebrada

1. Registro de bases e fábrica de conexão, com o teste de SQL idêntico.
2. Login e token.
3. `RegrasDaBase`, com o Minas Rural **nos valores da Época**.
4. O front.
5. **Medição:** apurar os cenários nos dois lados. Se a leitura do fonte estiver certa, a
   diferença se explica pelos dois mecanismos de [BASE_MINAS_RURAL.md](../rotinas/9815-dre-gerencial/BASE_MINAS_RURAL.md);
   o que sobrar é um terceiro achado.
6. Ligar as regras, **uma por commit**, cada uma com a entrada no `DIVERGENCIAS.md` e a medida
   que a justificou.

Os passos 1 a 4 não mudam número nenhum. A mudança de comportamento só entra no 6, medida.

## 10. Para acrescentar uma terceira base

Configuração (`Bases` + `ConnectionStrings`) → rodar a `mb1` e a `mb2` em
`docs/plataforma/validacao/` como o usuário da aplicação → medir contra a rotina do Winthor de
lá → só então ligar regras. Nenhuma consulta é editada.

---

## 11. Em aberto, para decidir no plano

- **O filtro por fornecedor no Minas Rural.** Ele depende da `TAB_WEB_CENTROC_FORNEC`, que
  **não existe** nessa base, e o vínculo de centro de custo × fornecedor de lá é outro. Sem a
  tabela, escolher fornecedor dá `ORA-00942`. O desenho provável é um campo `FiltroPorFornecedor`
  em `RegrasDaBase` que esconda o controle quando a base não o suporta — **um quinto campo**,
  e por isso fica para decidir aqui, não por omissão.
- **Dados de ambiente local.** Quem desenvolve precisa da `OracleMinasRural` no
  `appsettings.Development.json`, com o `EDI`; o `appsettings.example.json` ganha a chave.

## 12. Fora do escopo

- **`TAB_GER_RESTRICAO_DATA_DRE`**: o Delphi limita por matrícula o período que cada pessoa
  pode apurar, nas duas bases, e a web não implementa. Lacuna anterior a esta tarefa.
- Uma verificação de objetos por base no `/health` (a `mb1` cumpre esse papel por ora).
- Trocar de base sem sair, e duas sessões simultâneas — descartados na §2.

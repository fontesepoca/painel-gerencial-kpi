# Preferências de exibição por usuário — design

**Data:** 25/11/2026 · **Pedido:** Gabriel · **Rotina:** 9815 — DRE Gerencial (e as próximas)

## Problema

As opções do menu **Exibição** do DRE (Zeradas, AV, Confirmados…) são `useState` em
`app/dre-gerencial/page.tsx`: **toda abertura da tela volta ao padrão**. Não estão nem no
`localStorage`. Quem nunca quer ver o %AH, ou sempre quer os Confirmados separados, desmarca
de novo a cada vez — e em outra máquina, de novo.

O que se quer: **a pessoa deixa a tela como prefere, e ela abre assim de novo**, em qualquer
aba e em qualquer máquina. E a mesma estrutura tem de servir, quando for decidido, para a
**ordem das linhas** e para os **filtros**.

## Decisões (do Gabriel, nesta conversa)

1. **Uma tabela nova**, e não coluna em tabela existente. `PC*` é do Winthor e não se escreve;
   `EPCPARDRE*` é a estrutura da 9815; a `TAB_WEB_CENTROC_FORNEC` é um vínculo de negócio.
2. **`TAB_WEB_PREFERENCIA_TELA`, uma linha por (matrícula, tela), as preferências em JSON.**
   Criada pelo Gabriel em 25/11/2026 **só na Época**, conferida (estrutura, PK, check `IS
   JSON`) e com escrita provada pelo usuário da aplicação: `INSERT` e `UPDATE` com
   `JSON_MERGEPATCH(... RETURNING CLOB)` passaram, seguidos de `ROLLBACK`.
3. **Salvar as 12 opções do menu Exibição**, inclusive os dois modos de edição (Selecionar
   linhas e Mover linhas).
4. **A ordem das linhas e os filtros ficam para quando forem julgados necessários.** A
   estrutura já os comporta; esta entrega não os implementa.
5. **Gravar o trecho que mudou, não o documento** (abordagem A), juntando no Oracle com
   `JSON_MERGEPATCH`.

## A exceção à regra do piloto

O [SCHEMA_BANCO.md](../../plataforma/SCHEMA_BANCO.md) registra, em 28/08/2026: *"O piloto é
100% leitura"* — para a aplicação poder rodar com usuário Oracle somente leitura. **Esta é a
primeira tabela em que a aplicação grava.** O grant de escrita (`SELECT, INSERT, UPDATE`, sem
`DELETE`) vale só para ela; nenhuma tabela do Winthor, nem da 9815, ganha escrita. A exceção
entra no SCHEMA_BANCO.md com a data e o motivo.

## O que NÃO muda

- Nenhum número do DRE, nenhuma consulta de apuração ou de detalhe. Sem entrada no
  `DIVERGENCIAS.md`.
- O **padrão** de cada opção — o estado em que a tela abre para quem nunca mexeu — é o de hoje.
- A ordem das linhas continua no `localStorage` (`useOrdemSalva`); o modo de leitura
  (`LeituraProvider`) e a última base (`baseInicial`) também.
- Os filtros da apuração (filial, período, regime, análise…) não são salvos.
- O texto que filtra as linhas continua limpando a cada apuração (decisão de 28/09/2026).
- As travas que já existem continuam valendo por cima da preferência: Provisionado salvo
  marcado num período sem título em aberto continua escondido; Confirmados idem; Sem Total e
  Só Total continuam desabilitados quando o motivo da tela diz que estão.

## O documento

Uma linha por pessoa e por tela. O JSON tem **uma seção por assunto**:

```json
{
  "exibicao": { "confirmados": true, "ah": false, "codigos": true },
  "ordem":    { "grupo-contas": ["..."], "ccusto-principal": ["..."] },
  "filtros":  { }
}
```

- **`exibicao`** — esta entrega. Chave = o `id` da opção no menu; valor = `true`/`false`.
- **`ordem`** e **`filtros`** — reservadas. Nenhum código desta entrega as lê ou grava.
- **Só o que a pessoa mexeu fica gravado.** Opção ausente segue o padrão da tela — e se o
  padrão mudar um dia, quem nunca mexeu acompanha; quem mexeu mantém a escolha.

### As 12 opções

| Opção no menu | `id` | Padrão |
|---|---|---|
| Zeradas | `zeradas` | desmarcada |
| Informativos | `informativos` | marcada |
| Ocultar títulos estornados ou desdobrados | `ocultar-baixas` | marcada |
| AV % | `av` | marcada |
| AH % | `ah` | marcada |
| Provisionado | `provisionado` | marcada |
| Confirmados | `confirmados` | desmarcada |
| Sem Total | `sem-total` | desmarcada |
| Só Total | `so-total` | desmarcada |
| Selecionar linhas | `selecionar-linhas` | desmarcada |
| Mover linhas | `mover-linhas` | marcada |
| Códigos | `codigos` | desmarcada |

### Leitura defensiva

O que vem do banco passa por uma função pura antes de tocar a tela:

- chave que não é uma das 12 → ignorada (opção que saiu do menu não quebra nada);
- valor que não é booleano → ignorado (a opção fica no padrão);
- `sem-total` e `so-total` **os dois** `true` → os dois ignorados (os dois se excluem; um
  documento assim só sai de defeito, e o padrão é o estado seguro);
- seção `exibicao` ausente, ou o documento inteiro `{}` → tudo no padrão.

## Arquitetura

### Banco — o `MERGE`

```sql
MERGE INTO TAB_WEB_PREFERENCIA_TELA P
USING (SELECT :matricula MATRICULA, :tela TELA FROM DUAL) N
   ON (P.MATRICULA = N.MATRICULA AND P.TELA = N.TELA)
 WHEN MATCHED THEN UPDATE SET
      P.PREFERENCIAS = JSON_MERGEPATCH(P.PREFERENCIAS, :trecho RETURNING CLOB),
      P.DTALTERACAO  = SYSDATE
 WHEN NOT MATCHED THEN INSERT (MATRICULA, TELA, PREFERENCIAS)
      VALUES (N.MATRICULA, N.TELA, JSON_MERGEPATCH('{}', :trecho RETURNING CLOB))
```

- **`RETURNING CLOB` é obrigatório.** O retorno padrão do `JSON_MERGEPATCH` é
  `VARCHAR2(4000)`; sem ele, a gravação quebra quando a seção `ordem` passar disso.
- **`:trecho` vai como parâmetro CLOB** (`OracleDbType.Clob`), não `VARCHAR2`, pelo mesmo
  motivo: um bind `VARCHAR2` em SQL para nos 4.000 bytes.
- O `INSERT` também passa pelo `JSON_MERGEPATCH('{}', …)`: um `null` no primeiro trecho
  (que no merge significa "apague") não chega a ser gravado como valor.
- **Duas primeiras gravações simultâneas** da mesma pessoa podem disputar o `INSERT`, e uma
  delas recebe `ORA-00001`. O repositório repete o `MERGE` uma vez nesse caso — na segunda
  vez a linha existe e cai no `UPDATE`.
- Matrícula e tela são binds; nenhum valor é concatenado no SQL.

### API — módulo `Preferencias`

Um módulo novo, descoberto por reflexão como os outros (`PreferenciasModule : IModuleInstaller`).
Dapper, conexão da base da sessão (`IOracleConnectionFactory.CriarConexaoAsync`), nenhuma
biblioteca nova.

| Rota | Faz | Responde |
|---|---|---|
| `GET /api/preferencias/{tela}` | lê o documento da pessoa | `ApiResponse<JsonElement>` — o objeto salvo, ou `{}` |
| `POST /api/preferencias/{tela}` | grava o trecho do corpo | `ApiResponse<PreferenciasSalvasDto>` — `{ "salvo": true }`, ou `false` na base desligada |

**`POST`, e não `PUT`/`PATCH`:** o BFF do Next (`app/api/[...caminho]/route.ts`) só repassa
`GET` e `POST`.

**Regras, todas no serviço:**

- **A matrícula sai do token** (`GeradorDeToken.ClaimMatricula`), nunca da URL nem do corpo:
  ninguém lê nem grava a preferência de outra pessoa. Token sem matrícula numérica → 403.
- **`tela` numa lista fechada** — nesta entrega, só `dre-gerencial`. Fora dela → 400. A lista
  é uma constante do serviço; a próxima tela entra acrescentando o nome.
- **O corpo tem de ser um objeto JSON** (não array, não texto, não número) → senão 400.
- **Até 32 KB** (bytes UTF-8 do corpo) → acima, 400. Cabe a ordem das linhas de todas as
  análises com folga; barra um corpo sem sentido.
- A API **não valida o conteúdo das seções**: guardar é dela, interpretar é da tela (que lê
  defensivamente, acima). Assim uma seção nova não exige mudar a API.

**A base sem a tabela.** Cada base ganha a chave `PreferenciasNoBanco` em `appsettings.json`
→ `Bases:<Id>`, ao lado de `Rotulo` — diferença entre bases é configuração, não `if`
(CLAUDE.md). **Época: `true`. Minas Rural: `false`**, até a tabela ser criada lá. Ausente =
`false`. Desligada, o `GET` devolve `{}` e o `POST` devolve `salvo: false` — **sem tocar no
banco**, para não gerar um `ORA-00942` a cada clique. A tela não distingue: abre no padrão e
não lembra.

### BFF

`lib/servidor/decidirRepasse.ts`: `preferencias` entra em `REPASSADOS`, com a mesma exigência
de sessão do `dre-gerencial`.

### Tela

**Um lugar para o padrão.** `lib/preferenciasDaExibicao.ts` exporta:

- `PADRAO_DA_EXIBICAO` — as 12 opções e o estado com que abrem (a tabela acima);
- `lerExibicao(documento: unknown)` — a leitura defensiva; devolve só as opções válidas;
- `trechoDaExibicao(mudancas)` — monta `{ "exibicao": { … } }` para o `POST`.

`page.tsx` e o selo do `MenuDeExibicao` passam a ler `PADRAO_DA_EXIBICAO`. Hoje o selo compara
com uma lista própria (`padrao()`) que ficou velha — só AV, AH e Provisionado marcados — e por
isso **o DRE já abre com o selo em 2** (Informativos e Mover linhas contados como alterados) **e
passa a 3 depois de apurar** (Ocultar títulos estornados entra na conta). O selo
continua contando as opções **diferentes do padrão da tela** (não da preferência salva: com a
gravação automática, as duas seriam sempre iguais e o selo seria sempre zero).

**Um estado de módulo, não `useState` + React Query** (revisto ao ler o código, 25/11/2026).
As 12 opções passam a viver numa loja fora do React, lida por `useSyncExternalStore` — o mesmo
desenho do `useOcultarBaixas` e do `useOrdemSalva`. Dois motivos: o lint do React 19 do projeto
recusa `setState` síncrono dentro de efeito (o motivo registrado no `useOrdemSalva`), e é assim
que se aplica um valor que chega depois; e o Ocultar baixas **já é** um estado de módulo lido
por tabela, modal, Excel e página do detalhe. Ele vira uma das 12 opções da loja, e
`useOcultarBaixas` passa a ser uma vista dela — os consumidores não mudam.

- **`criarLojaDaExibicao(gravar)`** (em `lib/preferenciasDaExibicao.ts`, sem rede, testável):
  guarda o estado atual e o que o banco tem; `mudar(parcial)` aplica e manda gravar **só o
  que difere do banco**; `carregar(chave, salvo)` aplica o que chegou, uma vez por
  base + matrícula.
- **`hooks/useExibicao.ts`**: a instância da loja, com o `gravar` de verdade — `POST` numa
  fila (um clique só sai depois do anterior, para dois cliques rápidos na mesma opção não
  chegarem fora de ordem), sem novas tentativas e **sem mensagem de erro**: falhou, a escolha
  vale até fechar a aba. `useCarregarExibicao()` faz o `GET` uma vez quando a sessão chega;
  `GET` que falha carrega como `{}`.

**Ao abrir:** a tela começa no padrão; quando o `GET` chega, aplica o que `lerExibicao`
devolveu. **Se a pessoa já mexeu numa opção antes disso, vale o clique dela** para aquela
opção — e ele é gravado. Na prática o `GET` chega em menos de um segundo, antes de qualquer
apuração.

**Ao clicar:** o estado muda na hora; o trecho vai em seguida, só com o que mudou. Marcar Sem
Total com Só Total marcado manda os dois (`"sem-total": true, "so-total": false`), num `POST`
só.

**Mudar o Ocultar baixas no detalhamento também grava**, porque é a mesma opção. A página
dedicada do detalhe (`/dre-gerencial/detalhe/[id]`) recebe o valor de quem a abriu por
`definirOcultarBaixas` e **não carrega nem grava** preferência: é cópia da tela que a abriu,
não lugar de escolha. O comentário "Não é guardado" do hook muda.

## Testes

Sem banco e sem navegador, no padrão das validações do projeto:

- **`docs/plataforma/validacao/pr1_preferencias_da_exibicao.mjs`** — `lerExibicao`: documento
  vazio, chave desconhecida, valor não booleano, `sem-total` + `so-total`, seção ausente, lixo
  (`null`, array, texto); `trechoDaExibicao`: forma do objeto; `PADRAO_DA_EXIBICAO` igual ao
  estado inicial de hoje, opção a opção; o selo abre em **0**; a loja: nada grava antes de
  carregar, o clique anterior à carga vence e é gravado, `carregar` repetido não faz nada,
  clique igual ao estado não grava, Sem Total + Só Total num trecho só.
- **`docs/plataforma/validacao/pr2_preferencias_na_api.cs`** — serviço com repositório falso:
  tela fora da lista → 400; corpo array, texto, número → 400; 32 KB + 1 → 400; base desligada
  → `{}` e `salvo: false` **sem chamar o repositório**; a matrícula gravada é a do token
  (`MatriculaDo`), e o token sem matrícula numérica não tem matrícula.
- **A repetição no `ORA-00001` não tem teste automático**: `OracleException` não tem
  construtor público, e o repositório falso não chega nela. Fica na revisão do código.
- **dc87** (`dc87_proxy_do_bff.mjs`, `decidirRepasse`) — `preferencias` repassa com sessão e
  recusa 401 sem.
- `tsc` e `eslint` limpos; as validações do DRE que já passam continuam passando.

**No banco, pelo Gabriel** — depois de clicar na tela:

```sql
SELECT MATRICULA, TELA, PREFERENCIAS, DTCADASTRO, DTALTERACAO
  FROM TAB_WEB_PREFERENCIA_TELA
 ORDER BY DTALTERACAO DESC NULLS LAST;
```

**O critério de pronto:** marcar Confirmados e desmarcar AH num navegador; abrir o DRE em
outro navegador (ou outra máquina), com o mesmo usuário na Época — os dois já vêm como
deixados. No Minas Rural, o mesmo teste abre no padrão, sem erro.

## Documentação

- **`docs/plataforma/PREFERENCIAS.md`** (novo) — a tabela, o documento por seções, as rotas,
  a chave por base, e o passo a passo para uma tela nova salvar as suas opções.
- **`docs/plataforma/validacao/pr0_tab_web_preferencia_tela.sql`** — o DDL como foi criado, no
  formato da `mb3`: bloco do dono, grant, sinônimo, conferência com `ROLLBACK`; e o bloco do
  Minas Rural (schema `EPCTI`, para o `EDI`), pronto para quando for criada lá.
- **`SCHEMA_BANCO.md`** — a exceção à regra "100% leitura", com data e motivo.
- **`BIFURCACAO_DE_BASES.md`** — a chave `PreferenciasNoBanco` e o estado de cada base.
- **`useOcultarBaixas.ts`** e o comentário de cada `useState` das opções em `page.tsx` — o
  "não é guardado" deixa de ser verdade.

## Pendências

- **O dono da tabela na Época**, para o `pr0` registrar o grant e o sinônimo como foram
  feitos. Conectado com o usuário da aplicação:
  `SELECT OWNER FROM ALL_TABLES WHERE TABLE_NAME = 'TAB_WEB_PREFERENCIA_TELA';`
- **Minas Rural:** criar a tabela com o bloco do `pr0` e ligar `PreferenciasNoBanco` — quando
  o Gabriel decidir.
- **Ordem das linhas e filtros:** cada um é uma decisão própria (filtros, em especial: salvar
  o último usado ou ter um "salvar como padrão"?) e uma entrega própria sobre esta estrutura.

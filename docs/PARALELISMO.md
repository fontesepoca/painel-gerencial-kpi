# Paralelismo na consulta de faturamento

Ligado em 17/09/2026. É um hint `PARALLEL(4)` dentro da consulta mais cara da rotina 9815.

**Se você veio aqui para desligar, vá direto para [Como reverter](#como-reverter).** É um
número no appsettings e um reinício.

---

## O que foi ligado

| | |
|---|---|
| Onde, no SQL | `DreGerencialQueries.FaturamentoPorMes`, no `SELECT` do **primeiro bloco** |
| Quem monta | [OpcoesDeParalelismo.HintPara](../api-new-kpi/Infrastructure/Persistence/OpcoesDeParalelismo.cs) |
| Configuração | seção `Oracle` do appsettings |
| Grau | 4 |

```json
"Oracle": {
  "GrauDeParalelismo": 4,
  "MesesParaParalelizar": 1
}
```

## Em uma frase, para quem não acompanhou

A consulta que monta o faturamento do DRE lê 1,5 milhão de linhas e era feita por **um**
processo do Oracle. O hint manda **quatro** processos dividirem o trabalho. Mesma conta, mesmo
resultado, quatro mãos.

## Por que, com os números

O caminho até aqui foram oito medições, e duas hipóteses minhas caíram no meio:

| | |
|---|---|
| Apuração de 3 meses, 9 filiais | 173 s ([dc41](validacao/dc41_tres_meses_todas_as_filiais.mjs)) |
| → a consulta de faturamento | **92,5%** ([dc43](validacao/dc43_onde_vao_os_segundos.mjs)) |
| → → o bloco de vendas por item | **93,6%** dela ([dc45](validacao/dc45_tempo_de_cada_bloco.sql)) |
| A consulta inteira, sem hint | 70,3 s |
| A consulta inteira, com `PARALLEL(4)` | **6,0 s** ([dc50](validacao/dc50_onde_por_o_hint.sql)) |

**O grau é 4 porque é onde o ganho para** ([dc49](validacao/dc49_grau_do_paralelismo.sql)):

| Grau | Tempo | Ganho |
|---|---|---|
| sem paralelismo | 17,13 s | — |
| 2 | 9,23 s | 1,9× |
| **4** | **4,51 s** | **3,8×** |
| 8 | 4,31 s | 3,9× |

Oito não entrega nada além de quatro e tomaria o dobro dos processos do servidor.

**O hint fica dentro do primeiro bloco, e não no `SELECT` de fora.** Os dois dão a mesma média,
mas o de fora oscila: 11,79 s numa execução e 6,25 s na seguinte, na mesma sessão. O de dentro
deu 5,97 s nas duas. Um DRE que às vezes leva 6 s e às vezes 12 é pior de conviver que um que
leva 6 sempre — e paralelizar o `SELECT` externo alcançaria também os blocos 2 e 3, que juntos
custam 16 s e não precisam de ajuda.

## Na apuração inteira, medido pela API

Os números acima são da consulta sozinha. Na tela o ganho é menor, porque o faturamento é
92,5% da apuração e os outros 7,5% continuam custando o mesmo — a estrutura sozinha leva
18 s e não foi tocada.

Medido pela [dc51](validacao/dc51_paralelismo_pela_api.mjs), com aquecimento descartado dos
dois lados e mediana de três execuções:

| Caso | Desligado | Ligado | |
|---|---|---|---|
| 1 mês, 1 filial | 8,2 s | 6,0 s | 1,4× |
| 1 mês, 9 filiais | 7,2 s | 2,9 s | 2,5× |
| 3 meses, 9 filiais | 18,0 s | 5,8 s | 3,1× |

**A apuração pequena não piora** — era o risco que motivou medir este caso, e ele não se
confirmou. O ganho cresce com o tamanho do recorte, que é o comportamento esperado de
paralelismo bem aplicado. Por isso `MesesParaParalelizar` fica em `1`: ele é saída de
emergência, não ajuste necessário.

Os três `LUCRO LIQUIDO` batem ao centavo entre os dois estados.

**Estes são números de cache quente**, e a comparação exigia isso — igualar cache frio entre
duas execuções separadas por um reinício da API precisaria esvaziar o buffer do Oracle, que
é privilégio de DBA e atingiria a operação inteira. O caso frio, que é o que doía com 173 s,
está medido no banco: 70,3 s para 6,0 s.

> **A primeira versão desta medição saiu invertida** e vale como aviso. Ela rodava os dois
> estados em sequência, e o segundo herdava o cache do primeiro: acusou que a apuração
> pequena PIOROU 2,8×. O sinal de que algo estava errado era outro número na mesma tela —
> três meses em 18,3 s, quando de manhã a mesma apuração levara 173 s. É a mesma armadilha
> da dc19 e da dc48, e ela volta porque os números saem plausíveis.

## O que isto custa ao resto do banco

Este é o Oracle que a empresa usa para faturar, e o custo não aparece em nenhuma medição de
tempo: ele apareceria na tela de quem está emitindo nota. Medido na
[dc53](validacao/dc53_limites_do_paralelismo_como_dba.sql), com o usuário principal.

**São 8 processos por apuração, não 4.** `PARALLEL(4)` não quer dizer quatro processos: o
plano tem etapas que conversam entre si — as linhas `P->P`, produtores alimentando
consumidores —, e o Oracle aloca **dois conjuntos** de quatro. Esta página dizia "quatro" até
17/09/2026 e estava errada pela metade.

| | |
|---|---|
| `cpu_count` | 16 núcleos |
| `parallel_max_servers` | 640, o teto absoluto |
| `parallel_servers_target` | 256, mas **não vale aqui** — ver abaixo |
| `parallel_degree_policy` | `MANUAL` — o nosso hint é respeitado como escrito |
| `parallel_min_percent` | 0 — degrada em silêncio, nunca falha |
| Resource Manager | nenhum plano ativo |

**A conta: 640 ÷ 8 = 80 apurações simultâneas** antes de o banco começar a degradar. Com 28
pessoas ao todo, é inalcançável.

> **`parallel_servers_target` não entra nessa conta**, e esta página dizia que entrava. Ele
> rege *statement queuing*, que só é ativado com `parallel_degree_policy = AUTO`; aqui a
> política é `MANUAL`, então não há enfileiramento e o limite efetivo é
> `parallel_max_servers`. A conclusão prática fica mais folgada, não menos.

Dois parâmetros completam o quadro. `parallel_adaptive_multi_user = FALSE`: não há redução
automática do grau conforme a carga, o grau pedido é honrado até os escravos acabarem. E
`parallel_min_percent = 0`: quando acabam, a consulta **degrada em silêncio** em vez de
levantar `ORA-12827`. O pior caso é uma apuração rodar como rodava antes.

**E o banco já vive disso.** Desde que a instância subiu: 795.175 consultas paralelizadas,
807.325 operações paralelas concluídas e **zero** rebaixamentos, em qualquer faixa. O Winthor
já usa paralelismo intensamente; nós não estamos introduzindo nada estranho ao ambiente.

**O que limita de verdade não é nada disso — são os 16 núcleos e a PGA.** O pool de escravos
é folgado; os núcleos atendem ao mesmo tempo quem apura e quem fatura. Vinte e oito
apurações simultâneas seriam 224 processos disputando 16 núcleos: ninguém falha, todos ficam
lentos. Mas esse cenário exige as 28 pessoas clicando no mesmo instante, e cada apuração
dura 6 segundos.

Sob concorrência alta, o sintoma a vigiar não é falta de processo e sim **PGA**: são 16 GB
de `pga_aggregate_target`, cada escravo tem sua área de trabalho, e `HASH GROUP BY` e
`HASH JOIN` paralelos multiplicam workareas. O que apareceria é spill para TEMP.

### Por que hint, e não `ALTER TABLE ... PARALLEL`

É a pergunta de quem conhece Oracle, e a resposta é o ponto mais importante desta página.

`ALTER TABLE PCNFSAID PARALLEL 4` seria mais elegante e é **inaceitável aqui**. O atributo é
persistente e vale para toda consulta que tocar a tabela: relatórios do Winthor, rotinas
Delphi, integrações. Seria alterar o comportamento do ERP inteiro para acelerar uma tela —
e a regra do projeto é não tocar em nada do Winthor.

O hint no texto da nossa consulta atinge só a nossa consulta. Nada foi alterado no
dicionário, não há estado no banco para desfazer, e reverter é trocar um `4` por um `0`.

`MesesParaParalelizar` existe para esse tipo de ajuste: subindo para `2`, a apuração de um mês
— que é o uso comum da tela — deixa de pedir paralelismo, e ele fica reservado aos recortes
grandes, que foram os que motivaram tudo isto.

> **Um detalhe que explica por que funcionou.** Com o hint, o Oracle **manteve** os nested
> loops em `PCMOV` e paralelizou em volta deles. Ele não trocou a estratégia — que era a
> certa, como a dc47 provou ao piorar 3,5× forçando hash join —, só dividiu o trabalho.

## O que NÃO funcionou, e por quê

Fica registrado para ninguém tentar de novo.

**Hint de junção.** O plano de execução mostra `NESTED LOOPS` onde a intuição pede `HASH JOIN`,
e forçar hash join foi **3,5× pior**: 769 s contra 211 s ([dc47](validacao/dc47_hash_join_no_bloco_1.sql)).
`PCMOV` é grande demais para ser varrida, e 1,5 milhão de buscas indexadas sai mais barato.
O otimizador estava certo.

**Quebrar o período em meses.** A ideia veio de supor que o custo crescia em curva — o que
vinha de comparar 16,9 s de *um mês e uma filial* com 247 s de *três meses e nove filiais*. A
[dc48](validacao/dc48_um_mes_de_cada_vez.sql) mediu direito: um mês custa 74 s, três custam
~211 s. É reta. Dividir pioraria — 217 s somados.

## Como reverter

### Desligar

No `appsettings.Development.json` (ou no do ambiente):

```json
"Oracle": {
  "GrauDeParalelismo": 0
}
```

E reinicie a API. **`0` não é "paralelismo de grau zero"** — nenhum hint é gerado, e a consulta
sai do `string.Format` idêntica, caractere por caractere, à de antes de 17/09/2026.

Se estiver com `dotnet watch run`, `Ctrl+C` e suba de novo: a configuração é lida uma vez, na
construção do contêiner.

### Conferir que voltou mesmo

```bash
node docs/validacao/dc51_paralelismo_pela_api.mjs desligado
```

A dc51 apura pela API nos dois estados e compara. Ela também confere que o `LUCRO LIQUIDO` é o
mesmo com e sem paralelismo — **paralelismo não pode mudar um centavo**, e se mudar, isto é um
defeito e não uma melhoria.

### Reduzir sem desligar

`GrauDeParalelismo: 2` entrega metade do ganho com metade dos processos. É o meio-termo se o
servidor estiver apertado em horário de pico.

### Deixar só para recortes grandes

`MesesParaParalelizar: 2` faz a apuração de um mês rodar como sempre rodou, e só os recortes
maiores pedirem paralelismo.

### Arrancar de vez

1. apague `Infrastructure/Persistence/OpcoesDeParalelismo.cs`;
2. tire o `{3}` do `SELECT` do primeiro bloco em `DreGerencialQueries.FaturamentoPorMes`, e o
   quarto argumento do `string.Format` no repositório;
3. tire a injeção de `OpcoesDeParalelismo` no `DreGerencialRepository` e o registro em
   `PersistenceConfiguration`;
4. tire a seção `Oracle` dos dois appsettings;
5. apague esta página e a `dc51`.

Nenhuma tabela do Winthor foi tocada em nenhum momento, e nada disto deixou estado no banco.

## Quando desconfiar dele

**A apuração ficou mais lenta, não mais rápida.** Era o risco esperado em recorte pequeno, e a
dc51 mediu que **não acontece** — um mês numa filial ficou 1,4× mais rápido. Se aparecer mesmo
assim, desconfie primeiro da medição: comparar duas execuções sem aquecer as duas faz o segundo
estado herdar o cache do primeiro e inverte o resultado. Foi o que aconteceu na primeira versão
da dc51. Se, medido direito, a perda for real, a saída é `MesesParaParalelizar`, não desligar
tudo.

**A operação reclamou de lentidão no horário em que alguém apurou.** É o custo descrito acima, e
é real. Reduza o grau ou restrinja aos recortes grandes.

**Um valor do DRE mudou.** Isso não deveria ser possível — paralelismo divide trabalho, não
muda aritmética. Se acontecer, desligue primeiro e investigue depois: a dc51 compara o
`LUCRO LIQUIDO` nos dois estados exatamente para esse caso aparecer cedo.

**Nada mudou, nem para melhor.** Confira se o hint está mesmo saindo. Sem o `+` depois da barra
e do asterisco, `/*+ PARALLEL(4) */` vira comentário comum e o Oracle **ignora em silêncio** —
não falha, não avisa, e a consulta continua no mesmo tempo enquanto todos juram que foi
otimizada.

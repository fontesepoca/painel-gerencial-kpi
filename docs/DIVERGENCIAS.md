# Divergências de valores entre a versão web e a 9815

Documento único e vivo. Toda diferença numérica entre o que a tela web mostra e o
que a rotina 9815 mostra tem que estar aqui — medida, explicada e com a decisão
registrada. O que não estiver aqui é defeito, não escolha.

**Princípio que governa** ([ROTINA_9815.md §1](ROTINA_9815.md)): a web reproduz a
9815 ao centavo, inclusive nos pontos que parecem defeito. Divergir é exceção, e
cada exceção precisa de três coisas: a medida, o motivo de não ser reproduzível, e
a aprovação do Gabriel.

**Última revisão:** 31/08/2026.

---

## Índice

| # | Divergência | Dimensões afetadas | Tamanho | Situação |
|---|---|---|---|---|
| [1](#1-a-coluna-média-em-um-centavo) | Coluna MÉDIA | todas | 1 centavo | aceita em 28/08/2026 |
| [2](#2-a-filial-única-no-subselect-de-centro-de-custo) | Filial única no `CCC` | C. Custo Principal | R$ 2,56 mi em 2 meses | **corrigida** em 31/08/2026 |
| [3](#3-centro-de-custo-simples-não-tem-referência) | Sem referência | Centro de Custo | não mensurável | validação manual pendente |
| [4](#4-correção-deliberada-o-detalhamento-agora-fecha-com-a-linha-do-dre) | Detalhamento não fecha com a linha | Receita Bruta · Devolução · Receitas Líquidas | R$ 3,56 mi em 1 mês | **corrigida de propósito** em 01/09/2026 |

---

## 1. A coluna MÉDIA, em um centavo

**Afeta:** todas as dimensões. **Tamanho:** um centavo, em 9 de 145 linhas.
**Decisão:** aceita em 28/08/2026. **Detalhe completo:** [ROTINA_9815.md §14](ROTINA_9815.md).

A 9815 arredonda a MÉDIA por um caminho que não corresponde a modo nenhum de
arredondamento decimal — assinatura do `Extended` de 80 bits do Delphi, que o .NET
não tem. As nove linhas caem em ponto médio exato (`x,xx5`), onde a menor diferença
de representação decide.

Aceita porque MÉDIA é coluna derivada (`TOTAL ÷ meses`), não entra em identidade
contábil nenhuma, e reproduzi-la exigiria `double` em cálculo de dinheiro — errando
em 2 linhas mesmo assim.

**Reabrir se:** alguém usar a MÉDIA para decidir alguma coisa.

---

## 2. A filial única no subselect de centro de custo

**Afeta:** C. Custo Principal e Centro de Custo. **Tamanho medido:** R$ 2.564.063,37
em 2.269 lançamentos, 8,4% da despesa operacional, no cenário de 01/06 a 31/07/2026
com filiais 7/12/25. **Decisão:** corrigida — a web usa a lista completa de filiais.

### O defeito

Na consulta de estrutura, o subselect que descobre quais centros de custo existem
filtra por **uma filial só** — a última da seleção:

```sql
AND  FIN.CODFILIAL IN ('25')      -- com 7, 12 e 25 selecionadas
```

Na mesma consulta, o bloco de contas órfãs faz `UNION ALL` com as três, e a consulta
de valores também usa as três. Um único ponto ficou para trás; a lista de filiais foi
sobrescrita em vez de acumulada.

Como esse subselect decide **quais linhas existem**, e a consulta de valores calcula
**quanto cada linha vale** com todas as filiais, os valores dos centros de custo não
descobertos chegam à tela e são descartados por não terem linha correspondente. Não
caem no bloco de órfãs: aquele bloco marca `AntesLF = 'N'`, e os valores dessas contas
saem com `AntesLF = 'S'` — as chaves nunca se encontram. **A despesa some do relatório.**

### A prova

Duas execuções da própria 9815, com previsão registrada em git antes da segunda
([inc9f](validacao/inc9f_PREVISAO_REGISTRADA.md), commit `2261afd` anterior ao log
`codlog 885086` das 12:04 de 31/08/2026):

| Filiais selecionadas | `TRANSPORTE T - (28)` |
|---|---|
| 7 e 12 | presente, **(1.575.853,48)** |
| 7, 12 e 25 | **linha não existe** |

O total bate ao centavo com a soma independente das três filiais: a despesa inteira
está em 7 e 12, e a filial 25 não contribui com nada. Marcar uma filial a mais
apagou R$ 1,57 milhão do relatório.

No cenário de 7/12/25, nove centros de custo principais somem do bloco operacional:
`TRANSPORTE T - (28)`, `MANUTENÇÕES E CARRETAS`, `DEPARTAMENTO PESSOAL - RAT`,
`CD MONTES CLAROS`, `EQUIPE PASTA MISTA / ATACADO`, `CD 3 CORAÇOES`, `ECOMMERCE`,
`CD UBERLANDIA` e `POTENCIAL`. `Sub-Total`, `RESULTADO OPERACIONAL`,
`Total das Despesas` e `LUCRO LIQUIDO` saem todos subestimados nessa medida.

### Quais valores divergem, linha por linha

Medido pela [inc9d](validacao/inc9d_quanto_a_9815_deixa_de_somar.sql) em 31/08/2026.
Cenário: **01/06 a 31/07/2026, competência, filiais 7/12/25** — o mesmo da exportação de
dois meses. São as linhas do bloco operacional que a 9815 **não mostra** nesse recorte:

| Principal | Grupo | Lançamentos | Valor no período |
|---|---|---:|---:|
| 28 | TRANSPORTE T - (28) | 1.251 | **(1.575.853,48)** |
| 41 | MANUTENÇÕES E CARRETAS | 267 | (494.687,18) |
| 31 | DEPARTAMENTO PESSOAL - RAT | 106 | (150.867,42) |
| 40 | CD MONTES CLAROS | 244 | (117.407,17) |
| 27 | EQUIPE PASTA MISTA / ATACADO | 54 | (91.092,55) |
| 39 | CD 3 CORAÇOES | 173 | (87.124,57) |
| 30 | ECOMMERCE | 54 | (31.342,71) |
| 37 | CD UBERLANDIA | 87 | (11.382,32) |
| 34 | POTENCIAL | 33 | (4.305,97) |
| | **Fora da 9815** | **2.269** | **(2.564.063,37)** |
| | Bloco operacional que a 9815 mostra | 12.187 | (27.777.487,94) |
| | Total real | 14.456 | (30.341.551,31) |

`Sub-Total → Despesas Operacionais` exportado pela 9815 nesse cenário:
**(27.823.344,79)**. A medição do que ela mostra deu (27.777.487,94) — **0,16% de folga
não explicada**, provavelmente lançamentos posteriores ao retrato (ver armadilha 2 no
fim deste arquivo). Não altera a ordem de grandeza: **8,4% da despesa operacional**.

Nove linhas também somem do bloco depois do LUCRO LIQUIDO (`DIRETORIA`,
`FINANCEIRO - RAT`, `SEGURANÇA`, `EQUIPE P&G`, `CD GOV VALADARES` e outras), mas ali
**não há dinheiro envolvido**: a consulta de valores agrupa por conta depois do LUCRO
LIQUIDO, não por centro de custo, então essas linhas sairiam zeradas de qualquer jeito.

### O valor confirmado nas duas exportações

`TRANSPORTE T - (28)`, o maior deles, foi conferido diretamente nos dois xlsx:

| Filiais selecionadas | jun/2026 | jul/2026 | Total |
|---|---:|---:|---:|
| **7 e 12** | (664.912,50) | (910.940,98) | **(1.575.853,48)** |
| **7, 12 e 25** | — | — | **linha não existe** |

O total bate ao centavo com a medição independente das três filiais, o que prova que a
filial 25 não contribui com nada nesse centro de custo. Marcar uma filial a mais apagou
R$ 1,57 milhão.

A [inc9h](validacao/inc9h_transporte_t_por_filial.sql) quebrou esse valor por filial e
por mês — **e cada mês bate ao centavo com a exportação da 9815**:

| Filial | jun/2026 | jul/2026 | Subtotal | Lançamentos |
|---|---:|---:|---:|---:|
| 7 | (661.735,77) | (877.431,30) | **(1.539.167,07)** | 1.170 |
| 12 | (3.176,73) | (33.509,68) | (36.686,41) | 81 |
| 25 | — | — | **sem lançamento** | 0 |
| **Total** | **(664.912,50)** | **(910.940,98)** | **(1.575.853,48)** | **1.251** |

A linha `Total` desta tabela é idêntica à linha `TRANSPORTE T - (28)` da exportação de
7 e 12, mês a mês. A contagem de 1.251 lançamentos também bate com a inc9d.

Duas consequências:

1. **A filial 25 não tem um único lançamento** nesse centro de custo, confirmando de forma
   independente o que a inc9e já dizia pela estrutura. Ela não some por falta de dado —
   some porque foi marcada.
2. **97,7% do valor é da filial 7.** Marcar a 25 apaga do relatório, quase inteira, a
   despesa de transporte da filial 7 — que continuou selecionada o tempo todo.

### O tamanho da divergência depende de qual filial sobra

Da [inc9e](validacao/inc9e_previsao_por_filial.sql), mesmo período. Quais centros de
custo principais **entram na estrutura** conforme a filial que sobrou na variável:

| Principal | Grupo | com `'7'` | com `'12'` | com `'25'` |
|---|---|:---:|:---:|:---:|
| 27 | EQUIPE PASTA MISTA / ATACADO | ✅ | — | — |
| 28 | TRANSPORTE T - (28) | ✅ | ✅ | — |
| 30 | ECOMMERCE | ✅ | — | — |
| 31 | DEPARTAMENTO PESSOAL - RAT | ✅ | — | — |
| 33 | MERCHANDISING | — | — | ✅ |
| 34 | POTENCIAL | ✅ | — | — |
| 37 | CD UBERLANDIA | ✅ | — | — |
| 38 | CD GOV VALADARES | ✅ | — | ✅ |
| 39 | CD 3 CORAÇOES | ✅ | — | — |
| 40 | CD MONTES CLAROS | ✅ | — | — |
| 41 | MANUTENÇÕES E CARRETAS | ✅ | — | — |

Os demais principais (10, 11, 12, 14 a 25, 29, 32, 36, 80 a 99) entram nos três casos.

**Nenhuma das três filiais produz o conjunto completo.** Com `'7'` falta só
`MERCHANDISING`; com `'25'` faltam nove; com `'12'`, dez. O relatório que o usuário vê
depende de qual filial o Delphi guardou por último — não de quais ele marcou.

### O que ainda não está medido

Para não confundir o que foi conferido com o que foi deduzido:

- Os valores da tabela acima são do recorte de **três filiais**. Das nove linhas, só
  `TRANSPORTE T - (28)` foi quebrada por filial e por mês (inc9h) — e essa fechou ao
  centavo contra a exportação. As outras oito não têm essa quebra.
- Não medimos o efeito nas dimensões de **Centro de Custo simples**, onde a granularidade
  é o centro de custo inteiro e o defeito é muito maior. Falta referência (divergência nº 3).
- A folga de 0,16% na conferência do Sub-Total continua sem explicação fechada.

### Por que não foi replicado

Diferente dos outros defeitos da 9815, este **não é uma função**: o resultado depende
de qual filial sobrou numa variável do Delphi.

1. Na tela web a seleção é um conjunto de checkboxes, **sem ordem**. Não existe
   "última filial" para replicar.
2. O trace de 31/08 mostrou `IN ('12')` com 7 e 12 selecionadas — a última da lista.
   Mas isso vem de uma amostra; não sabemos se é ordem de lista ou de clique.
3. A própria rotina é incoerente: no bloco de baixo o autor acumulou as filiais.
   Não há comportamento coerente a reproduzir.

### O que a web faz

Usa a lista completa de filiais selecionadas no subselect. Consequência visível:
**C. Custo Principal mostra mais linhas que a 9815 quando mais de uma filial é
selecionada**, e os totalizadores ficam maiores em módulo.

### Como conferir

Selecione **uma filial só**. Nesse caso não há divergência possível — a lista completa
e a última filial são a mesma coisa —, e a web tem que bater ao centavo com a 9815.

**Evidências:** [inc9](validacao/inc9_filial_no_subselect_cc.sql) ·
[inc9b](validacao/inc9b_cc_principal_alcancavel.sql) ·
[inc9c](validacao/inc9c_cc_principal_periodo_da_exportacao.sql) ·
[inc9d](validacao/inc9d_quanto_a_9815_deixa_de_somar.sql) ·
[inc9e](validacao/inc9e_previsao_por_filial.sql) ·
[inc9f](validacao/inc9f_PREVISAO_REGISTRADA.md)

---

## 3. Centro de Custo simples não tem referência

**Afeta:** Centro de Custo. **Tamanho:** não mensurável. **Situação:** validação manual
com o negócio, pendente.

A análise por Centro de Custo **nunca funcionou** na 9815: falha sempre com `ORA-00923`,
por um parêntese sobrando no SQL montado pelo Delphi. Atrás dele espera um `ORA-01722`,
porque o código tem até dois separadores (`9701.001.02`) e não sobrevive a `TO_NUMBER` —
1.666 dos 1.757 centros de custo têm ponto.

Na web a chave de agrupamento é `VARCHAR2` e o defeito deixa de existir por construção.
Mas **não há resultado antigo para comparar**: é a única dimensão que precisa de
conferência manual com quem entende do negócio.

A divergência nº 2 também atinge esta dimensão, e com força muito maior — ali a
granularidade é o centro de custo inteiro, não os dois primeiros dígitos. Como não há
referência, não dá para medir.

---

## O que NÃO é divergência

Comportamentos que parecem defeito, foram conferidos, e são **reproduzidos de propósito**.
Estão aqui para que ninguém os "corrija" depois.

| Comportamento | Onde está documentado |
|---|---|
| `RECEITAS LIQUIDAS` não desconta ST, PIS e COFINS — são linhas informativas | [ROTINA_9815.md §5](ROTINA_9815.md) |
| Regime muda **só** a data das despesas; receita, deduções e CMV são idênticos | [ROTINA_9815.md §5](ROTINA_9815.md) |
| O mês da coluna acompanha o regime — em caixa, por `nvl(DTPAGTO, DTVENC)` | [ROTINA_9815.md §5](ROTINA_9815.md) |
| Despesa não paga nunca entra, nem em competência (`DTPAGTO IS NOT NULL`) | [ROTINA_9815.md §5](ROTINA_9815.md) |
| Duas bases de `%AV`: as cinco deduções sobre RECEITA BRUTA, o resto sobre a LÍQUIDA | [ROTINA_9815.md §13](ROTINA_9815.md) |
| `%AH` do primeiro mês é `0,00`, não vazio; mês anterior zero deixa a célula vazia | [ROTINA_9815.md §13](ROTINA_9815.md) |
| O bloco TOTAL não tem `%AV` nas cinco deduções | [ROTINA_9815.md §13](ROTINA_9815.md) |
| Cada mês é arredondado a duas casas **antes** de somar no TOTAL | [ROTINA_9815.md §13](ROTINA_9815.md) |
| O bloco informativo ignora "Mostrar Contas Zeradas" | [ROTINA_9815.md §10](ROTINA_9815.md) |

Otimizações de desempenho que **não podem** alterar valor — faturamento numa passada por
mês, `CODFILIAL IN (:lista)` no lugar de `UNION ALL`, remoção da conferência de rateio
com período hardcoded de 2012 — estão em [ROTINA_9815.md §6](ROTINA_9815.md) e §12.
Qualquer uma que mude um centavo é revertida.

---

## Riscos ainda não medidos

Não são divergências conhecidas — são cenários onde ainda não olhamos. Fecham na
Fase 5 ([HOMOLOGACAO.md](HOMOLOGACAO.md)).

| Risco | Por quê |
|---|---|
| Conta Gerencial | dimensão ainda não conferida contra exportação |
| Períodos de 3 e 4 meses | só validamos 1 e 2 meses |
| As 18 filiais juntas | só validamos 3 |
| Período sem movimento, 1 dia, virada de mês | recortes-limite não exercitados |
| Filial sem movimento no período | comportamento não observado |

---

## Duas armadilhas ao medir divergência

Ambas já produziram conclusão errada neste projeto. Detalhe em
[ROTINA_9815.md §11](ROTINA_9815.md).

1. **A exportação da 9815 esconde linhas zeradas.** Ausência no xlsx significa "fora da
   estrutura **ou** com valor zero" — as duas causas se confundem. Antes de afirmar que
   uma linha sumiu, prove que ela tem valor.
2. **A base é produção viva.** Exportar a 9815 e chamar a API têm que ser feitos em
   sequência imediata. Uma comparação já acusou R$ 24 mil de diferença que eram apenas
   lançamentos feitos entre as duas coletas — e a medição da divergência nº 2 tem
   0,16% de folga não explicada, provavelmente pela mesma causa.

---

## Validação de C. Custo Principal — 31/08/2026

Cenário: **01/07 a 31/07/2026, competência, filial 7 sozinha** — escolhido de propósito,
porque com uma filial só a divergência nº 2 não existe e os números têm que bater ao centavo.

| | |
|---|---|
| Linhas comparadas | 57 |
| Células comparadas | 114 (valor e `%AV`) |
| **Divergências** | **0** |

Cobre a consulta de estrutura, a de despesas, o faturamento, os quatro totalizadores, as
duas bases de `%AV` e a célula vazia de `%AV` na RECEITA BRUTA.

Um mês só **não exercita** `%AH`, `MÉDIA` nem o bloco TOTAL — a divergência nº 1 continua
valendo para períodos de mais de um mês.

Antes disso, a [inc9g](validacao/inc9g_comparacao_estrutura_ccusto.sql) já havia provado no
banco que a consulta de estrutura adaptada é equivalente à original nesse mesmo recorte.

### O critério de esconder linha é movimento, não valor

Conferido em 31/08/2026, no mesmo cenário. A 9815 **não** esconde linha por valor zero —
esconde por **não ter lançamento no período**:

| Linha | Valor | Lançamentos | A 9815 |
|---|---:|---:|---|
| DESCONTO FUNCIONÁRIOS | 0,00 | 16 | **mostra** |
| CONTRATO DE MUTUO | 0,00 | 18 | **mostra** |
| ALFALOG, VENDAS UNILEVER, RECEITAS NÃO OPERACIONAIS, RECEITA COM VERBAS | 0,00 | 0 | esconde |

Fecha na contagem: a consulta de despesas devolve **44 linhas com movimento**, e a
exportação tem **57** — as 44 mais as 13 calculadas (9 de cabeçalho, 4 totalizadores).
Nenhuma sobra.

A web usava valor zero como critério e escondia as duas primeiras. Corrigido: a linha do
DRE carrega `semMovimento`, somando os lançamentos do período, e é esse campo que o
filtro "Mostrar contas zeradas" usa. Linha calculada aparece sempre.

---

## Validação de Conta Gerencial — 31/08/2026

Cenário: **01/06 a 31/07/2026, competência, filiais 7, 12 e 25.** Dois meses, escolhidos
para exercitar `MÉDIA` e o bloco TOTAL, que a validação de C. Custo Principal não cobriu.

| Coluna | Células | Divergências |
|---|---:|---:|
| Junho — Valor | 133 | 0 |
| Junho — `% AV` | 133 | 0 |
| Julho — Valor | 133 | 0 |
| Julho — `% AV` | 133 | 0 |
| TOTAL — Valor | 133 | 0 |
| TOTAL — `% AV` | 133 | 0 |
| **TOTAL — `MÉDIA`** | 133 | **32** |
| | **931** | **32** |

Todas de um centavo, todas na MÉDIA — a divergência nº 1, já aceita. Nenhuma outra coluna
diverge.

Esta exportação não tem `% AH` (foi tirada sem análise horizontal), então essa coluna
continua sem conferência em Conta Gerencial. Ela foi conferida em Grupo de Contas.

### A contagem de linhas fechou exata

**133 linhas na exportação, 133 visíveis na API**, na mesma ordem. A apuração devolveu 354
linhas no total e o campo `semMovimento` escondeu exatamente as 221 certas.

É a validação da correção do critério de visibilidade contra um caso grande: a regra antiga,
que escondia por valor zero, teria deixado linhas sobrando.

### O mecanismo da MÉDIA, agora medido

Ver [ROTINA_9815.md §14](ROTINA_9815.md) para o detalhamento. Em resumo: com dois meses,
`MÉDIA = TOTAL ÷ 2`, e um TOTAL de centavo ímpar cai exatamente em `x,xx5` — o ponto médio,
onde só a regra de desempate decide.

| | |
|---|---:|
| Linhas com TOTAL de centavo ímpar | 60 |
| Linhas com TOTAL de centavo par | 73 |
| Divergências em linha ímpar | 32 |
| Divergências em linha par | **0** |

Nenhuma linha de centavo par diverge. Das 60 ímpares, 32 divergem — metade, o esperado
quando duas regras de desempate decidem cada empate de forma independente.

Isso explica a diferença de taxa entre dimensões: 6% em Grupo de Contas contra 24% aqui.
Não é a dimensão, é quantos totais caem em centavo ímpar naquele conjunto de linhas.

### A coluna `% AH`, e uma demonstração acidental da armadilha 2

Uma segunda exportação do mesmo cenário, agora **com análise horizontal marcada**, foi tirada
minutos depois da primeira. Ela acrescenta as duas colunas `% AH` — 266 células — e todas
batem, exceto nas seis linhas abaixo.

Entre a chamada da API e essa segunda exportação, **dois lançamentos entraram no banco**:

| Linha | Junho | Julho |
|---|---:|---:|
| Pensao Alimenticia | 0,00 | −1.134,70 |
| CREDITO FORNECEDORES | 0,00 | −599,90 |

Os quatro totalizadores moveram **exatamente −1.134,70**, nem um centavo a mais:
`Sub-Total`, `RESULTADO OPERACIONAL`, `Total das Despesas` e `LUCRO LIQUIDO`.

`CREDITO FORNECEDORES` mudou R$ 599,90 e **não moveu totalizador nenhum**, porque está
depois do LUCRO LIQUIDO, no bloco `NÃO SOMA`. A aritmética dos totalizadores
([ROTINA_9815.md §10](ROTINA_9815.md)) se confirmou sozinha, por acidente.

Junho não mudou em nada — lançamento novo cai na competência corrente.

**A comparação válida é a primeira**, tirada junto da API: 931 células, 32 divergências,
todas de um centavo na MÉDIA. Esta segunda serve para validar `% AH` e como lembrete de
que exportação e chamada da API têm que ser coletadas em sequência imediata.

---

## Atualização da nº 3 — Centro de Custo implementada em 31/08/2026

Os dois erros da 9815 somem por construção:

| Erro | Causa | Na web |
|---|---|---|
| `ORA-00923` | parêntese sobrando no SQL montado pelo Delphi — `decode(...)))`, dois abertos e três fechados, nas três cópias por filial | não reproduzido |
| `ORA-01722` | `TO_NUMBER` sobre código com ponto (`9701.001`); 1.666 dos 1.757 centros de custo têm | chave é texto em todo o caminho |

**Isso não valida os números.** Ninguém nunca viu este relatório funcionando, e não há
exportação para comparar. O que dá para fazer é ancorar em algo já conferido.

### A âncora: identidade contábil com C. Custo Principal

O centro de custo principal é, por definição, os dois primeiros dígitos do centro de custo.
Então a soma dos centros de custo que começam em `NN` **tem que dar exatamente** a linha do
principal `NN` — e essa linha já está validada ao centavo contra a 9815.

A [inc9j](validacao/inc9j_centro_custo_soma_no_principal.sql) mede isso.

O que a âncora **pega**: erro de agrupamento, perda ou duplicação de valor, sentinelas
(`9998`/`9999`) tratadas de forma diferente entre as duas dimensões.

O que ela **não pega**: se o lançamento certo caiu no centro de custo certo. Isso continua
dependendo de quem conhece a operação.

### Aviso na tela

O filtro mostra, sempre que Centro de Custo está escolhido:

> Esta análise nunca funcionou na 9815, então não há números antigos para comparar.
> Confira com quem conhece os centros de custo antes de usar para decidir.

E, com mais de uma filial marcada, um segundo aviso sobre a divergência nº 2.

### A âncora fechou — 31/08/2026

A [inc9j](validacao/inc9j_centro_custo_soma_no_principal.sql) voltou com **zero linhas**:
a soma dos centros de custo bate exatamente com a linha do principal, em todos os principais
do período (01/07 a 31/07/2026, competência, filiais 7/12/25).

**O que isso prova:** não há perda, duplicação nem erro de agrupamento entre as duas
granularidades, e as sentinelas `9998`/`9999` são tratadas igual nas duas.

**O que não prova:** se o lançamento certo caiu no centro de custo certo. Uma troca entre
dois centros de custo do **mesmo principal** passa por este teste sem deixar rastro — a soma
não muda. Só a conferência com quem conhece a operação pega isso.

Por isso a situação desta divergência continua **validação manual pendente**, e o aviso
segue na tela.

### Centro de Custo apurada pela API — 31/08/2026

Cenário: 01/07 a 31/07/2026, competência, filiais 7/12/25. **256 segundos**, sem erro —
nem `ORA-00923` nem `ORA-01722`.

O que foi possível conferir sem referência da 9815:

| Verificação | Resultado |
|---|---|
| As 9 linhas de cabeçalho contra a exportação de Conta Gerencial (mesmo período e filiais) | **batem ao centavo** |
| `RESULTADO OPERACIONAL` = LUCRO BRUTO + Sub-Total | 14.342.336,00 + (−16.425.449,27) = −2.083.113,27 ✓ |
| `LUCRO LIQUIDO` = LUCRO BRUTO + Total das Despesas | 14.342.336,00 + (−14.022.581,44) = 319.754,56 ✓ |
| Bloco pós-operacional: as 6 linhas somam `Total das Despesas − Sub-Total` | 2.402.867,83 ✓ exato |
| Soma dos centros de custo = linha do principal ([inc9j](validacao/inc9j_centro_custo_soma_no_principal.sql)) | zero divergências |

O cabeçalho não depende da dimensão, então a coluna de julho da exportação de Conta
Gerencial — já conferida contra a 9815 — serve de referência direta. Não é dedução.

**O que continua sem validação:** se o lançamento certo caiu no centro de custo certo.
Nenhuma dessas checagens pega uma troca entre dois centros de custo do mesmo principal.

Um ponto para quem conhece a operação olhar: dezenas de linhas se chamam `VENDIDO ...`,
`INATIVO`, `SUCATA`, `DISPONIVEL` — centros de custo de veículos já baixados. Quase todas
vêm zeradas, mas `2201.002 GTK7007 F27 FOI P/ 2201.017` indica migração de código em algum
momento, e só quem opera sabe se o histórico ficou correto.

### Regime de caixa validado em C. Custo Principal — 31/08/2026

Cenário: 01/07 a 31/07/2026, **caixa**, filial 7 sozinha. Escolhido para isolar a variável:
com uma filial não existe a divergência nº 2, e com um mês não existe a nº 1. Qualquer
diferença aqui só poderia vir do regime.

| | |
|---|---|
| Linhas comparadas | 57 |
| Células (valor e `% AV`) | 114 |
| **Divergências** | **0** |
| Linhas visíveis na API | 57 — a mesma contagem da exportação |

O regime muda **três** expressões de data, e as três foram exercitadas de uma vez:

| Expressão | Onde | Em caixa |
|---|---|---|
| `ExpressaoBucket` | mês da coluna | `nvl(DTPAGTO, DTVENC)` |
| `ExpressaoFiltro` | período das despesas | `nvl(DTPAGTO, DTVENC)` |
| `ExpressaoFiltroEstrutura` | órfãs e o subselect `CCC` | `DTPAGTO` **puro, sem o nvl** |

A terceira é a mais fácil de errar, porque difere da segunda. Era a única das três que ainda
não tinha sido exercitada fora de Grupo de Contas.

### Regime de caixa validado em Conta Gerencial — 31/08/2026

Mesmo recorte da validação anterior — 01/07 a 31/07/2026, caixa, filial 7 sozinha —,
trocando só a dimensão.

| | |
|---|---|
| Linhas comparadas | 111 |
| Células (valor e `% AV`) | 222 |
| **Divergências** | **0** |
| Linhas visíveis na API | 111 — a mesma contagem da exportação |

Com isso o regime de caixa está conferido em **três** dimensões: Grupo de Contas (na
validação original), C. Custo Principal e Conta Gerencial. Centro de Custo não tem
referência, mas usa as mesmas três expressões de data das outras.

---

## Placar da validação — 31/08/2026

| Cenário | Células | Divergências |
|---|---:|---|
| Grupo de Contas · competência · 2 meses · 3 filiais | 1305 | 9 centavos na MÉDIA |
| Conta Gerencial · competência · 2 meses · 3 filiais | 1197 | 32 centavos na MÉDIA |
| C. Custo Principal · competência · 1 mês · 1 filial | 114 | nenhuma |
| C. Custo Principal · **caixa** · 1 mês · 1 filial | 114 | nenhuma |
| Conta Gerencial · **caixa** · 1 mês · 1 filial | 222 | nenhuma |
| Centro de Custo · competência · 1 mês · 3 filiais | cabeçalho, totalizadores e âncora | nenhuma |
| | **2.952** | **41, todas de um centavo na MÉDIA** |

Em toda célula conferida, a única diferença é a divergência nº 1 — coluna derivada, um
centavo, mecanismo medido.

### Fase 5 — período de um dia · 31/08/2026

Cenário: **15/07/2026 a 15/07/2026**, competência, filial 7, Grupo de Contas.

| | |
|---|---|
| Linhas comparadas | 19 |
| Células (valor e `% AV`) | 38 |
| **Divergências** | **0** |
| Linhas visíveis na API | 19 — a mesma contagem da exportação |
| Rótulo do período | `Julho/2026` nos dois |

O `BETWEEN` com as duas pontas iguais funciona porque `DTCOMPETENCIA` não guarda hora —
medido antes do teste em [fase5b](validacao/fase5b_horas_em_dtcompetencia.sql), justamente
porque num período de um dia a hora custaria tudo em vez de um dia.

`PeriodoDre.Entre` deriva o mês do período **pedido**, não dos dados, e um recorte parcial
de mês continua rendendo um bucket só — igual à 9815.

### Fase 5 — virada de mês · 31/08/2026

Cenário: **15/06 a 15/07/2026**, competência, filial 7, Grupo de Contas. Dois meses
**parciais** — junho de 15 a 30, julho de 1 a 15.

| Coluna | Células | Divergências |
|---|---:|---:|
| jun: Valor, `% AV`, `% AH` | 96 | 0 |
| jul: Valor, `% AV`, `% AH` | 96 | 0 |
| TOTAL: Valor, `% AV` | 64 | 0 |
| TOTAL: `MÉDIA` | 32 | **6** |
| | **288** | **6** |

Todas de um centavo — a divergência nº 1. Contagem de linhas exata: 32 na exportação, 32
visíveis na API, e os rótulos `Junho/2026` e `Julho/2026` idênticos.

**O que este cenário exercitou pela primeira vez:** o recorte da consulta de faturamento em
meses **parciais**. A otimização da [§12](ROTINA_9815.md) fatia o período por mês usando o
maior entre o início do mês e a `dataInicio`, e o menor entre o fim do mês e a `dataFim`.
Todos os testes de dois meses anteriores usaram meses inteiros — os dois limites nunca
tinham sido tocados.

**O mecanismo da MÉDIA, terceira medição independente:**

| | |
|---|---:|
| Linhas com TOTAL de centavo ímpar | 13 |
| Linhas com TOTAL de centavo par | 19 |
| Divergências em linha ímpar | 6 |
| Divergências em linha par | **0** |

Metade de 13 é 6,5; observadas 6. A explicação medida em Conta Gerencial se sustenta num
recorte completamente diferente.

### Fase 5 — filial parada e filial meio-vazia · 31/08/2026

Julho/2026, competência, Grupo de Contas.

| Cenário | Linhas | Células | Divergências |
|---|---:|---:|---:|
| Filiais **7 e 35** — a 35 sem despesa e sem nota | 32 | 64 | **0** |
| Filial **1** (ALFALOG) — 53 lançamentos, zero notas | 18 | 36 | **0** |

A filial parada não contamina nada: entra no `IN (...)`, não contribui com linha nenhuma, e
o resultado é idêntico ao da filial ativa sozinha.

#### A pergunta em aberto do `%AV` foi respondida

A [primeira rodada](validacao/fase5a_PREVISAO_periodo_sem_movimento.md) só mostrou o
comportamento de base zero **quando o valor também era zero**. ALFALOG deu o outro caso —
cabeçalho zerado, despesas valendo:

| Linha | Valor | `% AV` nos dois |
|---|---:|---|
| (-) ABAT./DESC. e as outras quatro deduções | 0,00 | `0,000` |
| Despesas Adm e Vendas | (238.088,55) | **vazio** |
| FECH-RESULTADO | 917.873,00 | **vazio** |
| Sub-Total, RESULTADO OPER., LUCRO LIQUIDO | (238.213,04) e outros | **vazio** |

**Com base zero, só as cinco deduções escrevem `0,000`. Todo o resto fica vazio, tenha
valor ou não.** O `CalcularAv` já fazia isso, e agora é observação em vez de palpite.

Confirma também a aritmética no caso degenerado: `LUCRO BRUTO` zero faz
`RESULTADO OPERACIONAL` igualar o `Sub-Total`, e `LUCRO LIQUIDO` igualar o
`Total das Despesas`.

---

## O filtro de filiais — 18, depois 13

**Decisão de 31/08/2026.** Reversível numa linha; o histórico está aqui para que a reversão
seja informada, e não uma volta atrás no escuro.

### O que mudou

A consulta de filiais ganhou `AND F.DBLEPCTI IS NULL`. O filtro passa de **18 para 13**.

### Por quê

A tela de pré-seleção da 9815 oferece **nove** filiais; a nossa oferecia **18**. Isso foi
decisão consciente de 27/08/2026 — a web não tem essa tela, então o filtro nascia com o
cadastro inteiro.

O que ninguém sabia naquele momento: **cinco das nove a mais têm os dados em outro banco.**

| Filial | Label | Empresa | `DBLEPCTI` |
|---|---|---|---|
| 13 | MR::BH - BELO HORIZONTE | MRURAL | `@DBLEPCTICF` |
| 16 | SUP-NP | SUP | `@DBLEPCTISUP` |
| 17 | SUP-PL | SUP | `@DBLEPCTISUP` |
| 18 | SUP-SM | SUP | `@DBLEPCTISUP` |
| 19 | FUT-2013- | FUT | `@DBLEPCTIFUT` |

O `@` é sintaxe de **database link** do Oracle. Nosso `PCLANC` local não tem o movimento
delas — e foi por isso que apareceram com zero na
[fase5c](validacao/fase5c_movimento_por_filial.sql). **Não estão paradas: estão em outro
lugar.**

Selecionar uma delas na web devolveria um DRE inteiramente zerado, que parece um relatório
legítimo de operação sem movimento. **Um zero falso é pior que um erro, porque não parece
erro** — ninguém abre chamado por um relatório que "funcionou".

### O que NÃO mudou

As outras quatro que a 9815 não oferece continuam na lista:

| Filial | Label |
|---|---|
| 20 | EPC-CEASA |
| 22 | EPC-RJ |
| 31 | CeM-ES |
| 91 | CeM-MG |

Não têm link, os dados estão nesta base, e o zero delas é verdadeiro. São filiais
**inativas**, não ausentes — e apurar uma delas devolve um zero honesto, que confere com o
que a 9815 devolveria se as oferecesse.

### Como reverter

Apagar `AND F.DBLEPCTI IS NULL` de `DreGerencialQueries.Filiais`. Uma linha.

**Quando isso faria sentido:** se a API passar a consultar as bases remotas via database
link, ou se alguém precisar do relatório zerado dessas filiais por algum motivo que não
antecipamos. Enquanto a apuração ler só a base local, mostrar as cinco é oferecer um número
que não é o número delas.

### O que continua sem resposta

O critério da 9815 **não é o database link**: ela também não oferece as quatro sem link. E
não é movimento — a filial 35 está parada em julho e aparece na lista dela. Existe outro
filtro na tela de pré-seleção que não mapeamos, provavelmente uma configuração própria.
Não afeta a apuração; afeta só quais filiais cada tela oferece.

### Fase 5 — quatro meses · 31/08/2026

Cenário: **01/04 a 31/07/2026**, competência, filial 7, Grupo de Contas. Quatro meses, com
análise horizontal marcada. **436 segundos.**

| Colunas | Células | Divergências |
|---|---:|---:|
| abr, mai, jun, jul — Valor, `% AV`, `% AH` | 456 | 0 |
| TOTAL — Valor, `% AV` | 76 | 0 |
| TOTAL — `MÉDIA` | 38 | **2** |
| | **570** | **2** |

Contagem de linhas exata: 38 na exportação, 38 visíveis. As quatro colunas de `% AH`
bateram, inclusive o `0,00` de abril, que não tem mês anterior — foi a primeira vez que
testamos comparação horizontal encadeada por mais de um mês.

#### A condição de empate da MÉDIA, refinada

Com divisor 4, `MÉDIA = TOTAL ÷ 4` cai exatamente em `x,xx5` quando o total em centavos
satisfaz **`T mod 4 = 2`** — não é "múltiplo ímpar de 0,25", como estimei antes de medir.

| `T mod 4` | Linhas | Na MÉDIA |
|---|---:|---|
| 0 | 14 | divisão exata |
| 1 e 3 | 17 | sobra além do meio-centavo — não empata |
| **2** | **7** | **empate exato** |

**As 2 divergências caíram nas 7 de empate; zero nas outras 31.** Foram
`(=) RECEITAS LIQUIDAS` e `Acerto De Estoque`.

A parte **estrutural** do mecanismo — divergência só em empate — se sustentou pela quarta
medição independente. A parte **estatística** é mais frouxa: esperava-se metade dos empates,
3,5, e vieram 2. Com sete casos isso é variação de moeda, não contradição.

A taxa geral caiu como a previsão dizia: de ~20% com dois meses para **5,3%** com quatro.
Quanto maior o divisor, mais raro o empate.

---

## 4. Correção deliberada: o detalhamento agora fecha com a linha do DRE

**Esta é a primeira vez que a web sai de propósito do que a 9815 faz.** Decisão do Gabriel
em 01/09/2026, ao ver a medição abaixo. Instrução de reversão no fim da seção.

### O que a 9815 faz

Duas telas de detalhamento, abertas com duplo clique no valor, não somam o valor da linha
que foi clicada. Medido no cenário do print de 01/09/2026 — C. Custo Principal, caixa,
agosto/2026, filiais 7, 12 e 25:

| Linha clicada | DRE | Detalhamento | Diferença |
|---|---|---|---|
| `(+) RECEITA BRUTA` | 55.753.802,35 | 52.193.509,49 | 3.560.292,86 |
| `(-) ABAT./DESC.` | 4.663.258,65 | 4.663.258,6534 | — bate |
| `(-) DEVOLUCAO` | 1.256.167,12 | 1.370.523,10 | 114.355,98 |
| `(=) RECEITAS LIQUIDAS` | 49.834.376,58 | 46.159.727,74 | 3.674.648,84 |

O total do detalhamento é a soma das **15.444** linhas do `resultado.xlsx`, não da tela
carregada pela metade — a conferência não tem esse atalho.

**A lista de lançamentos não tem o problema.** `DIRETORIA` fecha em −256.840,02 e
`COMPRAS - RAT` em −278.024,83, ambas idênticas à linha do DRE. A correção abaixo não
toca nela.

### Por que não fecha

As duas telas da própria 9815 consultam com critérios diferentes:

| | Query do DRE | Query do detalhamento |
|---|---|---|
| Receita bruta | `SUM(ptabela * qt)` | `SUM((ptabela - nvl(st,0)) * qt)` |
| Devolução | junta `PCPEDC` exigindo `CONDVENDA IN (1,3,5,6,8)`, e `PCPRODUT` por junção interna | não tem nenhum dos dois; em compensação aplica `mostra_dre = 'S'` |

E as **duas telas de detalhamento discordam entre si** sobre a mesma devolução: a de
receita por cliente arredonda o item em duas casas e a de motivos em quatro, dando
1.370.523,10 contra 1.370.523,2318 para o mesmo conjunto de notas.

### O que a web faz

O detalhamento passa a usar **os critérios da linha do DRE**:

- receita bruta soma `ptabela * qt`, sem subtrair ST;
- devolução usa o mesmo recorte e o mesmo arredondamento da apuração, nas duas telas.

O resultado é que o total do detalhamento fecha com o valor clicado.

### Por que aqui a fidelidade cede

A regra do projeto é reproduzir a 9815 inclusive no que parece defeito, e ela se sustenta
porque o alvo é o **número**: se a web mostrasse outro valor, ninguém saberia qual acreditar.

Aqui é o oposto. As duas telas da 9815 mostram números diferentes **para a mesma coisa**,
e uma delas já contradiz a outra — não existe "o número da 9815" a preservar. Replicar
seria escolher preservar a contradição, e a contradição é justamente o que o detalhamento
existe para resolver: quem clica está perguntando "de onde vem este valor". Uma resposta
que não soma o valor perguntado não responde nada.

### A correção foi medida — 01/09/2026

[dc2](validacao/dc2_receita_por_cliente_corrigida.sql) registrou as cinco previsões antes
de rodar, e as cinco bateram:

| Coluna | Antes | Previsto | Medido |
|---|---|---|---|
| `REC_BRUTA` | 52.193.509,49 | 55.753.802,35 | 55.753.802,354557 |
| `DESCONTO` | 4.663.258,65 | 4.663.258,65 | 4.663.258,65342 |
| `DEVOLUCAO` | 1.370.523,10 | 1.256.167,12 | 1.256.167,12 |
| `REC_LIQUIDA` | 46.159.727,74 | 49.834.376,58 | 49.834.376,581137 |
| `CUSTO_LIQ` | 36.960.829,81 | 37.039.545,89 | 37.039.545,88513 |

**A contagem de clientes caiu de 15.444 para 15.443** — exatamente um. A diferença da
devolução, 114.355,98, é ao centavo o valor de `POTENCIAL COMERCIO E DIST. LTDA`
(codcli 174297), que aparecia na lista antiga com receita bruta zero: existia ali só por
causa de uma devolução que não passa no critério da apuração. Com o critério corrigido o
cliente some inteiro, e a linha some junto.

Isso é coerente com a aritmética, mas não foi provado diretamente — quem quiser fechar,
roda o bloco de devolução de dc2 com `AND cli.codcli = 174297` e confere que volta vazio.

### A devolução por motivo também fechou — 01/09/2026

[dc3](validacao/dc3_devolucao_por_motivo_corrigida.sql), previsão registrada antes de rodar:

| | Antes (9815) | Previsto | Medido |
|---|---|---|---|
| Total | 1.370.523,2318 | 1.256.167,12 | **1.256.167,12** |
| `PPART` somado | 100,02 | 100,00 ± 0,03 | 100,01 |
| Motivos | 27 | — | 27 |

**Nenhum motivo desapareceu.** A troca de critério mexeu nos valores — `DESACORDO COM O
PEDIDO` sai de 307.239,3733 para 307.239,24, efeito das duas casas — mas as 27 linhas
continuam lá, e a contagem de notas de cada motivo não mudou. É o esperado: a devolução
que saiu na tela de receita era de um cliente, não de um motivo inteiro.

Com isto **as três telas fecham com a linha clicada**: receita por cliente e devolução por
motivo pela correção, e a lista de lançamentos porque já fechava.

**Custo:** a consulta de receita levou **116,9 s**. A da 9815 levava 30,3 s — a diferença vem das
junções que o critério da apuração exige (`PCPEDC`, `PCMOVCOMPLE`, `PCPRODUT` na
devolução). Fechar os números veio primeiro; a otimização é assunto à parte, e dois
minutos é tempo demais para uma tela que abre com duplo clique.

### Como reverter

Em `DreGerencialQueries`, nas consultas de detalhamento:

1. **Receita bruta** — trocar `MV.ptabela * MV.qt` por `(MV.ptabela - nvl(MV.st,0)) * MV.qt`
   nos blocos de venda.
2. **Devolução** — remover a junção com `PCPEDC` e o filtro `CONDVENDA`, remover a junção
   interna com `PCPRODUT`, acrescentar `nvl(esp.mostra_dre,'S') = 'S'`, e voltar o
   arredondamento da tela de motivos para `round(..., 4)`.

**Quando isso faria sentido:** se a conferência contra a 9815 passar a ser feita tela a
tela em vez de número a número, e alguém precisar que o detalhamento web reproduza a
exportação antiga do detalhamento — inclusive a diferença. Enquanto a conferência for do
DRE, fechar é o comportamento útil.

### O que continua sem resposta

Não sabemos **qual dos dois critérios a 9815 considera certo** — se a receita bruta deveria
ou não descontar ST é uma pergunta contábil, não de código, e as duas telas dela respondem
diferente. A web escolheu o critério da linha do DRE porque é o que já foi conferido ao
centavo contra a rotina antiga em milhares de células. Se a área contábil disser que o
certo é o outro, muda a linha do DRE também — e aí é outra conversa, bem maior.

---

## Validação do detalhamento — 01/09/2026

As três telas conferidas contra a 9815, no cenário do print (C. Custo Principal, caixa,
agosto/2026, filiais 7/12/25).

### Lançamentos — cinco de cinco, pela API

[dc5](validacao/dc5_lancamentos.sh) bate **contagem e soma** de cada linha exportada, não
só o total. Cobre os três blocos:

| Linha | Bloco | Chave | Lançamentos | Soma | Tempo |
|---|---|---|---|---|---|
| DIRETORIA | operacional | `14` | 129 | −256.840,02 | 1,6 s |
| COMPRAS - RAT | operacional | `11` | 92 | −278.024,83 | 0,2 s |
| RECEITAS FINANCEIRAS | pós-operacional | `80` | 6.276 | 445.891,19 | 2,3 s |
| ACERTO DE ESTOQUE | órfã | `3000003` | 62 | −83.723,73 | 1,2 s |
| DISTRIBUIÇÃO DE LUCROS | órfã | `2342010001` | 2 | −50.000,00 | 0,0 s |

Os dois últimos blocos são os que valem: `pos-operacional` e `orfa` trocam o `in` por
`not in` nas duas subconsultas contra `EPCPARDRE` e mudam a coluna do recorte. Errar um
deles devolve a contagem de outro bloco, e a soma denuncia na hora.

**O rateio de centro de custo está correto:** o `RECNUM` 20638205 volta duas vezes, em
`1401.001` e `1401.003`, com −2.912,90 e −2.265,59 — exatamente as duas linhas da
planilha da 9815.

### Receita e devolução

Validadas por consulta direta, em [dc2](validacao/dc2_receita_por_cliente_corrigida.sql) e
[dc3](validacao/dc3_devolucao_por_motivo_corrigida.sql), com previsão registrada antes de
rodar. Ver §4 acima.

### O tempo é o problema, e é de uma tela só

Lançamentos responde entre 0,2 s e 2,3 s, mesmo com 6.276 linhas. A receita por cliente
leva **116,9 s** — ela varre as mesmas notas da apuração, e nenhuma das outras faz isso.

**Não foi limitada por número de linhas.** Um teto exigiria somar o total à parte, e a tela
existe justamente para mostrar de onde vem o valor da linha; um total que não é a soma do
que está na tela recria, por outro caminho, o problema que a §4 corrigiu. A espera fica
visível com o mesmo cronômetro da apuração, e a otimização é assunto medido à parte.

### Um objeto que faltava permissão

O primeiro `curl` devolveu `ORA-00942`. Três objetos aparecem no detalhamento e em nenhuma
consulta da apuração — `PCMOVCR`, `PCMOVCIAP` e `PCPRODCIAP` —, todos alimentando apenas
colunas acessórias. Era `GRANT` para o usuário da API, resolvido sem tocar em consulta:
`DTCOMPENSACAO` voltou preenchida, que é justamente `PCMOVCR`.

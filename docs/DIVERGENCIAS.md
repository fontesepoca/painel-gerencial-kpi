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

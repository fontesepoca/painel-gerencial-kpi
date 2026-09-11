# Divergências de valores entre a versão web e a 9815

Documento único e vivo. Toda diferença numérica entre o que a tela web mostra e o
que a rotina 9815 mostra tem que estar aqui — medida, explicada e com a decisão
registrada. O que não estiver aqui é defeito, não escolha.

**Princípio que governa** ([ROTINA_9815.md §1](ROTINA_9815.md)): a web reproduz a
9815 ao centavo, inclusive nos pontos que parecem defeito. Divergir é exceção, e
cada exceção precisa de três coisas: a medida, o motivo de não ser reproduzível, e
a aprovação do Gabriel.

**Última revisão:** 02/09/2026.

---

## Índice

| # | Divergência | Dimensões afetadas | Tamanho | Situação |
|---|---|---|---|---|
| [1](#1-a-coluna-média-em-um-centavo) | Coluna MÉDIA | todas | 1 centavo | aceita em 28/08/2026 |
| [2](#2-a-filial-única-no-subselect-de-centro-de-custo) | Filial única no `CCC` | C. Custo Principal | R$ 2,56 mi em 2 meses | **corrigida** em 31/08/2026 |
| [3](#3-centro-de-custo-simples-não-tem-referência) | Sem referência | Centro de Custo | não mensurável | validação manual pendente |
| [4](#4-correção-deliberada-o-detalhamento-agora-fecha-com-a-linha-do-dre) | Detalhamento não fecha com a linha | todas as linhas que abrem duplo clique | R$ 3,56 mi em 1 mês, mais estorno de baixa e contas escondidas | **corrigida de propósito** em 01–02/09/2026 · 162/162 |
| [6](#6-a-linha-receita-venda-ativo-sumia-da-tela--11092026) | `RECEITA VENDA ATIVO` escondida | todas | R$ 225 mil em 1 mês na filial 28 | **corrigida** em 11/09/2026 · dc23 24/24 |

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

`TRANSPORTE T - (28)`, o maior deles, foi conferido diretamente nos dois xlsx: **(664.912,50)**
em junho e **(910.940,98)** em julho com 7 e 12 marcadas, e linha inexistente com 7/12/25.

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

Revisado em 02/09/2026: dos cinco riscos abertos em 28/08, **quatro fecharam**. A matriz da
HOMOLOGACAO.md ainda não foi atualizada com essas medições — quem for lê-la deve confiar
nas seções deste documento, que são posteriores.

| Risco | Situação |
|---|---|
| Conta Gerencial | ✅ [conferida em 31/08](#validação-de-conta-gerencial--31082026) — 1.197 células, só a MÉDIA |
| Período de 4 meses | ✅ [medido em 31/08](#fase-5--quatro-meses--31082026) — 570 células, 2 divergências de MÉDIA |
| Período de 3 meses | ⬜ **continua sem medição.** Pulamos de 2 para 4 |
| As filiais todas juntas | ⬜ **continua sem medição.** O máximo testado são 3 |
| Período sem movimento, 1 dia, virada de mês | ✅ [medidos em 31/08](#fase-5--período-de-um-dia--31082026) — 0 divergências |
| Filial sem movimento no período | ✅ [medida em 31/08](#fase-5--filial-parada-e-filial-meio-vazia--31082026) — a parada não contamina nada |
| O duplo clique **pela tela** | ⬜ a API fecha 162/162, mas o caminho pela interface com dado real nunca foi percorrido ponta a ponta |
| `% AH` em Conta Gerencial | ⬜ a exportação usada saiu sem análise horizontal; a coluna só foi conferida em Grupo de Contas |

Os dois períodos e o conjunto de filiais são riscos de **custo**, não de valor: quatro meses
levaram 436 s, e o que ninguém mediu é o que acontece com 11 filiais de uma vez. Nenhum
mecanismo depende do número de meses ou de filiais — o recorte parcial de mês, que era o
único candidato, foi exercitado na virada de mês.

---

## Quatro armadilhas ao medir divergência

Todas já produziram conclusão errada neste projeto. Detalhe das duas primeiras em
[ROTINA_9815.md §11](ROTINA_9815.md).

1. **A exportação da 9815 esconde linhas zeradas.** Ausência no xlsx significa "fora da
   estrutura **ou** com valor zero" — as duas causas se confundem. Antes de afirmar que
   uma linha sumiu, prove que ela tem valor.
2. **A base é produção viva.** Exportar a 9815 e chamar a API têm que ser feitos em
   sequência imediata. Uma comparação já acusou R$ 24 mil de diferença que eram apenas
   lançamentos feitos entre as duas coletas — e a medição da divergência nº 2 tem
   0,16% de folga não explicada, provavelmente pela mesma causa.
3. **Compilar não é publicar.** `dotnet build -t:CoreCompile` compila sem gerar o
   executável, e uma conferência que compara a API contra ela mesma não percebe que está
   falando com um binário velho — [o caso completo](#a-armadilha-3-em-detalhe-medir-contra-um-binário-velho).
4. **Uma coluna zerada pode ser o mapeamento, não o dado.** O Dapper ignora maiúsculas, mas
   **não ignora underscore**: um alias `QDE_NF` não encontra a propriedade `QdeNf` e a
   coluna sai zerada, em silêncio — [o caso completo](#a-armadilha-4-em-detalhe-a-coluna-de-notas-veio-zerada-e-não-era-o-sql).

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

## O filtro de filiais — 18, depois 13, 11, agora 9

**Decisões de 31/08 e 02/09/2026.** Cada uma reversível numa linha; o histórico está aqui
para que a reversão seja informada, e não uma volta atrás no escuro.

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

### O que NÃO mudou naquele momento

As outras quatro que a 9815 não oferece ficaram na lista:

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

### As duas CeM saíram — 02/09/2026

Instrução do Gabriel, **revertendo a decisão de 31/08** que as mantinha. A consulta ganhou
`AND F.CODFIL NOT IN ('31','91')` e o filtro passa de **13 para 11**: saem `31 CeM-ES` e
`91 CeM-MG`.

O motivo não é técnico — elas não têm database link e o zero delas continua sendo verdadeiro.
É de escopo: não pertencem à operação que este DRE mede, e oferecê-las no filtro só cria
oportunidade de apurar por engano.

**Por que o critério é o código, e não `LABEL LIKE 'CeM%'`.** `LABEL` é campo de exibição.
Amarrar o que o DRE apura ao texto que aparece na tela transforma um rename de cadastro em
mudança silenciosa de resultado — e ninguém que renomeia uma filial imagina estar mexendo
em relatório. O preço é que uma CeM nova entraria na lista sem avisar: **se aparecer uma
terceira, o certo é procurar o atributo de cadastro que separa as CeM e trocar a lista por
ele.** A [fase5d](validacao/fase5d_filiais_que_a_9815_oferece.sql) é o ponto de partida —
foi ela que levantou os atributos de cadastro das 18.

**Como reverter:** apagar a linha. As duas voltam.

### Mais duas saíram — 09/09/2026

Instrução do Gabriel. A lista de exclusões passa a
`AND F.CODFIL NOT IN ('20','31','35','91')`, e o filtro vai de **11 para 9**:

| | |
|---|---|
| `20 EPC-CEASA` | EPC — EPC - CEASA, ordem 1 |
| `35 VIVALOG-SUL` | VIVALOG — VIVALOG-SUL, ordem 3 |

Mesmo motivo de escopo das CeM: as duas têm os dados nesta base, o zero delas seria
verdadeiro, e ainda assim ninguém deve apurá-las — oferecê-las no filtro só cria
oportunidade de erro.

**Vale registrar que a 20 chegou a ser defendida nesta lista.** Em 31/08/2026, quando as
cinco filiais com database link saíram, a `20 EPC-CEASA` foi explicitamente **mantida**, com
o argumento de que ela não tem link, os dados estão aqui e o zero dela é legítimo — "filial
inativa, não ausente". O argumento continua correto; a decisão de negócio passou por cima
dele. Não é contradição, e a distinção importa para as próximas: **"o número está certo" e
"esta linha deve estar no filtro" são perguntas diferentes**, e a segunda não é técnica.

**O filtro é a única barreira.** `ValidarPeriodoEFiliais` exige ao menos uma filial e não
confere se os códigos recebidos estão entre os apuráveis: um `POST /apuracao` com
`"filiais": ["20"]` continua sendo atendido. Para a tela isso não muda nada — ela só oferece
as 9 —, mas quem chamar a API direto ainda consegue apurar as excluídas. Fechar isso é uma
validação no serviço, e não foi pedida.

**Como reverter:** tirar o código da lista. Cada um sai sozinho.

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

A [dc10](validacao/dc10_o_que_sobra_alem_do_st.sql) corroborou por outro lado em 02/09: os
dois critérios de devolução devolvem **1.684 e 1.682 notas**, e a diferença de valor entre
eles é 114.355,98 ao centavo. Duas notas a mais, o mesmo valor — compatível com um único
cliente, que é o que a contagem de clientes já dizia.

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
devolução). Fechar os números veio primeiro; a otimização é assunto à parte.

> Medição revista em 02/09: os 116,9 s foram **a frio**. No uso real o duplo clique vem
> depois de uma apuração do mesmo período, e aí a mesma consulta responde em 8,2 s —
> [ver adiante](#o-detalhamento-da-receita-não-custa-dois-minutos-sempre).

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

[dc5](validacao/dc5_APOSENTADA_lancamentos.sh) bate **contagem e soma** de cada linha exportada, não
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
leva **116,9 s a frio** — ela varre as mesmas notas da apuração, e nenhuma das outras faz
isso. Quente, logo depois de uma apuração do mesmo período, são **8,2 s**; o caso real é o
quente ([medido em 02/09](#o-detalhamento-da-receita-não-custa-dois-minutos-sempre)).

**Não foi limitada por número de linhas.** Um teto exigiria somar o total à parte, e a tela
existe justamente para mostrar de onde vem o valor da linha; um total que não é a soma do
que está na tela recria, por outro caminho, o problema que a §4 corrigiu. A espera fica
visível com o mesmo cronômetro da apuração, e a otimização é assunto medido à parte.

### Um objeto que faltava permissão

O primeiro `curl` devolveu `ORA-00942`. Três objetos aparecem no detalhamento e em nenhuma
consulta da apuração — `PCMOVCR`, `PCMOVCIAP` e `PCPRODCIAP` —, todos alimentando apenas
colunas acessórias. Era `GRANT` para o usuário da API, resolvido sem tocar em consulta:
`DTCOMPENSACAO` voltou preenchida, que é justamente `PCMOVCR`.

### O detalhamento fecha em todas as linhas — 02/09/2026

[dc6](validacao/dc6_ponta_a_ponta.mjs) apura uma vez e confere **cada** linha que abre
duplo clique contra o próprio detalhamento dela, no mesmo retrato:

> **157/157 fecham ao centavo.** (162/162 desde 03/09, com ABAT./DESC., CMV LIQ.,
> ST, PIS e COFINS.)

Chegar lá exigiu mais duas correções, achadas pela [dc7](validacao/dc7_diagnostico_do_detalhamento.mjs)
e previstas na [dc8](validacao/dc8_PREVISAO_dois_filtros.md) antes de rodar. **As duas telas
da 9815 divergem em dois filtros**, e foi a terceira e a quarta vez que isso aparece:

| Filtro | Apuração | Detalhamento da 9815 | O que a web faz |
|---|---|---|---|
| `FIN.DTESTORNOBAIXA IS NULL` | não tem | tem | **removido** |
| `FIN.CODCONTA NOT IN (EPCPARDRE_NAOEXIBIR)` | tem | não tem | **acrescentado** |

**O estorno de baixa** explicava dois casos ao centavo. `VENDAS` tinha 626 lançamentos na
linha e 601 no detalhamento — os 25 que faltavam somam os −471,87 da diferença. E
`RATEIO DESP. CORPORATIVAS` tinha um lançamento de +36.726,00 fora do bloco operacional e
um de −36.726,00 fora do pós-operacional: como caíam um em cada bloco, **as duas linhas
erravam em sentidos opostos e o total geral continuava fechando**, que foi o que tornou o
defeito difícil de enxergar.

**O `EPCPARDRE_NAOEXIBIR`** explicava as outras 18. São contas que o DRE esconde de
propósito — `Verbas Rebaixa Custo`, `Estoque De Transporte`, `Estoque De Terceiros` —, e
sem o filtro o detalhamento mostrava R$ 1,46 milhão numa linha escrita 0,00.

### Consequência: a lista de lançamentos ficou maior que a da 9815

Incluir os estornos é o que faz o total fechar com a linha, mas muda o que a tela mostra.
`DIRETORIA` sai com **135 lançamentos** onde a 9815 exporta 129 — e com a **soma idêntica**,
−256.840,02, porque os seis a mais se cancelam. São o par baixa/estorno.

Quem conferir tela contra tela vai achar linhas a mais. Quem conferir **valor** contra valor
encontra o mesmo número, que é o que importa e o que a §4 decidiu preservar.

#### Resolvido no front, sem tocar nas consultas — 10/09/2026

A consequência acima virou reclamação de usuário: no detalhamento de `ADMINISTRATIVO`
apareciam dois lançamentos `REF.ESTORN.BORDERO JA BAIXADO` que a 9815 não mostra, e aquilo
foi lido como valor entrando no cálculo.

Medido nos dois arquivos do mesmo cenário — filial 7, 01/09 a 10/09/2026:

| | Lançamentos | Soma |
|---|---:|---:|
| 9815 | 5 | −71.311,55 |
| Nossa web, antes | 7 | −71.311,55 |

**O cálculo estava certo**; o par se cancela. Era ruído de leitura, não erro de número.

A saída foi um filtro **de apresentação**, em `client-new-kpi/lib/estornosQueSeAnulam.ts`:
some da lista o par de estorno que se anula, e **só ele**. Duas condições, por motivos
diferentes:

- **valores opostos** — a soma do par é zero, então nenhum total muda, e é isso que mantém o
  rodapé fechando com a linha do DRE;
- **mesmo grupo** (centro de custo + conta) — sem esta, esconder um par dividido entre duas
  contas manteria o total geral e **mudaria os dois subtotais**, que é o defeito da 9815 com
  outro nome. É literalmente o caso do `RATEIO DESP. CORPORATIVAS` acima.

Estorno **sem par** continua visível: ele afeta o total, e sumir com ele seria mentir sobre a
soma. E a tela **diz o que escondeu** — quem compara a contagem de linhas com a rotina antiga
precisa saber por que ela difere.

Nada disso chega ao banco: as consultas continuam trazendo tudo, e o filtro é reversível
apagando uma chamada. Aplicado também ao Excel, para o arquivo não contar outra história.

Verificado: [dc17](validacao/dc17_estornos_que_se_anulam.mjs) com **225 asserções** — os
casos que NÃO podem ser escondidos inclusive, e 200 listas aleatórias em que a soma nunca
mudou — e a **dc6 em 162/162** depois da mudança. Na tela, `ADMINISTRATIVO` passou de 7 para
5 lançamentos com o rodapé em (71.311,55), idêntico à célula do DRE.


### A armadilha 3 em detalhe: medir contra um binário velho

A primeira execução da dc6 depois da correção devolveu **exatamente** o resultado anterior —
mesmos 136/157, mesmos 601 itens em `VENDAS`. A mudança não tinha chegado na API.

A causa foi método, não código: as verificações vinham sendo feitas com
`dotnet build -t:CoreCompile`, que **compila mas não gera o executável**. Foi um contorno
adotado quando o `bin/` estava travado pelo processo em execução, e nunca revisto — então
"compila limpo" nunca significou "chegou na API". A DLL em `bin/` era 16 minutos mais velha
que o fonte.

**Uma conferência que compara a API contra ela mesma não percebe que está falando com um
binário velho.** Os dois lados vêm do mesmo processo, e um retrato coerente de código
obsoleto passa por correto. O sinal foi o resultado ter vindo idêntico ao anterior, dígito
a dígito — coincidência que dado vivo não produz.

### A rede de segurança da dc8 disparou, e estava mal especificada

A previsão dizia que as cinco linhas da [dc5](validacao/dc5_APOSENTADA_lancamentos.sh) tinham que
continuar fechando, "porque não têm estorno nem conta escondida envolvidos". **Duas têm.**
`DIRETORIA` ganhou 6 lançamentos e `COMPRAS - RAT` ganhou 7. Não foi a mudança pegando mais
do que devia: foi a premissa que estava errada.

Por isso a dc5 foi aposentada. Ela comparava nosso detalhamento com a exportação do
detalhamento da 9815, e essa referência deixou de valer no momento em que decidimos divergir
dela. A conferência que vale agora é a dc6, contra a linha do DRE.

### Por que a RECEITA LÍQUIDA difere da 9815 — decomposta

Pergunta do Gabriel em 02/09/2026, e vale registrar porque será feita de novo.

**O ST saiu das duas colunas, não só da receita bruta.** Não é escolha, é consequência:
as colunas do detalhamento se ligam pela identidade do DRE.

```
REC.BRUTA    = Σ (ptabela × qt)
DESCONTO     = Σ (ptabela × qt) − Σ (punit × qt)
REC.LÍQUIDA  = Σ (punit × qt) − devolução
```

A 9815 subtraía o ST de `ptabela` **e** de `punit`. Tirar só do primeiro inflaria o
`DESCONTO` pelo ST e deixaria a líquida curta pelo mesmo valor — duas colunas erradas no
lugar de uma certa. **A prova de que o ST estava nos dois** é que `ABAT./DESC.` era a única
das quatro linhas que já batia ao centavo antes da correção: ele é a diferença entre as
duas colunas, e o ST se cancelava ali.

A diferença contra a exportação da 9815 fecha inteira:

| | |
|---|---:|
| Nossa `REC.LÍQUIDA` | 49.834.919,58 |
| `REC.LIQUIDA` da 9815 | 46.160.270,74 |
| **Diferença** | **3.674.648,84** |
| menos a linha `(-) ST` | −3.556.322,88 |
| menos a devolução fora do critério da apuração | −114.355,98 |
| **Sobra** | **3.969,98** |

Os últimos dígitos oscilam entre execuções porque os dois retratos são de momentos
diferentes — ver a armadilha 2.

> **Correção de 02/09/2026 — a sobra não é o FECP.** Esta seção dizia, quando foi escrita
> em 01/09, que os 3.969,98 eram o FECP, "exatamente o valor que a dc1 previu". A
> [dc10](validacao/dc10_o_que_sobra_alem_do_st.sql) mediu os componentes e **o FECP das
> vendas é 96.380,76**, não 3.969,98. O número está certo; a atribuição estava errada.
>
> Os 3.969,98 são a soma de **três** termos que quase se cancelam:
>
> | | |
> |---|---:|
> | ST das devoluções (`Sd`) | 97.274,04 |
> | FECP das devoluções (`Fd`) | 3.076,70 |
> | menos o FECP das vendas (`F`) | −96.380,76 |
> | **Sobra** | **3.969,98** |
>
> A dc1 previu `FECP = −3.969,98` e o resultado foi lido como confirmação. Ela nunca
> devolveria esse valor: a coluna que ela calcula é `Σ fecp·qt` das vendas. **A previsão
> registrada acertou o número e errou o nome, e ninguém conferiu qual dos dois a coluna
> media** — é o modo de falha que a previsão registrada existe para evitar, acontecendo
> dentro dela mesma.

### As cinco colunas conferidas — 02/09/2026

A [dc6](validacao/dc6_ponta_a_ponta.mjs) percorre só as linhas que abrem duplo clique, e
`ABAT./DESC.` e `CMV LIQ.` não abrem. **As colunas `DESCONTO` e `CUSTO Liq` do modal
ficaram sem conferência** desde a dc2, que foi medida por SQL direto antes de várias
mudanças. A [dc9](validacao/dc9_colunas_da_receita.mjs) fechou o buraco:

| Coluna | Linha do DRE | Valor |
|---|---|---:|
| `REC.BRUTA` | `(+) RECEITA BRUTA` | 55.754.350,05 |
| `DESCONTO` | `(-) ABAT./DESC.` | 4.663.263,35 |
| `DEVOLUÇÃO` | `(-) DEVOLUCAO` | 1.256.167,12 |
| `REC.LÍQUIDA` | `(=) RECEITAS LIQUIDAS` | 49.834.919,58 |
| `CUSTO Liq` | `(=) CMV LIQ.` | 37.039.936,01 |

Cinco de cinco, e a identidade `bruta − desconto − devolução = líquida` fecha nos dois
lados. Que fechariam "por construção", uma vez que as outras três fechavam, era o
raciocínio que dispensava a medição — e é o tipo de raciocínio que já falhou três vezes
neste levantamento.

### O detalhamento da receita não custa dois minutos sempre

Na dc9 a receita por cliente respondeu em **8,2 s**, contra os 116,9 s medidos em
01/09/2026. A diferença é o cache do Oracle: a apuração acabara de varrer as mesmas notas,
e o detalhamento as encontrou quentes.

Isso muda o tamanho do problema. Os 116,9 s foram medidos **a frio**, sem apuração antes; no
uso real o duplo clique vem sempre depois de uma apuração do mesmo período, que é o caso
quente. A otimização continua valendo a pena, mas não é o que separa a tela de ser usável.

### A armadilha 4 em detalhe: a coluna de notas veio zerada, e não era o SQL

Gabriel abriu o duplo clique de `(-) DEVOLUCAO` e a coluna `Qt.Nota` mostrava zero em todas
as linhas, contra os valores da 9815 no print ao lado. **A consulta estava certa e o número
estava certo** — o que se perdeu foi o mapeamento.

O Dapper casa coluna com propriedade ignorando maiúsculas, mas **não ignora underscore**. O
alias `QDE_NF` não encontra `QdeNf`, e o resultado não é erro: é o valor default do tipo.
Uma coluna inteira de zeros plausíveis.

O alias virou `QDENF`, e na sequência os 41 aliases do detalhamento foram conferidos um a um
contra as 51 propriedades das entidades — nenhum outro tinha underscore.

Duas consequências de método:

- O arquivo de consultas ganhou um `<remarks>` avisando que alias com underscore não mapeia.
  É a única classe do projeto onde a convenção de nome tem efeito silencioso.
- **Nenhuma das nove conferências pegaria isto.** Todas somam dinheiro, e `QDENF` é
  contagem de notas. Uma coluna acessória zerada passa por qualquer teste que só olhe o
  total — foi o olho de quem conhece a tela antiga que pegou.

### A tela do detalhamento agora tem o desenho da 9815 — 02/09/2026

Não é divergência de valor: as duas telas mostram o mesmo dinheiro. É a última diferença
**visível** entre elas, e fica registrada porque é o que atrapalhava a conferência lado a
lado. Motivada por `RECEITAS FINANCEIRAS`, onde os valores fechavam exatos — 6.276
lançamentos, 445.891,19 — e ainda assim as telas pareciam contar coisas diferentes.

| O que mudou | Como era | Como ficou |
|---|---|---|
| Colunas | 12, na ordem que fazia sentido do zero | **25, na ordem da 9815**, de `Rec.Num.` a `Cod. Func. Reclass.` |
| Estrutura | lista plana | árvore `Centro Custo Princ` → `Conta`, com subtotal por conta |
| Ordem | por data | contas em ordem **alfabética**, lançamentos por **valor decrescente** |
| `%PART` | três casas | **duas**, como a rotina |

A 9815 mostra 26 colunas; a primeira é `Rank`, a coluna de recuo da árvore, que aqui virou a
indentação das linhas de grupo.

**Por que copiar uma ordem que não é a melhor:** quem confere as duas telas percorre coluna
por coluna. Reordenar "para melhorar" transforma cada conferência em caça ao campo — e a
conferência é o que este documento inteiro existe para permitir.

A ordenação vem pronta do banco (`ORDER BY CODCCPRINC, CONTA, VPAGO DESC`) e o front só
quebra a lista onde a chave muda, sem reordenar. Ordenar de novo na tela criaria uma segunda
fonte de verdade sobre a ordem, e as duas sairiam de sincronia na primeira vez que o SQL
mudasse.

**O que continua diferente na tela:** a contagem de lançamentos, pelo motivo da
[§4](#consequência-a-lista-de-lançamentos-ficou-maior-que-a-da-9815) — os estornos entram
aqui e não entram lá. Somam zero, mas aparecem.

### Por que `LUCRO BRUTO − ST` não fecha — 02/09/2026

Pergunta do Gabriel. Tirando do nosso `LUCRO BRUTO` o ST que aparece na tela, não se chega
ao que o detalhamento da 9815 mostrava: sobram alguns milhares.

**Sobram porque o ST não é o único item, e o que falta é tudo devolução.** Medido pela
[dc10](validacao/dc10_o_que_sobra_alem_do_st.sql):

| | |
|---|---:|
| linha `(-) ST` do DRE | 3.556.322,88 |
| devolução a mais na 9815 — 2 notas fora do critério da apuração | +114.355,98 |
| o CMV dessas mesmas notas | −74.746,10 |
| o ST e o FECP das devoluções, que a 9815 não tira do CMV delas | −100.350,74 |
| **`LUCRO BRUTO` nosso − o do detalhamento da 9815** | **3.495.582,02** |

Quem tira só a linha `(-) ST` para 60.740,86 antes da conta.

**A hipótese que eu tinha era outra, e foi refutada.** O SQL do duplo clique da 9815 escreve
o CMV como `decode(custofin, 0, custofinest, custofin − st)` — no ramo em que `custofin` é
zero ela usa o custo estimado **puro**, sem tirar o ST que tirou da receita. Parecia o
segundo item. A dc10 mediu: **nenhum** dos 387.480 itens do período tem `custofin = 0`. O
ramo errado nunca é executado. Continua sendo defeito latente do SQL dela, e não explica um
centavo desta diferença.

**O que valida o modelo** são dois números que ele reproduz sem ter sido ajustado para
nenhum dos dois:

| | |
|---|---:|
| linha `(-) ST` montada dos componentes, `(S+F) − (Sd+Fd)` | 3.556.322,880278 |
| a mesma linha, exportada da 9815 | 3.556.322,88 |
| diferença da `REC.LÍQUIDA` pela álgebra, `S + (DEV' − DEV)` | 3.674.648,841134 |
| a mesma diferença, medida em 01/09 | 3.674.648,84 |

**E de novo o ponto da §4:** nada disso diz que a nossa tela erra. O `LUCRO BRUTO` do nosso
DRE é igual ao do DRE da 9815 — 2.952 células conferidas. Quem discorda da linha é o
detalhamento da própria 9815.

### Os dois números chamados ST — 02/09/2026

Pergunta do Gabriel ao ler a seção acima, e é a raiz de toda a confusão desta semana:
*"o que fez a nossa aplicação chegar no valor bruto certo foi o FECP e o ST?"*

**Não. A aplicação não somou ST nem FECP em lugar nenhum — ela parou de subtrair.** E o
FECP não participa da receita em canto nenhum.

Na `RECEITA BRUTA` a diferença é o ST sozinho:

| | |
|---|---:|
| `REC.BRUTA` do detalhamento da 9815 — `Σ (ptabela − st) · qt` | 52.193.509,49 |
| `RECEITA BRUTA` da linha do DRE — `Σ ptabela · qt` | 55.753.802,35 |
| **Diferença** | **3.560.292,86** |
| `Σ st · qt`, medido pela dc10 | 3.560.292,861134 |

**O que confunde é que existem dois números com o nome "ST", e eles não são iguais:**

| | |
|---:|---:|
| o ST que a 9815 subtraía da receita — `Σ st·qt` | 3.560.292,86 |
| a linha `(-) ST` que aparece na tela — `(ST+FECP das vendas) − (ST+FECP das devoluções)` | 3.556.322,88 |
| **diferença** | **3.969,98** |

Qualquer conta feita com o ST **da tela** para desfazer a subtração erra em 3.969,98 já no
primeiro passo. Não é arredondamento nem base viva: a linha da tela carrega o FECP dentro e
ainda desconta o ST das devoluções, e o valor que saiu da receita não faz nem uma coisa nem
outra. **É o mesmo 3.969,98 que foi registrado como "o FECP" em 01/09** — o número aparece
nas duas contas porque é a mesma expressão, `Sd + Fd − F`, chegando por dois caminhos.

### O detalhamento da 9815 tinha três defeitos, não um

Consolidando o que foi medido entre 01 e 02/09. A `RECEITA BRUTA` sente só o primeiro; o
`LUCRO BRUTO`, que é receita menos CMV, sente os três:

| Onde | O que a 9815 fazia | O que a web faz |
|---|---|---|
| Receita — `ptabela` e `punit` | subtraía o `st` | não subtrai |
| CMV | `custofin − st`, **sem o FECP** | `custofin − st − fecp`, como a apuração |
| Devolução | outro conjunto de notas (`mostra_dre`, sem `PCPEDC` nem `PCPRODUT`) | o critério da apuração |

**O critério das três correções não foi contábil.** Não julgamos se descontar ST ou FECP é
o certo — copiamos literalmente as fórmulas da apuração, porque a regra é o detalhamento
fechar com a linha que ele detalha. A pergunta contábil continua em aberto e está registrada
em [§4 · O que continua sem resposta](#o-que-continua-sem-resposta).

### As três informativas decompostas, e o CMV que se mexeu — 03/09/2026

A consulta de faturamento passou a devolver as parcelas de ST, PIS e COFINS separadas,
para as três linhas informativas abrirem detalhamento. Medido pela
[dc11](validacao/dc11_composicao_das_calculadas.mjs), cenário de agosto/2026, caixa,
filiais 7/12/25:

| Linha | (imposto + FECP) das vendas | menos o das devoluções | = a linha |
|---|---:|---:|---:|
| `(-) ST` | 1.538.087,47 | 100.350,74 | **1.437.736,73** |
| `(-) PIS` | 108.843,56 | 0,00 | **108.843,56** |
| `(-) COFINS` | 501.339,89 | 0,00 | **501.339,89** |

**As três fecham**, e as 16 conferências de composição passaram sem uma falha.

**PIS e COFINS não têm parcela de devolução, e isso é dado, não defeito.** A previsão da
dc11 dizia para desconfiar de coluna zerada — foi assim que a contagem de notas apareceu em
branco em 02/09. Mas aqui há prova no próprio resultado: `PISLIQ` é calculado pela
expressão **antiga**, `sum(VLPIS) − sum(VLPIS_DEV)`, e veio idêntico ao `PISVENDAS` novo.
Duas colunas independentes, uma anterior à mudança, concordando que a parcela de devolução
é zero. A consulta do bloco de devoluções calcula PIS de verdade — não é um `0` fixo —, e
ainda assim soma zero: os campos de origem não são preenchidos em nota de entrada.

O ST, que passa exatamente pelo mesmo mecanismo, voltou com 100.350,74 — o mesmo valor que
a dc10 mediu como `Sd + Fd` em 02/09. Terceira medição independente do número.

#### O `CMV LIQ.` mudou 2,1 milhões entre 02 e 03/09, e ainda não está explicado

Comparando o cabeçalho de hoje com o que a dc9 registrou ontem, no mesmo cenário:

| Linha | 02/09 | 03/09 | |
|---|---:|---:|---|
| `(+) RECEITA BRUTA` | 55.754.350,05 | 55.754.350,05 | idêntico |
| `(-) ABAT./DESC.` | 4.663.263,35 | 4.663.263,35 | idêntico |
| `(-) DEVOLUCAO` | 1.256.167,12 | 1.256.167,12 | idêntico |
| `(=) RECEITAS LIQUIDAS` | 49.834.919,58 | 49.834.919,58 | idêntico |
| `(=) CMV LIQ.` | 37.039.936,01 | **39.158.522,17** | **+2.118.586,16** |

**Quatro linhas idênticas ao centavo e uma que anda 2,1 milhões não é a base viva se
mexendo** — a armadilha 2 moveria todas. É uma diferença de uma coluna só.

A hipótese é recálculo de custo no Winthor: `custofin` e `custofinest` são recalculados
pela operação, e um recálculo sobre agosto moveria o CMV sem tocar em receita. Seria
benigno. **Mas é hipótese, não medida.**

**Respondido em 03/09/2026: é dado.** A dc6 corrigida fechou **159/159**, e o CMV
está entre eles — linha −39.158.522,17, detalhamento −39.158.522,17.

O que torna isso conclusivo é que os dois lados vêm de consultas **diferentes**: o
cabeçalho lê `FaturamentoPorMes`, que foi a consulta alterada; o detalhamento lê
`ReceitaPorCliente`, que não foi tocada. Se as seis colunas novas tivessem corrompido a
primeira, a segunda continuaria nos 37,04 milhões e a comparação acusaria. As duas
concordam no valor novo, então o valor novo é o que a base devolve hoje.

Sobra a causa da mudança no dado, que é da operação e não do projeto: `custofin` e
`custofinest` são recalculados pelo Winthor, e um recálculo sobre agosto move o CMV sem
tocar em receita — que é exatamente o retrato observado.

**Fica o método:** quando uma linha se mexe sozinha, a pergunta certa é se as consultas
independentes que a calculam ainda concordam entre si. Se concordam, mudou o dado; se
discordam, mudou o código.

#### A dc6 não sabia ler a tela nova

Na primeira execução depois da mudança, `ABAT./DESC.` e `CMV LIQ.` apareceram como falha de
60 e 94 milhões. Não era a tela: a dc6 escolhia a coluna do detalhamento pelo nome da linha
e mandava tudo que não contivesse "LIQUIDA" para `receitaBruta`. Com quatro linhas abrindo a
mesma tela em vez de duas, ela passou a comparar a receita bruta contra o desconto.

Corrigido: `ABAT` lê `desconto` e `CMV` lê `custoLiq`, ambos com o sinal invertido, porque
são deduções — a linha do DRE mostra negativo e a coluna soma positivo.

**A conferência envelheceu junto com o código que ela confere**, e a falha apareceu como
defeito do produto. Vale para as outras: cada tela nova que reaproveita uma consulta
existente é uma chance de a dc6 comparar a coluna errada.

### ST, PIS e COFINS ganham detalhamento próprio — 03/09/2026

As três informativas passaram a abrir uma tela com **consulta própria**, quebrada por
produto, no mesmo formato da devolução por motivo: eixo, contagem de notas, valor e
participação. Medido pela dc6:

| Linha | Valor | Produtos |
|---|---:|---:|
| `(-) ST` | −1.437.736,73 | 3.313 |
| `(-) PIS` | −108.843,56 | 4.356 |
| `(-) COFINS` | −501.339,89 | 4.356 |

**162/162 fecham ao centavo**, e a contagem traz um sinal interno que ninguém programou:
PIS e COFINS pegam exatamente os mesmos 4.356 produtos — incidem em quase tudo —, e o ST
pega 1.043 a menos, porque só produto com substituição tributária tem ST e o
`HAVING <> 0` derruba os demais.

O eixo é o **produto** porque ST é imposto de item, nasce da classificação fiscal da
mercadoria, e é nesse eixo que a pergunta "por que subiu" tem resposta. Decisão do Gabriel
em 03/09/2026, entre produto, cliente, nota e fornecedor.

#### O caminho errado que veio antes, e por que era errado

A primeira tentativa acrescentou seis colunas à consulta de **apuração** e mostrou a conta
`vendas − devoluções` como "composição". Fechava, foi validada, e mesmo assim estava errada
em duas frentes:

- **Mostrava a fórmula da linha, não o detalhamento dela.** Responde "que contas somam neste
  número" quando a pergunta é "que notas, que produtos, que clientes formam este número".
- **Engordava a consulta mais sensível do projeto para servir uma tela de detalhe**, contra
  o padrão que já existia, em que cada detalhamento tem consulta própria.

Revertido. Ficou só a composição dos **cinco totalizadores**, onde ela é a resposta certa:
`LUCRO BRUTO` é `RECEITAS LIQUIDAS + CMV LIQ.` e não existe consulta possível para isso —
o valor é aritmética sobre linhas que já estão na resposta.

**A lição não é sobre SQL.** Uma implementação que passa em todas as conferências ainda pode
responder à pergunta errada; nenhuma das nove validações deste projeto detectaria isso,
porque todas conferem número, e o número estava certo.

#### `ORA-00935` sem um `SUM` dentro de outro

Na primeira execução, as três linhas voltaram com *"função de grupo aninhada muito
profundamente"* — numa consulta onde não havia `SUM(SUM(...))` em lugar nenhum do texto.

O alias de saída se chamava igual à coluna da subconsulta: com `SUM(VENDAS) AS VENDAS`, o
`ORDER BY SUM(VENDAS - DEVOLUCOES)` faz o Oracle resolver `VENDAS` como o **alias**, e a
expressão vira `SUM(SUM(VENDAS) - SUM(DEVOLUCOES))`. A mensagem manda procurar no lugar
errado.

Registrado em [CONVENCOES_ORACLE.md](CONVENCOES_ORACLE.md), com a convenção adotada: colunas
de subconsulta agregada terminam em `ITEM`.

---

## 5. A receita da transportadora vinha zero — 10/09/2026

Reportado por usuário: com a filial **28 EPC-TRANSP** selecionada, `RECEITA BRUTA` na web
saía **0,00**; a 9815, no mesmo filtro, trazia **1.152.705,09**.

### A causa: nós somamos item, a 9815 soma cabeçalho

| | 9815 | Nossa web (antes) |
|---|---|---|
| Granularidade | cabeçalho da nota (`PCNFSAID`) | **item** (`PCMOV`) |
| Receita bruta | `Σ nvl(NF.VLTABELA, NF.VLTOTGER)` | `Σ MV.ptabela · MV.qt` |
| Junções | só a nota | `+ PCMOV + PCMOVCOMPLE + PCPRODUT` |
| Código fiscal | **exclusão** na nota (`NOT IN 522,…`) | **inclusão** no item (`IN 5102,…`) |

`NF.numtransvenda = MV.numtransvenda` é junção **interna**: nota sem item desaparece da
soma inteira. E EPC-TRANSP é transportadora — emite CT-e.

Medido pela [dc15](validacao/dc15_receita_da_transportadora.sql), no período do reporte:

| | |
|---|---|
| Notas no período | **607** |
| Notas **sem** item em `PCMOV` | **607 — todas** |
| `ESPECIE` | `'CO'` em todas |
| `CONDVENDA` | **nula** em todas — entram na 9815 só pelo `OR NF.ESPECIE = 'CO'` |
| `VLTABELA` | **nulo** em todas; o valor vem inteiro de `VLTOTGER` |
| Códigos fiscais da nota | 5353 (601 notas), 6932, 6353, 5932 |
| O que a web via | 0 itens, receita nula |

**Não era a lista de códigos fiscais.** Essa era a primeira hipótese — que faltavam os
códigos de serviço de transporte na lista de inclusão —, e a dc15 a descartou: sem item, não
há `CODFISCAL` de item para incluir. Uma correção na lista teria parecido plausível e não
mudaria nada.

### Por que passou pelas quatro conferências

As validações do faturamento — [inc4](validacao/inc4_comparacao_faturamento.sql) e
[inc8](validacao/inc8_mensal_vs_periodo.sql) — usaram as filiais **7, 12 e 25**, todas de
distribuição. **Nenhuma transportadora entrou em nenhum dos quatro cenários.** Uma lista de
inclusão por item só inclui o que alguém previu, e ninguém previu frete: é o defeito que
fecha ao centavo em quatro cenários e quebra no quinto.

### A correção

Um **terceiro bloco** em `FaturamentoPorMes`, somando o cabeçalho **só das notas sem item**,
com `NOT EXISTS` garantindo que nada some duas vezes. Os filtros são os da 9815, que é a
referência para este caso. `ST`, `PIS`, `COFINS` e devolução entram como zero — é o que a
rotina traz para a 28, e coerente com CT-e não ter imposto de mercadoria.

**Aditivo de propósito:** nota com item continua somando exatamente como antes, então os
números conferidos não deviam se mexer.

### Medido, e a correção está validada — 10/09/2026

A [dc16](validacao/dc16_notas_sem_item_por_filial.sql) respondeu as duas perguntas:

| | |
|---|---|
| Cenário de referência (7, 12, 25 em 01/08 a 27/08) | **nenhuma linha** — não existe nota sem item ali |
| Todas as 9 apuráveis, agosto/2026 | **só a 28**: 1.812 notas, 4.034.347,40 |

Nenhuma outra filial do filtro tem nota sem item. O bloco novo só encosta na 28.

**Pela API, com período fechado.** Filial 28, agosto inteiro: `RECEITA BRUTA`
**4.034.347,40** — o mesmo valor que a dc16 mediu por SQL, de forma independente.

E o cenário da [dc9](validacao/dc9_colunas_da_receita.mjs), reapurado depois da mudança:

| Linha | Agora | dc9 (02-03/09) | |
|---|---:|---:|---|
| `(+) RECEITA BRUTA` | 55.754.350,05 | 55.754.350,05 | idêntico |
| `(-) ABAT./DESC.` | −4.663.263,35 | −4.663.263,35 | idêntico |
| `(-) DEVOLUCAO` | −1.256.167,12 | −1.256.167,12 | idêntico |
| `(=) RECEITAS LIQUIDAS` | 49.834.919,58 | 49.834.919,58 | idêntico |
| `(=) CMV LIQ.` | −39.158.687,34 | −39.158.522,17 | **−165,17** |

**As quatro primeiras idênticas ao centavo são a prova de que o bloco novo somou zero ali.**
Se ele tivesse pegado alguma nota naquelas filiais, a receita bruta teria mudado — ela é a
primeira coisa que o bloco toca.

Os −165,17 do CMV **não podem vir do bloco novo** pelo mesmo argumento: ele soma
`NVL(NF.VLCUSTOFIN,0)` das mesmas notas que somariam receita, e receita não mudou. É o
padrão já registrado neste documento — quatro linhas paradas e o CMV andando é recálculo de
custo no Winthor, o mesmo fenômeno que moveu 2,1 milhões entre 02 e 03/09.

> **Erro de método na primeira tentativa desta conferência.** Rodei 01/08 a **27/08** e
> comparei com os números da dc9, que são de 01/08 a **31/08**. As cinco linhas divergiram —
> a receita em 14,3 milhões — e por um instante pareceu regressão grave. Não era: eram
> cenários diferentes. O alvo de comparação faz parte da medição, e conferir contra número
> de outro recorte produz um alarme que custa mais que o defeito que ele denuncia.

**Resíduo conhecido:** nota que **tem** item, mas cujos itens caem fora da lista
`MV.CODFISCAL IN (5102,…)`, continua não somando em lugar nenhum — o primeiro bloco a exclui
pelo filtro, o terceiro pelo `NOT EXISTS`. Não é o caso da 28; o bloco 4 da dc15 é quem mede
se existe em outra filial.

### O valor que subia a cada consulta

Três leituras do mesmo cenário, em minutos: **1.137.050,01** (planilha), **1.137.229,05**
(relato) e **1.152.705,09** (dc15). Não é defeito: o período termina **no dia corrente** e a
transportadora está emitindo CT-e agora. É a armadilha 2 — a base viva — e o alvo de
comparação num período que inclui hoje muda enquanto se mede. Para conferir contra a 9815,
usar período **fechado**.


---

## 6. A linha RECEITA VENDA ATIVO sumia da tela — 11/09/2026

**Defeito nosso, corrigido.** Não era divergência de valor: o número sempre esteve certo. A
linha é que não aparecia, e o total continuava contando com ela.

### O sintoma

Filial 28, agosto/2026, competência, C. Custo Principal. A 9815 mostra:

| Linha | Valor |
|---|---:|
| RESULTADO OPERACIONAL | 2.015.344,94 |
| RECEITAS FINANCEIRAS | 65,71 |
| **RECEITA VENDA ATIVO** | **225.000,00** |
| LUCRO LIQUIDO | 2.240.410,65 |

Nossa API devolvia **os quatro valores ao centavo**, inclusive os 225.000,00 — mas a linha
vinha com `semMovimento: true`, e a tela esconde tudo que tem essa marca enquanto *Mostrar
contas zeradas* está desmarcada.

### Por que era pior do que uma linha faltando

Os 225.000,00 continuavam somados no `LUCRO LIQUIDO`. A tela mostrava 2.240.410,65 — o valor
certo — sobre um conjunto de linhas visíveis que somava 225 mil a menos. **Quem conferisse à
mão chegaria a um número diferente do total impresso logo abaixo, e nada na tela explicava a
diferença.** Um valor errado alguém questiona; uma soma que não fecha sem motivo aparente
corrói a confiança na tabela inteira.

### A causa

A linha vem do bloco injetado de `PCNFSAID`/`PCPREST` — o `union all` no fim da consulta de
despesas —, e esse bloco traz `0 as QdeReg`. Fielmente: a 9815 escreve exatamente isso.
Nossa regra de visibilidade olhava **só** a contagem de lançamentos.

A correção usa o critério que a própria 9815 aplica ao montar a estrutura,
`where VPAGO <> 0 or qdereg <> 0`: esconde apenas quando não há lançamento **e** não há
valor. O caso oposto, já conferido, continua valendo — `DESCONTO FUNCIONÁRIOS` fecha em 0,00
com 16 lançamentos e aparece.

### O defeito irmão, evitado junto

Assim que a linha voltasse, o duplo clique nela abriria o detalhamento de lançamentos, que
consulta `PCLANC` — e não é de lá que esses 225.000,00 vêm. Seria uma tela vazia sobre uma
linha de 225 mil. Linha com valor e nenhum lançamento deixou de oferecer detalhamento.

### Limite conhecido

A condição está presa à **contagem de lançamentos**, não à chave da linha — a injeção usa uma
chave diferente por dimensão (`400`, `85`, `8501`) e manter as quatro em dia seria convite a
esquecer uma.

**Se algum dia a mesma linha juntar lançamento de `PCLANC` com a injeção de `PCPREST`**, a
contagem passa de zero e o detalhamento volta a abrir — mostrando só a parte que veio de
`PCLANC`, e sem nada dizendo que falta o resto. Não foi observado em nenhuma das quatro
dimensões na filial 28; fica registrado como o caminho pelo qual isto pode voltar.

### Conferido

dc23, **24/24**, nas quatro dimensões — o mesmo valor chegando por nomes diferentes
(`Outras Receitas`, `RECEITA VENDA ATIVO`, `Receita Com Venda De Ativo`) — mais a filial 7
como contraprova, onde não há venda de ativo e nenhuma linha nova apareceu. A conferência
principal é a **invariante**, não o valor de uma linha: *nenhuma linha escondida tem valor*.
Visíveis na 28: 37 antes, 38 depois — exatamente uma a mais.

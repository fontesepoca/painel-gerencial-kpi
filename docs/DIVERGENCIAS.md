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

- Os valores da tabela acima são do recorte de **três filiais**. Não medimos, linha por
  linha, quanto cada uma dessas nove linhas vale no recorte de 7 e 12 — só
  `TRANSPORTE T - (28)`, que veio da exportação.
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

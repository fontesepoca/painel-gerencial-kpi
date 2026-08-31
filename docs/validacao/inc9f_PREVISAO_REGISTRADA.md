# Previsão registrada — experimento da filial única em C. Custo Principal

**Gravado em 31/08/2026, ANTES de rodar a 9815 com filiais 7 e 12.**

Este arquivo existe para que o experimento possa me derrubar. Se o resultado
não bater, a leitura do SQL está errada e a análise recomeça.

## O experimento

Rodar a 9815 com **filiais 7 e 12** (sem a 25), competência,
01/06/2026 a 31/07/2026, análise por **C. Custo Principal**.
Fechar e reabrir a rotina antes, por causa do resíduo de grade.

## O que estou afirmando

O subselect `CCC` da consulta de estrutura recebe **uma filial só** — a que
sobrou numa variável do Delphi. Como ele é quem descobre quais centros de custo
principais viram linha, o relatório muda conforme *qual* filial sobra, e não
conforme *quais* filiais foram selecionadas.

## Previsão 1 — o trace

O `CCC` vai mostrar `FIN.CODFILIAL IN ('12')`, e não `IN ('7','12')`.

Se mostrar `IN ('7')`, o Delphi usa ordem de clique e não ordem de lista —
o defeito continua real, mas fica ainda menos replicável.

Se mostrar `IN ('7','12')`, **minha leitura está errada** e eu recomeço.

## Previsão 2 — quais linhas aparecem

Conjuntos de centros de custo principais que a estrutura gera, por filial
isolada (resultado da inc9e, rodada em 31/08/2026):

| Principal | Grupo | com '7' | com '12' | com '25' |
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

Os demais (10, 11, 12, 14 a 25, 29, 32, 36, 80 a 99) aparecem nos três.

**O que a exportação de 7 e 12 tem que mostrar, se a previsão 1 estiver certa:**

- `TRANSPORTE T - (28)` **presente** no bloco operacional — e ele está
  **ausente** da exportação de 7/12/25. É a prova de que acrescentar uma
  filial faz linha sumir.
- `MERCHANDISING` e `CD GOV VALADARES` **ausentes** — os dois estão
  **presentes** na exportação de 7/12/25.
- `EQUIPE PASTA MISTA`, `ECOMMERCE`, `DEPARTAMENTO PESSOAL - RAT`,
  `POTENCIAL`, `CD UBERLANDIA`, `CD 3 CORAÇOES`, `CD MONTES CLAROS` e
  `MANUTENÇÕES E CARRETAS` **ausentes**.

Se em vez disso vierem todas essas oito presentes e `MERCHANDISING` ausente,
então o `CCC` usou `'7'` — ordem de clique, não ordem de lista.

## Ressalva metodológica

A exportação **não mostra linhas zeradas**. Então ausência no xlsx significa
"fora da estrutura **ou** com valor zero", e as duas causas se confundem.

Isso não enfraquece o caso dos nove centros de custo: a inc9d mediu que eles
carregam R$ 2.564.063,37 em 2.269 lançamentos no período. Ausentes por zero,
não é.

Duas evidências de que a leitura está certa, tiradas da exportação de 7/12/25:

- `MERCHANDISING` aparece lá, e só está no conjunto da filial `'25'` —
  compatível com o trace, que mostrava `IN ('25')`.
- `ALFALOG`, `VENDAS UNILEVER`, `RECEITAS NÃO OPERACIONAIS` e
  `RECEITA COM VERBAS` estão nos três conjuntos e **não** aparecem na
  exportação: são as zeradas que o relatório esconde.

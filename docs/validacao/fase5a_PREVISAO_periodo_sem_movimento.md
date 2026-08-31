# Previsão registrada — período sem movimento

**Gravado em 31/08/2026, ANTES de rodar.** Primeiro cenário da Fase 5.

## O cenário

| Filtro | Valor |
|---|---|
| Filiais | apenas a **7** |
| Período | **01/12/2026 a 31/12/2026** — futuro, hoje é 31/08/2026 |
| Regime | Competência |
| Análise | Grupo de Contas — a dimensão mais validada |

Dezembro está no futuro, então não há nota de saída nem lançamento pago. Em caixa o filtro
`DTPAGTO IS NOT NULL` garantiria vazio; em competência pode haver provisão lançada com
`DTCOMPETENCIA` futura, e é justamente por isso que vale olhar em vez de supor.

## Previsão 1 — a API responde 200, não erro

Nenhuma divisão por zero escapa: `CalcularAv` devolve `null` quando a base é zero, e
`CalcularAh` devolve `0` no primeiro mês. Se vier `500`, há uma guarda faltando.

## Previsão 2 — a estrutura volta cheia, os valores vêm zerados

O primeiro bloco da consulta de estrutura lê o `EPCPARDRE` e **não depende do período**.
Só o bloco de órfãs depende. Então:

- todas as linhas parametrizadas voltam, com valor zero;
- o bloco de órfãs volta vazio;
- `semMovimento` fica `true` em toda linha não calculada;
- `semMovimento` fica `false` nas calculadas — cabeçalho e totalizadores aparecem sempre.

## Previsão 3 — o estado "Vazio" NÃO vai aparecer, e isso é um defeito nosso

[TabelaDre.tsx:20](../../client-new-kpi/components/dre-gerencial/TabelaDre.tsx) decide assim:

```tsx
const visiveis = mostrarZeradas ? linhas : linhas.filter((l) => !l.semMovimento);
if (visiveis.length === 0) {  // "Nenhum lançamento no período selecionado."
```

Com as ~13 linhas calculadas sempre visíveis, `visiveis.length` nunca chega a zero.
**A mensagem que a especificação promete em §3.3 é código morto** — o usuário vai ver uma
tabela de zeros.

> | Vazio | "nenhum lançamento no período", não uma tabela em branco |

Se a previsão 3 se confirmar, a pergunta seguinte **não** é como consertar o front, e sim
**o que a 9815 faz**. Se ela também mostra o esqueleto zerado, quem está errado é a
especificação, e a correção é apagar a promessa. Se ela mostra alguma mensagem, aí sim o
front precisa mudar. É a exportação que decide.

## O que conferir na 9815

Depois de rodar a rotina no mesmo cenário:

1. Ela **deixa** rodar um período futuro? Existe `tab_ger_restricao_data_dre`, mas a única
   linha lá é da matrícula 51 — a 4893 não tem restrição. Se mesmo assim ela recusar, há
   outra trava que não mapeamos.
2. A grade fica com o esqueleto zerado ou aparece alguma mensagem?
3. Quantas linhas a exportação traz?

# Simulador de preço — colunas "Classe de tributação" e "CST"

**Data:** 25/11/2026 · **Pedido por:** Gabriel · **Tamanho:** mudança pequena (spec curta)

## O que e por quê

A grid do simulador passa a mostrar duas colunas da `PCTRIBUTACAO`: `CCLASSTRIB` (título
**"Classe de tributação"**) e `CST` (título **"CST"**). Elas só são exibidas: nenhuma conta muda,
nenhum número da consulta muda.

## O que já foi conferido no banco (Gabriel, 25/11/2026)

- Os nomes certos são `PCTRIBUTACAO.CCLASSTRIB` e `PCTRIBUTACAO.CST`.
- `CODIGO_TRIBUTACAO` é **único** na `PCTRIBUTACAO`: a consulta de duplicados veio vazia. Por
  isso o join não repete linha de produto.

## Abordagens

1. **`LEFT JOIN PCTRIBUTACAO` fora do SQL v2, na `ConsultaPaginada`** (escolhida). Faz igual ao
   fornecedor (spec `2026-11-24-simulador-coluna-codigo-e-fornecedor`). O SQL v2 fica intacto e a
   sp5 continua IDENTICO. Não há bind novo, então a ordem dos 37 binds não muda.
2. Acrescentar as colunas dentro do subselect `CBS` do SQL v2. Descartada porque seria mais uma
   adaptação (A9) no texto de referência do gestor, sem ganho nenhum.

## Como fica

**Back-end**

- `SimuladorPrecoQueries.ConsultaPaginada`, no nível `C`:
  - Duas colunas novas: `TO_CHAR(TR2.CCLASSTRIB) AS CCLASSTRIB` e `TO_CHAR(TR2.CST) AS CST`. O
    `TO_CHAR` segue a A6: o tipo das colunas no banco não foi conferido, e texto serve aos dois casos.
  - Um join novo:
    `LEFT JOIN PCTRIBUTACAO TR2 ON TO_CHAR(TR2.CODIGO_TRIBUTACAO) = C.CODIGOTRIBUTACAO`.
  - Sobre o alias: `TR` já é usado no SQL v2 para a `PCTRIBUT`. Nesse nível o nome não colidiria,
    mas um alias diferente evita confusão.
- `ProdutoSimulado` (entidade) ganha `string? CClassTrib` e `string? Cst`.
- `ProdutoSimuladoDto` ganha `string? CClassTrib` e `string? Cst`, no fim, depois de
  `Fornecedor`, preenchidos no `ParaDto`.

**Front-end**

- `ProdutoSimulado` (tipos) ganha `cClassTrib: string | null` e `cst: string | null`. Em produto
  novo (`linhaDeProdutoNovo`), os dois ficam `null`.
- `TabelaSimulador`:
  - Duas colunas logo depois de **Classe**, centralizadas, com o mesmo estilo de Classe. Valor
    nulo aparece como "—".
  - "Classe de tributação" leva a dica (`title`): "CCLASSTRIB da PCTRIBUTACAO, pela tributação
    do NCM".
  - "CST" leva a dica: "CST da PCTRIBUTACAO. Não é o ST da coluna Preço".
  - O espaço vazio sobre Classe na linha de grupos passa a cobrir as três colunas (`colSpan={3}`).
  - `COLUNAS_DEPOIS_DO_PRODUTO` sobe de 18 para 20.

**Validação**

- sp15: duas conferências novas, uma para o `LEFT JOIN PCTRIBUTACAO TR2` e outra para os aliases
  `CCLASSTRIB` e `CST`.
- sp5: sem mudança, e tem de continuar IDENTICO.
- sp6, no banco, por você: toda linha tem as propriedades `cClassTrib` e `cst`, mesmo que nulas.

## Fora do escopo

- Mostrar as duas colunas no quadro de simulação (o modal do produto).
- Filtrar ou buscar pela classe de tributação ou pelo CST.

## Deixado ao implementador

- A largura das colunas, seguindo a de Classe.

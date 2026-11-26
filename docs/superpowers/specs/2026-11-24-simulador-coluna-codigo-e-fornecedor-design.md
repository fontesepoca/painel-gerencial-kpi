# Simulador de preço — coluna do código, com o fornecedor embaixo

**Data:** 24/11/2026 · **Spec mãe:** `2026-11-18-simulador-de-preco-design.md`

## Por quê

Com vários fornecedores na mesma consulta, o comprador precisa ver de quem é cada produto. O
código do produto, hoje miúdo ao lado da descrição, passa a ter a sua própria coluna.

## O que muda (decidido pelo Gabriel em 24/11/2026)

1. **Coluna "Código" antes da do Produto.**
   - Na primeira linha, o código do produto.
   - Embaixo, o fornecedor: código e nome curto ("234 · RECKITT B…"). O nome cortado aparece
     inteiro ao passar o mouse.
   - O código sai da linha da descrição.
2. **As duas colunas ficam grudadas** à esquerda ao rolar a tabela para o lado.
3. **A ordem da consulta não muda:** Classe (A → B → C, sem classe por último) > Descrição >
   Código. O fornecedor não entra na ordem.

## Approaches

- **Escolhida: ligar o fornecedor por fora do SQL v2.** Na `ConsultaPaginada`, cada linha da
  `Consulta` se liga ao `PCPRODUT` (pelo `CODPROD`) e ao `PCFORNEC` (pelo `CODFORNEC` do produto)
  para trazer `CODFORNEC` e `FORNECEDOR`.
  - O SQL v2 não muda uma letra, então o sp5 continua IDENTICO sem adaptação nova.
  - É o mesmo fornecedor que o SQL v2 usa (`F.CODFORNEC = P.CODFORNEC`).
  - Nenhum bind novo: continuam 37.
- **Descartada: colunas novas dentro do SQL v2 (A9).** Funciona, mas mexe na referência por
  causa de uma informação que só serve à tela.

## Minhas decisões (corrigíveis)

- **Ligação:** é por `LEFT JOIN`. Um produto sem fornecedor no cadastro continua aparecendo, com
  "—".
- **Produtos novos:** a coluna mostra "Simulado" no lugar do código, sem fornecedor (Gabriel).
- **Nome curto:** o corte é feito pela largura da coluna, com reticências, e não por um número
  fixo de letras.
- **A API:** `ProdutoSimuladoDto` ganha `CodFornec` (decimal?) e `Fornecedor` (string?), e a
  entidade ganha os mesmos dois campos.
- **A tela:** o `COLUNAS_DEPOIS_DO_PRODUTO` / `TOTAL_DE_COLUNAS` ganha +1, e a linha de grupos do
  cabeçalho ganha uma célula vazia.
- **A coluna grudada:** a do código usa uma classe própria do simulador, para não mexer na
  `.celula-descricao` que o DRE também usa. A do produto passa a grudar logo depois da largura
  fixa do código.

## Fora do escopo

Ordenar por fornecedor e filtrar pela coluna.

## Verificação

- **Sem banco:** sp5 IDENTICO sem mudança. O sp15 confere que a `ConsultaPaginada` liga
  `PCPRODUT`/`PCFORNEC` sem bind novo e que a ordem dos 37 continua.
- **sp6, com o banco (Gabriel):** toda linha tem `codFornec`, e com o filtro `234` todas as linhas
  vêm com `codFornec` 234.
- **Na tela:** a coluna nova nos dois temas e na leitura ampliada, e as duas colunas grudadas ao
  rolar.

## Mudança na implementação (24/11/2026, decidida pelo Gabriel)

**Uma célula com duas partes, e não duas colunas fixas.** Duas colunas grudadas lado a lado já
deram defeito no projeto: abre uma fresta de alguns pixels por onde os números passam ao rolar
(ver "Uma coluna fixa só" no `globals.css`).
- **Como fica:** "Código" e "Produto" ficam numa célula fixa só (`.largura-codigo-e-produto` com
  `.codigo-e-produto`), dividida em duas partes por um traço vertical da altura inteira da linha.
- **Tamanhos:** a parte do código tem 8rem (6rem no celular). O total de colunas não muda.
- **Produtos novos:** a parte do código mostra "Simulado", e a descrição perdeu a marca "NOVO".

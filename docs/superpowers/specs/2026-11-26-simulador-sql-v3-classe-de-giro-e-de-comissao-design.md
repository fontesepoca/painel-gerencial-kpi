# Simulador de preço: SQL v3, com classe de giro e classe de comissão

**Data:** 26/11/2026. **Pedido de:** Gabriel, com o SQL do gestor. **Tamanho:** mudança pequena.

## O que o gestor mudou (v2 → v3)

1. `B.CLASSEVENDA` passa a sair como **`CLASSE_GIRO_EST`**. É a mesma coluna
   (`PCPRODUT.CLASSEVENDA`), a "Classe" que a tela já mostra e pela qual ordena e filtra.
2. Coluna nova **`B.CLASSE AS CLASSE_COMISSAO`**, vinda de `P.CLASSE` (`PCPRODUT.CLASSE`).
3. O texto já vem com o `LEFT JOIN PCTRIBUTACAO TR2` de `CCLASSTRIB` e `CST`, o mesmo de
   25/11/2026.

Nenhuma conta muda. Quem confirma que o resto do texto é igual é a sp5, ao comparar a v3 com a
`Consulta`.

## Como fica

**Referência**
- O texto do gestor fica guardado sem edição em `docs/rotinas/simulador-preco/referencia/sql-v3.sql`.
- A v2 continua guardada ao lado, sem alteração.

**API**
- **A `Consulta` passa a ter o miolo da v3, sem edição**, com as adaptações de sempre (A1, A2,
  A4, A5 e A8).
- **O SELECT de fora (A7) renomeia as duas classes:**
  - `CLASSE_GIRO_EST AS CLASSEVENDA`, para a tela continuar lendo `classeVenda`. Assim a
    ordenação, o filtro A/B/C e as simulações guardadas não mudam;
  - `TO_CHAR(CLASSE_COMISSAO) AS CLASSECOMISSAO`. O `TO_CHAR` segue a A6, porque o tipo da coluna
    não foi conferido.
- **Adaptação nova A9:** o SELECT de fora da v3 (`SELECT V2.*, TR2.CCLASSTRIB, TR2.CST ...
  LEFT JOIN PCTRIBUTACAO TR2`) não entra na `Consulta`. Esse join já é feito na
  `ConsultaPaginada`, com `TO_CHAR` (spec 2026-11-25-simulador-classe-de-tributacao-e-cst). A sp5
  aplica a A9 retirando esse invólucro da referência antes de comparar.
- **A numeração das repetições** (`ROW_NUMBER ... OCORRENCIA`) passa a ordenar também por
  `C.CLASSECOMISSAO`. A sp15 cobra que ela ordene por todas as colunas.
- **Entidade e DTO:** `ClasseComissao` (`string?`), no fim do DTO. No JSON, `classeComissao`.

**Tela**
- A coluna **"CL. giro est."** é a "Classe" de hoje, só renomeada.
- Uma coluna nova, **"CL. comiss."**, vem logo depois. Só aparece: não ordena nem filtra.
- Nenhuma das duas tem dica ao passar o mouse (Gabriel, 26/11/2026).
- **A divisória fina e a contagem de colunas:**
  - "CL. comiss." tem a mesma divisória fina das colunas de cadastro;
  - o espaço sem título na linha de grupos passa a cobrir 4 colunas;
  - `COLUNAS_DEPOIS_DO_PRODUTO` sobe de 20 para 21.
- Produto novo simulado: a coluna fica com "—".

**Validação**
- **sp5:** passa a comparar com a `sql-v3.sql`, aplicando a A9, e tem de dar IDENTICO.
- **sp15:** `colunasDeValor` passa a incluir `CLASSECOMISSAO`, e o teste continua cobrando todas
  as colunas no `ROW_NUMBER`. Tem de dar 21/21.
- **sp6, no banco:** toda linha tem de trazer a propriedade `classeComissao`.

## Fora do escopo

- Filtrar ou ordenar pela classe de comissão.

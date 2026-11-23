# Simulador de preço: SQL v2 (spec curta)

**Data:** 23/11/2026 · **Branch:** `feat/simula-preco` · **Pedido:** Gabriel (SQL do gestor) · **Tamanho:** mudança pequena

**Referência:** [sql-v2.sql](../../rotinas/simulador-preco/referencia/sql-v2.sql), guardada ao lado da
[sql-v1.sql](../../rotinas/simulador-preco/referencia/sql-v1.sql), sem nenhuma edição.
**Base:** [spec do simulador](2026-11-18-simulador-de-preco-design.md) e [paginação](2026-11-23-simulador-paginacao-design.md).

## Intenção

Trocar o SQL v1 pela v2 do gestor sem que a tela deixe de bater com o SQL ao milésimo, e mostrar
o que a v2 traz de novo: o ST de verdade e o preço final.

## O que muda da v1 para a v2 (lido do texto)

| # | Mudança | Efeito |
|---|---|---|
| 1 | **`VLST` vem de `PCTABPR.VLST`** (tabela de preço da região), e não do zero fixo da v1 | Resolve a D7. **Não depende do preço de compra.** |
| 2 | **O ST sai do custo e da base da CBS** e entra só no fim: `PRECOFINAL = ROUND(diferença / índice + VLST, 3)` | Uma coluna nova de preço |
| 3 | **O `CUSTOREP` sai:** preço = `NVL(:PCOMPRA, NVL(VLULTPCOMPRA, 0))` | A D13 passa a ser intencional |
| 4 | **Arredondamento:** `CUSTO_ANTES_CBS`, `BASE_CBS` e `VLCBS` são **uma conta só**, com um `ROUND` no fim, sobre os valores **não arredondados**. A v1 somava valores já arredondados. | O recálculo da tela é reescrito |
| 5 | **Colunas novas:** `CODFILIAL`, `CLASSEVENDA` e `PRECOFINAL` | — |
| 6 | **Binds:** 22× `:PCOMPRA`, 1× `:NUMREGIAO`, 2× `:CODFORNEC` e 1× `:CODFILIAL` | Nova ordem de parâmetros |
| 7 | **Continua igual:** `CODFUNC = 1` na PCLIB, a duplicação por NCM, as mesmas tabelas | A D3 (matrícula da sessão) continua |

## Decisões do Gabriel (23/11/2026)

| # | Decisão |
|---|---|
| V1 | **O grupo Preço ganha três colunas:** Preço futuro, ST e **Preço final**. O destaque verde e a variação ▲/▼ vão para o **Preço final**. |
| V2 | **O ST é editável no quadro do produto, em R$**, com o valor do SQL como padrão e o ↺. Ele muda só o preço final. No produto novo, começa em zero. |
| V3 | **`CLASSEVENDA` vai na linha de baixo do produto**, junto do NCM e da tributação. |
| V4 | **A consulta fica só no estado do React**, pelo React Query, que já é o que guarda o resultado da consulta (`useMutation`). **Sai a camada do sessionStorage:** o `lib/consultaGuardada.ts`, a `sp11`, a chave em `chavesPorBase` e a restauração ao abrir. É o princípio do projeto de não guardar dado financeiro no navegador (`NoStoreMiddleware`, `apiClient` `no-store`). Depois de um F5, é preciso consultar de novo, como no DRE. O "Consultado às…" fica, a partir do momento da consulta. |

## Objetivos

1. **API.** `SimuladorPrecoQueries.Consulta` passa a ser a v2, dentro do mesmo SELECT de fora que só renomeia as colunas sem sublinhado (A7). As adaptações continuam:
   - **A1:** um nome de bind por ocorrência, na ordem do texto: `:pCompra1`…`:pCompra22`, `:numRegiao`, `:codFornec1`, `:codFornec2`, `:matricula1`, `:matricula2` e `:codFilial`;
   - **A2:** `CODFUNC = 1` vira a matrícula da sessão;
   - **A4:** sem o `;`;
   - **A6:** `TO_CHAR` nos códigos.

   Entram `CodFilial`, `ClasseVenda` e `PrFinal` na entidade, no DTO e nos tipos do front.
2. **`sp5` contra a v2:** o miolo idêntico à referência, exceto A1, A2 e A4.
3. **Recálculo** (`lib/simuladorPreco.ts`) reescrito pelas fórmulas da v2, com o `vlSt` como entrada, e devolvendo `prFinal`.
4. **`sp8`:**
   - os casos à mão refeitos com as fórmulas da v2;
   - a parte 2 conferindo também `prFinal`, contra um JSON novo da `sp6` rodada **com a v2**, que o Gabriel executa.
5. **Tela:**
   - a coluna ST sai do grupo Entrada (na v2 o ST não é custo de entrada);
   - o grupo Preço passa a ter Preço futuro, ST e Preço final, em verde;
   - o quadro ganha o campo ST (R$);
   - o `AjusteDaLinha` e o `ProdutoNovo` ganham `st`;
   - a classe de venda aparece na linha de baixo.
6. **Remover a camada do sessionStorage** (V4), e com ela a `sp11`. A `sp10` e a `sp12` ficam.

## Não-objetivos

- **Busca e paginação no back-end:** são as anotações do Dev, e ficam para a próxima rodada. Até lá, ficam como estão, no front.
- **Mexer no localStorage das simulações:** o Dev vai mostrar a forma certa.
- **Usar o EF Core:** só vale para tabela nova, nunca para as `PC*`, e nem está instalado.

## Antiobjetivos

- A tela discordar do SQL v2 em qualquer coluna calculada, inclusive `prFinal`.
- Uma simulação antiga, salva com a v1, quebrar a tela. Os ajustes guardados só têm preço e percentuais, e o `st` é opcional.

## Decisões de quem constrói (minhas, a conferir)

- **A coluna ST do grupo Preço mostra o `VLST` em R$.** O `% ST`, que continua vindo da `PCTABTRIBENT`, fica no `title` da célula, como informação: na v2 os dois não entram na mesma conta.
- **A contagem de colunas depois do Produto passa a ser `1 + 5 + 3 + 5 + 3 = 17`** (Compra, Entrada, Custo, Saída e Preço).
- **O `CodFilial` vem na API, mas não aparece na tabela:** a consulta já é de uma filial só.

## Verificação

- `sp5` contra a v2: idêntico.
- `sp8`:
  - parte 1 (casos à mão da v2), que roda já;
  - parte 2, contra a `sp6` nova: 0 diferenças, também em `prFinal`.
- `sp10` e `sp12` verdes, `tsc` e `eslint` limpos, `dotnet build` sem erro.
- **Na tela, com login:**
  - as três colunas de preço;
  - o ST editável mexendo só no preço final;
  - a classe de venda visível;
  - nenhum dado do simulador no sessionStorage.

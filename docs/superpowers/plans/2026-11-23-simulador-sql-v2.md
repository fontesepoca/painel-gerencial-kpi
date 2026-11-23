# Simulador de preço: SQL v2 (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a API roda o SQL v2, a tela recalcula pelas fórmulas da v2 (com ST e preço final), e a
consulta deixa de ser guardada no navegador.

**Architecture:** quatro frentes. Cada uma tem a sua prova, e todas são sem banco até a última
tarefa:
- **SQL:** a constante passa a ter o miolo v2, dentro do SELECT de fora (A7). Prova: `sp5`.
- **Recálculo:** reescrito por CTE, que na v2 é uma subconsulta só. Prova: `sp8`.
- **Navegador:** a camada do sessionStorage sai.
- **Tela:** colunas novas e o campo ST no quadro.

**Tech Stack:** .NET 10 + Dapper + ODP.NET (bind posicional), Next.js 16 + React 19 + React Query 5, TypeScript strict.

**Spec:** [docs/superpowers/specs/2026-11-23-simulador-sql-v2-design.md](../specs/2026-11-23-simulador-sql-v2-design.md)

## Global Constraints

- **Referência imutável:** `docs/rotinas/simulador-preco/referencia/sql-v2.sql`.
- **Adaptações permitidas: só A1, A2, A4 e A6, mais o SELECT de fora (A7).**
- **A ordem dos binds:** `:pCompra1`…`:pCompra22`, `:numRegiao`, `:codFornec1`, `:codFornec2`, `:matricula1`, `:matricula2` e `:codFilial`.
- **Conta em decimal exato** (`lib/decimalExato.ts`), com o `ROUND` do Oracle nos mesmos pontos da v2.
- **Colunas depois do Produto:** `1 + 5 + 3 + 5 + 3 = 17`.
- **Nada da consulta no sessionStorage ou no localStorage.** O localStorage das simulações fica como está.
- **Sem commit pelo agente;** sem tocar no DRE, no `globals.css` nem em tabela `PC*`.

## Review Focus

1. **Linha com `VLST` nulo na `PCTABPR`:** o SQL faz `NVL(TP.VLST, 0)`, então o preço final é igual ao preço futuro. A `sp8` tem esse caso.
2. **Simulação salva antes (v1), sem `st`:** a linha abre e recalcula com o ST do SQL. A `sp8` cobre o `st` ausente no ajuste.
3. **ST editado com índice ≤ 0:** o preço futuro é "—", e o preço final também, pela D16 (sem somar o ST a um nulo). A `sp8` tem esse caso.
4. **Produto novo salvo antes da v2, sem `st`:** conta como zero. A `sp8` cobre.
5. **A diferença de arredondamento entre v1 e v2:** um caso em que somar os arredondados dá diferente de arredondar a soma. A Task 2 o encontra por busca e o fixa na `sp8`.

---

### Task 1: API na v2

**Files:**
- Modify: `api-new-kpi/Infrastructure/Persistence/Queries/SimuladorPrecoQueries.cs`
- Modify: `api-new-kpi/Infrastructure/Persistence/Repositories/SimuladorPrecoRepository.cs`
- Modify: `api-new-kpi/Domain/Entities/ProdutoSimulado.cs`
- Modify: `api-new-kpi/Application/Features/SimuladorPreco/Dtos/SimuladorPrecoDtos.cs`
- Modify: `api-new-kpi/Application/Features/SimuladorPreco/SimuladorPrecoService.cs`
- Test: `docs/rotinas/simulador-preco/validacao/sp5_sql_da_api_igual_a_referencia.mjs`

**Interfaces:**
- Produces: o DTO `ProdutoSimuladoDto` ganha `string? CodFilial`, `string? ClasseVenda` e `decimal? PrFinal`, que viram `codFilial`, `classeVenda` e `prFinal` no JSON.

- [ ] **Step 1: Generalizar a `sp5`.** A ordem esperada dos binds sai das ocorrências na referência, contadas por nome: N× `PCOMPRA` vira `pCompra1..N`, e os nomes repetidos ganham sufixo numérico. O `CODFUNC = 1` vira `:matricula1..2`. A marca de início do miolo passa a ser a primeira linha `SELECT` depois do cabeçalho da referência. A de fim, o último `)` antes do `;`. Rodar contra `sql-v2.sql`.
- [ ] **Step 2: Ver falhar.** Run: `node docs/rotinas/simulador-preco/validacao/sp5_sql_da_api_igual_a_referencia.mjs api-new-kpi/Infrastructure/Persistence/Queries/SimuladorPrecoQueries.cs docs/rotinas/simulador-preco/referencia/sql-v2.sql`. Expected: `DIFERE`, porque a constante ainda é a v1.
- [ ] **Step 3: Trocar a constante.**
  - O miolo da v2 entra com A1, A2 e A4.
  - O SELECT de fora mapeia `CODFILIAL`, `CLASSEVENDA` (com `TO_CHAR`, porque o tipo não foi conferido), `PRECOFINAL AS PRFINAL` e as colunas da v1.
  - O repositório faz `Add` de `pCompra1..22` (todos `null`, `DbType.Decimal`), depois `numRegiao`, `codFornec1`, `codFornec2`, `matricula1`, `matricula2` e `codFilial`.
  - A entidade, o DTO e o mapeamento do serviço ganham os três campos.
- [ ] **Step 4: Ver passar.** O mesmo comando dá `IDENTICO`. Run: `cd api-new-kpi && dotnet build -o "$TEMP/kpi-build-sp"`. Expected: `0 Erro(s)`.

---

### Task 2: Recálculo pela v2

**Files:**
- Modify: `client-new-kpi/lib/simuladorPreco.ts`
- Modify: `client-new-kpi/types/simulador-preco.ts`
- Test: `docs/rotinas/simulador-preco/validacao/sp8_recalculo_reproduz_o_sql.mjs`

**Interfaces:**
- Produces:
  - em `types`: `ProdutoSimulado` ganha `codFilial: string | null`, `classeVenda: string | null` e `prFinal: number | null`. `AjusteDaLinha` ganha `st?: number`. `ProdutoNovo` ganha `st?: number`, opcional, porque produto salvo antes não tem.
  - `calcular(preco: number, pc: PercentuaisDaLinha, st: number): LinhaCalculada`. `LinhaCalculada` ganha `prFinal: number | null`, e o `vlSt` devolvido é o `st` recebido.
  - `stEfetivo(p: ProdutoSimulado, ajuste?: AjusteDaLinha): number`, que é `ajuste?.st ?? p.vlSt ?? 0`.
  - `COLUNAS_CALCULADAS` ganha `"prFinal"`.

- [ ] **Step 1: Atualizar a `sp8` antes do código.**
  - Na linha conferida à mão, a v2 dá os mesmos números, porque ela é exata. Acrescentar `st: 5`, que dá `prFinal: 166.556` (161,5564… + 5, arredondado uma vez).
  - Acrescentar um caso de **arredondamento v1 × v2**: achar por busca (P de 0,001 a 50 em passos de 0,001, com os percentuais da linha à mão) um P em que `ROUND(soma dos arredondados)` ≠ `ROUND(soma crua)` no custo antes da CBS, e fixar os dois números esperados. A busca roda uma vez, fora do teste, para escolher o P.
  - Acrescentar os casos do Review Focus: `vlSt` nulo (preço final = preço futuro), índice ≤ 0 com ST (preço final `null`), `st` ausente no ajuste (vale o do SQL) e produto novo sem `st` (zero).
  - Na parte 2, `calcular(p.vlUltPCompra, percentuaisDe(p), p.vlSt ?? 0)`.
- [ ] **Step 2: Ver falhar.** Run (raiz): `node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/simulador-preco/validacao/sp8_recalculo_reproduz_o_sql.mjs`. Expected: FALHA no caso v1 × v2 e no `prFinal`.
- [ ] **Step 3: Reescrever `calcular` pela v2:**
  - `CUSTO_ANTES_CBS = ROUND(P + P·IPI − P·ICMSc − (P − P·ICMSc)·|PIS| − (P − P·ICMSc)·|COFINS| + P·FRETE, 3)`, tudo **cru** e com um `ROUND` só, com os percentuais divididos por 100;
  - `BASE_CBS = ROUND(P − P·ICMSc − P·IPI, 3)`;
  - `VLCBS = ROUND((P − P·ICMSc − P·IPI)·CBS, 3)`;
  - `CUSTO_CALC = ROUND(CUSTO_ANTES_CBS − VLCBS, 3)`;
  - `INDICE` como antes;
  - `PR_FUTURO = ROUND((CUSTO_ANTES_CBS − VLCBS) / índice cru, 3)`;
  - `PRFINAL = ROUND((CUSTO_ANTES_CBS − VLCBS) / índice cru + ST, 3)`, nulo quando o índice é zero.

  `VLIPI`, `VLICMS`, `VLPIS`, `VLCOFINS` e `VLFRETE` continuam como colunas arredondadas, iguais às da v1. Os comentários passam a citar a v2.
- [ ] **Step 4: Ver passar.** O mesmo comando dá todas passaram. Run: `cd client-new-kpi && npx tsc --noEmit`. Expected: erros **só** nos componentes e na página, que usam `calcular` com dois argumentos e são resolvidos na Task 4.

---

### Task 3: A consulta sai do navegador

**Files:**
- Delete: `client-new-kpi/lib/consultaGuardada.ts`
- Delete: `docs/rotinas/simulador-preco/validacao/sp11_consulta_comprimida.mjs`
- Modify: `client-new-kpi/lib/chavesPorBase.ts` (tirar `chaveDaConsultaGuardada`)
- Modify: `client-new-kpi/app/simulador-preco/page.tsx`

- [ ] **Step 1:** tirar da página:
  - o efeito de restauração, o ref `consultou` e a gravação no `onSuccess`;
  - os imports de `consultaGuardada` e de `chaveDaConsultaGuardada`.

  O `resultado` continua como estado (`{ dados, consultadoEm }`), preenchido só pelo `onSuccess` da consulta. O resultado da consulta continua sendo o da `useMutation` do React Query, e o estado só acrescenta o momento.
- [ ] **Step 2: Verificar.** Run: `grep -rn "sessionStorage\|consultaGuardada" client-new-kpi/app client-new-kpi/lib client-new-kpi/components`. Expected: nenhuma linha.

---

### Task 4: A tela da v2

**Files:**
- Modify: `client-new-kpi/components/simulador-preco/TabelaSimulador.tsx`
- Modify: `client-new-kpi/components/simulador-preco/QuadroSimulacao.tsx`
- Modify: `client-new-kpi/lib/simuladorPreco.ts` (`linhaDeProdutoNovo` e `linhaSimulada` com `st`)

**Interfaces:**
- Consumes: `calcular(preco, pc, st)`, `stEfetivo` e `prFinal` (Task 2).

- [ ] **Step 1: Tabela.**
  - O grupo Entrada perde a coluna ST e fica com `colSpan` 5.
  - O grupo Preço fica com `colSpan` 3: "Preço futuro" (sem destaque), "ST" e "Preço final", com `TH_FUNDO_PRECO`/`TD_FUNDO_PRECO` e a variação ▲/▼ contra `p.prFinal`.
  - A coluna ST mostra `vl("vlSt")` em R$, fica azul quando `ajuste.st` está definido, e tem o `% ST` no `title`.
  - `COLUNAS_DEPOIS_DO_PRODUTO = 1 + 5 + 3 + 5 + 3`.
  - Na linha de baixo do produto entra ` · Classe ${classeVenda}`, quando houver.
  - A D16 vale para os dois preços.
- [ ] **Step 2: Quadro.**
  - Um campo "ST (R$)" depois da margem e do ICMS de saída. A referência é `p.vlSt ?? 0`; no produto novo, `inicial?.st ?? 0`.
  - O resultado ganha as linhas "+ ST" e "Preço final", em destaque, com a variação.
  - O Confirmar grava `st` no ajuste quando ele difere da referência; no produto novo, grava sempre.
- [ ] **Step 3: `linhaSimulada`** passa a considerar `ajuste.st !== undefined` como simulação, e `linhaDeProdutoNovo` passa a usar `n.st ?? 0`.
- [ ] **Step 4: Verificar.** Run: `cd client-new-kpi && npx tsc --noEmit && npx eslint app/simulador-preco components/simulador-preco lib`. Expected: limpo. Depois, `sp8` (parte 1), `sp10` e `sp12` verdes.

---

### Task 5: Prova contra o banco e capturas

- [ ] **Step 1:** pedir ao Gabriel que suba a API e rode a `sp6` com a filial 7, região 90, gerando um JSON novo da v2.
- [ ] **Step 2:** rodar a `sp8` com esse JSON. Expected: `0 com diferença`, inclusive em `prFinal`.
- [ ] **Step 3:** capturas, com login, dos pontos da spec v2 e das pendentes das rodadas anteriores. Atualizar a §3.5 da spec do simulador. Parar e entregar para commit.

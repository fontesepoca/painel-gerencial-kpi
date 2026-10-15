# Coluna PROVISIONADO (competência) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Em competência, cada linha de despesa ganha, nos meses com título em aberto, as colunas PROVISIONADO (o aberto) e TOTAL (Valor + Provisionado), com checkbox para esconder e detalhamento dos títulos em aberto.

**Architecture:** A versão "em aberto" de cada consulta de despesas é derivada do texto atual por troca de trechos com contagem garantida (`EmAberto`), e roda em paralelo à de hoje. O `MontadorDre` indexa o aberto pelo mesmo `Destino` e o mesmo rateio do Valor e o devolve em campos novos dos DTOs. O front desenha as colunas por mês conforme `TemProvisionado`.

**Tech Stack:** .NET 10 + Dapper + ODP.NET (binds posicionais) · Next.js 16 + React 19 + TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-10-14-provisionado-competencia-design.md`

## Global Constraints

- Só regime **competência**; em caixa a resposta é a de hoje, sem campos preenchidos.
- Em aberto = a mesma consulta trocando **só** `DTPAGTO IS NOT NULL` por `DTPAGTO IS NULL`; o ramo de venda de ativo (`PCNFSAID`/`PCPREST`) fica vazio com `AND 1 = 0`. Nenhum outro filtro.
- O texto das constantes SQL **não muda** (dc86 e dc76 seguem valendo).
- ODP.NET é posicional: a lista de parâmetros da versão em aberto é **idêntica** à de hoje.
- Provisionado só em linha **não calculada**. Totalizadores, %AV e %AH não mudam.
- Arredondamento por coluna, half-to-even, antes de somar o período.
- Português em código, comentários e docs. Nunca conectar no Oracle; nenhuma biblioteca nova.
- Toda tela com `<ControlesDeExibicao />`; todo efeito visual nos dois temas.

## Review Focus

1. **Linha que só tem aberto** (nenhum pago no período): tem de aparecer com Valor 0,00 e o Provisionado, inclusive com "Mostrar zeradas" desmarcado — Task 2 testa.
2. **Filtro por fornecedor:** o Provisionado rateado pela participação, com o exclusivo inteiro — Task 2 testa; dc78 com a API.
3. **Conta subida (manutenção/pneus) em aberto num centro sem linha:** vai para a linha da conta, e o detalhe dessa linha recorta a sobra — Task 2 testa.
4. **Mês sem nenhum aberto:** sem colunas novas, e o bloco do período só as ganha se algum mês tiver — Task 2 testa `TemProvisionado`; Task 4 na tela.
5. **Reordenação de linhas** (`recalculoDoDre.ts`) não pode descartar `provisionado` do total — Task 4.

---

### Task 1: A versão em aberto das consultas (API, sem montador)

**Files:**
- Modify: `api-new-kpi/Infrastructure/Persistence/Queries/DreGerencialQueries.cs` (método `EmAberto`)
- Modify: `api-new-kpi/Infrastructure/Persistence/Queries/DreDetalheQueries.cs` (método `EmAberto` do detalhe)
- Modify: `api-new-kpi/Domain/Interfaces/IDreGerencialRepository.cs`, `api-new-kpi/Infrastructure/Persistence/Repositories/DreGerencialRepository.cs` (`emAberto`)
- Test: `docs/rotinas/9815-dre-gerencial/validacao/dc92_consultas_em_aberto.cs`

**Interfaces:**
- Produces: `DreGerencialQueries.EmAberto(string sqlDespesas): string`; `DreDetalheQueries.EmAberto(string sqlLancamentos): string`; `ObterDespesasAsync(..., IReadOnlyList<decimal>? fornecedores = null, bool emAberto = false, CancellationToken ct = default)`.

- [ ] **Step 1: Teste (falha):** `dc92` chama `EmAberto` nas quatro `Despesas*` e em `Lancamentos` e confere: exatamente um `DTPAGTO IS NULL`, nenhum `DTPAGTO IS NOT NULL`, o `AND 1 = 0` no ramo, os mesmos `:placeholders` na mesma ordem que o original, e que uma consulta sem os trechos lança `InvalidOperationException`.
- [ ] **Step 2: Rodar** `dotnet run docs/rotinas/9815-dre-gerencial/validacao/dc92_consultas_em_aberto.cs -p:BaseOutputPath="$TEMP/dc92/"` → falha de compilação (método não existe).
- [ ] **Step 3: Implementar** em `DreGerencialQueries`:

```csharp
public static string EmAberto(string sqlDespesas) =>
    TrocarUmaVez(
        TrocarUmaVez(sqlDespesas, "WHERE DTPAGTO IS NOT NULL", "WHERE DTPAGTO IS NULL"),
        "nf.codfilial IN ({3})", "nf.codfilial IN ({3}) AND 1 = 0");

internal static string TrocarUmaVez(string sql, string de, string para)
{
    var primeira = sql.IndexOf(de, StringComparison.Ordinal);
    if (primeira < 0 || sql.IndexOf(de, primeira + de.Length, StringComparison.Ordinal) >= 0)
        throw new InvalidOperationException($"A versão em aberto espera '{de}' exatamente uma vez na consulta.");
    return string.Concat(sql.AsSpan(0, primeira), para, sql.AsSpan(primeira + de.Length));
}
```

  e em `DreDetalheQueries.EmAberto` o mesmo com `"WHERE DTPAGTO IS NOT NULL) FIN"` e `"nf.codfilial IN ({2})"`. No repositório, `var modelo = emAberto ? DreGerencialQueries.EmAberto(analise.SqlDespesas) : analise.SqlDespesas;` antes do `string.Format`.
- [ ] **Step 4: Rodar** dc92 → passa; `dotnet build`; dc86 → 60/60.
- [ ] **Step 5: Commit** `feat(dre): a versao em aberto das consultas de despesa`.

### Task 2: Montador, DTOs e serviço

**Files:**
- Modify: `Application/Features/DreGerencial/ColunaApuracao.cs` (`Abertos`), `RecorteDre.cs` (`EmColunas(..., abertos)`), `Dtos/DreGerencialDtos.cs` (`ValorMesDto.Provisionado`, `TotalLinhaDto.Provisionado`, `PeriodoDto.TemProvisionado`), `MontadorDre.cs`, `DreGerencialService.cs`
- Test: `docs/rotinas/9815-dre-gerencial/validacao/dc93_provisionado_no_montador.cs`

**Interfaces:**
- Consumes: `ObterDespesasAsync(..., emAberto: true)`.
- Produces: `ValorMesDto(string MesAno, decimal Valor, decimal? PercentualAv, decimal? PercentualAh, decimal? Provisionado = null)`; `TotalLinhaDto(decimal Valor, decimal Media, decimal? PercentualAv, decimal? Provisionado = null)`; `PeriodoDto(..., int Bloco, bool TemProvisionado = false)`; `ColunaApuracao(..., int Bloco = 0, IReadOnlyList<DespesaDre>? Abertos = null)`.

- [ ] **Step 1: Teste (falha)** `dc93`: estrutura com ADMINISTRATIVO (1001 SSS), Sub-Total, RESULTADO, LUCRO LIQUIDO e a conta 3000067 (NNN); duas colunas (jul com aberto, ago sem). Afirma: aberto na linha do centro; Valor intacto; `Provisionado` nulo em totalizador; `TemProvisionado` true só em jul; linha só com aberto não é `SemMovimento`; conta subida em aberto num centro sem linha vai para a conta e entra na `Sobra`; com `Faturamento.Participacao = 0,5` e exclusivo, `(aberto − exclusivo) × 0,5 + exclusivo`; sem `Abertos` (caixa) tudo nulo; Sub-Total igual com e sem aberto.
- [ ] **Step 2: Rodar** → falha de compilação.
- [ ] **Step 3: Implementar.** No `Montar`: `valorAberto` com o mesmo `GroupBy(Destino…)` sobre `c.Abertos`; `qtdDespesa` soma também os abertos; `sobras` considera pagos e abertos; por coluna `temAberto = c.Abertos is { Count: > 0 }`; por linha não calculada, `Provisionado = temAberto ? Arredondar(Ratear(aberto, exclusivo, c.Faturamento?.Participacao ?? 1m)) : null`; total = soma dos não nulos, ou nulo; `PeriodoDto.TemProvisionado = temAberto`. No serviço, quando `regime == RegimeDre.Competencia`, buscar os abertos em paralelo (`Task.WhenAll`) e passar a `recorte.EmColunas(despesas, faturamento, abertos)`.
- [ ] **Step 4: Rodar** dc93 → passa; dc91 → 15/15; `dotnet build`.
- [ ] **Step 5: Commit** `feat(dre): o provisionado no montador e nos DTOs`.

### Task 3: Detalhamento dos títulos em aberto (API)

**Files:**
- Modify: `DreDetalheQueries.cs` (coluna `DTVENC`), `Domain/Entities/DetalheDre.cs` (`DtVenc`), `Dtos/DreGerencialDtos.cs` (`DetalheLancamentoDto.DtVenc`, `DetalheFiltroDto.Provisionado`, `DetalhamentoDto.Provisionado`), `DreGerencialService.cs`, `IDreGerencialRepository.cs`, `DreGerencialRepository.cs`

- [ ] **Step 1:** `Lancamentos` projeta `DTVENC` (o `FIN` já o tem; o ramo de venda de ativo devolve `fin.dtvenc`). `ObterDetalheLancamentosAsync(..., bool emAberto = false, ...)` usa `DreDetalheQueries.EmAberto`. O serviço recusa `Provisionado` fora de competência e ecoa `Provisionado` no `DetalhamentoDto`.
- [ ] **Step 2:** dc92 passa a conferir também a coluna `DTVENC` nos dois ramos; `dotnet build`; dc86 (o texto de `Lancamentos` muda de propósito: reapontar `COMMIT_BASE` no commit seguinte).
- [ ] **Step 3: Commit** `feat(detalhe): os titulos em aberto de uma celula de provisionado` e, em seguida, `test(dc86): ...`.

### Task 4: Front — tipos, colunas, checkbox, reordenação e Excel

**Files:**
- Modify: `client-new-kpi/types/dre-gerencial.ts`, `components/dre-gerencial/TabelaDre.tsx`, `app/dre-gerencial/page.tsx`, `lib/recalculoDoDre.ts`, `lib/exportarExcel.ts`

- [ ] **Step 1:** Tipos: `ValorMes.provisionado?: number | null`, `TotalLinha.provisionado?: number | null`, `PeriodoDre.temProvisionado?: boolean`, `DetalheLancamento.dtVenc?: string | null`, `FiltroDetalhe.provisionado?: boolean`, `Detalhamento.provisionado?: boolean`.
- [ ] **Step 2:** `page.tsx`: `const [mostrarProvisionado, setMostrarProvisionado] = useState(true)`; `temProvisionado = dados?.regime === "competencia" && dados.periodos.some(p => p.temProvisionado)`; checkbox "Provisionado" ao lado de AH% só quando `temProvisionado`; repassa a `TabelaDre` e a `exportarApuracao` (`{ av, ah, provisionado }`).
- [ ] **Step 3:** `TabelaDre`: por período, `colunasPorMes += prov(p) ? 2 : 0` com `prov(p) = mostrarProvisionado && p.temProvisionado`; o bloco do período ganha 2 se algum mês tiver; `ColunasCabecalho` e `BlocoMes` desenham `Provisionado` e `Total` (Total = valor + provisionado; célula vazia em totalizador). Duplo clique no Provisionado → `abrirDetalhe(linha, mesAno, { provisionado: true })`, título `… · Títulos em aberto`.
- [ ] **Step 4:** `recalculoDoDre.ts`: `total: { ...l.total, valor, media, percentualAv }` para não descartar `provisionado`; dc35/dc36 passam.
- [ ] **Step 5:** `exportarExcel.ts`: `ColunasDeAnalise.provisionado`; as duas colunas por mês e no bloco final com a mesma regra; dc14-like offline (dc94) confere a matriz.
- [ ] **Step 6:** `npx tsc --noEmit`, `npx eslint` nos arquivos; commit `feat(tela): colunas Provisionado e Total, com checkbox`.

### Task 5: Front — tela dos títulos em aberto

**Files:**
- Modify: `components/dre-gerencial/TabelaDre.tsx` (o pedido leva `provisionado`), `hooks/useDreGerencial.ts` (repassa), `components/dre-gerencial/ModalDetalhe.tsx` (colunas Vencimento e Dias em atraso quando `dados.provisionado`), `lib/exportarExcelDetalhe.ts` (Vencimento)

- [ ] **Step 1:** colunas novas logo depois do `V. Pago`: `Vencimento` (data) e `Dias em atraso` (hoje − vencimento, só positivo; vazio quando a vencer). "Lançado por" é o `Func.Lanc` que já existe.
- [ ] **Step 2:** `tsc`/`eslint`; commit `feat(detalhe): a tela dos titulos em aberto`.

### Task 6: Documentação e verificação com a API

- [ ] **Step 1:** DIVERGENCIAS.md: divergência nova (acréscimo, a pedido, 14/10/2026) com a medição; ESPECIFICACAO.md §colunas.
- [ ] **Step 2:** dc6 aceita `--provisionado` e confere cada célula de Provisionado contra o detalhe.
- [ ] **Step 3:** O Gabriel roda: dc34, dc6 (com e sem provisionado), dc78, a consulta de conferência de um mês por centro, e a tela nos dois temas.
- [ ] **Step 4:** Commit `docs: o provisionado na DIVERGENCIAS e na ESPECIFICACAO`.

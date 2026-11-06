# Exportação do detalhamento em lote — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar as N linhas × M colunas requisições da exportação do detalhamento por um
endpoint de lote em fluxo NDJSON, com uma consulta por bloco × coluna, à prova de timeout e com
zip parcial quando algo falhar.

**Architecture:** A API planeja o lote em unidades (bloco × coluna para os lançamentos; linha ×
coluna para receita, devolução, impostos e contas com sobra), roda uma de cada vez com uma nova
tentativa em falha transitória e batimento a cada 15 s, e escreve um pacote por linha × coluna.
O front lê o fluxo, gera cada Excel na hora com o mesmo `planilhaDoDetalhe` e monta o zip; um
vigia de 90 s e um botão Cancelar fecham a conexão.

**Tech Stack:** .NET 10 + Dapper + ODP.NET; Next.js 16 / React 19 / TypeScript strict; ExcelJS;
NDJSON sobre `fetch` nativo. Nenhuma biblioteca nova.

**Spec:** `docs/superpowers/specs/2026-11-06-exportacao-em-lote-design.md`

## Global Constraints

- Branch `feat/exportacao-em-lote`. **Sem commit durante a execução**: o Gabriel revisa o
  working tree e pede o commit (memória "Não commitar direto").
- O Claude **nunca conecta no Oracle**: o dc107 é rodado pelo Gabriel.
- `DreGerencialQueries.cs` e `DreDetalheQueries.cs` **não mudam** (o dc86 compara os dois).
- Toda `CommandDefinition` nova passa por `Final(...)` (dc86 regra 5).
- `repassarParaApi` não ganha `timeout` (dc87).
- Nenhum número muda: o conteúdo de cada planilha é o `DetalhamentoDto` de hoje.
- Português com acentos em textos, comentários e mensagens.
- Limites do lote: 1–300 linhas, 1–24 colunas, `id` único.
- Batimento: 15 s. Vigia do front: 90 s. `commandTimeout` da unidade agrupada: 600 s.
- Erros transitórios (nova tentativa, uma vez): ORA-01013, 03113, 03114, 03135, 12170, 12541,
  12571 e `TimeoutException`. Cancelamento do usuário nunca é tentado de novo.
- Nome do aviso no zip: `LEIA - arquivos que faltaram.txt`.

## Review Focus

1. **Chave que não casa** — `CHAVELOTE` devolvida pelo Oracle diferente, byte a byte, da `chave`
   da linha (espaço, zero à esquerda): a planilha sairia vazia, sem erro. O dc107 compara linha a
   linha; a Task 4 registra no log as linhas devolvidas com chave fora do lote.
2. **Duas linhas com a mesma chave no mesmo bloco** — as duas têm de receber os mesmos
   lançamentos (dc105, Task 3).
3. **Pacote enorme partido em muitos pedaços** — uma unidade de ~10 mil lançamentos é uma linha
   de ~8 MB; o leitor tem de juntar sem custo quadrático e sem perder a quebra (dc106, Task 5).
4. **Conexão que cai em silêncio** — sem `fim` e sem bytes: o vigia aborta e o zip sai parcial
   com o motivo (dc106 + verificação final).
5. **Comparativo** — colunas não vizinhas: cada coluna é a sua unidade, com o próprio intervalo
   (dc105 confere que a unidade carrega o índice da coluna, e o dc107 roda num comparativo).

---

### Task 1: SQL do lote e chave no lançamento

**Files:**
- Create: `api-new-kpi/Infrastructure/Persistence/Queries/ConsultaDoLote.cs`
- Modify: `api-new-kpi/Domain/Entities/DetalheDre.cs` (classe `DetalheLancamentoDre`)
- Test: `docs/rotinas/9815-dre-gerencial/validacao/dc105_lote_do_detalhamento.cs`

**Interfaces:**
- Produces: `ConsultaDoLote.Lancamentos(string sqlLancamentos, int chaves) : string` — troca
  `SELECT RECNUM, EXCLUSIVO,` por `SELECT {3} AS CHAVELOTE, RECNUM, EXCLUSIVO,` e
  `WHERE {3} = :chave` por `WHERE {3} IN (:chave0, ..., :chaveN-1)`; lança se uma âncora não
  aparecer exatamente uma vez. `DetalheLancamentoDre.ChaveLote : string?`.

- [ ] **Step 1: Escrever o dc105 (parte 1) — falha por não compilar**

```csharp
#:project ../../../../api-new-kpi/api-new-kpi.csproj
#:property PublishAot=false

// dc105 — o LOTE do detalhamento (06/11/2026): a consulta, o plano e o batimento.
//
// Pedido do Gabriel: exportar muitas linhas em períodos longos sem uma requisição por linha ×
// mês. A API agrupa as linhas de lançamentos por bloco e consulta com `IN`, uma vez por coluna.
// Ver docs/superpowers/specs/2026-11-06-exportacao-em-lote-design.md.
//
// Rode da RAIZ do repositório:
//   dotnet run docs/rotinas/9815-dre-gerencial/validacao/dc105_lote_do_detalhamento.cs -p:BaseOutputPath="$TEMP/dc105/"
//
// Não toca no banco.

using System.Text.RegularExpressions;
using Epoca.Kpi.Api.Infrastructure.Persistence.Queries;

var falhas = 0;
var n = 0;
void Afirmar(bool ok, string oque)
{
    n++;
    Console.WriteLine($"  {(ok ? "ok   " : "FALHA")} {oque}");
    if (!ok) falhas++;
}

static string Binds(string sql) =>
    string.Join(" ", Regex.Matches(sql, @":[A-Za-z]\w*|\{\d+\}").Select(m => m.Value));

static int Vezes(string sql, string trecho) =>
    Regex.Matches(sql, Regex.Escape(trecho)).Count;

Console.WriteLine("\n══ dc105 — o lote do detalhamento ══\n");

// ── 1. A consulta do lote ────────────────────────────────────────────────────────────────
var original = DreDetalheQueries.Lancamentos;
var lote = ConsultaDoLote.Lancamentos(original, 3);

Afirmar(Vezes(lote, "WHERE {3} IN (:chave0, :chave1, :chave2)") == 1, "o recorte vira IN com uma chave por linha");
Afirmar(Vezes(lote, "WHERE {3} = :chave") == 0, "o recorte de uma chave só não sobra");
Afirmar(Vezes(lote, "SELECT {3} AS CHAVELOTE, RECNUM, EXCLUSIVO,") == 1, "o SELECT externo devolve a chave do lote");
Afirmar(
    Binds(lote) == "{3} " + Binds(original).Replace(":chave", ":chave0 :chave1 :chave2"),
    "os binds são os de sempre, na mesma ordem, com as chaves no lugar de :chave");
Afirmar(Vezes(ConsultaDoLote.Lancamentos(original, 1), "WHERE {3} IN (:chave0)") == 1, "uma chave só também é IN");

var competencia = ConsultasEmAberto.LancamentosRealizadosEmCompetencia(original);
var loteCompetencia = ConsultaDoLote.Lancamentos(competencia, 2);
Afirmar(Vezes(loteCompetencia, "WHERE (DTPAGTO IS NOT NULL OR TIPOLANC = 'C')") == 1
        && Vezes(loteCompetencia, "WHERE {3} IN (:chave0, :chave1)") == 1,
    "compõe com o realizado em competência");

var lancou = false;
try { ConsultaDoLote.Lancamentos("SELECT 1 FROM DUAL", 1); } catch (InvalidOperationException) { lancou = true; }
Afirmar(lancou, "consulta sem as âncoras lança, em vez de seguir pela metade");

lancou = false;
try { ConsultaDoLote.Lancamentos(original, 0); } catch (ArgumentOutOfRangeException) { lancou = true; }
Afirmar(lancou, "zero chaves lança");

// [PARTE 2 — Task 3]
// [PARTE 3 — Task 3]

Console.WriteLine($"\n{(falhas == 0 ? "✓ dc105 passou" : $"✗ dc105: {falhas} falha(s)")} — {n} conferências\n");
return falhas == 0 ? 0 : 1;
```

> A conferência de binds monta o esperado a partir do original: `{3}` entra na frente (a coluna
> nova vem antes de tudo) e `:chave` vira as três; o resto não muda.

- [ ] **Step 2: Rodar e ver falhar**

Run: `dotnet run docs/rotinas/9815-dre-gerencial/validacao/dc105_lote_do_detalhamento.cs -p:BaseOutputPath="$TEMP/dc105/"`
Expected: erro de compilação — `ConsultaDoLote` não existe.

- [ ] **Step 3: Implementar `ConsultaDoLote`**

```csharp
namespace Epoca.Kpi.Api.Infrastructure.Persistence.Queries;

/// <summary>
/// A versão EM LOTE de <see cref="DreDetalheQueries.Lancamentos"/> — a exportação de muitas
/// linhas (06/11/2026, pedido do Gabriel).
///
/// <para><b>Uma consulta por bloco e por coluna, com todas as linhas do bloco de uma vez.</b>
/// O recorte <c>WHERE {3} = :chave</c> vira <c>WHERE {3} IN (:chave0, ...)</c>, e o SELECT
/// externo devolve a própria expressão do recorte como <c>CHAVELOTE</c> — é por ela que a API
/// devolve a cada linha os lançamentos dela. O filtro de datas é o de sempre, com o intervalo
/// da coluna: o lote não redistribui lançamento entre meses.</para>
///
/// <para><b>Derivada, e não uma cópia</b>, pelo mesmo motivo de <see cref="ConsultasEmAberto"/>:
/// uma correção no detalhamento vale para a exportação sem ninguém lembrar. E mora num
/// arquivo próprio porque o dc86 compara <c>DreDetalheQueries.cs</c> inteiro.</para>
///
/// <para>Os binds ficam na mesma ordem: a coluna nova não tem bind, e as chaves ocupam a
/// posição de <c>:chave</c>. O dc105 confere.</para>
/// </summary>
public static class ConsultaDoLote
{
    private const string SelectExterno = "SELECT RECNUM, EXCLUSIVO,";
    private const string Recorte = "WHERE {3} = :chave";

    public static string Lancamentos(string sqlLancamentos, int chaves)
    {
        if (chaves < 1)
        {
            throw new ArgumentOutOfRangeException(nameof(chaves), chaves, "O lote precisa de ao menos uma chave.");
        }

        var lista = string.Join(", ", Enumerable.Range(0, chaves).Select(i => $":chave{i}"));

        return TrocarUmaVez(
            TrocarUmaVez(sqlLancamentos, SelectExterno, "SELECT {3} AS CHAVELOTE, RECNUM, EXCLUSIVO,"),
            Recorte,
            "WHERE {3} IN (" + lista + ")");
    }

    /// <summary>Zero ou duas ocorrências lançam: a consulta mudou e a troca sairia pela metade.</summary>
    private static string TrocarUmaVez(string sql, string de, string para)
    {
        var primeira = sql.IndexOf(de, StringComparison.Ordinal);
        if (primeira < 0 || sql.IndexOf(de, primeira + de.Length, StringComparison.Ordinal) >= 0)
        {
            throw new InvalidOperationException(
                $"A consulta do lote espera '{de}' exatamente uma vez no detalhamento.");
        }

        return string.Concat(sql.AsSpan(0, primeira), para, sql.AsSpan(primeira + de.Length));
    }
}
```

Em `DetalheLancamentoDre` (`Domain/Entities/DetalheDre.cs`), logo depois de `RecNum`:

```csharp
    /// <summary>
    /// A chave da linha do DRE a que o lançamento pertence — só na consulta do LOTE
    /// (<c>ConsultaDoLote</c>), nula no detalhamento de uma célula. Sem sublinhado no alias
    /// (<c>CHAVELOTE</c>): o Dapper não casaria <c>CHAVE_LOTE</c> com esta propriedade.
    /// </summary>
    public string? ChaveLote { get; init; }
```

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo comando do Step 2.
Expected: `✓ dc105 passou — 8 conferências`. Se a conferência de binds falhar, imprima
`Binds(lote)` e `Binds(original)` e ajuste a montagem do esperado — não a consulta.

- [ ] **Step 5: Regressão das consultas**

Run: `dotnet run docs/rotinas/9815-dre-gerencial/validacao/dc92_consultas_em_aberto.cs -p:BaseOutputPath="$TEMP/dc92/"` e
`node docs/rotinas/9815-dre-gerencial/validacao/dc86_sql_da_epoca_identico.mjs`
Expected: os dois passam (nenhum arquivo comparado mudou).

---

### Task 2: Repositório — consulta do lote e falha transitória

**Files:**
- Create: `api-new-kpi/Infrastructure/Persistence/FalhaTransitoria.cs`
- Modify: `api-new-kpi/Domain/Interfaces/IDreGerencialRepository.cs`
- Modify: `api-new-kpi/Infrastructure/Persistence/Repositories/DreGerencialRepository.cs:788-920`
- Test: dc105 (parte 2 entra na Task 3), dc86

**Interfaces:**
- Consumes: `ConsultaDoLote.Lancamentos`, `DetalheLancamentoDre.ChaveLote`.
- Produces:
  - `Task<IReadOnlyList<DetalheLancamentoDre>> ObterDetalheLancamentosDoLoteAsync(IReadOnlyList<string> filiais, DateOnly dataInicio, DateOnly dataFim, RegimeDre regime, AnaliseDre analise, string bloco, IReadOnlyList<string> chaves, IReadOnlyList<decimal>? fornecedores = null, CancellationToken cancellationToken = default)`
  - `bool EhFalhaTransitoria(Exception erro)` na interface.
  - `FalhaTransitoria.Eh(Exception) : bool`, `FalhaTransitoria.Codigos : IReadOnlySet<int>`.

- [ ] **Step 1: `FalhaTransitoria`**

```csharp
using Oracle.ManagedDataAccess.Client;

namespace Epoca.Kpi.Api.Infrastructure.Persistence;

/// <summary>
/// Que falha do Oracle vale UMA nova tentativa na exportação em lote (06/11/2026).
///
/// <para>Só o que passa sozinho: tempo esgotado (ORA-01013 é como o ODP.NET avisa o
/// <c>commandTimeout</c>) e conexão que caiu ou não abriu. Erro de SQL, de privilégio ou de
/// dado repetiria igual — tentar de novo só dobraria a espera.</para>
///
/// <para>Mora na infraestrutura porque <c>OracleException</c> é do driver; o serviço pergunta
/// pelo repositório (<c>EhFalhaTransitoria</c>).</para>
/// </summary>
public static class FalhaTransitoria
{
    public static readonly IReadOnlySet<int> Codigos =
        new HashSet<int> { 1013, 3113, 3114, 3135, 12170, 12541, 12571 };

    public static bool Eh(Exception erro) => erro switch
    {
        OracleException oracle => Codigos.Contains(oracle.Number),
        TimeoutException => true,
        AggregateException { InnerExceptions.Count: 1 } agregada => Eh(agregada.InnerExceptions[0]),
        _ => false,
    };
}
```

- [ ] **Step 2: Interface**

Em `IDreGerencialRepository`, depois de `ObterDetalheLancamentosAsync`:

```csharp
    /// <summary>
    /// Os lançamentos de VÁRIAS linhas de um bloco numa coluna — a exportação em lote
    /// (06/11/2026). A mesma consulta de <see cref="ObterDetalheLancamentosAsync"/>, com
    /// <c>IN</c> no recorte e a chave de cada lançamento em <c>ChaveLote</c>. Só os realizados
    /// (sem provisionado) e sem sobra: linha com sobra vai pelo detalhamento de uma célula.
    /// </summary>
    Task<IReadOnlyList<DetalheLancamentoDre>> ObterDetalheLancamentosDoLoteAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        RegimeDre regime,
        AnaliseDre analise,
        string bloco,
        IReadOnlyList<string> chaves,
        IReadOnlyList<decimal>? fornecedores = null,
        CancellationToken cancellationToken = default);

    /// <summary>Se vale uma nova tentativa — ver <c>FalhaTransitoria</c>.</summary>
    bool EhFalhaTransitoria(Exception erro);
```

- [ ] **Step 3: Repositório — um corpo só para as duas consultas**

Em `DreGerencialRepository`, renomeie o corpo atual de `ObterDetalheLancamentosAsync` para um
método privado que recebe o modo, e faça os dois públicos chamarem ele. As únicas diferenças
dentro do corpo estão marcadas com `// LOTE`:

```csharp
    public Task<IReadOnlyList<DetalheLancamentoDre>> ObterDetalheLancamentosAsync(
        IReadOnlyList<string> filiais, DateOnly dataInicio, DateOnly dataFim, RegimeDre regime,
        AnaliseDre analise, string bloco, string chave,
        IReadOnlyList<decimal>? fornecedores = null, IReadOnlyList<string>? sobra = null,
        bool emAberto = false, CancellationToken cancellationToken = default) =>
        ConsultarLancamentosAsync(filiais, dataInicio, dataFim, regime, analise, bloco,
            [chave], lote: false, fornecedores, sobra, emAberto, commandTimeout: 300,
            cancellationToken);

    public Task<IReadOnlyList<DetalheLancamentoDre>> ObterDetalheLancamentosDoLoteAsync(
        IReadOnlyList<string> filiais, DateOnly dataInicio, DateOnly dataFim, RegimeDre regime,
        AnaliseDre analise, string bloco, IReadOnlyList<string> chaves,
        IReadOnlyList<decimal>? fornecedores = null, CancellationToken cancellationToken = default) =>
        // 600 s, o dobro da célula: o `IN` lê as linhas de um bloco inteiro num mês.
        ConsultarLancamentosAsync(filiais, dataInicio, dataFim, regime, analise, bloco,
            chaves, lote: true, fornecedores, sobra: null, emAberto: false, commandTimeout: 600,
            cancellationToken);

    public bool EhFalhaTransitoria(Exception erro) => FalhaTransitoria.Eh(erro);

    private async Task<IReadOnlyList<DetalheLancamentoDre>> ConsultarLancamentosAsync(
        IReadOnlyList<string> filiais, DateOnly dataInicio, DateOnly dataFim, RegimeDre regime,
        AnaliseDre analise, string bloco, IReadOnlyList<string> chaves, bool lote,
        IReadOnlyList<decimal>? fornecedores, IReadOnlyList<string>? sobra, bool emAberto,
        int commandTimeout, CancellationToken cancellationToken)
    {
        // ... corpo atual, sem mudança, até o string.Format ...
```

Mudanças dentro do corpo:

1. O primeiro argumento do `string.Format` (a escolha entre em aberto / competência / caixa)
   vai para uma variável `baseSql`, e logo depois:
   ```csharp
   // LOTE: a mesma consulta, com IN no recorte e a chave de cada lançamento.
   if (lote) baseSql = ConsultaDoLote.Lancamentos(baseSql, chaves.Count);
   ```
   e o `string.Format` passa a receber `baseSql`.
2. No lugar de `parametros.Add("chave", chave);`:
   ```csharp
   // LOTE: as chaves ocupam a posição de `:chave`, na ordem do IN.
   if (lote)
   {
       for (var i = 0; i < chaves.Count; i++) parametros.Add($"chave{i}", chaves[i]);
   }
   else
   {
       parametros.Add("chave", chaves[0]);
   }
   ```
3. `commandTimeout: 300` vira `commandTimeout: commandTimeout`. O `Final(sql)` continua.

Mantenha o `<summary>`/comentários do método original no método privado.

- [ ] **Step 4: Compilar e conferir**

Run: `dotnet build api-new-kpi -v q` ; depois dc105, dc92 e dc86 (comandos da Task 1).
Expected: build sem erro nem aviso novo; os três passam.

---

### Task 3: Lote no domínio da aplicação — DTOs, validação, plano, pacotes e batimento

**Files:**
- Modify: `api-new-kpi/Application/Features/DreGerencial/Dtos/DreGerencialDtos.cs` (DTOs do lote)
- Create: `api-new-kpi/Application/Features/DreGerencial/LoteDeDetalhe.cs`
- Modify: `api-new-kpi/Application/Features/DreGerencial/DreGerencialService.cs` (a regra da sobra passa a vir de `LoteDeDetalhe.SobraValida`)
- Test: dc105 partes 2 e 3

**Interfaces:**
- Produces:
  - `record LoteColunaDto(DateOnly DataInicio, DateOnly DataFim)`
  - `record LoteLinhaDto(int Id, string Tipo, string? Bloco, string? Chave, IReadOnlyList<string>? Sobra = null)`
  - `record LoteFiltroDto(IReadOnlyList<string> Filiais, string Regime, string Analise, IReadOnlyList<LoteColunaDto> Colunas, IReadOnlyList<LoteLinhaDto> Linhas, IReadOnlyList<decimal>? Fornecedores = null)`
  - `record UnidadeDoLote(int Coluna, IReadOnlyList<int> Linhas, string Tipo, string? Bloco, IReadOnlyList<string> Chaves, IReadOnlyList<string>? Sobra, bool Agrupada)`
  - `record PacoteDoLote(...)` com `Inicio(int, BaseDto?)`, `Aguarde`, `Parte(int, int, DetalhamentoDto)`, `Falha(IReadOnlyList<int>, int, string)`, `Fim`, `Erro(string)`
  - `static class LoteDeDetalhe { TimeSpan IntervaloDoBatimento; string? Validar(LoteFiltroDto); IReadOnlyList<UnidadeDoLote> Planejar(LoteFiltroDto); bool SobraValida(IReadOnlyList<string>); IAsyncEnumerable<bool> Esperar(Task, TimeSpan, CancellationToken) }`
  - `sealed class FalhaDoLote(string mensagem) : Exception`

- [ ] **Step 1: Escrever as partes 2 e 3 do dc105 — falha por não compilar**

Adicione ao `using` do dc105:

```csharp
using Epoca.Kpi.Api.Application.Features.DreGerencial;
using Epoca.Kpi.Api.Application.Features.DreGerencial.Dtos;
```

e troque `// [PARTE 2 — Task 3]` por:

```csharp
// ── 2. O plano: que consultas o lote faz ─────────────────────────────────────────────────
LoteLinhaDto L(int id, string tipo, string? bloco, string? chave, params string[] sobra) =>
    new(id, tipo, bloco, chave, sobra.Length > 0 ? sobra : null);

var colunas = new List<LoteColunaDto>
{
    new(new DateOnly(2025, 1, 1), new DateOnly(2025, 1, 31)),
    new(new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 31)),   // comparativo: não vizinha
};
var linhas = new List<LoteLinhaDto>
{
    L(0, "receita-por-cliente", null, null),
    L(1, "receita-por-cliente", null, null),                  // RECEITAS LIQUIDAS: a mesma tela
    L(2, "lancamentos", "operacional", "310"),
    L(3, "lancamentos", "operacional", "320"),
    L(4, "lancamentos", "pos-operacional", "4401"),
    L(5, "lancamentos", "operacional", "310"),                // a mesma chave duas vezes
    L(6, "lancamentos", "operacional", "9001", "1001", "1002"), // conta subida, com sobra
    L(7, "imposto-por-produto", "st", null),
};
var filtro = new LoteFiltroDto(["7"], "competencia", "grupo-contas", colunas, linhas);
var plano = LoteDeDetalhe.Planejar(filtro);

Afirmar(plano.Count == 10, $"5 unidades por coluna × 2 colunas (achou {plano.Count})");
var operacional = plano.First(u => u.Coluna == 0 && u.Agrupada && u.Bloco == "operacional");
Afirmar(operacional.Linhas.SequenceEqual([2, 3, 5]) && operacional.Chaves.SequenceEqual(["310", "320"]),
    "o bloco operacional é UMA consulta, com as chaves sem repetir e as três linhas");
Afirmar(plano.Count(u => u.Coluna == 0 && u.Agrupada) == 2, "um agrupamento por bloco");
var receita = plano.First(u => u.Coluna == 0 && u.Tipo == "receita-por-cliente");
Afirmar(receita.Linhas.SequenceEqual([0, 1]) && !receita.Agrupada,
    "RECEITA BRUTA e RECEITAS LIQUIDAS saem de UMA consulta");
var subida = plano.First(u => u.Coluna == 0 && u.Sobra is not null);
Afirmar(!subida.Agrupada && subida.Linhas.SequenceEqual([6]) && subida.Sobra!.SequenceEqual(["1001", "1002"]),
    "a conta com sobra vai sozinha, com a sobra dela");
Afirmar(plano.Where(u => u.Coluna == 1).Count() == 5 && plano.Take(5).All(u => u.Coluna == 0),
    "coluna por coluna, cada uma com o seu índice");

// ── 3. A validação ───────────────────────────────────────────────────────────────────────
Afirmar(LoteDeDetalhe.Validar(filtro) is null, "o lote do exemplo é válido");
Afirmar(LoteDeDetalhe.Validar(filtro with { Linhas = [] }) is not null, "sem linhas: recusa");
Afirmar(LoteDeDetalhe.Validar(filtro with { Linhas = Enumerable.Range(0, 301).Select(i => L(i, "lancamentos", "orfa", "1")).ToList() }) is not null,
    "mais de 300 linhas: recusa");
Afirmar(LoteDeDetalhe.Validar(filtro with { Colunas = Enumerable.Repeat(colunas[0], 25).ToList() }) is not null,
    "mais de 24 colunas: recusa");
Afirmar(LoteDeDetalhe.Validar(filtro with { Linhas = [L(0, "lancamentos", "orfa", "1"), L(0, "lancamentos", "orfa", "2")] }) is not null,
    "id repetido: recusa");
Afirmar(LoteDeDetalhe.Validar(filtro with { Linhas = [L(0, "lancamentos", "qualquer", "1")] }) is not null,
    "bloco fora da lista: recusa");
Afirmar(LoteDeDetalhe.Validar(filtro with { Linhas = [L(0, "lancamentos", "orfa", null)] }) is not null,
    "lançamentos sem chave: recusa");
Afirmar(LoteDeDetalhe.Validar(filtro with { Linhas = [L(0, "notas-por-motivo", null, "1")] }) is not null,
    "tipo que a exportação não usa: recusa");
Afirmar(LoteDeDetalhe.Validar(filtro with { Linhas = [L(0, "imposto-por-produto", "icms", null)] }) is not null,
    "imposto fora de st/pis/cofins: recusa");
Afirmar(LoteDeDetalhe.Validar(filtro with { Linhas = [L(0, "lancamentos", "operacional", "1", "1; drop")] }) is not null,
    "sobra fora do formato: recusa");
Afirmar(LoteDeDetalhe.Validar(filtro with { Colunas = [new(new DateOnly(2025, 2, 1), new DateOnly(2025, 1, 1))] }) is not null,
    "coluna com fim antes do início: recusa");
Afirmar(LoteDeDetalhe.Validar(filtro with { Regime = "nenhum" }) is not null, "regime desconhecido: recusa");
Afirmar(LoteDeDetalhe.Validar(filtro with { Filiais = [] }) is not null, "sem filial: recusa");
```

e troque `// [PARTE 3 — Task 3]` por:

```csharp
// ── 4. O batimento: enquanto a consulta roda, um sinal a cada intervalo ───────────────────
async Task<int> Batidas(Task tarefa, int intervaloMs)
{
    var batidas = 0;
    await foreach (var _ in LoteDeDetalhe.Esperar(tarefa, TimeSpan.FromMilliseconds(intervaloMs), CancellationToken.None))
        batidas++;
    return batidas;
}

Afirmar(await Batidas(Task.Delay(350), 100) is >= 2 and <= 4, "consulta de 350 ms com batimento de 100 ms: 3 batidas (±1)");
Afirmar(await Batidas(Task.CompletedTask, 100) == 0, "consulta já pronta: nenhuma batida");
Afirmar(await Batidas(Task.FromException(new InvalidOperationException()), 100) == 0,
    "consulta que falhou: o batimento não lança — quem lê o erro é o serviço");
Afirmar(LoteDeDetalhe.IntervaloDoBatimento == TimeSpan.FromSeconds(15), "o batimento de produção é 15 s");
```

- [ ] **Step 2: Rodar e ver falhar**

Run: o comando do dc105.
Expected: erro de compilação — `LoteFiltroDto`, `LoteDeDetalhe` não existem.

- [ ] **Step 3: DTOs**

No fim de `Dtos/DreGerencialDtos.cs`:

```csharp
/// <summary>Uma coluna do lote: o intervalo exato da coluna na tela (mês, ano ou recorte do comparativo).</summary>
public record LoteColunaDto(DateOnly DataInicio, DateOnly DataFim);

/// <summary>
/// Uma linha do lote: o destino que a apuração pôs na linha (<see cref="DetalheDisponivelDto"/>),
/// devolvido como veio, e um <c>Id</c> que o front escolhe para reconhecer as partes.
/// </summary>
public record LoteLinhaDto(int Id, string Tipo, string? Bloco, string? Chave, IReadOnlyList<string>? Sobra = null);

/// <summary>
/// O pedido da exportação em lote (06/11/2026): o recorte da apuração, as colunas e as linhas.
/// Ver <c>LoteDeDetalhe</c>.
/// </summary>
public record LoteFiltroDto(
    IReadOnlyList<string> Filiais,
    string Regime,
    string Analise,
    IReadOnlyList<LoteColunaDto> Colunas,
    IReadOnlyList<LoteLinhaDto> Linhas,
    IReadOnlyList<decimal>? Fornecedores = null);
```

- [ ] **Step 4: `LoteDeDetalhe.cs`**

```csharp
using System.Runtime.CompilerServices;
using System.Text.Json.Serialization;
using Epoca.Kpi.Api.Application.Common.Bases;
using Epoca.Kpi.Api.Application.Features.DreGerencial.Dtos;

namespace Epoca.Kpi.Api.Application.Features.DreGerencial;

/// <summary>
/// A EXPORTAÇÃO EM LOTE do detalhamento (06/11/2026, pedido do Gabriel): muitas linhas, muitas
/// colunas, poucas consultas. Ver docs/superpowers/specs/2026-11-06-exportacao-em-lote-design.md.
///
/// <para><b>A unidade é bloco × coluna.</b> As linhas de lançamentos sem sobra de um mesmo
/// bloco saem numa consulta só, com <c>IN</c>, no intervalo exato de uma coluna — o tamanho de
/// um detalhamento de um mês, que já roda hoje. Receita, devolução, impostos e contas com
/// sobra vão pelo detalhamento de uma célula, uma linha × coluna por vez, e linhas com o
/// mesmo destino (RECEITA BRUTA e RECEITAS LIQUIDAS) dividem a consulta.</para>
///
/// <para>O que mora aqui é o que não depende do banco — e por isso o dc105 testa tudo.</para>
/// </summary>
public static class LoteDeDetalhe
{
    public const int MaximoDeLinhas = 300;
    public const int MaximoDeColunas = 24;

    /// <summary>Quanto tempo sem dado até mandar um "aguarde": nenhuma camada vê a conexão parada.</summary>
    public static readonly TimeSpan IntervaloDoBatimento = TimeSpan.FromSeconds(15);

    private static readonly HashSet<string> Tipos =
        ["receita-por-cliente", "devolucao-por-motivo", "imposto-por-produto", "lancamentos"];

    private static readonly HashSet<string> Blocos = ["operacional", "pos-operacional", "orfa"];
    private static readonly HashSet<string> Impostos = ["st", "pis", "cofins"];

    /// <summary>
    /// A sobra de uma conta subida: 1 a 200 códigos, só dígitos e ponto. Entra como bind, mas
    /// uma lista sem limite ainda seria uma consulta sem limite. O detalhamento de uma célula
    /// usa a mesma regra.
    /// </summary>
    public static bool SobraValida(IReadOnlyList<string> sobra) =>
        sobra.Count is > 0 and <= 200
        && sobra.All(c => c.Length is > 0 and <= 20 && c.All(ch => char.IsAsciiDigit(ch) || ch == '.'));

    /// <summary>O motivo da recusa, ou nulo. Tudo antes de abrir o fluxo: erro aqui é um 400 comum.</summary>
    public static string? Validar(LoteFiltroDto lote)
    {
        if (lote.Filiais is not { Count: > 0 }) return "Selecione ao menos uma filial.";
        if (RegimeDre.Resolver(lote.Regime) is null) return $"Regime '{lote.Regime}' não existe.";
        if (AnaliseDre.Resolver(lote.Analise) is not { Implementada: true })
            return $"Análise '{lote.Analise}' não existe ou não está implementada.";

        if (lote.Colunas is not { Count: > 0 and <= MaximoDeColunas })
            return $"O lote precisa de 1 a {MaximoDeColunas} colunas.";
        foreach (var c in lote.Colunas)
        {
            if (c.DataFim < c.DataInicio) return "Uma coluna tem a data final antes da inicial.";
            if (c.DataInicio.AddMonths(12) < c.DataFim) return "Uma coluna passa de 12 meses.";
        }

        if (lote.Linhas is not { Count: > 0 and <= MaximoDeLinhas })
            return $"O lote precisa de 1 a {MaximoDeLinhas} linhas.";
        if (lote.Linhas.Select(l => l.Id).Distinct().Count() != lote.Linhas.Count)
            return "Duas linhas do lote têm o mesmo id.";

        foreach (var l in lote.Linhas)
        {
            if (!Tipos.Contains(l.Tipo)) return $"A linha {l.Id} tem um tipo de detalhamento que a exportação não usa.";
            if (l.Tipo == "imposto-por-produto" && !Impostos.Contains(l.Bloco ?? ""))
                return $"A linha {l.Id} pede um imposto que não existe.";
            if (l.Tipo != "lancamentos") continue;
            if (!Blocos.Contains(l.Bloco ?? "")) return $"A linha {l.Id} tem um bloco que não existe.";
            if (string.IsNullOrWhiteSpace(l.Chave) || l.Chave.Length > 40)
                return $"A linha {l.Id} não tem a chave do recorte.";
            if (l.Sobra is not null && !SobraValida(l.Sobra))
                return $"A sobra da linha {l.Id} tem de ser de 1 a 200 códigos, só com dígitos e ponto.";
        }

        return null;
    }

    /// <summary>As consultas do lote, na ordem em que rodam: coluna por coluna, na ordem das linhas.</summary>
    public static IReadOnlyList<UnidadeDoLote> Planejar(LoteFiltroDto lote)
    {
        var unidades = new List<UnidadeDoLote>();

        for (var coluna = 0; coluna < lote.Colunas.Count; coluna++)
        {
            var porBloco = new Dictionary<string, (List<int> Ids, List<string> Chaves)>();
            var porDestino = new Dictionary<string, (LoteLinhaDto Modelo, List<int> Ids)>();
            var ordem = new List<(bool Agrupada, string Chave)>();

            foreach (var linha in lote.Linhas)
            {
                if (linha.Tipo == "lancamentos" && linha.Sobra is not { Count: > 0 })
                {
                    if (!porBloco.TryGetValue(linha.Bloco!, out var grupo))
                    {
                        grupo = ([], []);
                        porBloco[linha.Bloco!] = grupo;
                        ordem.Add((true, linha.Bloco!));
                    }

                    grupo.Ids.Add(linha.Id);
                    if (!grupo.Chaves.Contains(linha.Chave!)) grupo.Chaves.Add(linha.Chave!);
                    continue;
                }

                var destino = $"{linha.Tipo}|{linha.Bloco}|{linha.Chave}|{string.Join(",", linha.Sobra ?? [])}";
                if (!porDestino.TryGetValue(destino, out var mesmo))
                {
                    mesmo = (linha, []);
                    porDestino[destino] = mesmo;
                    ordem.Add((false, destino));
                }

                mesmo.Ids.Add(linha.Id);
            }

            foreach (var (agrupada, chave) in ordem)
            {
                if (agrupada)
                {
                    var (ids, chaves) = porBloco[chave];
                    unidades.Add(new UnidadeDoLote(coluna, ids, "lancamentos", chave, chaves, null, Agrupada: true));
                }
                else
                {
                    var (modelo, ids) = porDestino[chave];
                    unidades.Add(new UnidadeDoLote(coluna, ids, modelo.Tipo, modelo.Bloco,
                        modelo.Chave is { } c ? [c] : [], modelo.Sobra, Agrupada: false));
                }
            }
        }

        return unidades;
    }

    /// <summary>
    /// Um sinal a cada <paramref name="intervalo"/> enquanto <paramref name="tarefa"/> não
    /// termina. Não observa o resultado: uma tarefa que falhou só encerra a espera, e quem
    /// lê o erro é o serviço.
    /// </summary>
    public static async IAsyncEnumerable<bool> Esperar(
        Task tarefa, TimeSpan intervalo, [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        while (!tarefa.IsCompleted)
        {
            var relogio = Task.Delay(intervalo, cancellationToken);
            var primeira = await Task.WhenAny(tarefa, relogio);
            cancellationToken.ThrowIfCancellationRequested();
            if (primeira == relogio) yield return true;
        }
    }
}

/// <summary>Uma consulta do lote: uma coluna, as linhas que ela atende e o destino.</summary>
public sealed record UnidadeDoLote(
    int Coluna,
    IReadOnlyList<int> Linhas,
    string Tipo,
    string? Bloco,
    IReadOnlyList<string> Chaves,
    IReadOnlyList<string>? Sobra,
    bool Agrupada);

/// <summary>Uma falha de unidade que não é do banco (o detalhamento recusou o pedido): não se tenta de novo.</summary>
public sealed class FalhaDoLote(string mensagem) : Exception(mensagem);

/// <summary>
/// Um pacote do fluxo NDJSON. Campo nulo não é escrito — o batimento sai como
/// <c>{"t":"aguarde"}</c>. O <c>Dados</c> é o <see cref="DetalhamentoDto"/> de sempre, com os
/// nulos dele: a regra só vale para os campos do pacote.
/// </summary>
public sealed record PacoteDoLote(
    string T,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Partes = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] BaseDto? Base = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Linha = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] int? Coluna = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] DetalhamentoDto? Dados = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<int>? Linhas = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Mensagem = null)
{
    public static PacoteDoLote Inicio(int partes, BaseDto? base_) => new("inicio", Partes: partes, Base: base_);
    public static readonly PacoteDoLote Aguarde = new("aguarde");
    public static PacoteDoLote Parte(int linha, int coluna, DetalhamentoDto dados) =>
        new("parte", Linha: linha, Coluna: coluna, Dados: dados);
    public static PacoteDoLote Falha(IReadOnlyList<int> linhas, int coluna, string mensagem) =>
        new("falha", Coluna: coluna, Linhas: linhas, Mensagem: mensagem);
    public static readonly PacoteDoLote Fim = new("fim");
    public static PacoteDoLote Erro(string mensagem) => new("erro", Mensagem: mensagem);
}
```

> Confira o namespace de `BaseDto` (`grep -rn "record BaseDto" api-new-kpi`) e ajuste o `using`.

- [ ] **Step 5: A sobra do detalhamento usa a mesma regra**

Em `DreGerencialService.ObterDetalheAsync`, caso `lancamentos`, troque a condição:

```csharp
                if (filtro.Sobra is { } sobra
                    && (sobra.Count is 0 or > 200
                        || sobra.Any(c => c.Length is 0 or > 20 || !c.All(ch => char.IsAsciiDigit(ch) || ch == '.'))))
```

por

```csharp
                if (filtro.Sobra is { } sobra && !LoteDeDetalhe.SobraValida(sobra))
```

(o comentário acima dela fica; a mensagem de erro também).

- [ ] **Step 6: Rodar e ver passar**

Run: o comando do dc105.
Expected: `✓ dc105 passou — 31 conferências` (8 + 6 + 13 + 4).

---

### Task 4: Serviço e endpoint em fluxo

**Files:**
- Modify: `api-new-kpi/Application/Features/DreGerencial/DreGerencialService.cs`
- Modify: `api-new-kpi/Controllers/DreGerencialController.cs`
- Modify: `api-new-kpi/Middleware/NoStoreMiddleware.cs`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `POST /api/dre-gerencial/detalhe/lote` (400 com `ApiResponse` em pedido inválido;
  200 `application/x-ndjson` com os pacotes de `PacoteDoLote`);
  `DreGerencialService.ValidarLote(LoteFiltroDto) : string?`,
  `DreGerencialService.ExecutarLoteAsync(LoteFiltroDto, CancellationToken) : IAsyncEnumerable<PacoteDoLote>`.

- [ ] **Step 1: Extrair a montagem do detalhamento de lançamentos**

Em `DreGerencialService`, extraia do fim do caso `lancamentos` dois métodos estáticos e faça o
caso usá-los (o comportamento do `/detalhe` não muda):

```csharp
    /// <summary>A participação do fornecedor no período: receita líquida filtrada sobre a da filial.</summary>
    private static decimal Participacao(IReadOnlyList<FaturamentoDre> faturamento)
    {
        var total = faturamento.Sum(f => f.ReceitaLiquidaTotal);
        return total == 0m ? 1m : faturamento.Sum(f => f.ReceitaLiquida) / total;
    }

    /// <summary>O detalhamento de lançamentos, como o duplo clique e a exportação em lote o entregam.</summary>
    private static DetalhamentoDto DetalhamentoDeLancamentos(
        string tipo, DateOnly inicio, DateOnly fim,
        IEnumerable<(DetalheLancamentoDre Lancamento, bool EmAberto)> linhas,
        long duracaoMs, IReadOnlyList<decimal> eco, decimal participacao,
        bool provisionado, bool ambos) =>
        new(tipo, inicio, fim, null, null,
            linhas.Select(par => { var l = par.Lancamento; return new DetalheLancamentoDto(
                /* os mesmos argumentos de hoje, na mesma ordem, terminando em par.EmAberto */); }).ToList(),
            null, duracaoMs, Fornecedores: eco, Participacao: participacao,
            Provisionado: provisionado, RealizadoEProvisionado: ambos);
```

Copie a lista de argumentos do `new DetalheLancamentoDto(...)` atual sem mudar nada. O caso
`lancamentos` passa a fazer `participacao = Participacao(faturamento);` e
`return Result<DetalhamentoDto>.Ok(DetalhamentoDeLancamentos(filtro.Tipo, filtro.DataInicio, filtro.DataFim, linhas, cronometro.ElapsedMilliseconds, eco, participacao, filtro.Provisionado && !ambos, ambos));`

- [ ] **Step 2: Logger no serviço**

Construtor passa a receber `ILogger<DreGerencialService> log` (guardado em `_log`). O DI já
resolve; confirme com `grep -rn "new DreGerencialService" .` que ninguém constrói à mão
(esperado: nenhum resultado).

- [ ] **Step 3: O lote no serviço**

```csharp
    /// <summary>O motivo da recusa do lote, ou nulo. Ver <see cref="LoteDeDetalhe.Validar"/>.</summary>
    public string? ValidarLote(LoteFiltroDto lote) => LoteDeDetalhe.Validar(lote);

    /// <summary>
    /// A exportação em lote (06/11/2026): as unidades de <see cref="LoteDeDetalhe.Planejar"/>,
    /// UMA DE CADA VEZ — não disputar o Oracle com a operação —, cada parte entregue assim que
    /// a unidade termina.
    ///
    /// <para><b>À prova de timeout.</b> Enquanto uma unidade roda, um <c>aguarde</c> a cada
    /// 15 s mantém a conexão viva em toda camada. Falha transitória (tempo esgotado, conexão
    /// caída) ganha UMA nova tentativa; se falhar de novo, ou se for outro erro, a unidade vira
    /// um pacote <c>falha</c> e o lote SEGUE — o front monta o zip parcial com o LEIA.</para>
    ///
    /// <para>Pedido já validado por <see cref="ValidarLote"/>.</para>
    /// </summary>
    public async IAsyncEnumerable<PacoteDoLote> ExecutarLoteAsync(
        LoteFiltroDto lote,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var unidades = LoteDeDetalhe.Planejar(lote);
        var linhas = lote.Linhas.ToDictionary(l => l.Id);
        var participacoes = new Dictionary<int, decimal>();

        yield return PacoteDoLote.Inicio(lote.Linhas.Count * lote.Colunas.Count, BaseDto.De(_baseAtual.Base));

        foreach (var unidade in unidades)
        {
            IReadOnlyList<(int Linha, DetalhamentoDto Dados)>? partes = null;
            string? falha = null;

            for (var tentativa = 1; partes is null && falha is null; tentativa++)
            {
                var tarefa = RodarUnidadeAsync(lote, unidade, linhas, participacoes, cancellationToken);

                await foreach (var _ in LoteDeDetalhe.Esperar(tarefa, LoteDeDetalhe.IntervaloDoBatimento, cancellationToken))
                {
                    yield return PacoteDoLote.Aguarde;
                }

                try
                {
                    partes = await tarefa;
                }
                catch (FalhaDoLote e)
                {
                    falha = e.Message;
                }
                catch (Exception e) when (!cancellationToken.IsCancellationRequested && _repositorio.EhFalhaTransitoria(e))
                {
                    _log.LogWarning(e, "Lote do detalhamento: {Tipo} {Bloco}, coluna {Coluna}, tentativa {Tentativa}",
                        unidade.Tipo, unidade.Bloco, unidade.Coluna, tentativa);
                    if (tentativa >= 2) falha = "O banco não respondeu a tempo, nem na segunda tentativa.";
                }
                catch (Exception e) when (!cancellationToken.IsCancellationRequested)
                {
                    _log.LogError(e, "Lote do detalhamento: {Tipo} {Bloco}, coluna {Coluna}",
                        unidade.Tipo, unidade.Bloco, unidade.Coluna);
                    falha = "Erro inesperado ao consultar o banco.";
                }
            }

            if (falha is not null)
            {
                yield return PacoteDoLote.Falha(unidade.Linhas, unidade.Coluna, falha);
                continue;
            }

            foreach (var (linha, dados) in partes!)
            {
                yield return PacoteDoLote.Parte(linha, unidade.Coluna, dados);
            }
        }

        yield return PacoteDoLote.Fim;
    }

    private async Task<IReadOnlyList<(int Linha, DetalhamentoDto Dados)>> RodarUnidadeAsync(
        LoteFiltroDto lote, UnidadeDoLote unidade, IReadOnlyDictionary<int, LoteLinhaDto> linhas,
        Dictionary<int, decimal> participacoes, CancellationToken cancellationToken)
    {
        var coluna = lote.Colunas[unidade.Coluna];
        var fornecedores = lote.Fornecedores is { Count: > 0 } f ? f : null;

        // Receita, devolução, impostos e contas com sobra: o detalhamento de uma célula, sem
        // mudança nenhuma — e o resultado serve a todas as linhas com o mesmo destino.
        if (!unidade.Agrupada)
        {
            var modelo = linhas[unidade.Linhas[0]];
            var resultado = await ObterDetalheAsync(new DetalheFiltroDto(
                lote.Filiais, coluna.DataInicio, coluna.DataFim, lote.Regime, lote.Analise,
                modelo.Tipo, modelo.Bloco, modelo.Chave, fornecedores, modelo.Sobra),
                cancellationToken);

            if (resultado.Falha) throw new FalhaDoLote(resultado.Erro!);
            return unidade.Linhas.Select(id => (id, resultado.Valor!)).ToList();
        }

        var cronometro = System.Diagnostics.Stopwatch.StartNew();
        var lancamentos = await _repositorio.ObterDetalheLancamentosDoLoteAsync(
            lote.Filiais, coluna.DataInicio, coluna.DataFim,
            RegimeDre.Resolver(lote.Regime)!, AnaliseDre.Resolver(lote.Analise)!,
            unidade.Bloco!, unidade.Chaves, fornecedores, cancellationToken);

        // A participação é da COLUNA, e as unidades da mesma coluna a dividem.
        var participacao = 1m;
        if (fornecedores is not null && !participacoes.TryGetValue(unidade.Coluna, out participacao))
        {
            participacao = Participacao(await _repositorio.ObterFaturamentoPorMesAsync(
                lote.Filiais, coluna.DataInicio, coluna.DataFim, fornecedores, cancellationToken));
            participacoes[unidade.Coluna] = participacao;
        }

        cronometro.Stop();

        var foraDoLote = lancamentos.Count(l => l.ChaveLote is null || !unidade.Chaves.Contains(l.ChaveLote));
        if (foraDoLote > 0)
        {
            // Não deveria acontecer: é a chave que o Oracle devolveu diferente da que entrou.
            _log.LogWarning("Lote do detalhamento: {Fora} lançamentos com chave fora do lote ({Bloco}, coluna {Coluna})",
                foraDoLote, unidade.Bloco, unidade.Coluna);
        }

        var porChave = lancamentos.ToLookup(l => l.ChaveLote ?? string.Empty);
        return unidade.Linhas
            .Select(id => (id, DetalhamentoDeLancamentos(
                "lancamentos", coluna.DataInicio, coluna.DataFim,
                porChave[linhas[id].Chave!].Select(l => (l, false)),
                cronometro.ElapsedMilliseconds, fornecedores ?? [], participacao,
                provisionado: false, ambos: false)))
            .ToList();
    }
```

Acrescente `using System.Runtime.CompilerServices;` e `using Microsoft.Extensions.Logging;` se
faltarem.

- [ ] **Step 4: O endpoint**

No `DreGerencialController`: construtor ganha `ILogger<DreGerencialController> log` e
`IOptions<Microsoft.AspNetCore.Mvc.JsonOptions> json` (guarde `json.Value.JsonSerializerOptions`
em `_json`). Ação:

```csharp
    private static readonly byte[] QuebraDeLinha = "\n"u8.ToArray();

    /// <summary>
    /// Exportação do detalhamento EM LOTE (06/11/2026) — muitas linhas × muitas colunas, em
    /// fluxo NDJSON: <c>inicio</c>, <c>aguarde</c> a cada 15 s, uma <c>parte</c> por linha ×
    /// coluna, <c>falha</c> do que não deu, <c>fim</c>. Ver <c>LoteDeDetalhe</c>.
    ///
    /// <para><b>Cada pacote sai na hora</b> (<c>FlushAsync</c>), e o <c>no-transform</c> impede o
    /// Next de comprimir — compressão em blocos seguraria o batimento, e a conexão pareceria
    /// parada justamente quando está trabalhando.</para>
    /// </summary>
    [HttpPost("detalhe/lote")]
    public async Task ObterDetalheEmLote([FromBody] LoteFiltroDto lote, CancellationToken cancellationToken)
    {
        var erro = _servico.ValidarLote(lote);
        if (erro is not null)
        {
            Response.StatusCode = StatusCodes.Status400BadRequest;
            await Response.WriteAsJsonAsync(ApiResponse<object>.Falha(erro), _json, cancellationToken);
            return;
        }

        Response.ContentType = "application/x-ndjson; charset=utf-8";
        Response.Headers.CacheControl = "no-store, no-transform";
        HttpContext.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();

        async Task Escrever(PacoteDoLote pacote)
        {
            await JsonSerializer.SerializeAsync(Response.Body, pacote, _json, cancellationToken);
            await Response.Body.WriteAsync(QuebraDeLinha, cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);
        }

        try
        {
            await foreach (var pacote in _servico.ExecutarLoteAsync(lote, cancellationToken))
            {
                await Escrever(pacote);
            }
        }
        catch (Exception e) when (!cancellationToken.IsCancellationRequested)
        {
            // Depois do primeiro byte não há mais status a mudar: o erro vai como pacote, e o
            // front monta o zip parcial com o que já chegou.
            _log.LogError(e, "Lote do detalhamento interrompido");
            await Escrever(PacoteDoLote.Erro("A exportação parou por um erro no servidor."));
        }
    }
```

`using`: `System.Text.Json`, `Microsoft.AspNetCore.Http.Features`, `Microsoft.Extensions.Options`.

- [ ] **Step 5: `NoStoreMiddleware` preserva o `no-transform`**

O `OnStarting` dele roda por último e sobrescreveria o cabeçalho do lote. Troque o corpo do
callback por:

```csharp
            var headers = context.Response.Headers;
            // A resposta em fluxo (lote do detalhamento) pede `no-transform` para ninguém no
            // caminho comprimir em blocos e segurar o batimento. O resto da regra não muda.
            var semTransformar = headers.CacheControl.ToString().Contains("no-transform", StringComparison.OrdinalIgnoreCase);
            headers.CacheControl = "no-store, no-cache, must-revalidate, max-age=0" + (semTransformar ? ", no-transform" : "");
            headers.Pragma = "no-cache";
            headers.Expires = "0";
```

- [ ] **Step 6: Build e recusa sem banco**

Run: `dotnet build api-new-kpi -v q`
Expected: sem erro.

Se a API do Gabriel estiver rodando em `:5207` (não suba outra), confira a recusa — ela não
toca no banco:

Run: `curl -s -X POST http://localhost:5207/api/dre-gerencial/detalhe/lote -H "Content-Type: application/json" -d "{}" -o NUL -w "%{http_code}"`
Expected: `401` (sem token) — prova que a rota existe e está atrás do `[Authorize]`. Se a API
não estiver rodando, pule e registre no ledger.

- [ ] **Step 7: Regressão**

Run: dc105, dc101, dc92, dc86.
Expected: todos passam.

---

### Task 5: Front — leitor do fluxo, pedido e LEIA

**Files:**
- Create: `client-new-kpi/lib/loteDeDetalhe.ts`
- Test: `docs/rotinas/9815-dre-gerencial/validacao/dc106_fluxo_do_lote.mjs`

**Interfaces:**
- Produces:
  - `type LinhaDoLote = { id: number; tipo: TipoDetalhe; bloco: string | null; chave: string | null; sobra?: string[] | null }`
  - `interface PedidoDoLote { filiais: string[]; regime: string; analise: string; fornecedores?: number[]; colunas: { dataInicio: string; dataFim: string }[]; linhas: LinhaDoLote[] }`
  - `type PacoteDoLote` (união `inicio | aguarde | parte | falha | fim | erro`)
  - `SILENCIO_MAXIMO_MS = 90_000`, `class SilencioDoServidor extends Error`
  - `lerNdjson(corpo: ReadableStream<Uint8Array>, silencioMaximoMs?): AsyncGenerator<PacoteDoLote>`
  - `pedirLote(pedido: PedidoDoLote, signal: AbortSignal): Promise<ReadableStream<Uint8Array>>`
  - `NOME_DO_LEIA = "LEIA - arquivos que faltaram.txt"`, `textoDoLeia(faltas: readonly { caminho: string; motivo: string }[]): string`

- [ ] **Step 1: Escrever o dc106 — falha por não achar o módulo**

```js
/**
 * dc106 — o fluxo do lote no navegador (06/11/2026): ler o NDJSON, vigiar o silêncio e
 * escrever o LEIA do zip parcial.
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc106_fluxo_do_lote.mjs
 *
 * Não toca na API nem no banco: os fluxos são montados à mão.
 */
import assert from "node:assert/strict";
import {
  lerNdjson,
  textoDoLeia,
  NOME_DO_LEIA,
  SilencioDoServidor,
} from "../../../../client-new-kpi/lib/loteDeDetalhe.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, oque);
};

const cod = new TextEncoder();
/** Um fluxo que entrega os pedaços dados, com `pausaMs` entre eles, e fecha (ou não). */
function fluxo(pedacos, { pausaMs = 0, fechar = true } = {}) {
  return new ReadableStream({
    async start(c) {
      for (const p of pedacos) {
        if (pausaMs) await new Promise((r) => setTimeout(r, pausaMs));
        c.enqueue(typeof p === "string" ? cod.encode(p) : p);
      }
      if (fechar) c.close();
    },
  });
}
async function ler(corpo, silencio) {
  const lidos = [];
  for await (const p of lerNdjson(corpo, silencio)) lidos.push(p);
  return lidos;
}

// ── Pacotes inteiros, partidos e juntos ─────────────────────────────────────────────────
eq(await ler(fluxo(['{"t":"inicio","partes":2}\n{"t":"fim"}\n'])), [{ t: "inicio", partes: 2 }, { t: "fim" }],
  "dois pacotes num pedaço");
eq(await ler(fluxo(['{"t":"par', 'te","linha":1,"col', 'una":0}\n'])), [{ t: "parte", linha: 1, coluna: 0 }],
  "um pacote partido em três pedaços");
eq(await ler(fluxo(['{"t":"fim"}'])), [{ t: "fim" }], "último pacote sem quebra de linha");
eq(await ler(fluxo(["\n\n", '{"t":"aguarde"}\r\n'])), [{ t: "aguarde" }], "linhas vazias e CRLF são ignorados");

// Acento partido no meio dos bytes: o decodificador tem de esperar o resto.
const acento = cod.encode('{"t":"erro","mensagem":"não"}\n');
const corte = acento.indexOf(0xc3) + 1;
eq(await ler(fluxo([acento.slice(0, corte), acento.slice(corte)])), [{ t: "erro", mensagem: "não" }],
  "um caractere de dois bytes partido entre pedaços");

// Um pacote grande (~8 MB) em pedaços de 64 KB, sem custo quadrático.
const grande = JSON.stringify({ t: "parte", linha: 0, coluna: 0, dados: { lancamentos: "x".repeat(8_000_000) } }) + "\n";
const bytes = cod.encode(grande);
const pedacos = [];
for (let i = 0; i < bytes.length; i += 65536) pedacos.push(bytes.slice(i, i + 65536));
const inicio = performance.now();
const [unico] = await ler(fluxo(pedacos));
const ms = performance.now() - inicio;
eq(unico.dados.lancamentos.length, 8_000_000, "pacote de 8 MB inteiro");
n++;
assert.ok(ms < 3000, `8 MB em 64 KB lidos em ${ms.toFixed(0)} ms (limite 3 s)`);

// ── O vigia ─────────────────────────────────────────────────────────────────────────────
let erro = null;
try {
  await ler(fluxo(['{"t":"inicio","partes":1}\n'], { fechar: false }), 200);
} catch (e) {
  erro = e;
}
n++;
assert.ok(erro instanceof SilencioDoServidor, "fluxo parado além do limite: SilencioDoServidor");

eq(await ler(fluxo(['{"t":"aguarde"}\n', '{"t":"fim"}\n'], { pausaMs: 120 }), 200).then((l) => l.length), 2,
  "batimento dentro do limite mantém o fluxo vivo");

// ── O LEIA ──────────────────────────────────────────────────────────────────────────────
eq(NOME_DO_LEIA, "LEIA - arquivos que faltaram.txt", "o nome do aviso");
const leia = textoDoLeia([
  { caminho: "03 COMBUSTIVEL/Detalhe COMBUSTIVEL · Março-2025.xlsx", motivo: "O banco não respondeu a tempo, nem na segunda tentativa." },
  { caminho: "05 VENDAS/Detalhe VENDAS · Março-2025.xlsx", motivo: "A conexão com o servidor caiu antes do fim." },
]);
n++;
assert.ok(leia.includes("03 COMBUSTIVEL/Detalhe COMBUSTIVEL · Março-2025.xlsx") && leia.includes("nem na segunda tentativa"),
  "o LEIA lista o caminho e o motivo de cada arquivo");
n++;
assert.ok(!/[^\r]\n/.test(leia), "o LEIA usa CRLF — o Bloco de Notas antigo mostraria tudo numa linha");

console.log(`✓ dc106 passou — ${n} conferências`);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc106_fluxo_do_lote.mjs`
Expected: erro `Cannot find module .../lib/loteDeDetalhe.ts`.

- [ ] **Step 3: Implementar `lib/loteDeDetalhe.ts`**

```ts
import { ApiError } from "@/services/apiClient";
import type { Detalhamento, TipoDetalhe } from "@/types/dre-gerencial";

/**
 * A EXPORTAÇÃO EM LOTE no navegador (06/11/2026, pedido do Gabriel): o pedido, a leitura do
 * fluxo NDJSON e o aviso do zip parcial. Quem monta os Excels e o zip é
 * `exportarDetalhesDaLinha.ts`; a API está em `LoteDeDetalhe.cs`.
 */

export interface LinhaDoLote {
  id: number;
  tipo: TipoDetalhe;
  bloco: string | null;
  chave: string | null;
  sobra?: string[] | null;
}

export interface PedidoDoLote {
  filiais: string[];
  regime: string;
  analise: string;
  fornecedores?: number[];
  colunas: { dataInicio: string; dataFim: string }[];
  linhas: LinhaDoLote[];
}

export type PacoteDoLote =
  | { t: "inicio"; partes: number; base?: { id: string; rotulo: string } | null }
  | { t: "aguarde" }
  | { t: "parte"; linha: number; coluna: number; dados: Detalhamento }
  | { t: "falha"; linhas: number[]; coluna: number; mensagem: string }
  | { t: "fim" }
  | { t: "erro"; mensagem: string };

/**
 * Quanto tempo sem NENHUM pacote — nem o batimento de 15 s — até dar a conexão por perdida.
 * Seis batimentos: folga para uma rede lenta, e ninguém fica olhando um "consultando" eterno.
 */
export const SILENCIO_MAXIMO_MS = 90_000;

export class SilencioDoServidor extends Error {
  constructor() {
    super("O servidor ficou mais de 90 segundos sem responder; a conexão foi dada como perdida.");
    this.name = "SilencioDoServidor";
  }
}

/**
 * Os pacotes do fluxo, um a um. Junta pacote partido entre pedaços (inclusive no meio de um
 * caractere acentuado) e procura a quebra só no trecho novo — um pacote de 8 MB chega em
 * centenas de pedaços. Ao sair, por fim, erro ou vigia, solta a conexão: cancelar o corpo é o
 * que faz o BFF e a API desistirem da consulta.
 */
export async function* lerNdjson(
  corpo: ReadableStream<Uint8Array>,
  silencioMaximoMs = SILENCIO_MAXIMO_MS,
): AsyncGenerator<PacoteDoLote> {
  const leitor = corpo.getReader();
  const texto = new TextDecoder();
  let resto = "";

  const emitir = function* (linha: string) {
    const limpa = linha.trim();
    if (limpa) yield JSON.parse(limpa) as PacoteDoLote;
  };

  try {
    for (;;) {
      let relogio: ReturnType<typeof setTimeout> | undefined;
      const silencio = new Promise<never>((_, rejeitar) => {
        relogio = setTimeout(() => rejeitar(new SilencioDoServidor()), silencioMaximoMs);
      });

      let lido: ReadableStreamReadResult<Uint8Array>;
      try {
        lido = await Promise.race([leitor.read(), silencio]);
      } finally {
        clearTimeout(relogio);
      }
      if (lido.done) break;

      const procurarDe = resto.length;
      resto += texto.decode(lido.value, { stream: true });
      let quebra = resto.indexOf("\n", procurarDe);
      while (quebra >= 0) {
        yield* emitir(resto.slice(0, quebra));
        resto = resto.slice(quebra + 1);
        quebra = resto.indexOf("\n");
      }
    }

    resto += texto.decode();
    yield* emitir(resto);
  } finally {
    leitor.cancel().catch(() => {});
  }
}

/**
 * Abre o fluxo do lote pelo BFF. Recusa antes de começar (400, 401, 409) vira `ApiError` com
 * a mensagem da API; depois de aberto, o que chega é pacote.
 */
export async function pedirLote(
  pedido: PedidoDoLote,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  let resposta: Response;
  try {
    resposta = await fetch("/api/dre-gerencial/detalhe/lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pedido),
      cache: "no-store",
      signal,
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new ApiError("Não foi possível conectar à API.", 0);
  }

  if (!resposta.ok || !resposta.body) {
    let mensagem = `Erro ${resposta.status} ao exportar.`;
    try {
      const envelope = (await resposta.json()) as { mensagem?: string } | null;
      if (envelope?.mensagem) mensagem = envelope.mensagem;
    } catch {
      // Sem corpo JSON: fica a mensagem com o status.
    }
    if (resposta.status === 401) mensagem = "A sessão expirou. Entre de novo e repita a exportação.";
    throw new ApiError(mensagem, resposta.status);
  }

  return resposta.body;
}

export const NOME_DO_LEIA = "LEIA - arquivos que faltaram.txt";

/** O aviso do zip parcial, em CRLF para abrir certo no Bloco de Notas. */
export function textoDoLeia(faltas: readonly { caminho: string; motivo: string }[]): string {
  return [
    "Arquivos que faltaram nesta exportação",
    "",
    "Os arquivos abaixo não foram gerados; os demais deste zip estão completos.",
    "Para obtê-los, exporte de novo só estas linhas.",
    "",
    ...faltas.flatMap((f) => [`- ${f.caminho}`, `  Motivo: ${f.motivo}`]),
    "",
  ].join("\r\n");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: o comando do Step 2.
Expected: `✓ dc106 passou — 12 conferências`.

---

### Task 6: Front — exportação pelo lote, Cancelar e zip parcial

**Files:**
- Modify: `client-new-kpi/lib/exportarDetalhesDaLinha.ts` (substitui `arquivosDaLinha`, `exportarDetalhesDaLinha`, `exportarDetalhesDasLinhas` por `exportarLinhas` + `nomeDoZipDaLinha`)
- Modify: `client-new-kpi/hooks/useDreGerencial.ts` (exporta `paraApi`)
- Modify: `client-new-kpi/components/dre-gerencial/TabelaDre.tsx`
- Test: dc98, dc103, dc104 (regressão), `tsc`, `eslint`

**Interfaces:**
- Consumes: Task 5 (`pedirLote`, `lerNdjson`, `textoDoLeia`, `NOME_DO_LEIA`, `PedidoDoLote`),
  `planilhaDoDetalhe`, `planilhaDaComposicao`, `exigirMesmaBase`.
- Produces:
  - `interface LinhaParaExportarNoLote extends LinhaParaExportar { destino?: { tipo: TipoDetalhe; bloco: string | null; chave: string | null; sobra?: string[] | null }; composicao?: ComposicaoDaColuna }`
  - `exportarLinhas({ linhas, caminhos, nomeDoZip, filtro, ocultarBaixas, baseDaSessao, signal, onProgresso }): Promise<{ arquivos: number; faltando: number }>`
  - `nomeDoZipDaLinha(descricao, colunas): string`
  - `nomesDosArquivos`, `caminhosNoZip`, `nomeDoZipDaSelecao` ficam como estão.

- [ ] **Step 1: `exportarDetalhesDaLinha.ts`**

Remova `arquivosDaLinha`, `exportarDetalhesDaLinha` e `exportarDetalhesDasLinhas` (e o import de
`Detalhamento`). Mantenha `ColunaParaExportar`, `tituloDe`, `nomesDosArquivos`,
`ComposicaoDaColuna`, `dataNoNome`, `nomeDoZipDaSelecao`, `LinhaParaExportar`, `caminhosNoZip`.
Troque o comentário do topo do arquivo para descrever o lote (uma frase sobre o fluxo, uma sobre o
zip parcial). Acrescente:

```ts
import { baixar, gerarPlanilha, nomeSeguro, type Planilha } from "@/lib/excel";
import { exigirMesmaBase } from "@/lib/baseDaResposta";
import {
  lerNdjson,
  NOME_DO_LEIA,
  pedirLote,
  textoDoLeia,
  type PedidoDoLote,
} from "@/lib/loteDeDetalhe";
import { ApiError } from "@/services/apiClient";
import type { TipoDetalhe } from "@/types/dre-gerencial";

const periodoDe = (c: ColunaParaExportar) => ({ dataInicio: c.dataInicio, dataFim: c.dataFim });

/** O zip do botão direito: uma linha, todas as colunas. */
export function nomeDoZipDaLinha(descricao: string, colunas: readonly ColunaParaExportar[]): string {
  const inicio = colunas[0]?.dataInicio ?? "";
  const fim = colunas.at(-1)?.dataFim ?? "";
  return `${nomeSeguro(`Detalhe ${descricao} ${inicio} a ${fim}`)}.zip`;
}

/** Uma linha a exportar: a CONTA leva o destino do detalhamento; o TOTALIZADOR, a composição. */
export interface LinhaParaExportarNoLote extends LinhaParaExportar {
  destino?: { tipo: TipoDetalhe; bloco: string | null; chave: string | null; sobra?: string[] | null };
  composicao?: ComposicaoDaColuna;
}

/**
 * EXPORTA linhas num zip (06/11/2026): os totalizadores pela composição, no navegador; as
 * contas por UM pedido em lote, em fluxo — cada Excel é gerado assim que a parte dele chega,
 * e os dados são descartados (10 meses de uma filial são ~104 mil lançamentos).
 *
 * <b>Zip parcial.</b> Parte que falhou no servidor, ou que não chegou porque a conexão caiu,
 * vira uma linha do `LEIA - arquivos que faltaram.txt`; o resto é baixado. Só não há zip
 * quando nada foi gerado, quando o servidor recusou o pedido antes de começar, ou quando a
 * pessoa CANCELOU (aí lança o `AbortError`).
 */
export async function exportarLinhas({
  linhas,
  caminhos,
  nomeDoZip,
  filtro,
  ocultarBaixas,
  baseDaSessao,
  signal,
  onProgresso,
}: {
  linhas: readonly LinhaParaExportarNoLote[];
  /** O caminho de cada arquivo no zip: `caminhos[linha][coluna]`. */
  caminhos: readonly (readonly string[])[];
  nomeDoZip: string;
  filtro: Omit<PedidoDoLote, "colunas" | "linhas">;
  ocultarBaixas: boolean;
  baseDaSessao: string | undefined;
  signal: AbortSignal;
  onProgresso?: (p: { feitos: number; total: number; agora: string }) => void;
}): Promise<{ arquivos: number; faltando: number }> {
  const arquivos: ArquivoDoZip[] = [];
  const faltas: { caminho: string; motivo: string }[] = [];
  const total = linhas.reduce((soma, l) => soma + l.colunas.length, 0);
  let feitos = 0;
  const avisar = (agora: string) => onProgresso?.({ feitos, total, agora });

  async function adicionar(nome: string, planilha: Planilha) {
    const blob = await gerarPlanilha([planilha]);
    arquivos.push({ nome, dados: new Uint8Array(await blob.arrayBuffer()) });
  }

  // 1. TOTALIZADORES — aritmética do que já está na tela.
  for (const [i, linha] of linhas.entries()) {
    if (!linha.composicao) continue;
    for (const [c, coluna] of linha.colunas.entries()) {
      await adicionar(
        caminhos[i]![c]!,
        planilhaDaComposicao({ titulo: tituloDe(linha.descricao, coluna), periodo: periodoDe(coluna), ...linha.composicao(coluna) }),
      );
      feitos++;
      avisar(`${linha.descricao} · ${coluna.rotulo}`);
    }
  }

  // 2. CONTAS — um pedido em lote.
  const comConsulta = linhas.flatMap((l, i) => (l.destino ? [i] : []));
  if (comConsulta.length > 0) {
    const colunas = linhas[comConsulta[0]!]!.colunas;
    const recebidas = new Set<string>();
    let terminou = false;
    let interrompido: string | null = null;
    avisar("Consultando o banco…");

    try {
      const corpo = await pedirLote(
        {
          ...filtro,
          colunas: colunas.map(periodoDe),
          linhas: comConsulta.map((i) => ({ id: i, ...linhas[i]!.destino! })),
        },
        signal,
      );

      for await (const pacote of lerNdjson(corpo)) {
        if (pacote.t === "inicio") {
          exigirMesmaBase({ base: pacote.base }, baseDaSessao);
        } else if (pacote.t === "parte") {
          const linha = linhas[pacote.linha]!;
          const coluna = linha.colunas[pacote.coluna]!;
          await adicionar(
            caminhos[pacote.linha]![pacote.coluna]!,
            planilhaDoDetalhe({
              titulo: tituloDe(linha.descricao, coluna),
              periodo: periodoDe(coluna),
              linha: { descricao: linha.descricao, valor: coluna.valor ?? 0 },
              dados: pacote.dados,
              ocultarBaixas,
            }),
          );
          recebidas.add(`${pacote.linha}:${pacote.coluna}`);
          feitos++;
          avisar(`${linha.descricao} · ${coluna.rotulo}`);
        } else if (pacote.t === "falha") {
          for (const id of pacote.linhas) {
            faltas.push({ caminho: caminhos[id]![pacote.coluna]!, motivo: pacote.mensagem });
            recebidas.add(`${id}:${pacote.coluna}`);
            feitos++;
          }
          avisar(`${faltas.length} ${faltas.length === 1 ? "arquivo falhou" : "arquivos falharam"} até agora`);
        } else if (pacote.t === "erro") {
          interrompido = pacote.mensagem;
          break;
        } else if (pacote.t === "fim") {
          terminou = true;
          break;
        }
      }
    } catch (e) {
      if (signal.aborted) throw e;
      // Recusa ANTES de começar (pedido inválido, sessão, base trocada): não há zip a montar.
      if (e instanceof ApiError && e.status !== 0 && recebidas.size === 0 && faltas.length === 0) throw e;
      interrompido = e instanceof Error ? e.message : "A exportação foi interrompida.";
    }

    if (signal.aborted) throw new DOMException("Exportação cancelada.", "AbortError");
    if (!terminou && !interrompido) interrompido = "A conexão com o servidor caiu antes do fim.";

    if (interrompido) {
      for (const i of comConsulta) {
        for (const c of colunas.keys()) {
          if (!recebidas.has(`${i}:${c}`)) faltas.push({ caminho: caminhos[i]![c]!, motivo: interrompido });
        }
      }
      if (arquivos.length === 0) throw new Error(interrompido);
    }
  }

  if (faltas.length > 0) {
    arquivos.push({ nome: NOME_DO_LEIA, dados: new TextEncoder().encode(textoDoLeia(faltas)) });
  }
  baixar(criarZip(arquivos), nomeDoZip);
  return { arquivos: arquivos.length - (faltas.length > 0 ? 1 : 0), faltando: faltas.length };
}
```

`planilhaDoDetalhe` vem de `@/lib/exportarExcelDetalhe` (já importado), `planilhaDaComposicao`
de `@/lib/composicaoDoTotal` (troque o import para `{ planilhaDaComposicao, type Parcela }` se
`Parcela` ainda for usado por `ComposicaoDaColuna`), `criarZip`/`ArquivoDoZip` de `@/lib/zip`.

- [ ] **Step 2: Exportar `paraApi`**

Em `hooks/useDreGerencial.ts`, `function paraApi(` vira `export function paraApi(`.

- [ ] **Step 3: `TabelaDre.tsx` — fonte, execução e aviso**

1. Imports: remova `exportarDetalhesDaLinha`, `exportarDetalhesDasLinhas` e, se não houver outro
   uso (`grep -n pedirDetalhe`), `pedirDetalhe`. Importe `exportarLinhas`, `nomeDoZipDaLinha`,
   `nomesDosArquivos`, `caminhosNoZip`, `nomeDoZipDaSelecao`, `type LinhaParaExportarNoLote` de
   `@/lib/exportarDetalhesDaLinha`, e `paraApi` de `@/hooks/useDreGerencial`.
2. Estado da exportação:
   ```ts
   const [exportacao, setExportacao] = useState<{
     conta: string;
     feitos: number;
     total: number;
     /** O que está acontecendo agora: "Consultando o banco…" ou "COMBUSTÍVEL · Março/2025". */
     agora: string | null;
     erro: string | null;
     /** Terminou, mas com arquivos faltando — o LEIA está no zip. */
     aviso: string | null;
     cancelar: (() => void) | null;
   } | null>(null);
   ```
3. `paraExportar` passa a devolver `LinhaParaExportarNoLote | null`: no ramo com `destino`,
   `{ descricao, colunas, destino: { tipo: destino.tipo, bloco: destino.bloco, chave: destino.chave, sobra: destino.sobra ?? null } }`
   (sem `buscar`); o ramo da composição fica igual. Deps: `[periodos, ordenadas]`.
4. Uma função comum às duas ações:
   ```ts
   const rodarExportacao = useCallback(
     async (linhas: LinhaParaExportarNoLote[], caminhos: string[][], nomeDoZip: string, conta: string) => {
       const controle = new AbortController();
       const total = linhas.reduce((s, l) => s + l.colunas.length, 0);
       setExportacao({ conta, feitos: 0, total, agora: null, erro: null, aviso: null, cancelar: () => controle.abort() });
       const { filiais, regime, analise, fornecedores } = paraApi(filtro);
       try {
         const { faltando } = await exportarLinhas({
           linhas,
           caminhos,
           nomeDoZip,
           filtro: { filiais, regime, analise, ...(fornecedores ? { fornecedores } : {}) },
           ocultarBaixas,
           baseDaSessao: usuario?.base.id,
           signal: controle.signal,
           onProgresso: ({ feitos, total, agora }) =>
             setExportacao((e) => (e ? { ...e, feitos, total, agora } : e)),
         });
         setExportacao(
           faltando > 0
             ? { conta, feitos: total, total, agora: null, erro: null, cancelar: null,
                 aviso: `Exportado com ${faltando} ${faltando === 1 ? "arquivo faltando" : "arquivos faltando"} — veja o LEIA no zip.` }
             : null,
         );
       } catch (e) {
         if (controle.signal.aborted) {
           setExportacao(null);
           return;
         }
         setExportacao((atual) => ({
           conta,
           feitos: atual?.feitos ?? 0,
           total,
           agora: null,
           aviso: null,
           cancelar: null,
           erro: `Não foi possível exportar: ${e instanceof Error ? e.message : "erro desconhecido"}`,
         }));
       }
     },
     [filtro, ocultarBaixas, usuario],
   );
   ```
5. `exportarTudo(linha)`: `const fonte = paraExportar(linha); if (!fonte) return;`
   `await rodarExportacao([fonte], [nomesDosArquivos(fonte.descricao, fonte.colunas)], nomeDoZipDaLinha(fonte.descricao, fonte.colunas), fonte.descricao);`
6. `exportarSelecionadas(escolhidas)`: monta `linhasParaExportar` como hoje e chama
   `rodarExportacao(linhasParaExportar, caminhosNoZip(linhasParaExportar), nomeDoZipDaSelecao({...como hoje...}), rotulo)`.
7. O aviso flutuante (hoje em ~1410): mostra `exportacao.erro ?? exportacao.aviso ?? (texto de
   andamento)`. Texto de andamento:
   `Exportando <strong>{conta}</strong>: <span className="tabular">{feitos} de {total}</span>` e,
   abaixo, em `text-[var(--text-secondary)]`, `{agora}` quando houver. Botões:
   - **Cancelar** enquanto `exportacao.cancelar` existir (`onClick={exportacao.cancelar}`), no
     mesmo estilo do "Fechar" atual;
   - **Fechar** quando houver `erro` ou `aviso` (`onClick={() => setExportacao(null)}`).
   O `aviso` usa `text-[var(--text-primary)]`, não a cor de erro: o zip foi baixado.
8. O aviso de demora (~1060, "uma consulta por planilha de conta: pode levar vários minutos")
   vira "— as contas são consultadas em lote: pode levar alguns minutos". Mantenha a regra de
   quando ele aparece.

- [ ] **Step 4: Tipos, lint e regressão**

Run (em `client-new-kpi/`): `npx tsc --noEmit -p .` e
`npx eslint lib/exportarDetalhesDaLinha.ts lib/loteDeDetalhe.ts components/dre-gerencial/TabelaDre.tsx hooks/useDreGerencial.ts`
Expected: sem erro.

Run (raiz): dc98, dc103, dc104, dc106 (`node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs <arquivo>`).
Expected: todos passam. Se o dc98 ou o dc103 importarem algo removido, troque pelo equivalente
(`nomesDosArquivos`/`caminhosNoZip` continuam) e registre a troca no ledger.

---

### Task 7: Conferência contra o Oracle (o Gabriel roda) e documentação

**Files:**
- Create: `docs/rotinas/9815-dre-gerencial/validacao/dc107_lote_contra_mensal.mjs`
- Modify: a página da 9815 que descreve a exportação do detalhamento (ache com
  `grep -rln "Exportar todo o detalhamento\|exportar o detalhamento" docs/rotinas/9815-dre-gerencial`)

- [ ] **Step 1: dc107**

```js
/**
 * dc107 — o LOTE traz exatamente os lançamentos do detalhamento mês a mês (06/11/2026).
 *
 * QUEM RODA É O GABRIEL — o script fala com a API, e a API com o Oracle. Com a API rodando:
 *
 *   $env:KPI_LOGIN="..."; $env:KPI_SENHA="..."      (no seu terminal; nunca no repositório)
 *   $env:FILIAL="7"; $env:INICIO="2025-01-01"; $env:FIM="2025-03-31"
 *   $env:REGIME="competencia"; $env:ANALISE="grupo-contas"
 *   node docs/rotinas/9815-dre-gerencial/validacao/dc107_lote_contra_mensal.mjs
 *
 * Opcionais: API (padrão http://localhost:5207), BASE (id da base), MAX_LINHAS (padrão 8).
 * Para o comparativo, rode uma vez com INICIO/FIM de um ano e outra com o outro.
 *
 * Para cada linha de lançamentos da apuração e cada mês: o /detalhe (o caminho de hoje) e o
 * /detalhe/lote têm de devolver o MESMO conjunto de (RECNUM, VPAGO) e a mesma participação.
 */
const API = process.env.API ?? "http://localhost:5207";
const { KPI_LOGIN, KPI_SENHA, BASE, FILIAL, INICIO, FIM, REGIME = "competencia", ANALISE = "grupo-contas" } = process.env;
const MAX_LINHAS = Number(process.env.MAX_LINHAS ?? 8);
if (!KPI_LOGIN || !KPI_SENHA || !FILIAL || !INICIO || !FIM) {
  console.error("Defina KPI_LOGIN, KPI_SENHA, FILIAL, INICIO e FIM — ver o cabeçalho.");
  process.exit(2);
}

async function post(caminho, corpo, token) {
  const r = await fetch(`${API}${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(corpo),
  });
  return r;
}
async function dados(r) {
  const env = await r.json();
  if (!r.ok || env.sucesso === false) throw new Error(env.mensagem ?? `HTTP ${r.status}`);
  return env.dados;
}

/** Os meses do recorte: [1º dia, último dia], aparados pelo INICIO e pelo FIM. */
function meses(inicio, fim) {
  const saida = [];
  let [a, m] = inicio.split("-").map(Number);
  for (;;) {
    const primeiro = `${a}-${String(m).padStart(2, "0")}-01`;
    const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const ultimo = `${a}-${String(m).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
    saida.push({ dataInicio: primeiro < inicio ? inicio : primeiro, dataFim: ultimo > fim ? fim : ultimo });
    if (ultimo >= fim) return saida;
    m++;
    if (m === 13) { m = 1; a++; }
  }
}

const assinatura = (d) =>
  (d.lancamentos ?? []).map((l) => `${l.recNum}|${Number(l.vPago).toFixed(2)}`).sort().join("\n");

const login = await dados(await post("/api/auth/login", { login: KPI_LOGIN, senha: KPI_SENHA, ...(BASE ? { base: BASE } : {}) }));
const token = login.token;
const filtro = { filiais: [FILIAL], regime: REGIME, analise: ANALISE };
const colunas = meses(INICIO, FIM);

console.log(`\n══ dc107 — lote × mês a mês · filial ${FILIAL} · ${INICIO} a ${FIM} · ${REGIME} · ${ANALISE} ══\n`);
const apuracao = await dados(await post("/api/dre-gerencial/apuracao", { ...filtro, dataInicio: INICIO, dataFim: FIM, modo: "meses" }, token));
const linhas = apuracao.linhas
  .filter((l) => l.detalhe?.tipo === "lancamentos")
  .slice(0, MAX_LINHAS)
  .map((l, id) => ({ id, descricao: l.descricao.trim(), destino: l.detalhe }));
console.log(`${linhas.length} linhas × ${colunas.length} meses\n`);

// O caminho de hoje: uma requisição por linha × mês.
const t0 = Date.now();
const mensal = new Map();
for (const l of linhas) {
  for (const [c, col] of colunas.entries()) {
    const d = await dados(await post("/api/dre-gerencial/detalhe", {
      ...filtro, ...col, tipo: "lancamentos", bloco: l.destino.bloco, chave: l.destino.chave,
      ...(l.destino.sobra?.length ? { sobra: l.destino.sobra } : {}),
    }, token));
    mensal.set(`${l.id}:${c}`, d);
  }
}
const tMensal = Date.now() - t0;

// O lote.
const t1 = Date.now();
const r = await post("/api/dre-gerencial/detalhe/lote", {
  ...filtro, colunas,
  linhas: linhas.map((l) => ({ id: l.id, tipo: "lancamentos", bloco: l.destino.bloco, chave: l.destino.chave, sobra: l.destino.sobra ?? null })),
}, token);
if (!r.ok) throw new Error(`lote: HTTP ${r.status} ${await r.text()}`);
const texto = await r.text();
const tLote = Date.now() - t1;
const pacotes = texto.split("\n").filter(Boolean).map((s) => JSON.parse(s));
const lote = new Map(pacotes.filter((p) => p.t === "parte").map((p) => [`${p.linha}:${p.coluna}`, p.dados]));

let diferencas = 0;
for (const l of linhas) {
  for (const [c] of colunas.entries()) {
    const a = mensal.get(`${l.id}:${c}`);
    const b = lote.get(`${l.id}:${c}`);
    const ok = b && assinatura(a) === assinatura(b) && Math.abs(a.participacao - b.participacao) < 1e-9;
    if (!ok) {
      diferencas++;
      console.log(`  DIFERE  ${l.descricao} · ${colunas[c].dataInicio}  mensal=${a.lancamentos?.length ?? 0}  lote=${b?.lancamentos?.length ?? "ausente"}`);
    }
  }
}
const falhas = pacotes.filter((p) => p.t === "falha");
const batidas = pacotes.filter((p) => p.t === "aguarde").length;
console.log(`\nmês a mês: ${(tMensal / 1000).toFixed(1)} s · lote: ${(tLote / 1000).toFixed(1)} s · batimentos: ${batidas} · falhas: ${falhas.length} · fim: ${pacotes.at(-1)?.t}`);
console.log(diferencas === 0 && falhas.length === 0 && pacotes.at(-1)?.t === "fim"
  ? "\n✓ dc107 passou — o lote traz os mesmos lançamentos\n"
  : `\n✗ dc107: ${diferencas} diferença(s), ${falhas.length} falha(s)\n`);
process.exit(diferencas === 0 && falhas.length === 0 ? 0 : 1);
```

> Antes de entregar, confira com `grep` os nomes de campo usados: `recNum`/`vPago` em
> `DetalheLancamentoDto` serializado (camelCase do `RecNum`/`VPago`), `linhas[].detalhe` e
> `descricao` na apuração, `modo` no filtro da apuração, `dados.token` no login. Ajuste o
> script ao que existir — o Claude não roda este teste.

- [ ] **Step 2: Sintaxe do dc107 sem rodar**

Run: `node --check docs/rotinas/9815-dre-gerencial/validacao/dc107_lote_contra_mensal.mjs`
Expected: sem saída (sintaxe válida).

- [ ] **Step 3: Documentação**

Na página encontrada, uma seção curta "Exportação em lote (06/11/2026)": o endpoint, a unidade
bloco × coluna, o que fica no caminho de uma célula, as proteções contra timeout (tabela da
spec, enxuta), o zip parcial com o LEIA, e os testes dc105/dc106/dc107.

---

### Verificação final

- [ ] `dotnet build api-new-kpi -v q` sem erro.
- [ ] dc105, dc101, dc92 (C#) e dc86, dc87, dc98, dc103, dc104, dc106 (mjs) passam.
- [ ] `npx tsc --noEmit -p .` e o `eslint` dos arquivos tocados, limpos.
- [ ] `git log --oneline HEAD..main` vazio.
- [ ] Revisão final do branch inteiro por um revisor novo (executing-plans).
- [ ] Entregar ao Gabriel: o comando do dc107 e o roteiro de teste na tela — 10 meses, muitas
      linhas, cronometrado; cancelar no meio; e (opcional) derrubar a API no meio para ver o zip
      parcial com o LEIA.

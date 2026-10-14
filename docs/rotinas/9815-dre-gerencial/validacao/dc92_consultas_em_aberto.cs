#:project ../../../../api-new-kpi/api-new-kpi.csproj
#:property PublishAot=false

// dc92 — a versão EM ABERTO das consultas (coluna PROVISIONADO, 14/10/2026).
//
// O provisionado é a mesma consulta de despesas trocando SÓ `DTPAGTO IS NOT NULL` por
// `DTPAGTO IS NULL`, com o ramo de venda de ativo vazio (`AND 1 = 0`). Este teste prova que a
// troca acontece exatamente uma vez em cada consulta, que nada mais muda — em especial a
// LISTA DE BINDS, que o ODP.NET liga por posição — e que uma consulta sem os trechos lança
// em vez de seguir pela metade.
//
// Rode da RAIZ do repositório:
//   dotnet run docs/rotinas/9815-dre-gerencial/validacao/dc92_consultas_em_aberto.cs -p:BaseOutputPath="$TEMP/dc92/"
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

// Os binds (`:nome`) e os pontos do string.Format (`{n}`), na ordem em que aparecem.
static string Binds(string sql) =>
    string.Join(" ", Regex.Matches(sql, @":[A-Za-z]\w*|\{\d+\}").Select(m => m.Value));

static int Vezes(string sql, string trecho) =>
    Regex.Matches(sql, Regex.Escape(trecho)).Count;

Console.WriteLine("\n══ dc92 — as consultas em aberto ══\n");

var despesas = new (string Nome, string Sql)[]
{
    ("DespesasGrupoDeContas", DreGerencialQueries.DespesasGrupoDeContas),
    ("DespesasContaGerencial", DreGerencialQueries.DespesasContaGerencial),
    ("DespesasCCustoPrincipal", DreGerencialQueries.DespesasCCustoPrincipal),
    ("DespesasCentroCusto", DreGerencialQueries.DespesasCentroCusto),
};

foreach (var (nome, sql) in despesas)
{
    var aberto = DreGerencialQueries.EmAberto(sql);
    Afirmar(Vezes(aberto, "DTPAGTO IS NULL") == 1 && Vezes(aberto, "DTPAGTO IS NOT NULL") == 0,
        $"{nome}: só o aberto — DTPAGTO IS NULL uma vez, IS NOT NULL nenhuma");
    Afirmar(Vezes(aberto, "nf.codfilial IN ({3}) AND 1 = 0") == 1,
        $"{nome}: o ramo de venda de ativo vazio");
    Afirmar(Binds(aberto) == Binds(sql), $"{nome}: os MESMOS binds, na mesma ordem");
    Afirmar(aberto.Length == sql.Length - "NOT ".Length + " AND 1 = 0".Length,
        $"{nome}: nenhuma outra mudança no texto");
}

var lanc = DreDetalheQueries.Lancamentos;
var lancAberto = DreDetalheQueries.EmAberto(lanc);
Afirmar(Vezes(lancAberto, "WHERE DTPAGTO IS NULL) FIN") == 1 && Vezes(lancAberto, "DTPAGTO IS NOT NULL") == 0,
    "Lancamentos: só o aberto");
Afirmar(Vezes(lancAberto, "nf.codfilial IN ({2}) AND 1 = 0") == 1, "Lancamentos: o ramo de venda de ativo vazio");
Afirmar(Binds(lancAberto) == Binds(lanc), "Lancamentos: os MESMOS binds, na mesma ordem");

// Uma consulta que mudou e perdeu o trecho não pode virar "aberto pela metade".
var lancou = false;
try { DreGerencialQueries.EmAberto("SELECT 1 FROM DUAL WHERE DTPAGTO IS NOT NULL"); }
catch (InvalidOperationException) { lancou = true; }
Afirmar(lancou, "sem o ramo de venda de ativo, lança");

lancou = false;
try { DreGerencialQueries.EmAberto("WHERE DTPAGTO IS NOT NULL WHERE DTPAGTO IS NOT NULL nf.codfilial IN ({3})"); }
catch (InvalidOperationException) { lancou = true; }
Afirmar(lancou, "com o trecho DUAS vezes, lança");

Console.WriteLine(falhas == 0 ? $"\n✓ dc92 passou — {n} conferências\n" : $"\n✗ {falhas} falha(s) de {n}\n");
return falhas == 0 ? 0 : 1;

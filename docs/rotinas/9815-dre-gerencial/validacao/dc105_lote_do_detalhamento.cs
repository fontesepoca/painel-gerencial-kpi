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

using System.Reflection;
using System.Text.RegularExpressions;
using Epoca.Kpi.Api.Application.Common.Bases;
using Epoca.Kpi.Api.Domain.Entities;
using Epoca.Kpi.Api.Domain.Interfaces;
using Microsoft.Extensions.Logging.Abstractions;
using Epoca.Kpi.Api.Application.Features.DreGerencial;
using Epoca.Kpi.Api.Application.Features.DreGerencial.Dtos;
using Epoca.Kpi.Api.Infrastructure.Persistence;
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
// ── 4. O batimento: enquanto a consulta roda, um sinal a cada intervalo ───────────────────
async Task<int> Batidas(Task tarefa, int intervaloMs)
{
    var batidas = 0;
    await foreach (var _ in LoteDeDetalhe.Esperar(tarefa, TimeSpan.FromMilliseconds(intervaloMs), CancellationToken.None))
        batidas++;
    return batidas;
}

// Margem larga de propósito: o relógio do Windows tem ~15 ms de resolução, e o primeiro
// Task.Delay de um processo frio atrasa. O que importa é bater várias vezes, não o número exato.
Afirmar(await Batidas(Task.Delay(1000), 200) is >= 2 and <= 6, "consulta de 1 s com batimento de 200 ms: algumas batidas (~4)");
Afirmar(await Batidas(Task.CompletedTask, 100) == 0, "consulta já pronta: nenhuma batida");
Afirmar(await Batidas(Task.FromException(new InvalidOperationException()), 100) == 0,
    "consulta que falhou: o batimento não lança — quem lê o erro é o serviço");
Afirmar(LoteDeDetalhe.IntervaloDoBatimento == TimeSpan.FromSeconds(15), "o batimento de produção é 15 s");

// ── 5. O serviço: partes por linha, nova tentativa e falha que não para o lote ─────────────
async Task<List<PacoteDoLote>> Executar(Func<int, Task<IReadOnlyList<DetalheLancamentoDre>>> responder, LoteFiltroDto pedido)
{
    var repositorio = DispatchProxy.Create<IDreGerencialRepository, RepositorioFalso>();
    ((RepositorioFalso)(object)repositorio).Responder = responder;
    var baseAtual = DispatchProxy.Create<IBaseAtual, BaseFalsa>();
    var servico = new DreGerencialService(repositorio, baseAtual, NullLogger<DreGerencialService>.Instance);
    var pacotes = new List<PacoteDoLote>();
    await foreach (var p in servico.ExecutarLoteAsync(pedido)) pacotes.Add(p);
    return pacotes;
}

DetalheLancamentoDre Lanc(decimal recNum, string chave) => new() { RecNum = recNum, ChaveLote = chave };
var tresLinhas = new LoteFiltroDto(["7"], "competencia", "grupo-contas", [colunas[0]],
    [L(0, "lancamentos", "operacional", "310"), L(1, "lancamentos", "operacional", "320"), L(2, "lancamentos", "operacional", "310")]);
IReadOnlyList<DetalheLancamentoDre> doBanco = [Lanc(1, "310"), Lanc(2, "320"), Lanc(3, "310")];

var chamadas = 0;
var ok1 = await Executar(_ => { chamadas++; return Task.FromResult(doBanco); }, tresLinhas);
Afirmar(ok1.Select(p => p.T).SequenceEqual(["inicio", "parte", "parte", "parte", "fim"]) && chamadas == 1,
    "um bloco, três linhas: UMA consulta, três partes, e o fim");
Afirmar(ok1[0].Partes == 3 && ok1[0].Base?.Id == "teste", "o início diz quantas partes vêm e de que base");
var porLinha = ok1.Where(p => p.T == "parte").ToDictionary(p => p.Linha!.Value, p => p.Dados!.Lancamentos!.Select(l => l.RecNum).ToArray());
Afirmar(porLinha[0].SequenceEqual([1m, 3m]) && porLinha[1].SequenceEqual([2m]) && porLinha[2].SequenceEqual([1m, 3m]),
    "cada linha recebe os lançamentos da SUA chave — e a chave repetida recebe os mesmos");

chamadas = 0;
var ok2 = await Executar(_ => ++chamadas == 1 ? Task.FromException<IReadOnlyList<DetalheLancamentoDre>>(new TimeoutException()) : Task.FromResult(doBanco), tresLinhas);
Afirmar(chamadas == 2 && ok2.Count(p => p.T == "parte") == 3 && ok2.All(p => p.T != "falha"),
    "tempo esgotado na primeira: a segunda tentativa entrega tudo");

chamadas = 0;
var ok3 = await Executar(_ => { chamadas++; return Task.FromException<IReadOnlyList<DetalheLancamentoDre>>(new TimeoutException()); }, tresLinhas);
var falha3 = ok3.SingleOrDefault(p => p.T == "falha");
Afirmar(chamadas == 2 && falha3 is not null && falha3.Linhas!.SequenceEqual([0, 1, 2]) && falha3.Mensagem!.Contains("segunda tentativa")
        && ok3[^1].T == "fim",
    "tempo esgotado duas vezes: falha das três linhas, e o lote chega ao fim");

chamadas = 0;
var ok4 = await Executar(_ => { chamadas++; return Task.FromException<IReadOnlyList<DetalheLancamentoDre>>(new InvalidOperationException("ORA-00942")); }, tresLinhas);
Afirmar(chamadas == 1 && ok4.Single(p => p.T == "falha").Mensagem == "Erro inesperado ao consultar o banco.",
    "erro que não é transitório: sem segunda tentativa, e a mensagem não vaza o erro do banco");

// ── 6. O que ganha a segunda tentativa (revisão final, 06/11/2026) ───────────────────────
// A abertura da conexão chega embrulhada em BaseIndisponivelException; o commandTimeout do
// ODP.NET chega como OperationCanceledException (GlobalExceptionMiddleware, 11/09/2026).
var baseDeTeste = new BaseConfigurada("teste", "Base de teste", "", null!);
Afirmar(FalhaTransitoria.Eh(new BaseIndisponivelException(baseDeTeste, "ORA-12541", new TimeoutException())),
    "conexão que não abriu (embrulhada): vale a segunda tentativa");
Afirmar(FalhaTransitoria.Eh(new OperationCanceledException()),
    "tempo esgotado do ODP.NET (OperationCanceledException): vale a segunda tentativa");
Afirmar(!FalhaTransitoria.Eh(new InvalidOperationException("ORA-00942")), "erro de SQL: não vale");

chamadas = 0;
var ok5 = await Executar(_ => ++chamadas == 1 ? Task.FromException<IReadOnlyList<DetalheLancamentoDre>>(new OperationCanceledException()) : Task.FromResult(doBanco), tresLinhas);
Afirmar(chamadas == 2 && ok5.Count(p => p.T == "parte") == 3,
    "commandTimeout na primeira: a segunda tentativa entrega tudo");

Console.WriteLine($"\n{(falhas == 0 ? "✓ dc105 passou" : $"✗ dc105: {falhas} falha(s)")} — {n} conferências\n");
return falhas == 0 ? 0 : 1;

/// <summary>Só o que o lote agrupado usa; o resto lança, para o teste não passar por engano.</summary>
public class RepositorioFalso : DispatchProxy
{
    public Func<int, Task<IReadOnlyList<DetalheLancamentoDre>>> Responder { get; set; } = null!;
    private int _chamadas;

    protected override object? Invoke(MethodInfo? metodo, object?[]? args) => metodo!.Name switch
    {
        nameof(IDreGerencialRepository.ObterDetalheLancamentosDoLoteAsync) => Responder(++_chamadas),
        nameof(IDreGerencialRepository.EhFalhaTransitoria) => FalhaTransitoria.Eh((Exception)args![0]!),
        _ => throw new NotSupportedException(metodo.Name),
    };
}

public class BaseFalsa : DispatchProxy
{
    protected override object? Invoke(MethodInfo? metodo, object?[]? args) =>
        new BaseConfigurada("teste", "Base de teste", "", null!);
}

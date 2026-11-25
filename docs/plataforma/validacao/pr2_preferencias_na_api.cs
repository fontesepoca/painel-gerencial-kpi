#:project ../../../api-new-kpi/api-new-kpi.csproj
#:property PublishAot=false

// pr2 — as preferências de tela por usuário, na API (25/11/2026).
// Regras de docs/superpowers/specs/2026-11-25-preferencias-por-usuario-design.md, sem banco: o
// repositório é falso e anota o que recebeu.
//
// Rode da RAIZ do repositório:
//   dotnet run docs/plataforma/validacao/pr2_preferencias_na_api.cs -p:BaseOutputPath="$TEMP/pr2/"

using System.Security.Claims;
using System.Text.Json;
using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Common.Bases;
using Epoca.Kpi.Api.Application.Features.Autenticacao;
using Epoca.Kpi.Api.Application.Features.Preferencias;
using Epoca.Kpi.Api.Domain.Entities;
using Epoca.Kpi.Api.Domain.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

var falhas = 0;
void Conferir(string afirmacao, bool condicao)
{
    Console.WriteLine($"  {(condicao ? "ok   " : "FALHA")} {afirmacao}");
    if (!condicao) falhas++;
}

static JsonElement Json(string texto) => JsonDocument.Parse(texto).RootElement.Clone();
static bool Vazio(JsonElement e) => e.ValueKind == JsonValueKind.Object && !e.EnumerateObject().Any();

(PreferenciasService Servico, RepositorioFalso Repo) Montar(bool ligada, string? guardado = null)
{
    var repo = new RepositorioFalso(guardado);
    return (new PreferenciasService(repo, new BaseFalsa(ligada)), repo);
}

const string Tela = "dre-gerencial";

Console.WriteLine("A — tela fora da lista: recusada nos dois sentidos, sem tocar no banco");
var (sa, ra) = Montar(ligada: true);
var a1 = await sa.ObterAsync(144, "outra-tela");
var a2 = await sa.SalvarAsync(144, "outra-tela", Json("""{"exibicao":{"av":false}}"""));
Conferir("GET recusado como validação", a1.Falha && a1.TipoErro == ResultErrorType.Validacao);
Conferir("POST recusado como validação", a2.Falha && a2.TipoErro == ResultErrorType.Validacao);
Conferir("o repositório não foi chamado", ra.Leituras == 0 && ra.Gravacoes.Count == 0);

Console.WriteLine("B — corpo que não é objeto JSON: recusado");
foreach (var corpo in new[] { "[1,2]", "\"texto\"", "42", "null", "true" })
{
    var r = await sa.SalvarAsync(144, Tela, Json(corpo));
    Conferir($"{corpo} recusado", r.Falha && r.TipoErro == ResultErrorType.Validacao);
}
var indefinido = await sa.SalvarAsync(144, Tela, default);
Conferir("corpo ausente recusado", indefinido.Falha && indefinido.TipoErro == ResultErrorType.Validacao);
Conferir("nada gravado", ra.Gravacoes.Count == 0);

Console.WriteLine("C — o limite de 32 KB");
static string Corpo(int bytes)
{
    const string prefixo = "{\"x\":\"";
    const string sufixo = "\"}";
    return prefixo + new string('a', bytes - prefixo.Length - sufixo.Length) + sufixo;
}
var noLimite = await sa.SalvarAsync(144, Tela, Json(Corpo(32 * 1024)));
var acima = await sa.SalvarAsync(144, Tela, Json(Corpo(32 * 1024 + 1)));
Conferir("exatamente 32 KB passa", noLimite.Sucesso);
Conferir("32 KB + 1 byte é recusado", acima.Falha && acima.TipoErro == ResultErrorType.Validacao);

Console.WriteLine("D — base ligada: grava o trecho como veio e devolve o guardado");
var (sd, rd) = Montar(ligada: true, guardado: """{"exibicao":{"ah":false}}""");
var d1 = await sd.SalvarAsync(144, Tela, Json("""{"exibicao":{"av":false}}"""));
Conferir("salvo: true", d1.Sucesso && d1.Valor!.Salvo);
Conferir("um MERGE com a matrícula, a tela e o trecho",
    rd.Gravacoes.Count == 1 && rd.Gravacoes[0] == (144, Tela, """{"exibicao":{"av":false}}"""));
var d2 = await sd.ObterAsync(144, Tela);
Conferir("o GET devolve o objeto guardado",
    d2.Sucesso && d2.Valor.GetProperty("exibicao").GetProperty("ah").GetBoolean() == false);

Console.WriteLine("E — nada guardado, ou guardado estragado: {}");
var (se1, _) = Montar(ligada: true, guardado: null);
var e1 = await se1.ObterAsync(144, Tela);
Conferir("nunca salvou: {}", e1.Sucesso && Vazio(e1.Valor));
var (se2, _) = Montar(ligada: true, guardado: "[1]");
var e2 = await se2.ObterAsync(144, Tela);
Conferir("guardado que não é objeto: {}", e2.Sucesso && Vazio(e2.Valor));
var (se3, _) = Montar(ligada: true, guardado: "{quebrado");
var e3 = await se3.ObterAsync(144, Tela);
Conferir("guardado que não é JSON: {}", e3.Sucesso && Vazio(e3.Valor));

Console.WriteLine("F — base desligada (Minas Rural hoje): {} e salvo: false, sem tocar no banco");
var (sf, rf) = Montar(ligada: false, guardado: """{"exibicao":{"ah":false}}""");
var f1 = await sf.ObterAsync(144, Tela);
var f2 = await sf.SalvarAsync(144, Tela, Json("""{"exibicao":{"av":false}}"""));
Conferir("GET: {}", f1.Sucesso && Vazio(f1.Valor));
Conferir("POST: salvo false", f2.Sucesso && f2.Valor!.Salvo == false);
Conferir("o repositório não foi chamado", rf.Leituras == 0 && rf.Gravacoes.Count == 0);
var f3 = await sf.SalvarAsync(144, "outra-tela", Json("{}"));
Conferir("a tela continua validada com a base desligada", f3.Falha);

Console.WriteLine("G — a matrícula vem do token");
static ClaimsPrincipal Token(params Claim[] claims) => new(new ClaimsIdentity(claims, "teste"));
Conferir("claim numérica → a matrícula",
    PreferenciasService.MatriculaDo(Token(new Claim(GeradorDeToken.ClaimMatricula, "144"))) == 144);
Conferir("sem a claim → nenhuma", PreferenciasService.MatriculaDo(Token()) is null);
Conferir("claim não numérica → nenhuma",
    PreferenciasService.MatriculaDo(Token(new Claim(GeradorDeToken.ClaimMatricula, "abc"))) is null);

Console.WriteLine("H — a configuração das bases (appsettings.json de verdade)");
var configuracao = new ConfigurationBuilder()
    .AddJsonFile(Path.GetFullPath(Path.Combine("api-new-kpi", "appsettings.json")), optional: false)
    .AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["ConnectionStrings:OracleEpoca"] = "teste",
        ["ConnectionStrings:OracleMinasRural"] = "teste",
    })
    .Build();
var bases = new RegistroDeBases(configuracao, NullLogger<RegistroDeBases>.Instance);
Conferir("a Época grava", bases.Buscar("Epoca")!.PreferenciasNoBanco);
Conferir("o Minas Rural não grava (a tabela não existe lá)", !bases.Buscar("MinasRural")!.PreferenciasNoBanco);
Conferir("ausente na configuração = desligada",
    !new BaseConfigurada("x", "X", "", new RegrasDaBase()).PreferenciasNoBanco);

Console.WriteLine(falhas == 0 ? "\n✓ pr2 passou" : $"\n✗ pr2: {falhas} falha(s)");
return falhas == 0 ? 0 : 1;

/// <summary>Devolve <c>guardado</c> e anota cada gravação.</summary>
sealed class RepositorioFalso(string? guardado) : IPreferenciasRepository
{
    public int Leituras { get; private set; }
    public List<(int Matricula, string Tela, string Trecho)> Gravacoes { get; } = [];

    public Task<string?> ObterAsync(int matricula, string tela, CancellationToken cancellationToken = default)
    {
        Leituras++;
        return Task.FromResult(guardado);
    }

    public Task SalvarAsync(int matricula, string tela, string trecho, CancellationToken cancellationToken = default)
    {
        Gravacoes.Add((matricula, tela, trecho));
        return Task.CompletedTask;
    }
}

sealed class BaseFalsa(bool ligada) : IBaseAtual
{
    public BaseConfigurada Base { get; } = new("teste", "Base de teste", "", new RegrasDaBase(), ligada);
}

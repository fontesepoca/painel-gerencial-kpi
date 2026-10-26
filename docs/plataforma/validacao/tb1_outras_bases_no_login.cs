#:project ../../../api-new-kpi/api-new-kpi.csproj
#:property PublishAot=false

// tb1 — o login confere as OUTRAS bases (troca de base sem novo login, 26/10/2026).
// Regras R1–R3 de docs/superpowers/specs/2026-10-26-troca-de-base-design.md, sem banco: o
// repositório é falso e cada cenário diz o que a "outra base" responde.
//
// Rode da RAIZ do repositório:
//   dotnet run docs/plataforma/validacao/tb1_outras_bases_no_login.cs -p:BaseOutputPath="$TEMP/tb1/"

using System.Diagnostics;
using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Common.Bases;
using Epoca.Kpi.Api.Application.Features.Autenticacao;
using Epoca.Kpi.Api.Application.Features.Autenticacao.Dtos;
using Epoca.Kpi.Api.Domain.Entities;
using Epoca.Kpi.Api.Domain.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

var configuracao = new ConfigurationBuilder()
    .AddJsonFile(Path.GetFullPath(Path.Combine("api-new-kpi", "appsettings.json")), optional: false)
    // Uma string qualquer: o registro só oferece base que tenha conexão, e aqui ninguém conecta.
    .AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["ConnectionStrings:OracleEpoca"] = "teste",
        ["ConnectionStrings:OracleMinasRural"] = "teste",
    })
    .Build();

var bases = new RegistroDeBases(configuracao, NullLogger<RegistroDeBases>.Instance);
var tokens = new GeradorDeToken(Options.Create(new OpcoesDeToken { Chave = new string('x', 64) }));

var falhas = 0;
void Conferir(string afirmacao, bool condicao)
{
    Console.WriteLine($"  {(condicao ? "ok   " : "FALHA")} {afirmacao}");
    if (!condicao) falhas++;
}

static CredenciaisWinthor Pessoa(int matricula, string senha = "S", string ativo = "S", string controle = "S") => new()
{
    Matricula = matricula, Nome = "FULANO DE TAL", NomeGuerra = "FULANO",
    TemSenha = "S", Ativo = ativo, SenhaConfere = senha, TemRotina = "S", TemControle = controle,
};

async Task<(Result<LoginResponse> Resultado, RepositorioFalso Repo, TimeSpan Tempo)> Entrar(
    string escolhida, Func<CancellationToken, Task<CredenciaisWinthor?>> outra, CredenciaisWinthor? principal = null)
{
    var repo = new RepositorioFalso(escolhida, principal ?? Pessoa(144), outra);
    var servico = new AutenticacaoService(repo, bases, tokens, NullLogger<AutenticacaoService>.Instance);
    var relogio = Stopwatch.StartNew();
    var resultado = await servico.EntrarAsync(new LoginRequest("fulano", "senha", escolhida));
    return (resultado, repo, relogio.Elapsed);
}

Console.WriteLine("A — outra base com a mesma senha e a 9815: entra na lista, com a matrícula DELA");
var a = await Entrar("Epoca", _ => Task.FromResult<CredenciaisWinthor?>(Pessoa(77)));
Conferir("login ok", a.Resultado.Sucesso);
Conferir("uma outra base", a.Resultado.Valor!.OutrasBases.Count == 1);
Conferir("é o Minas Rural", a.Resultado.Valor!.OutrasBases[0].Usuario.Base.Id == "MinasRural");
Conferir("matrícula do Minas Rural (77), não a da Época", a.Resultado.Valor!.OutrasBases[0].Usuario.Matricula == 77);
Conferir("token próprio, diferente do principal", a.Resultado.Valor!.OutrasBases[0].Token != a.Resultado.Valor!.Token);

Console.WriteLine("B — senha diferente na outra base: fora");
var b = await Entrar("Epoca", _ => Task.FromResult<CredenciaisWinthor?>(Pessoa(77, senha: "N")));
Conferir("login ok e lista vazia", b.Resultado.Sucesso && b.Resultado.Valor!.OutrasBases.Count == 0);

Console.WriteLine("C — inativo na outra base: fora");
var c = await Entrar("Epoca", _ => Task.FromResult<CredenciaisWinthor?>(Pessoa(77, ativo: "N")));
Conferir("login ok e lista vazia", c.Resultado.Sucesso && c.Resultado.Valor!.OutrasBases.Count == 0);

Console.WriteLine("D — sem rotina na outra base (sem a guia 4-DRE): fora (R1)");
var d = await Entrar("Epoca", _ => Task.FromResult<CredenciaisWinthor?>(Pessoa(77, controle: "N")));
Conferir("login ok e lista vazia", d.Resultado.Sucesso && d.Resultado.Valor!.OutrasBases.Count == 0);

Console.WriteLine("E — outra base fora do ar: fora, e o login não cai (R3)");
var e = await Entrar("Epoca", _ => throw new BaseIndisponivelException(bases.Buscar("MinasRural")!, "ORA-12541", new Exception("sem listener")));
Conferir("login ok e lista vazia", e.Resultado.Sucesso && e.Resultado.Valor!.OutrasBases.Count == 0);

Console.WriteLine("F — outra base pendurada, ignorando o cancelamento: fora, dentro do teto (R3)");
var f = await Entrar("Epoca", _ => new TaskCompletionSource<CredenciaisWinthor?>().Task);
Conferir("login ok e lista vazia", f.Resultado.Sucesso && f.Resultado.Valor!.OutrasBases.Count == 0);
Conferir($"respondeu em menos de 7 s ({f.Tempo.TotalSeconds:0.0} s)", f.Tempo < TimeSpan.FromSeconds(7));

Console.WriteLine("F2 — outra base que trava ANTES de devolver a Task (driver síncrono): fora, dentro do teto");
var f2 = await Entrar("Epoca", _ => { Thread.Sleep(10_000); return Task.FromResult<CredenciaisWinthor?>(Pessoa(77)); });
Conferir("login ok e lista vazia", f2.Resultado.Sucesso && f2.Resultado.Valor!.OutrasBases.Count == 0);
Conferir($"respondeu em menos de 7 s ({f2.Tempo.TotalSeconds:0.0} s)", f2.Tempo < TimeSpan.FromSeconds(7));

Console.WriteLine("G — senha errada na base escolhida: recusa e NÃO tenta a outra");
var g = await Entrar("Epoca", _ => Task.FromResult<CredenciaisWinthor?>(Pessoa(77)), principal: Pessoa(144, senha: "N"));
Conferir("login recusado", g.Resultado.Falha);
Conferir("a outra base não foi consultada", g.Repo.ConsultasDaOutra == 0);

Console.WriteLine("H — entrando pelo Minas Rural, a Época é a outra");
var h = await Entrar("MinasRural", _ => Task.FromResult<CredenciaisWinthor?>(Pessoa(144)), principal: Pessoa(77));
Conferir("a outra é a Época", h.Resultado.Sucesso && h.Resultado.Valor!.OutrasBases.Single().Usuario.Base.Id == "Epoca");

Console.WriteLine(falhas == 0 ? "\n✓ tb1 passou" : $"\n✗ tb1: {falhas} falha(s)");
return falhas == 0 ? 0 : 1;

/// <summary>A base escolhida responde `principal`; qualquer outra responde `outra`.</summary>
sealed class RepositorioFalso(
    string escolhida, CredenciaisWinthor principal, Func<CancellationToken, Task<CredenciaisWinthor?>> outra)
    : IAutenticacaoRepository
{
    public int ConsultasDaOutra { get; private set; }

    public Task<CredenciaisWinthor?> VerificarCredenciaisAsync(
        BaseConfigurada baseAlvo, string nomeGuerra, string senha, CancellationToken cancellationToken = default)
    {
        if (baseAlvo.Id == escolhida) return Task.FromResult<CredenciaisWinthor?>(principal);
        ConsultasDaOutra++;
        return outra(cancellationToken);
    }

    public Task<IReadOnlyList<string>> ObterFiliaisDoUsuarioAsync(
        BaseConfigurada baseAlvo, int matricula, CancellationToken cancellationToken = default) =>
        Task.FromResult<IReadOnlyList<string>>(["1", "7"]);
}

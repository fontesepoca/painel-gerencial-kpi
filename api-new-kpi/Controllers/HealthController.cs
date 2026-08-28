using System.Diagnostics;
using System.Text.RegularExpressions;
using Dapper;
using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Infrastructure.Persistence.Context;
using Microsoft.AspNetCore.Mvc;

namespace Epoca.Kpi.Api.Controllers;

[ApiController]
[Route("api/health")]
public sealed partial class HealthController : ControllerBase
{
    private readonly IOracleConnectionFactory _conexoes;
    private readonly IReadOnlyList<IModuleInstaller> _modulos;
    private readonly IHostEnvironment _ambiente;
    private readonly ILogger<HealthController> _logger;

    public HealthController(
        IOracleConnectionFactory conexoes,
        IReadOnlyList<IModuleInstaller> modulos,
        IHostEnvironment ambiente,
        ILogger<HealthController> logger)
    {
        _conexoes = conexoes;
        _modulos = modulos;
        _ambiente = ambiente;
        _logger = logger;
    }

    /// <summary>Diz se a aplicação está de pé. Não toca no banco.</summary>
    [HttpGet]
    public ActionResult<ApiResponse<HealthResponse>> Get()
    {
        var resposta = new HealthResponse(
            Status: "ok",
            Ambiente: _ambiente.EnvironmentName,
            OracleConfigurado: _conexoes.EstaConfigurada,
            Modulos: _modulos.Select(m => m.Nome).ToArray(),
            VerificadoEm: DateTimeOffset.Now);

        return Ok(ApiResponse<HealthResponse>.Ok(resposta));
    }

    /// <summary>
    /// Testa a conexão de verdade: abre, roda SELECT 1 FROM DUAL e mede o tempo.
    /// Devolve também o usuário conectado, para confirmar que é o de somente-leitura
    /// e não uma credencial antiga esquecida na configuração.
    /// </summary>
    [HttpGet("oracle")]
    public async Task<IActionResult> GetOracle(CancellationToken cancellationToken)
    {
        if (!_conexoes.EstaConfigurada)
        {
            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                ApiResponse<object>.Falha(
                    "ConnectionStrings:OracleEpoca não está configurada.",
                    ["Copie appsettings.example.json para appsettings.Development.json e preencha."]));
        }

        var cronometro = Stopwatch.StartNew();

        try
        {
            using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

            var usuario = await conexao.QuerySingleAsync<string>(
                new CommandDefinition(
                    "SELECT USER AS USUARIO FROM DUAL",
                    commandTimeout: 10,
                    cancellationToken: cancellationToken));

            cronometro.Stop();

            return Ok(ApiResponse<OracleHealthResponse>.Ok(new OracleHealthResponse(
                Status: "ok",
                Usuario: usuario,
                TempoMs: cronometro.ElapsedMilliseconds,
                VerificadoEm: DateTimeOffset.Now)));
        }
        catch (Exception excecao)
        {
            cronometro.Stop();

            var codigo = ExtrairCodigoOra(excecao.Message);

            // Loga só o código ORA e a mensagem — nunca a string de conexão,
            // que carrega a senha.
            _logger.LogError("Falha ao conectar no Oracle. {Codigo}", codigo ?? "sem código ORA");

            return StatusCode(
                StatusCodes.Status503ServiceUnavailable,
                ApiResponse<object>.Falha(
                    "Não foi possível conectar ao Oracle.",
                    [codigo ?? "Erro sem código ORA.", DiagnosticarOra(codigo)]));
        }
    }

    private static string? ExtrairCodigoOra(string mensagem)
    {
        var achado = RegexOra().Match(mensagem);
        return achado.Success ? achado.Value : null;
    }

    /// <summary>Traduz os erros de conexão mais comuns para algo acionável.</summary>
    private static string DiagnosticarOra(string? codigo) => codigo switch
    {
        "ORA-01017" => "Usuário ou senha inválidos.",
        "ORA-12541" => "Não há listener no host/porta informados.",
        "ORA-12514" => "O listener não conhece esse nome de serviço.",
        "ORA-12154" => "Nome de serviço não resolvido. Confira o Data Source.",
        "ORA-12170" => "Timeout ao conectar. Provável bloqueio de rede ou firewall.",
        "ORA-28000" => "A conta está bloqueada.",
        "ORA-28001" => "A senha expirou.",
        _ => "Confira host, porta, serviço e credenciais no appsettings do ambiente."
    };

    [GeneratedRegex(@"ORA-\d{5}")]
    private static partial Regex RegexOra();
}

public record HealthResponse(
    string Status,
    string Ambiente,
    bool OracleConfigurado,
    IReadOnlyList<string> Modulos,
    DateTimeOffset VerificadoEm);

public record OracleHealthResponse(
    string Status,
    string Usuario,
    long TempoMs,
    DateTimeOffset VerificadoEm);

using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Infrastructure.Persistence.Context;
using Microsoft.AspNetCore.Mvc;

namespace Epoca.Kpi.Api.Controllers;

[ApiController]
[Route("api/health")]
public sealed class HealthController : ControllerBase
{
    private readonly IOracleConnectionFactory _conexoes;
    private readonly IReadOnlyList<IModuleInstaller> _modulos;
    private readonly IHostEnvironment _ambiente;

    public HealthController(
        IOracleConnectionFactory conexoes,
        IReadOnlyList<IModuleInstaller> modulos,
        IHostEnvironment ambiente)
    {
        _conexoes = conexoes;
        _modulos = modulos;
        _ambiente = ambiente;
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
}

public record HealthResponse(
    string Status,
    string Ambiente,
    bool OracleConfigurado,
    IReadOnlyList<string> Modulos,
    DateTimeOffset VerificadoEm);

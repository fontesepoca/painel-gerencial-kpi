using System.Text.Json;
using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Features.Preferencias;
using Epoca.Kpi.Api.Application.Features.Preferencias.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Epoca.Kpi.Api.Controllers;

/// <summary>
/// As preferências de tela de quem está logado — o menu Exibição do DRE, por enquanto.
/// Ver docs/plataforma/PREFERENCIAS.md.
/// </summary>
[ApiController]
[Authorize]
[Route("api/preferencias")]
public sealed class PreferenciasController : ControllerBase
{
    private readonly PreferenciasService _servico;

    public PreferenciasController(PreferenciasService servico) => _servico = servico;

    /// <summary>O documento guardado da pessoa nesta tela, ou <c>{}</c>.</summary>
    [HttpGet("{tela}")]
    [ProducesResponseType(typeof(ApiResponse<JsonElement>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Obter(string tela, CancellationToken cancellationToken)
    {
        if (PreferenciasService.MatriculaDo(User) is not { } matricula) return SemMatricula();

        var resultado = await _servico.ObterAsync(matricula, tela, cancellationToken);
        return resultado.Falha
            ? BadRequest(ApiResponse<object>.Falha(resultado.Erro!))
            : Ok(ApiResponse<JsonElement>.Ok(resultado.Valor));
    }

    /// <summary>
    /// Junta o trecho do corpo ao guardado — só as chaves enviadas mudam.
    ///
    /// <para><c>POST</c>, e não <c>PATCH</c>: o BFF do Next só repassa <c>GET</c> e
    /// <c>POST</c>.</para>
    /// </summary>
    [HttpPost("{tela}")]
    [RequestSizeLimit(64 * 1024)]
    [ProducesResponseType(typeof(ApiResponse<PreferenciasSalvasDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Salvar(
        string tela,
        [FromBody] JsonElement trecho,
        CancellationToken cancellationToken)
    {
        if (PreferenciasService.MatriculaDo(User) is not { } matricula) return SemMatricula();

        var resultado = await _servico.SalvarAsync(matricula, tela, trecho, cancellationToken);
        return resultado.Falha
            ? BadRequest(ApiResponse<object>.Falha(resultado.Erro!))
            : Ok(ApiResponse<PreferenciasSalvasDto>.Ok(resultado.Valor!));
    }

    // 403, e não 401: um 401 encerra a sessão do BFF, e este é um token nosso, assinado, a que
    // só falta a matrícula — defeito do gerador, não sessão vencida.
    private ObjectResult SemMatricula() =>
        StatusCode(StatusCodes.Status403Forbidden,
            ApiResponse<object>.Falha("Sessão sem matrícula. Entre novamente."));
}

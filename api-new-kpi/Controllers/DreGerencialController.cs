using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Features.DreGerencial;
using Epoca.Kpi.Api.Application.Features.DreGerencial.Dtos;
using Microsoft.AspNetCore.Mvc;

namespace Epoca.Kpi.Api.Controllers;

/// <summary>
/// DRE Gerencial — rotina 9815 do Winthor.
/// </summary>
[ApiController]
[Route("api/dre-gerencial")]
public sealed class DreGerencialController : ControllerBase
{
    private readonly DreGerencialService _servico;

    public DreGerencialController(DreGerencialService servico) => _servico = servico;

    /// <summary>Filiais disponíveis para o filtro, na ordem de exibição do cadastro.</summary>
    [HttpGet("filiais")]
    public async Task<IActionResult> ObterFiliais(CancellationToken cancellationToken)
    {
        var resultado = await _servico.ObterFiliaisAsync(cancellationToken);

        if (resultado.Falha)
        {
            var resposta = ApiResponse<object>.Falha(resultado.Erro!);
            return resultado.TipoErro switch
            {
                ResultErrorType.NaoEncontrado => NotFound(resposta),
                ResultErrorType.Proibido => StatusCode(StatusCodes.Status403Forbidden, resposta),
                ResultErrorType.Conflito => Conflict(resposta),
                _ => BadRequest(resposta)
            };
        }

        return Ok(ApiResponse<IReadOnlyList<FilialDto>>.Ok(resultado.Valor!));
    }
}

using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Common.Bases;
using Epoca.Kpi.Api.Application.Features.Autenticacao;
using Epoca.Kpi.Api.Application.Features.SimuladorPreco;
using Epoca.Kpi.Api.Application.Features.SimuladorPreco.Dtos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Epoca.Kpi.Api.Controllers;

/// <summary>
/// Simulador de preço — só consulta. O recálculo com o preço digitado é feito na tela (D1).
///
/// <para><b>A permissão é cobrada AQUI, e não só na tela.</b> O DRE ainda barra a rotina apenas
/// pela página (AUTENTICACAO.md, "o bloqueio de permissão é de TELA"); este controller já nasce
/// lendo o claim <c>rotina</c> do token, para quem montar a chamada à mão não alcançar os
/// dados. A rotina exigida é a do DRE (decisão D4).</para>
/// </summary>
[ApiController]
[Authorize]
[Route("api/simulador-preco")]
public sealed class SimuladorPrecoController : ControllerBase
{
    private readonly SimuladorPrecoService _servico;
    private readonly IBaseAtual _baseAtual;

    public SimuladorPrecoController(SimuladorPrecoService servico, IBaseAtual baseAtual)
    {
        _servico = servico;
        _baseAtual = baseAtual;
    }

    /// <summary>
    /// Os produtos da filial e da região, com impostos, custo e preço futuro, como o SQL v1 os
    /// calcula com o preço de compra padrão dele.
    /// </summary>
    [HttpPost("consulta")]
    public async Task<IActionResult> Consultar(
        [FromBody] SimuladorPrecoFiltroDto filtro,
        CancellationToken cancellationToken)
    {
        if (!PodeAbrir())
        {
            return StatusCode(
                StatusCodes.Status403Forbidden,
                ApiResponse<object>.Falha("Você não tem acesso ao simulador de preço."));
        }

        // A matrícula vem do token assinado, nunca do corpo: é ela que decide o que a PCLIB
        // libera (D3), e aceitá-la do cliente seria deixar cada um escolher a própria permissão.
        if (!int.TryParse(User.FindFirst(GeradorDeToken.ClaimMatricula)?.Value, out var matricula))
        {
            return Unauthorized(ApiResponse<object>.Falha("Sessão inválida. Entre novamente."));
        }

        var resultado = await _servico.ConsultarAsync(filtro, matricula, cancellationToken);

        if (resultado.Falha)
        {
            return BadRequest(ApiResponse<object>.Falha(resultado.Erro!));
        }

        return Ok(ApiResponse<ConsultaSimuladorDto>.Ok(
            resultado.Valor! with { Base = BaseDto.De(_baseAtual.Base) }));
    }

    /// <summary>
    /// As filiais em que o comprador logado tem região vinculada na TAB_REG_PR_FILIAL, e qual
    /// (spec 2026-11-25-simulador-regiao-pelo-vinculo-do-comprador). A tela oferece só estas.
    /// </summary>
    [HttpGet("vinculos")]
    public async Task<IActionResult> Vinculos(CancellationToken cancellationToken)
    {
        if (!PodeAbrir())
        {
            return StatusCode(
                StatusCodes.Status403Forbidden,
                ApiResponse<object>.Falha("Você não tem acesso ao simulador de preço."));
        }

        // A matrícula vem do token assinado, nunca da URL: cada um vê só os próprios vínculos.
        if (!int.TryParse(User.FindFirst(GeradorDeToken.ClaimMatricula)?.Value, out var matricula))
        {
            return Unauthorized(ApiResponse<object>.Falha("Sessão inválida. Entre novamente."));
        }

        var resultado = await _servico.ObterVinculosAsync(matricula, cancellationToken);
        return Ok(ApiResponse<IReadOnlyList<VinculoDeRegiaoDto>>.Ok(resultado.Valor!));
    }

    private bool PodeAbrir() =>
        User.FindAll(GeradorDeToken.ClaimRotina)
            .Any(c => c.Value == RotinasDoWinthor.DreGerencial);
}

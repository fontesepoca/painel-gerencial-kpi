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

    /// <summary>
    /// Estrutura de linhas do DRE — o que a tabela exibe, em que ordem e com que cor,
    /// já incluindo as contas órfãs do período. Ainda sem os valores.
    /// Virou POST porque agora depende de filiais, período e regime.
    /// </summary>
    [HttpPost("estrutura")]
    public async Task<IActionResult> ObterEstrutura(
        [FromBody] DespesasFiltroDto filtro,
        CancellationToken cancellationToken)
    {
        var resultado = await _servico.ObterEstruturaAsync(filtro, cancellationToken);

        if (resultado.Falha)
        {
            return BadRequest(ApiResponse<object>.Falha(resultado.Erro!));
        }

        return Ok(ApiResponse<IReadOnlyList<LinhaEstruturaDto>>.Ok(resultado.Valor!));
    }

    /// <summary>
    /// Despesas do período, agregadas por grupo e mês. Etapa intermediária: ainda não é o
    /// DRE montado, é a saída bruta do `GetValorGrupo` para conferência contra a 9815.
    /// </summary>
    [HttpPost("despesas")]
    public async Task<IActionResult> ObterDespesas(
        [FromBody] DespesasFiltroDto filtro,
        CancellationToken cancellationToken)
    {
        var resultado = await _servico.ObterDespesasAsync(filtro, cancellationToken);

        if (resultado.Falha)
        {
            return BadRequest(ApiResponse<object>.Falha(resultado.Erro!));
        }

        return Ok(ApiResponse<IReadOnlyList<DespesaDto>>.Ok(resultado.Valor!));
    }

    /// <summary>
    /// Cabeçalho do DRE: faturamento, CMV e impostos. Etapa intermediária, para conferência
    /// contra a 9815 antes da montagem completa.
    /// </summary>
    [HttpPost("faturamento")]
    public async Task<IActionResult> ObterFaturamento(
        [FromBody] DespesasFiltroDto filtro,
        CancellationToken cancellationToken)
    {
        var resultado = await _servico.ObterFaturamentoAsync(filtro, cancellationToken);

        if (resultado.Falha)
        {
            return BadRequest(ApiResponse<object>.Falha(resultado.Erro!));
        }

        return Ok(ApiResponse<FaturamentoDto>.Ok(resultado.Valor!));
    }
}

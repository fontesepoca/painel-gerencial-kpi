using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Features.SimuladorPreco.Dtos;
using Epoca.Kpi.Api.Domain.Entities;
using Epoca.Kpi.Api.Domain.Interfaces;

namespace Epoca.Kpi.Api.Application.Features.SimuladorPreco;

/// <summary>
/// O simulador de preço. A API só CONSULTA: o recálculo com o preço digitado é feito na tela
/// (decisão D1), e esta camada não faz conta nenhuma sobre o que o SQL devolve.
/// </summary>
public sealed class SimuladorPrecoService
{
    private readonly ISimuladorPrecoRepository _repositorio;

    public SimuladorPrecoService(ISimuladorPrecoRepository repositorio) => _repositorio = repositorio;

    public async Task<Result<ConsultaSimuladorDto>> ConsultarAsync(
        SimuladorPrecoFiltroDto filtro,
        int matricula,
        CancellationToken cancellationToken = default)
    {
        var codFilial = filtro.CodFilial?.Trim() ?? string.Empty;

        // Só dígitos: o código vai como bind, então não é questão de injeção — é de não mandar ao
        // Oracle uma consulta de minutos para uma filial que não pode existir.
        if (codFilial.Length == 0 || !codFilial.All(char.IsAsciiDigit))
        {
            return Result<ConsultaSimuladorDto>.Invalido("Escolha uma filial.");
        }

        if (filtro.NumRegiao <= 0)
        {
            return Result<ConsultaSimuladorDto>.Invalido("Escolha uma região.");
        }

        if (filtro.CodFornec is < 0)
        {
            return Result<ConsultaSimuladorDto>.Invalido("Código de fornecedor inválido.");
        }

        var linhas = await _repositorio.ConsultarAsync(
            codFilial, filtro.NumRegiao, filtro.CodFornec, matricula, cancellationToken);

        // Lista vazia é resposta, nunca nulo: o front distingue "nenhum produto" de erro.
        return Result<ConsultaSimuladorDto>.Ok(
            new ConsultaSimuladorDto(linhas.Select(ParaDto).ToList()));
    }

    private static ProdutoSimuladoDto ParaDto(ProdutoSimulado p) => new(
        p.CodFilial, p.CodProd, p.Descricao, p.ClasseVenda,
        p.Ncm, p.CodigoTributacao, p.DescricaoTributacao, p.TipoImposto,
        p.VlUltPCompra, p.PercIpi, p.VlIpi, p.PercSt, p.VlSt,
        p.PercIcmsEnt, p.PercBaseRedEnt, p.PercIcmCusto, p.VlIcmsEnt,
        p.PerPisEnt, p.VlPisEnt, p.PerCofinsEnt, p.VlCofinsEnt,
        p.PercFreteFobEnt, p.VlFreteFobEnt,
        p.CustoAntesCbs, p.PercCbs, p.BaseCbs, p.VlCbs, p.CustoCalc,
        p.Margem, p.PercIcmsSaid, p.PerPisSaid, p.PerCofinsSaid, p.Indice, p.PrFuturo, p.PrFinal);
}

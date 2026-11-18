using Epoca.Kpi.Api.Application.Common.Bases;

namespace Epoca.Kpi.Api.Application.Features.SimuladorPreco.Dtos;

/// <summary>O filtro da consulta: igual ao SQL (D5) — uma filial, uma região, fornecedor opcional.</summary>
public record SimuladorPrecoFiltroDto(
    string CodFilial,
    int NumRegiao,
    decimal? CodFornec);

/// <summary>
/// Uma linha do simulador. <b>É o contrato da tela, não o SQL</b>: quando a v2 do SQL trocar
/// colunas, muda este record e o mapeamento no serviço, e a tela continua lendo os mesmos nomes
/// onde nada mudou.
/// </summary>
public record ProdutoSimuladoDto(
    decimal CodProd,
    string Descricao,
    string? Ncm,
    string? CodigoTributacao,
    string? DescricaoTributacao,
    string? TipoImposto,
    // Entrada
    decimal? VlUltPCompra,
    decimal? PercIpi,
    decimal? VlIpi,
    decimal? PercSt,
    decimal? VlSt,
    decimal? PercIcmsEnt,
    decimal? PercBaseRedEnt,
    decimal? PercIcmCusto,
    decimal? VlIcmsEnt,
    decimal? PerPisEnt,
    decimal? VlPisEnt,
    decimal? PerCofinsEnt,
    decimal? VlCofinsEnt,
    decimal? PercFreteFobEnt,
    decimal? VlFreteFobEnt,
    // Custo e CBS
    decimal? CustoAntesCbs,
    decimal? PercCbs,
    decimal? BaseCbs,
    decimal? VlCbs,
    decimal? CustoCalc,
    // Saída
    decimal? Margem,
    decimal? PercIcmsSaid,
    decimal? PerPisSaid,
    decimal? PerCofinsSaid,
    decimal? Indice,
    decimal? PrFuturo);

/// <summary>
/// A resposta da consulta. A <see cref="Base"/> volta junto pelo mesmo motivo do DRE: a tela
/// recusa exibir números de uma base diferente da da sessão (BIFURCACAO_DE_BASES §6).
/// </summary>
public record ConsultaSimuladorDto(
    IReadOnlyList<ProdutoSimuladoDto> Produtos,
    BaseDto? Base = null);

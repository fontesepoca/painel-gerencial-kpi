using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Common.Bases;

namespace Epoca.Kpi.Api.Application.Features.SimuladorPreco.Dtos;

/// <summary>
/// O pedido de uma página. Os três primeiros são os filtros do SQL (D5): uma filial, uma região,
/// fornecedor opcional. Os outros são da paginação no back-end (spec 2026-11-24): a página, a
/// busca, as classes de venda e os códigos do "ver só os simulados". O tamanho da página NÃO
/// vem daqui: é fixo no servidor.
/// </summary>
public record SimuladorPrecoFiltroDto(
    string CodFilial,
    int NumRegiao,
    IReadOnlyList<int>? Fornecedores,
    int Pagina = 1,
    string? Busca = null,
    IReadOnlyList<string>? Classes = null,
    IReadOnlyList<string>? Codigos = null);

/// <summary>
/// Uma linha do simulador. <b>É o contrato da tela, não o SQL</b>: quando a v2 do SQL trocar
/// colunas, muda este record e o mapeamento no serviço, e a tela continua lendo os mesmos nomes
/// onde nada mudou.
/// </summary>
public record ProdutoSimuladoDto(
    string? CodFilial,
    decimal CodProd,
    string Descricao,
    string? ClasseVenda,
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
    decimal? PrFuturo,
    decimal? PrFinal,
    // A n-ésima repetição desta chave (produto + tributação), numerada pelo Oracle: vira o #n
    // da chave da linha na tela (spec 2026-11-24-simulador-paginacao-no-backend).
    int Ocorrencia,
    // O fornecedor do produto, embaixo do código na tela (spec 2026-11-24-simulador-coluna-
    // codigo-e-fornecedor). Nulos quando o produto não tem fornecedor no cadastro.
    decimal? CodFornec,
    string? Fornecedor,
    // Da PCTRIBUTACAO, depois da Classe na tela (spec 2026-11-25-simulador-classe-de-tributacao-
    // e-cst). Nulos quando o NCM não tem tributação. No JSON: "cClassTrib" e "cst".
    string? CClassTrib,
    string? Cst);

/// <summary>
/// A resposta: UMA PÁGINA (spec 2026-11-24-simulador-paginacao-no-backend). A
/// <see cref="Base"/> volta junto pelo mesmo motivo do DRE: a tela recusa exibir números de uma
/// base diferente da da sessão (BIFURCACAO_DE_BASES §6).
/// </summary>
public record ConsultaSimuladorDto(
    PagedResult<ProdutoSimuladoDto> Pagina,
    BaseDto? Base = null);

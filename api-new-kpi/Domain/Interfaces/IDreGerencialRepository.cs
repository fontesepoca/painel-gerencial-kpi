using Epoca.Kpi.Api.Application.Features.DreGerencial;
using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Domain.Interfaces;

/// <summary>
/// Acesso a dados da rotina DRE Gerencial. Somente leitura.
/// </summary>
public interface IDreGerencialRepository
{
    /// <summary>
    /// Filiais disponíveis para o filtro, na ordem de exibição do cadastro.
    /// </summary>
    Task<IReadOnlyList<Filial>> ObterFiliaisAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Estrutura de linhas do DRE na dimensão pedida, incluindo as contas órfãs do
    /// período — as que dão rótulo ao bloco final do relatório.
    /// </summary>
    /// <param name="analise">
    /// Precisa estar implementada. Cada dimensão tem um SQL próprio na 9815, não é um
    /// parâmetro do mesmo SQL.
    /// </param>
    Task<IReadOnlyList<LinhaEstruturaDre>> ObterEstruturaAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        RegimeDre regime,
        AnaliseDre analise,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Despesas do período agregadas pela chave da dimensão e por mês. Replica o
    /// `GetValorGrupo` da 9815 — SQL validado contra o original.
    /// </summary>
    Task<IReadOnlyList<DespesaDre>> ObterDespesasAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        RegimeDre regime,
        AnaliseDre analise,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Faturamento, CMV e impostos, uma linha por mês do período. Não recebe regime:
    /// caixa e competência produzem os mesmos valores aqui.
    /// </summary>
    Task<IReadOnlyList<FaturamentoDre>> ObterFaturamentoPorMesAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        CancellationToken cancellationToken = default);
}

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
    /// Estrutura de linhas do DRE para a análise Grupo de Contas, incluindo as contas
    /// órfãs do período — as que dão rótulo ao bloco final do relatório.
    /// </summary>
    Task<IReadOnlyList<LinhaEstruturaDre>> ObterEstruturaGrupoDeContasAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        RegimeDre regime,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Despesas do período agregadas por grupo e mês, para a análise Grupo de Contas.
    /// Replica o `GetValorGrupo` da 9815 — SQL validado contra o original.
    /// </summary>
    Task<IReadOnlyList<DespesaDre>> ObterDespesasGrupoDeContasAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        RegimeDre regime,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Faturamento, CMV e impostos do período. Não recebe regime: caixa e competência
    /// produzem os mesmos valores aqui.
    /// </summary>
    Task<FaturamentoDre> ObterFaturamentoAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        CancellationToken cancellationToken = default);
}

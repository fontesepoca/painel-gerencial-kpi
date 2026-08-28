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
    /// Estrutura de linhas do DRE para a análise Grupo de Contas.
    /// Ainda sem o bloco de contas órfãs, que entra no incremento 3.
    /// </summary>
    Task<IReadOnlyList<LinhaEstruturaDre>> ObterEstruturaGrupoDeContasAsync(
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
}

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
}

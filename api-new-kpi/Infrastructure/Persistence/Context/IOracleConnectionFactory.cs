using System.Data;
using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Infrastructure.Persistence.Context;

/// <summary>
/// Fábrica de conexões com o Oracle. Os repositórios pedem uma conexão, usam e descartam — o
/// pool do ODP.NET cuida do resto, e há um pool por string de conexão, ou seja, por base.
/// </summary>
public interface IOracleConnectionFactory
{
    /// <summary>
    /// Abre uma conexão NA BASE DA SESSÃO (a do token). É o que os repositórios do DRE usam.
    /// O chamador é dono dela e deve descartá-la.
    /// </summary>
    Task<IDbConnection> CriarConexaoAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Abre uma conexão numa base ESCOLHIDA pelo chamador. Só o login (que ainda não tem
    /// token) e a saúde usam esta: todo o resto passa pela da sessão.
    /// </summary>
    Task<IDbConnection> CriarConexaoAsync(
        BaseConfigurada baseAlvo,
        CancellationToken cancellationToken = default);
}

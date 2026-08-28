using System.Data;

namespace Epoca.Kpi.Api.Infrastructure.Persistence.Context;

/// <summary>
/// Fábrica de conexões com o Oracle da Época. Os repositórios pedem uma conexão,
/// usam e descartam — o pool do ODP.NET cuida do resto.
/// </summary>
public interface IOracleConnectionFactory
{
    /// <summary>Abre uma conexão nova. O chamador é dono dela e deve descartá-la.</summary>
    Task<IDbConnection> CriarConexaoAsync(CancellationToken cancellationToken = default);

    /// <summary>Indica se há string de conexão configurada, sem tentar conectar.</summary>
    bool EstaConfigurada { get; }
}

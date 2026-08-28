using Epoca.Kpi.Api.Infrastructure.Persistence.Context;

namespace Epoca.Kpi.Api.Configurations;

public static class PersistenceConfiguration
{
    /// <summary>
    /// Acesso a dados. Dapper para as tabelas legadas do ERP Winthor e para stored procedures.
    /// EF Core entra só quando existir tabela nova com prefixo próprio — e migration
    /// **nunca** roda em tabela legada.
    /// </summary>
    public static IServiceCollection AddPersistencia(this IServiceCollection services)
    {
        services.AddSingleton<IOracleConnectionFactory, OracleConnectionFactory>();
        return services;
    }
}

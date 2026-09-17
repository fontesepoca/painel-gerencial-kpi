using Epoca.Kpi.Api.Infrastructure.Persistence;
using Epoca.Kpi.Api.Infrastructure.Persistence.Context;

namespace Epoca.Kpi.Api.Configurations;

public static class PersistenceConfiguration
{
    /// <summary>
    /// Acesso a dados. Dapper para as tabelas legadas do ERP Winthor e para stored procedures.
    /// EF Core entra só quando existir tabela nova com prefixo próprio — e migration
    /// **nunca** roda em tabela legada.
    /// </summary>
    public static IServiceCollection AddPersistencia(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddSingleton<IOracleConnectionFactory, OracleConnectionFactory>();

        // Paralelismo da consulta de faturamento. Singleton porque é configuração lida uma
        // vez no boot — mudar o grau exige reiniciar, e isso está escrito em
        // docs/PARALELISMO.md, que abre com como reverter.
        var paralelismo = configuration.GetSection(OpcoesDeParalelismo.Secao)
                                       .Get<OpcoesDeParalelismo>()
                          ?? new OpcoesDeParalelismo();

        services.AddSingleton(paralelismo);

        return services;
    }
}

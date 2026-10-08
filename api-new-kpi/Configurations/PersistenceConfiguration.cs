using Epoca.Kpi.Api.Application.Common.Bases;
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
        // A lista fechada de bases. Singleton: é configuração lida uma vez no boot.
        services.AddSingleton<RegistroDeBases>();

        services.AddHttpContextAccessor();
        services.AddScoped<IBaseAtual, BaseAtual>();

        // POR REQUISIÇÃO, e não singleton: a fábrica abre a conexão da base do token, e o
        // token é da requisição. (Era singleton quando só existia uma string de conexão.)
        services.AddScoped<IOracleConnectionFactory, OracleConnectionFactory>();


        // Paralelismo da consulta de faturamento. Singleton porque é configuração lida uma
        // vez no boot — mudar o grau exige reiniciar, e isso está escrito em
        // docs/plataforma/PARALELISMO.md, que abre com como reverter.
        var paralelismo = configuration.GetSection(OpcoesDeParalelismo.Secao)
                                       .Get<OpcoesDeParalelismo>()
                          ?? new OpcoesDeParalelismo();

        services.AddSingleton(paralelismo);

        return services;
    }
}

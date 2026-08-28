using Scalar.AspNetCore;

namespace Epoca.Kpi.Api.Configurations;

public static class OpenApiConfiguration
{
    public static IServiceCollection AddDocumentacaoApi(this IServiceCollection services)
    {
        services.AddOpenApi(options =>
        {
            options.AddDocumentTransformer((documento, _, _) =>
            {
                documento.Info.Title = "Época KPI — API";
                documento.Info.Version = "v1";
                documento.Info.Description =
                    "Rotinas do Winthor migradas para web. Um módulo por rotina.";
                return Task.CompletedTask;
            });
        });

        return services;
    }

    /// <summary>
    /// Documentação exposta só fora de produção. Em produção o schema da API é
    /// informação de superfície de ataque, não conteúdo público.
    /// </summary>
    public static WebApplication UseDocumentacaoApi(this WebApplication app)
    {
        if (!app.Environment.IsProduction())
        {
            app.MapOpenApi();
            app.MapScalarApiReference(options => options
                .WithTitle("Época KPI — API")
                .WithTheme(ScalarTheme.BluePlanet));
        }

        return app;
    }
}

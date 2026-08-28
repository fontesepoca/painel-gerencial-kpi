namespace Epoca.Kpi.Api.Configurations;

public static class CorsConfiguration
{
    public const string PoliticaPadrao = "PoliticaPadrao";

    /// <summary>
    /// Origens permitidas vêm de Cors:OrigensPermitidas no appsettings do ambiente.
    /// Sem nada configurado, libera só o front local — nunca AllowAnyOrigin.
    /// </summary>
    public static IServiceCollection AddCorsPadrao(this IServiceCollection services, IConfiguration configuration)
    {
        var origens = configuration.GetSection("Cors:OrigensPermitidas").Get<string[]>()
                      ?? ["http://localhost:3000"];

        services.AddCors(options =>
        {
            options.AddPolicy(PoliticaPadrao, policy => policy
                .WithOrigins(origens)
                .AllowAnyHeader()
                .AllowAnyMethod());
        });

        return services;
    }
}

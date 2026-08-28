using System.Reflection;
using Epoca.Kpi.Api.Application.Common;

namespace Epoca.Kpi.Api.Configurations;

/// <summary>
/// Descoberta e registro automático dos módulos de rotina.
/// </summary>
public static class ModuleInstallerExtensions
{
    /// <summary>
    /// Varre a assembly em busca de implementações de <see cref="IModuleInstaller"/> e
    /// chama Instalar em cada uma. É isto que permite acrescentar a rotina 9816 criando
    /// só a pasta dela — nenhum arquivo existente é tocado.
    /// </summary>
    public static IServiceCollection AddModulosDeRotina(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var modulos = Assembly.GetExecutingAssembly()
            .GetTypes()
            .Where(t => typeof(IModuleInstaller).IsAssignableFrom(t)
                        && t is { IsInterface: false, IsAbstract: false })
            .Select(Activator.CreateInstance)
            .Cast<IModuleInstaller>()
            .OrderBy(m => m.Nome, StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (var modulo in modulos)
        {
            modulo.Instalar(services, configuration);
        }

        // Registrado para o endpoint de diagnóstico conseguir listar o que subiu.
        services.AddSingleton<IReadOnlyList<IModuleInstaller>>(modulos);

        return services;
    }
}

using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Domain.Interfaces;
using Epoca.Kpi.Api.Infrastructure.Persistence.Repositories;

namespace Epoca.Kpi.Api.Application.Features.Preferencias;

/// <summary>
/// Preferências de tela por usuário (25/11/2026). Não é uma rotina do Winthor: é a
/// plataforma, e serve a qualquer tela da lista <see cref="PreferenciasService.Telas"/>.
/// Descoberto por reflexão, como os outros módulos.
/// </summary>
public sealed class PreferenciasModule : IModuleInstaller
{
    public string Nome => "Preferencias";

    public void Instalar(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<IPreferenciasRepository, PreferenciasRepository>();
        services.AddScoped<PreferenciasService>();
    }
}

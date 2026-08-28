using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Domain.Interfaces;
using Epoca.Kpi.Api.Infrastructure.Persistence.Repositories;

namespace Epoca.Kpi.Api.Application.Features.DreGerencial;

/// <summary>
/// Módulo da rotina DRE Gerencial (rotina 9815 do Winthor).
///
/// O host encontra esta classe por reflexão no boot, e é por isso que acrescentar uma
/// rotina nova não exige editar Program.cs — basta criar a pasta com a sua classe de
/// módulo. Ver docs/ARQUITETURA.md.
/// </summary>
public sealed class DreGerencialModule : IModuleInstaller
{
    public string Nome => "DreGerencial";

    public void Instalar(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<IDreGerencialRepository, DreGerencialRepository>();
        services.AddScoped<DreGerencialService>();
    }
}

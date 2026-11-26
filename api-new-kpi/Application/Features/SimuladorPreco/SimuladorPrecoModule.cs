using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Domain.Interfaces;
using Epoca.Kpi.Api.Infrastructure.Persistence.Repositories;

namespace Epoca.Kpi.Api.Application.Features.SimuladorPreco;

/// <summary>
/// Módulo do simulador de preço — tela nova, sem rotina correspondente no Winthor. A permissão
/// é a do DRE (9815, decisão D4). Descoberto por reflexão; o <c>Program.cs</c> não é tocado.
/// Spec: <c>docs/superpowers/specs/2026-11-18-simulador-de-preco-design.md</c>.
/// </summary>
public sealed class SimuladorPrecoModule : IModuleInstaller
{
    public string Nome => "SimuladorPreco";

    public void Instalar(IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<ISimuladorPrecoRepository, SimuladorPrecoRepository>();
        services.AddScoped<SimuladorPrecoService>();
    }
}

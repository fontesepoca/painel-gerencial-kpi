using Epoca.Kpi.Api.Application.Common;

namespace Epoca.Kpi.Api.Application.Features.DreGerencial;

/// <summary>
/// Módulo da rotina DRE Gerencial (rotina 9815 do Winthor).
///
/// Na Fase 1 ele existe só para provar o mecanismo de descoberta automática: o host
/// encontra esta classe por reflexão e a lista aparece em GET /api/health.
/// Nenhuma regra de negócio da 9815 é implementada aqui ainda — isso é Fase 4.
///
/// Para criar o módulo da próxima rotina, copie o padrão: nova pasta em
/// Application/Features/, uma classe implementando IModuleInstaller, e pronto.
/// Nenhum arquivo existente precisa ser alterado.
/// </summary>
public sealed class DreGerencialModule : IModuleInstaller
{
    public string Nome => "DreGerencial";

    public void Instalar(IServiceCollection services, IConfiguration configuration)
    {
        // Fase 4: registrar aqui IDreGerencialRepository, as queries Dapper e os
        // serviços de aplicação desta rotina.
    }
}

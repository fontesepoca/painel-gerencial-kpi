namespace Epoca.Kpi.Api.Application.Common;

/// <summary>
/// Contrato de um módulo de rotina. Cada rotina migrada do Winthor implementa esta
/// interface uma vez, dentro da sua própria pasta em Application/Features/.
///
/// O host descobre as implementações por reflexão no boot (ver
/// Configurations/ModuleInstallerExtensions.cs), então **adicionar uma rotina nova não
/// exige editar Program.cs nem nenhum arquivo existente** — basta criar a pasta com a
/// sua classe de módulo. Essa é a decisão de arquitetura da Fase 1: monólito modular
/// com registro por convenção.
/// </summary>
public interface IModuleInstaller
{
    /// <summary>Nome do módulo, usado em log de boot e no endpoint de diagnóstico.</summary>
    string Nome { get; }

    /// <summary>Registra os serviços, repositórios e queries que só este módulo usa.</summary>
    void Instalar(IServiceCollection services, IConfiguration configuration);
}

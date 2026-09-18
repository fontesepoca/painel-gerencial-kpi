using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Domain.Interfaces;
using Epoca.Kpi.Api.Infrastructure.Persistence.Repositories;

namespace Epoca.Kpi.Api.Application.Features.Autenticacao;

/// <summary>
/// Módulo de autenticação. Descoberto por reflexão no boot, como as rotinas.
///
/// <para>Ele não é uma rotina do Winthor, mas cabe no mesmo formato: registra o que precisa e
/// não obriga ninguém a editar <c>Program.cs</c>. A configuração do <c>JwtBearer</c> não mora
/// aqui — ela mexe no pipeline HTTP, que é assunto de <c>Configurations/</c>.</para>
/// </summary>
public sealed class AutenticacaoModule : IModuleInstaller
{
    public string Nome => "Autenticacao";

    public void Instalar(IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<OpcoesDeToken>(configuration.GetSection(OpcoesDeToken.Secao));

        services.AddScoped<IAutenticacaoRepository, AutenticacaoRepository>();
        services.AddScoped<AutenticacaoService>();

        // Singleton: o gerador guarda a credencial de assinatura já montada, e derivar a
        // chave HMAC a cada login seria trabalho repetido sem motivo.
        services.AddSingleton<GeradorDeToken>();
    }
}

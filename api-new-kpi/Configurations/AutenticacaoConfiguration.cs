using System.Text;
using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Features.Autenticacao;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace Epoca.Kpi.Api.Configurations;

/// <summary>
/// Validação do JWT em cada requisição — o outro lado do <see cref="GeradorDeToken"/>.
/// </summary>
public static class AutenticacaoConfiguration
{
    public static IServiceCollection AddAutenticacaoJwt(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var opcoes = configuration.GetSection(OpcoesDeToken.Secao).Get<OpcoesDeToken>()
                     ?? new OpcoesDeToken();
        opcoes.Validar();

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = opcoes.Emissor,

                    ValidateAudience = true,
                    ValidAudience = opcoes.Audiencia,

                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(
                        Encoding.UTF8.GetBytes(opcoes.Chave)),

                    ValidateLifetime = true,

                    // O padrão do .NET é CINCO MINUTOS de tolerância no relógio, o que estende
                    // silenciosamente a validade de todo token. Trinta segundos cobrem a
                    // diferença real entre máquinas da mesma rede; o resto era só folga.
                    ClockSkew = TimeSpan.FromSeconds(30)
                };

                // O cabeçalho diz POR QUE o token foi recusado — expirado, assinatura inválida.
                // Sem isso, o BFF só vê 401 e não tem como distinguir "renove a sessão" de
                // "algo está errado com a configuração".
                options.IncludeErrorDetails = true;

                options.Events = new JwtBearerEvents
                {
                    // Sem esta linha a resposta 401 sai com corpo vazio, e o front precisa
                    // tratar um caso a mais só porque esta rota respondeu diferente das outras.
                    OnChallenge = async contexto =>
                    {
                        contexto.HandleResponse();
                        contexto.Response.StatusCode = StatusCodes.Status401Unauthorized;
                        contexto.Response.ContentType = "application/json; charset=utf-8";

                        await contexto.Response.WriteAsJsonAsync(
                            ApiResponse<object>.Falha("Sessão expirada ou ausente. Entre novamente."));
                    }
                };
            });

        services.AddAuthorization();

        return services;
    }
}

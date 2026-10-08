using System.Text;
using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Common.Bases;
using Epoca.Kpi.Api.Application.Features.Autenticacao;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace Epoca.Kpi.Api.Configurations;

/// <summary>
/// Validação do JWT em cada requisição — o outro lado do <see cref="GeradorDeToken"/>.
/// </summary>
public static class AutenticacaoConfiguration
{
    /// <summary>A razão que <c>OnTokenValidated</c> dá e o <c>OnChallenge</c> reconhece.</summary>
    private const string SessaoSemBase = "sessao-sem-base";

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
                    // A BASE É PARTE DA IDENTIDADE. Um token sem o claim `base` (emitido antes
                    // da bifurcação) ou com uma base que saiu da configuração não vale: a API
                    // não tem como saber em que Oracle consultar, e adivinhar é o erro que
                    // esta mudança existe para impedir.
                    OnTokenValidated = contexto =>
                    {
                        var registro = contexto.HttpContext.RequestServices
                            .GetRequiredService<RegistroDeBases>();
                        var id = contexto.Principal?.FindFirst(BaseAtual.ClaimBase)?.Value;

                        if (registro.Buscar(id) is null)
                        {
                            contexto.Fail(SessaoSemBase);
                        }

                        return Task.CompletedTask;
                    },

                    // Sem esta linha a resposta 401 sai com corpo vazio, e o front precisa
                    // tratar um caso a mais só porque esta rota respondeu diferente das outras.
                    OnChallenge = async contexto =>
                    {
                        contexto.HandleResponse();
                        contexto.Response.StatusCode = StatusCodes.Status401Unauthorized;
                        contexto.Response.ContentType = "application/json; charset=utf-8";

                        // Os dois 401 pedem a mesma ação (entrar de novo), mas dizem coisas
                        // diferentes: um é sessão que venceu, o outro é sessão que a
                        // atualização invalidou. Quem lê o segundo não deve achar que errou.
                        var anterior = contexto.AuthenticateFailure?.Message == SessaoSemBase;
                        var mensagem = anterior
                            ? "Sua sessão é anterior a esta atualização. Entre de novo."
                            : "Sessão expirada ou ausente. Entre novamente.";

                        await contexto.Response.WriteAsJsonAsync(ApiResponse<object>.Falha(mensagem));
                    }
                };
            });

        services.AddAuthorization();

        return services;
    }
}

using System.Net;
using System.Text.Json;
using Epoca.Kpi.Api.Application.Common;

namespace Epoca.Kpi.Api.Middleware;

/// <summary>
/// Rede de segurança do pipeline: qualquer exception que escape vira uma resposta no
/// envelope ApiResponse, com o detalhe técnico apenas no log. Fluxo de negócio previsível
/// não passa por aqui — isso é papel do Result&lt;T&gt;.
/// </summary>
public sealed class GlobalExceptionMiddleware
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _logger;
    private readonly IHostEnvironment _ambiente;

    public GlobalExceptionMiddleware(
        RequestDelegate next,
        ILogger<GlobalExceptionMiddleware> logger,
        IHostEnvironment ambiente)
    {
        _next = next;
        _logger = logger;
        _ambiente = ambiente;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception excecao)
        {
            _logger.LogError(excecao, "Erro não tratado em {Metodo} {Caminho}",
                context.Request.Method, context.Request.Path);

            if (context.Response.HasStarted)
            {
                // Resposta já começou a ser escrita: não dá para trocar o status.
                throw;
            }

            context.Response.Clear();
            context.Response.StatusCode = (int)HttpStatusCode.InternalServerError;
            context.Response.ContentType = "application/json; charset=utf-8";

            // Fora de Development a mensagem é genérica: stack trace e detalhe de
            // conexão não vão para o cliente.
            var resposta = ApiResponse.Falha(
                "Erro interno ao processar a requisição.",
                _ambiente.IsDevelopment() ? [excecao.Message] : null);

            await context.Response.WriteAsync(JsonSerializer.Serialize(resposta, JsonOptions));
        }
    }
}

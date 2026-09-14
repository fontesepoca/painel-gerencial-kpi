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
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            // O CLIENTE DESISTIU — fechou a aba, recarregou a página, perdeu a rede. Não é
            // erro nosso, e tratá-lo como erro enchia o log de stack trace assustador para
            // um evento normal: a apuração por ano leva minutos, e nesse tempo alguém
            // recarregar a tela é rotina.
            //
            // Não há resposta a escrever: a conexão já não existe. O log fica em
            // Information porque o dado é útil — diz que a consulta rodou à toa —, e não em
            // Warning, porque não há nada a corrigir.
            _logger.LogInformation(
                "Requisição cancelada pelo cliente em {Metodo} {Caminho}",
                context.Request.Method, context.Request.Path);
        }
        catch (OperationCanceledException excecao)
        {
            // O cancelamento veio de DENTRO: é o `commandTimeout` do ODP.NET desistindo da
            // consulta. A distinção importa porque as duas causas se parecem no log e pedem
            // ações opostas — uma é do usuário, a outra é nossa.
            //
            // Em 11/09/2026 esta foi a primeira ocorrência da rotina, apurando 2025 e 2026
            // no modo por ano: os 600 s fixos do faturamento tinham sido calibrados para
            // quatro meses, e o modo por ano pede doze. Ver `FolegoDaApuracao`.
            _logger.LogWarning(excecao,
                "Consulta cancelada por tempo limite em {Metodo} {Caminho}",
                context.Request.Method, context.Request.Path);

            if (context.Response.HasStarted)
            {
                throw;
            }

            context.Response.Clear();
            context.Response.StatusCode = (int)HttpStatusCode.GatewayTimeout;
            context.Response.ContentType = "application/json; charset=utf-8";

            // A mensagem diz o que fazer, e não só o que houve: quem apura um ano inteiro
            // com muitas filiais precisa saber que o caminho é reduzir o pedido.
            var aviso = ApiResponse.Falha(
                "A consulta passou do tempo limite. Reduza o período ou o número de filiais — " +
                "no modo por ano, cada coluna é uma varredura de doze meses da base.");

            await context.Response.WriteAsync(JsonSerializer.Serialize(aviso, JsonOptions));
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

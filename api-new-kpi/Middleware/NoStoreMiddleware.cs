namespace Epoca.Kpi.Api.Middleware;

/// <summary>
/// Marca toda resposta como não-cacheável. São dados financeiros: um proxy ou o próprio
/// navegador guardando um DRE e devolvendo depois para outro filtro seria erro grave e
/// silencioso — o usuário veria número velho achando que é o de agora.
/// </summary>
public sealed class NoStoreMiddleware
{
    private readonly RequestDelegate _next;

    public NoStoreMiddleware(RequestDelegate next) => _next = next;

    public Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(() =>
        {
            var headers = context.Response.Headers;
            headers.CacheControl = "no-store, no-cache, must-revalidate, max-age=0";
            headers.Pragma = "no-cache";
            headers.Expires = "0";
            return Task.CompletedTask;
        });

        return _next(context);
    }
}

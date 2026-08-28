namespace Epoca.Kpi.Api.Application.Common;

/// <summary>
/// Envelope HTTP padrão da API. Toda resposta — sucesso ou erro — sai neste formato,
/// para o front ter um contrato único em vez de adivinhar o formato de cada rota.
/// </summary>
public record ApiResponse<T>
{
    public required bool Sucesso { get; init; }
    public T? Dados { get; init; }
    public string? Mensagem { get; init; }
    public IReadOnlyList<string>? Erros { get; init; }

    public static ApiResponse<T> Ok(T dados, string? mensagem = null) =>
        new() { Sucesso = true, Dados = dados, Mensagem = mensagem };

    public static ApiResponse<T> Falha(string mensagem, IReadOnlyList<string>? erros = null) =>
        new() { Sucesso = false, Mensagem = mensagem, Erros = erros };
}

/// <summary>
/// Envelope para respostas sem corpo de dados (204, confirmações).
/// </summary>
public record ApiResponse : ApiResponse<object>
{
    public static ApiResponse Ok(string mensagem) =>
        new() { Sucesso = true, Mensagem = mensagem };

    public static new ApiResponse Falha(string mensagem, IReadOnlyList<string>? erros = null) =>
        new() { Sucesso = false, Mensagem = mensagem, Erros = erros };
}

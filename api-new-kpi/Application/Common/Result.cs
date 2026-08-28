namespace Epoca.Kpi.Api.Application.Common;

/// <summary>
/// Resultado de uma operação de negócio. Substitui exceptions no fluxo previsível:
/// "não encontrado", "período inválido", "filial sem permissão" são estados esperados,
/// não erros excepcionais. Exception fica reservada para falha real de infraestrutura,
/// que o GlobalExceptionMiddleware captura.
/// </summary>
public readonly struct Result<T>
{
    private Result(bool sucesso, T? valor, string? erro, ResultErrorType tipoErro)
    {
        Sucesso = sucesso;
        Valor = valor;
        Erro = erro;
        TipoErro = tipoErro;
    }

    public bool Sucesso { get; }
    public T? Valor { get; }
    public string? Erro { get; }
    public ResultErrorType TipoErro { get; }

    public bool Falha => !Sucesso;

    public static Result<T> Ok(T valor) => new(true, valor, null, ResultErrorType.Nenhum);

    public static Result<T> Invalido(string erro) => new(false, default, erro, ResultErrorType.Validacao);

    public static Result<T> NaoEncontrado(string erro) => new(false, default, erro, ResultErrorType.NaoEncontrado);

    public static Result<T> Conflito(string erro) => new(false, default, erro, ResultErrorType.Conflito);

    public static Result<T> Proibido(string erro) => new(false, default, erro, ResultErrorType.Proibido);

    /// <summary>
    /// Encadeia uma transformação sem desembrulhar manualmente. Se já falhou, propaga o erro.
    /// </summary>
    public Result<TNovo> Map<TNovo>(Func<T, TNovo> transformacao) =>
        Sucesso
            ? Result<TNovo>.Ok(transformacao(Valor!))
            : new Result<TNovo>(false, default, Erro, TipoErro);
}

public enum ResultErrorType
{
    Nenhum = 0,
    Validacao = 1,
    NaoEncontrado = 2,
    Conflito = 3,
    Proibido = 4
}

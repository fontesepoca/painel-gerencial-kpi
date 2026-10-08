using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Application.Common.Bases;

/// <summary>
/// A base da requisição em curso — a do token, e só a do token.
/// </summary>
public interface IBaseAtual
{
    /// <summary>
    /// A base da sessão. <b>Lança se não houver:</b> uma consulta sem base não roda em
    /// nenhuma. Não existe "a Época por padrão" — foi exatamente isso que a bifurcação veio
    /// impedir.
    /// </summary>
    BaseConfigurada Base { get; }
}

/// <inheritdoc cref="IBaseAtual"/>
public sealed class BaseAtual : IBaseAtual
{
    /// <summary>O claim do JWT que diz de que base é a sessão.</summary>
    public const string ClaimBase = "base";

    private readonly IHttpContextAccessor _http;
    private readonly RegistroDeBases _registro;
    private BaseConfigurada? _resolvida;

    public BaseAtual(IHttpContextAccessor http, RegistroDeBases registro)
    {
        _http = http;
        _registro = registro;
    }

    public BaseConfigurada Base => _resolvida ??= Resolver();

    private BaseConfigurada Resolver()
    {
        var id = _http.HttpContext?.User.FindFirst(ClaimBase)?.Value;

        return _registro.Buscar(id) ?? throw new InvalidOperationException(
            "Esta requisição não carrega uma base válida. Uma consulta nunca roda sem base. " +
            "Isto indica uma rota anônima que pediu conexão, ou um token sem o claim 'base' " +
            "que passou pela validação — a segunda coisa é defeito na validação do JWT.");
    }
}

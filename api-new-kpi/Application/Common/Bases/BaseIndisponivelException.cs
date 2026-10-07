using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Application.Common.Bases;

/// <summary>
/// O banco da base não respondeu. Vira 503 com a mensagem certa — e <b>nunca</b> 401: quem
/// vê "senha incorreta" para um banco fora do ar vai trocar a senha para resolver um problema
/// que não é dela.
/// </summary>
public sealed class BaseIndisponivelException : Exception
{
    public BaseIndisponivelException(BaseConfigurada baseAlvo, string? codigoOra, Exception interna)
        : base($"A base {baseAlvo.Rotulo} não respondeu ({codigoOra ?? "sem código ORA"}).", interna)
    {
        BaseId = baseAlvo.Id;
        Rotulo = baseAlvo.Rotulo;
        CodigoOra = codigoOra;
    }

    public string BaseId { get; }

    public string Rotulo { get; }

    /// <summary>Ex.: <c>ORA-12541</c>. Útil à TI; não é para a tela de produção.</summary>
    public string? CodigoOra { get; }
}

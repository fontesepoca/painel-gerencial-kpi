using Oracle.ManagedDataAccess.Client;

namespace Epoca.Kpi.Api.Infrastructure.Persistence;

/// <summary>
/// Que falha do Oracle vale UMA nova tentativa na exportação em lote (06/11/2026).
///
/// <para>Só o que passa sozinho: tempo esgotado (ORA-01013 é como o ODP.NET avisa o
/// <c>commandTimeout</c>) e conexão que caiu ou não abriu. Erro de SQL, de privilégio ou de
/// dado repetiria igual — tentar de novo só dobraria a espera.</para>
///
/// <para>Mora na infraestrutura porque <c>OracleException</c> é do driver; o serviço pergunta
/// pelo repositório (<c>EhFalhaTransitoria</c>).</para>
/// </summary>
public static class FalhaTransitoria
{
    public static readonly IReadOnlySet<int> Codigos =
        new HashSet<int> { 1013, 3113, 3114, 3135, 12170, 12541, 12571 };

    /// <remarks>
    /// <para><b>A falha costuma vir embrulhada.</b> A conexão que não abre chega como
    /// <c>BaseIndisponivelException</c> (o <c>OracleConnectionFactory</c> embrulha o
    /// <c>OracleException</c>), por isso o que decide é a exceção de dentro.</para>
    ///
    /// <para><b><c>OperationCanceledException</c> é o <c>commandTimeout</c> do ODP.NET</b>
    /// (visto em 11/09/2026 — ver <c>GlobalExceptionMiddleware</c>). O cancelamento pedido pela
    /// pessoa também chega assim, e quem o separa é o chamador: o serviço só pergunta aqui
    /// quando o token dele NÃO foi cancelado.</para>
    /// </remarks>
    public static bool Eh(Exception erro) => erro switch
    {
        OracleException oracle => Codigos.Contains(oracle.Number),
        TimeoutException => true,
        OperationCanceledException => true,
        AggregateException { InnerExceptions.Count: 1 } agregada => Eh(agregada.InnerExceptions[0]),
        { InnerException: { } interna } => Eh(interna),
        _ => false,
    };
}

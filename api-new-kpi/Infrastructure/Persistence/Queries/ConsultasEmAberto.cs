namespace Epoca.Kpi.Api.Infrastructure.Persistence.Queries;

/// <summary>
/// A versão EM ABERTO das consultas de despesa e do detalhamento — a coluna PROVISIONADO
/// (14/10/2026, regime competência).
///
/// <para><b>A mesma consulta, trocando só o pagamento</b>: <c>DTPAGTO IS NOT NULL</c> vira
/// <c>DTPAGTO IS NULL</c>, e o ramo de venda de ativo (<c>PCNFSAID</c>/<c>PCPREST</c>, receita
/// já recebida) fica vazio com <c>AND 1 = 0</c>. Filtros, rateio e marcadores da base
/// continuam os mesmos — um título pago sai do Provisionado e entra no Valor da mesma
/// linha.</para>
///
/// <para><b>Derivada, e não uma constante a mais.</b> Uma cópia das quatro consultas
/// divergiria da original na primeira correção feita só em uma. O ramo é desligado, não
/// removido, para a <b>lista de binds ser idêntica</b> nas duas versões: o ODP.NET liga por
/// posição. A dc92 confere as duas coisas.</para>
///
/// <para><b>O TIPOLANC entra na divisão (22/10/2026, decisão do Gabriel).</b> A validação
/// principal é o pagamento: título pago é REALIZADO, qualquer que seja o <c>TIPOLANC</c>. Título
/// NÃO pago com <c>TIPOLANC = 'C'</c> (confirmado) também é realizado; o PROVISIONADO fica só
/// com o não pago e não confirmado. As duas versões se complementam — todo lançamento cai em
/// exatamente uma. Vale só em competência, que é onde o Provisionado existe: em caixa o
/// realizado continua sendo só o que foi pago, e a consulta segue a da 9815. É divergência
/// aprovada em relação à 9815, registrada no DIVERGENCIAS.md (§20).</para>
///
/// <para><b>Mora num arquivo próprio de propósito.</b> O dc86 compara os arquivos de
/// consultas inteiros com a última mudança aprovada do SQL da Época; um método a mais lá
/// dentro o faria acusar mudança onde o SQL não mudou.</para>
/// </summary>
public static class ConsultasEmAberto
{
    /// <summary>Pago: o filtro da 9815, e o realizado em caixa.</summary>
    private const string Pago = "WHERE DTPAGTO IS NOT NULL";

    /// <summary>Realizado em competência: pago OU confirmado.</summary>
    private const string PagoOuConfirmado = "WHERE (DTPAGTO IS NOT NULL OR TIPOLANC = 'C')";

    /// <summary>
    /// Provisionado: não pago E não confirmado. <c>NVL</c> porque <c>TIPOLANC</c> nulo não é
    /// <c>'C'</c> — sem ele, <c>NULL &lt;&gt; 'C'</c> não é verdadeiro e o título sumiria das
    /// duas versões.
    /// </summary>
    private const string AbertoNaoConfirmado = "WHERE DTPAGTO IS NULL AND NVL(TIPOLANC, 'X') <> 'C'";

    /// <summary>Uma das quatro <c>DreGerencialQueries.Despesas*</c>, em aberto.</summary>
    public static string Despesas(string sqlDespesas) =>
        TrocarUmaVez(
            TrocarUmaVez(sqlDespesas, Pago, AbertoNaoConfirmado),
            "nf.codfilial IN ({3})",
            "nf.codfilial IN ({3}) AND 1 = 0");

    /// <summary>
    /// Uma das quatro <c>DreGerencialQueries.Despesas*</c>, realizada em COMPETÊNCIA: pago ou
    /// confirmado. O ramo de venda de ativo fica como está — ele é receita recebida.
    /// </summary>
    public static string RealizadoEmCompetencia(string sqlDespesas) =>
        TrocarUmaVez(sqlDespesas, Pago, PagoOuConfirmado);

    /// <summary><see cref="DreDetalheQueries.Lancamentos"/>, em aberto.</summary>
    public static string Lancamentos(string sqlLancamentos) =>
        TrocarUmaVez(
            TrocarUmaVez(sqlLancamentos, Pago + ") FIN", AbertoNaoConfirmado + ") FIN"),
            "nf.codfilial IN ({2})",
            "nf.codfilial IN ({2}) AND 1 = 0");

    /// <summary><see cref="DreDetalheQueries.Lancamentos"/>, realizado em competência.</summary>
    public static string LancamentosRealizadosEmCompetencia(string sqlLancamentos) =>
        TrocarUmaVez(sqlLancamentos, Pago + ") FIN", PagoOuConfirmado + ") FIN");

    /// <summary>
    /// Troca um trecho que tem de aparecer <b>exatamente uma vez</b>. Zero ou duas vezes
    /// lança: a consulta mudou, e seguir com a troca pela metade daria um provisionado com
    /// pagos dentro, sem erro nenhum.
    /// </summary>
    private static string TrocarUmaVez(string sql, string de, string para)
    {
        var primeira = sql.IndexOf(de, StringComparison.Ordinal);
        if (primeira < 0 || sql.IndexOf(de, primeira + de.Length, StringComparison.Ordinal) >= 0)
        {
            throw new InvalidOperationException(
                $"A versão em aberto espera '{de}' exatamente uma vez na consulta.");
        }

        return string.Concat(sql.AsSpan(0, primeira), para, sql.AsSpan(primeira + de.Length));
    }
}

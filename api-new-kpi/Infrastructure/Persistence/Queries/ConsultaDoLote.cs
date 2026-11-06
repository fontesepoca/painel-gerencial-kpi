namespace Epoca.Kpi.Api.Infrastructure.Persistence.Queries;

/// <summary>
/// A versão EM LOTE de <see cref="DreDetalheQueries.Lancamentos"/> — a exportação de muitas
/// linhas (06/11/2026, pedido do Gabriel).
///
/// <para><b>Uma consulta por bloco e por coluna, com todas as linhas do bloco de uma vez.</b>
/// O recorte <c>WHERE {3} = :chave</c> vira <c>WHERE {3} IN (:chave0, ...)</c>, e o SELECT
/// externo devolve a própria expressão do recorte como <c>CHAVELOTE</c> — é por ela que a API
/// devolve a cada linha os lançamentos dela. O filtro de datas é o de sempre, com o intervalo
/// da coluna: o lote não redistribui lançamento entre meses.</para>
///
/// <para><b>Derivada, e não uma cópia</b>, pelo mesmo motivo de <see cref="ConsultasEmAberto"/>:
/// uma correção no detalhamento vale para a exportação sem ninguém lembrar. E mora num
/// arquivo próprio porque o dc86 compara <c>DreDetalheQueries.cs</c> inteiro.</para>
///
/// <para>Os binds ficam na mesma ordem: a coluna nova não tem bind, e as chaves ocupam a
/// posição de <c>:chave</c>. O dc105 confere.</para>
/// </summary>
public static class ConsultaDoLote
{
    private const string SelectExterno = "SELECT RECNUM, EXCLUSIVO,";
    private const string Recorte = "WHERE {3} = :chave";

    public static string Lancamentos(string sqlLancamentos, int chaves)
    {
        if (chaves < 1)
        {
            throw new ArgumentOutOfRangeException(nameof(chaves), chaves, "O lote precisa de ao menos uma chave.");
        }

        var lista = string.Join(", ", Enumerable.Range(0, chaves).Select(i => $":chave{i}"));

        return TrocarUmaVez(
            TrocarUmaVez(sqlLancamentos, SelectExterno, "SELECT {3} AS CHAVELOTE, RECNUM, EXCLUSIVO,"),
            Recorte,
            "WHERE {3} IN (" + lista + ")");
    }

    /// <summary>Zero ou duas ocorrências lançam: a consulta mudou e a troca sairia pela metade.</summary>
    private static string TrocarUmaVez(string sql, string de, string para)
    {
        var primeira = sql.IndexOf(de, StringComparison.Ordinal);
        if (primeira < 0 || sql.IndexOf(de, primeira + de.Length, StringComparison.Ordinal) >= 0)
        {
            throw new InvalidOperationException(
                $"A consulta do lote espera '{de}' exatamente uma vez no detalhamento.");
        }

        return string.Concat(sql.AsSpan(0, primeira), para, sql.AsSpan(primeira + de.Length));
    }
}

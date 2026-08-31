namespace Epoca.Kpi.Api.Application.Features.DreGerencial;

/// <summary>
/// Um mês do período apurado. As colunas da tela saem daqui.
/// </summary>
public sealed record PeriodoDre(string MesAno, string Rotulo)
{
    private static readonly string[] Meses =
    [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
    ];

    /// <summary>
    /// Meses do intervalo, do mais antigo ao mais recente.
    ///
    /// <para><b>A lista sai do período pedido, não dos dados.</b> Mês sem movimento não
    /// aparece no retorno das consultas, e se a coluna viesse dos dados ela sumiria da
    /// tela — o usuário pediu junho e julho, tem que ver junho e julho, ainda que um
    /// deles esteja zerado.</para>
    /// </summary>
    public static IReadOnlyList<PeriodoDre> Entre(DateOnly inicio, DateOnly fim)
    {
        var periodos = new List<PeriodoDre>();
        var cursor = new DateOnly(inicio.Year, inicio.Month, 1);
        var ultimo = new DateOnly(fim.Year, fim.Month, 1);

        while (cursor <= ultimo)
        {
            periodos.Add(new PeriodoDre(
                MesAno: $"{cursor.Month:D2}/{cursor.Year}",
                Rotulo: $"{Meses[cursor.Month - 1]}/{cursor.Year}"));

            cursor = cursor.AddMonths(1);
        }

        return periodos;
    }
}

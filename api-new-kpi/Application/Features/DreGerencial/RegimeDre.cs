namespace Epoca.Kpi.Api.Application.Features.DreGerencial;

/// <summary>
/// Regime de apuração. A única coisa que o regime muda no DRE são **as datas das despesas** —
/// receita, deduções e CMV são idênticas nos dois (verificado no trace da 9815).
///
/// <para>
/// As duas expressões são **trechos de SQL**, não valores, e entram no template por
/// <c>string.Format</c>. Não vêm de entrada do usuário: são constantes desta classe, e o
/// código do regime é validado contra a lista antes de chegar aqui.
/// </para>
/// </summary>
public sealed record RegimeDre(
    string Codigo,
    string Rotulo,
    string ExpressaoBucket,
    string ExpressaoFiltro)
{
    /// <summary>
    /// Caixa: filtra e distribui pela data de pagamento, com vencimento como fallback.
    /// </summary>
    public static readonly RegimeDre Caixa = new(
        Codigo: "caixa",
        Rotulo: "Caixa",
        ExpressaoBucket: "nvl(FIN.DTPAGTO,fin.DTVENC)",
        ExpressaoFiltro: "nvl(FIN.DTPAGTO,fin.DTVENC)");

    /// <summary>
    /// Competência: **filtra** por `DTCOMPETENCIA` pura, mas **distribui** por
    /// `nvl(DTCOMPETENCIA, DTVENC)`. A assimetria é da 9815 e está replicada de propósito.
    /// </summary>
    public static readonly RegimeDre Competencia = new(
        Codigo: "competencia",
        Rotulo: "Competência",
        ExpressaoBucket: "nvl(FIN.DTCOMPETENCIA,fin.DTVENC)",
        ExpressaoFiltro: "FIN.dtcompetencia");

    public static readonly IReadOnlyList<RegimeDre> Todos = [Caixa, Competencia];

    /// <summary>Resolve o código vindo da API. Devolve <c>null</c> se não existir.</summary>
    public static RegimeDre? Resolver(string? codigo) =>
        Todos.FirstOrDefault(r => string.Equals(r.Codigo, codigo, StringComparison.OrdinalIgnoreCase));
}

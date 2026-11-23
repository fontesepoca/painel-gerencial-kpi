namespace Epoca.Kpi.Api.Domain.Entities;

/// <summary>
/// Uma linha do simulador de preço, como o SQL a devolve (<c>SimuladorPrecoQueries.Consulta</c>).
///
/// <para><b>Os nomes espelham os aliases do SELECT de fora, sem sublinhado</b>, para o Dapper
/// casar. Numérico anulável em tudo que pode vir de LEFT JOIN ou de divisão: <c>PRFUTURO</c>
/// é nulo quando o índice é zero (<c>NULLIF</c>), e a CBS vem de LEFT JOIN.</para>
/// </summary>
public class ProdutoSimulado
{
    /// <summary>A filial da linha (SQL v2). A consulta já é de uma filial só.</summary>
    public string? CodFilial { get; init; }
    public decimal CodProd { get; init; }
    public string Descricao { get; init; } = string.Empty;
    /// <summary><c>PCPRODUT.CLASSEVENDA</c> (SQL v2).</summary>
    public string? ClasseVenda { get; init; }
    public string? Ncm { get; init; }
    public string? CodigoTributacao { get; init; }
    public string? DescricaoTributacao { get; init; }
    public string? TipoImposto { get; init; }

    // ── Entrada ──
    public decimal? VlUltPCompra { get; init; }
    public decimal? PercIpi { get; init; }
    public decimal? VlIpi { get; init; }
    public decimal? PercSt { get; init; }
    public decimal? VlSt { get; init; }
    public decimal? PercIcmsEnt { get; init; }
    public decimal? PercBaseRedEnt { get; init; }
    public decimal? PercIcmCusto { get; init; }
    public decimal? VlIcmsEnt { get; init; }
    public decimal? PerPisEnt { get; init; }
    public decimal? VlPisEnt { get; init; }
    public decimal? PerCofinsEnt { get; init; }
    public decimal? VlCofinsEnt { get; init; }
    public decimal? PercFreteFobEnt { get; init; }
    public decimal? VlFreteFobEnt { get; init; }

    // ── Custo e CBS ──
    public decimal? CustoAntesCbs { get; init; }
    public decimal? PercCbs { get; init; }
    public decimal? BaseCbs { get; init; }
    public decimal? VlCbs { get; init; }
    public decimal? CustoCalc { get; init; }

    // ── Saída ──
    public decimal? Margem { get; init; }
    public decimal? PercIcmsSaid { get; init; }
    public decimal? PerPisSaid { get; init; }
    public decimal? PerCofinsSaid { get; init; }
    public decimal? Indice { get; init; }
    public decimal? PrFuturo { get; init; }
    /// <summary><c>PRECOFINAL</c> do SQL v2: o preço futuro mais o <c>VLST</c> da tabela de preço.</summary>
    public decimal? PrFinal { get; init; }
}

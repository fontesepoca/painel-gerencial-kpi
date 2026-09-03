namespace Epoca.Kpi.Api.Domain.Entities;

/// <summary>
/// Cabeçalho do DRE de **um mês**: faturamento, CMV e impostos.
/// A consulta devolve uma linha por mês do período.
///
/// <para>
/// <b>Não depende do regime.</b> Caixa e competência produzem exatamente os mesmos valores
/// aqui — o regime só muda as datas das despesas.
/// </para>
/// </summary>
public class FaturamentoDre
{
    /// <summary>Mês da coluna, no formato `mm/yyyy`.</summary>
    public string MesAno { get; init; } = string.Empty;

    /// <summary>`(+) RECEITA BRUTA` — soma de preço de tabela × quantidade.</summary>
    public decimal ReceitaBruta { get; init; }

    /// <summary>`(-) ABAT./DESC.` — diferença entre preço de tabela e preço praticado.</summary>
    public decimal AbatDesc { get; init; }

    /// <summary>`(-) DEVOLUCAO`.</summary>
    public decimal Devolucao { get; init; }

    /// <summary>`(=) RECEITAS LIQUIDAS` — base 100% do %AV.</summary>
    public decimal ReceitaLiquida { get; init; }

    /// <summary>`(=) CMV LIQ.` — custo financeiro líquido das devoluções.</summary>
    public decimal CmvLiq { get; init; }

    /// <summary>Informativa: <b>não</b> entra no cálculo das Receitas Líquidas.</summary>
    public decimal StLiq { get; init; }

    /// <summary>Informativa: <b>não</b> entra no cálculo.</summary>
    public decimal PisLiq { get; init; }

    /// <summary>Informativa: <b>não</b> entra no cálculo.</summary>
    public decimal CofinsLiq { get; init; }

    /// <summary>
    /// As parcelas das três linhas informativas, para o detalhamento mostrar de onde o
    /// líquido saiu: <c>StLiq = StVendas − StDevolucao</c>, e o mesmo para PIS e COFINS.
    ///
    /// <para><b>`StVendas` já soma ST e FECP</b> — a consulta calcula
    /// <c>(st + vlfecp) × qt</c> num só `SUM`, e é por isso que a linha `(-) ST` do DRE
    /// difere de `Σ st·qt` em exatamente o FECP. Foi essa distinção que custou dois dias
    /// em 02/09/2026; ver `docs/DIVERGENCIAS.md`, "Os dois números chamados ST".</para>
    /// </summary>
    public decimal StVendas { get; init; }

    /// <inheritdoc cref="StVendas"/>
    public decimal StDevolucao { get; init; }

    /// <inheritdoc cref="StVendas"/>
    public decimal PisVendas { get; init; }

    /// <inheritdoc cref="StVendas"/>
    public decimal PisDevolucao { get; init; }

    /// <inheritdoc cref="StVendas"/>
    public decimal CofinsVendas { get; init; }

    /// <inheritdoc cref="StVendas"/>
    public decimal CofinsDevolucao { get; init; }

    /// <summary>`LUCRO BRUTO` = Receitas Líquidas − CMV. Derivado, não vem do banco.</summary>
    public decimal LucroBruto => ReceitaLiquida - CmvLiq;
}

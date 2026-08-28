namespace Epoca.Kpi.Api.Domain.Entities;

/// <summary>
/// Cabeçalho do DRE: faturamento, CMV e impostos do período. Uma linha só.
///
/// <para>
/// <b>Não depende do regime.</b> Caixa e competência produzem exatamente os mesmos valores
/// aqui — o regime só muda as datas das despesas.
/// </para>
/// </summary>
public class FaturamentoDre
{
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

    /// <summary>`LUCRO BRUTO` = Receitas Líquidas − CMV. Derivado, não vem do banco.</summary>
    public decimal LucroBruto => ReceitaLiquida - CmvLiq;
}

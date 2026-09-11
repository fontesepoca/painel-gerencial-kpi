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

    /// <summary>`LUCRO BRUTO` = Receitas Líquidas − CMV. Derivado, não vem do banco.</summary>
    public decimal LucroBruto => ReceitaLiquida - CmvLiq;

    /// <summary>
    /// Soma vários meses num só — o faturamento de uma coluna que cobre mais de um mês.
    ///
    /// <para>Todos os campos são somáveis por natureza: cada um é um <c>SUM</c> sobre notas
    /// do mês, então somar os meses dá o mesmo que consultar o período inteiro. O único
    /// derivado, <c>LucroBruto</c>, é calculado a partir dos campos somados.</para>
    ///
    /// <para><b>Devolve `null` para lista vazia</b>, e não um objeto zerado: o montador
    /// distingue "não houve movimento" de "houve e deu zero" — é o critério de visibilidade
    /// da linha na 9815, que esconde por ausência de movimento e não por valor.</para>
    /// </summary>
    public static FaturamentoDre? Somar(string mesAno, IReadOnlyList<FaturamentoDre> meses)
    {
        if (meses.Count == 0)
        {
            return null;
        }

        return new FaturamentoDre
        {
            MesAno = mesAno,
            ReceitaBruta = meses.Sum(m => m.ReceitaBruta),
            AbatDesc = meses.Sum(m => m.AbatDesc),
            Devolucao = meses.Sum(m => m.Devolucao),
            ReceitaLiquida = meses.Sum(m => m.ReceitaLiquida),
            CmvLiq = meses.Sum(m => m.CmvLiq),
            StLiq = meses.Sum(m => m.StLiq),
            PisLiq = meses.Sum(m => m.PisLiq),
            CofinsLiq = meses.Sum(m => m.CofinsLiq),
        };
    }
}

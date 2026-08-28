namespace Epoca.Kpi.Api.Domain.Entities;

/// <summary>
/// Uma linha de despesa agregada, saída do `GetValorGrupo` da 9815.
///
/// <para>
/// <b>A identidade é a tupla `(GrupoConta, AntesRo, AntesLl, AntesLf, MesAno)`</b> — não
/// `GrupoConta` sozinha. O mesmo grupo aparece mais de uma vez no DRE com flags diferentes:
/// `300` (Despesas Adm e Vendas) surge antes e depois do RESULTADO OPERACIONAL, com valores
/// distintos. Indexar só pela chave faria as duas linhas receberem o mesmo número, e o total
/// sairia errado sem erro aparente. Ver `docs/ROTINA_9815.md` §9.
/// </para>
/// </summary>
public class DespesaDre
{
    /// <summary>Chave da dimensão, sempre texto.</summary>
    public string GrupoConta { get; init; } = string.Empty;

    public string AntesRo { get; init; } = "N";
    public string AntesLl { get; init; } = "N";
    public string AntesLf { get; init; } = "N";

    /// <summary>Mês da coluna, no formato `mm/yyyy`.</summary>
    public string MesAno { get; init; } = string.Empty;

    public string Mes { get; init; } = string.Empty;
    public int Ano { get; init; }

    /// <summary>Valor do período. Despesa vem negativa — a 9815 inverte o sinal.</summary>
    public decimal VlRealizado { get; init; }

    /// <summary>Sempre 0 nesta consulta; mantido por fidelidade ao original.</summary>
    public decimal VpagoExclusivoFornec { get; init; }

    /// <summary>Quantidade de lançamentos somados. Útil para conferência.</summary>
    public int QdeReg { get; init; }

    /// <summary>Tupla que identifica a linha, para casar com a estrutura.</summary>
    public (string GrupoConta, string AntesRo, string AntesLl, string AntesLf, string MesAno) Chave
        => (GrupoConta, AntesRo, AntesLl, AntesLf, MesAno);
}

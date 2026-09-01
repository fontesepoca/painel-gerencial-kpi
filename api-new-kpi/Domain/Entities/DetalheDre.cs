namespace Epoca.Kpi.Api.Domain.Entities;

/// <summary>
/// Uma linha da tela **Receita por Cliente** — o detalhamento de `(+) RECEITA BRUTA` e de
/// `(=) RECEITAS LIQUIDAS`, que na 9815 abrem a mesma tela.
///
/// <para>As colunas usam as fórmulas da apuração, não as da 9815. Ver
/// `docs/DIVERGENCIAS.md` §4 — a tela original não soma o valor da linha clicada.</para>
/// </summary>
public class DetalheClienteDre
{
    public int CodCli { get; init; }
    public string Cliente { get; init; } = string.Empty;
    public string Cidade { get; init; } = string.Empty;

    /// <summary>Notas distintas do cliente no período, vendas e devoluções juntas.</summary>
    public int QdeNf { get; init; }

    public decimal ReceitaBruta { get; init; }
    public decimal Desconto { get; init; }
    public decimal Devolucao { get; init; }
    public decimal ReceitaLiquida { get; init; }
    public decimal CustoLiq { get; init; }
}

/// <summary>
/// Uma linha da tela **Devolução por Motivo** — o detalhamento de `(-) DEVOLUCAO`.
/// </summary>
public class DetalheMotivoDre
{
    /// <summary>
    /// `PCTABDEV.CODDEVOL`. <b>Anulável:</b> a junção com a tabela de motivos é externa, e
    /// devolução sem motivo cadastrado continua entrando no total, com o motivo vazio.
    /// </summary>
    public int? CodMotivo { get; init; }

    public string? Motivo { get; init; }

    /// <summary>`'S'` quando a devolução é atribuída ao RCA.</summary>
    public string? CulpaRca { get; init; }

    public int QdeNf { get; init; }
    public decimal VlDevolucao { get; init; }

    /// <summary>
    /// Participação no total, em pontos percentuais. Somados, os motivos fecham perto de
    /// 100 mas raramente em 100 exato — são ~27 valores arredondados a duas casas.
    /// </summary>
    public decimal PPart { get; init; }
}

/// <summary>
/// Um lançamento da tela de detalhamento das linhas de grupo.
///
/// <para><b>Fiel à 9815.</b> Esta tela já somava o valor da linha clicada e não foi
/// corrigida — `DIRETORIA` fecha em −256.840,02 e `COMPRAS - RAT` em −278.024,83.</para>
///
/// <para>Quase todo campo é anulável de propósito: o bloco de venda de ativo entra por
/// `UNION ALL` preenchendo só uma parte das colunas, e a maioria dos campos de
/// rastreabilidade do financeiro não é obrigatória no cadastro.</para>
/// </summary>
public class DetalheLancamentoDre
{
    public decimal RecNum { get; init; }
    public string? CodFilial { get; init; }

    public string? CodCcPrinc { get; init; }
    public string? DescCcPrinc { get; init; }
    public string? CodCentroCusto { get; init; }
    public string? DescCentroCusto { get; init; }
    public decimal? CodGrupo { get; init; }
    public string? Grupo { get; init; }
    public decimal? CodConta { get; init; }
    public string? Conta { get; init; }

    /// <summary>Já vem negativo, como na apuração: despesa reduz o resultado.</summary>
    public decimal VPago { get; init; }

    public string? Historico { get; init; }
    public DateTime? DtLanc { get; init; }
    public DateTime? DtCompetencia { get; init; }
    public DateTime? DtCompensacao { get; init; }
    public DateTime? DtPagto { get; init; }

    public decimal? NumTrans { get; init; }
    public decimal? NumNota { get; init; }
    public string? Duplic { get; init; }
    public string? Indice { get; init; }
    public decimal? CodProjeto { get; init; }
    public decimal? CodFornec { get; init; }
    public string? Fornecedor { get; init; }

    public decimal? NumBanco { get; init; }
    public string? NumCheque { get; init; }
    public decimal? NumBordero { get; init; }
    public decimal? NumSeqBordero { get; init; }
    public string? NumCheque2 { get; init; }
    public decimal? NumCar { get; init; }

    public string? Localizacao { get; init; }
    public string? NomeFunc { get; init; }
    public string? NomeFuncBaixa { get; init; }
    public DateTime? DtReclassific { get; init; }
    public decimal? CodFuncReclassific { get; init; }
}

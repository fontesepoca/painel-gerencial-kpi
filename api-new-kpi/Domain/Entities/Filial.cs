namespace Epoca.Kpi.Api.Domain.Entities;

/// <summary>
/// Filial do cadastro da Época (`FILIAIS` + `EMPRESA`).
///
/// <para>
/// <b>`CodFilial` é texto, não número.</b> Em todo o trace da 9815 o código aparece entre
/// aspas (`CODFILIAL IN ('7','12','25')`), e no Winthor a coluna é `VARCHAR2`. Converter
/// para inteiro descartaria um eventual zero à esquerda e o valor deixaria de casar no
/// `IN` da consulta — o mesmo tipo de armadilha que derrubou a análise por Centro de Custo.
/// </para>
/// </summary>
public class Filial
{
    public string CodFilial { get; init; } = string.Empty;

    /// <summary>Nome curto exibido no filtro: `EPC-MAT`, `VIVALOG-GBH`.</summary>
    public string Label { get; init; } = string.Empty;

    /// <summary>Agrupador: `EPC`, `FUT`, `VIVALOG`, `GB`, `MRURAL`, `VALE`, `SUP`.</summary>
    public string Empresa { get; init; } = string.Empty;

    /// <summary>Descrição da empresa e da filial concatenadas.</summary>
    public string Unidade { get; init; } = string.Empty;

    public string Uf { get; init; } = string.Empty;

    /// <summary>Ordem de exibição. Anulável: a coluna permite nulo no cadastro.</summary>
    public int? Ordem { get; init; }
}

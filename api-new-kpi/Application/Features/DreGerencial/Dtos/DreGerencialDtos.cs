namespace Epoca.Kpi.Api.Application.Features.DreGerencial.Dtos;

/// <summary>
/// Filial no filtro da tela. `CodFilial` é texto — ver <c>Domain/Entities/Filial.cs</c>.
/// </summary>
public record FilialDto(
    string CodFilial,
    string Label,
    string Empresa,
    string EmpresaCodigo,
    string Unidade,
    string Uf,
    int? Ordem);

/// <summary>
/// Linha da estrutura do DRE, já traduzida para a tela: flags como booleano e cor em CSS.
/// </summary>
public record LinhaEstruturaDto(
    int? Id,
    string Chave,
    string Descricao,
    bool Totalizadora,
    bool Calculada,
    string? Cor,
    bool AntesResultadoOperacional,
    bool AntesLucroLiquido,
    bool AntesLucroFinal);

/// <summary>Filtro da consulta de despesas. `Filiais` são códigos em texto.</summary>
public record DespesasFiltroDto(
    IReadOnlyList<string> Filiais,
    DateOnly DataInicio,
    DateOnly DataFim,
    string Regime,
    string Analise);

/// <summary>
/// Linha de despesa agregada. A identidade é a tupla completa, não `Chave` sozinha —
/// ver `docs/ROTINA_9815.md` §9.
/// </summary>
public record DespesaDto(
    string Chave,
    string MesAno,
    bool AntesResultadoOperacional,
    bool AntesLucroLiquido,
    bool AntesLucroFinal,
    decimal Valor,
    int QuantidadeLancamentos);

/// <summary>
/// Cabeçalho do DRE. `StLiq`, `PisLiq` e `CofinsLiq` são informativas — não entram no
/// cálculo das Receitas Líquidas (ver `docs/ROTINA_9815.md` §5).
/// </summary>
public record FaturamentoDto(
    string MesAno,
    decimal ReceitaBruta,
    decimal AbatDesc,
    decimal Devolucao,
    decimal ReceitaLiquida,
    decimal CmvLiq,
    decimal LucroBruto,
    decimal StLiq,
    decimal PisLiq,
    decimal CofinsLiq);

/// <summary>Um mês do período apurado.</summary>
public record PeriodoDto(string MesAno, string Rotulo);

/// <summary>Valor de uma linha em um mês.</summary>
public record ValorMesDto(
    string MesAno,
    decimal Valor,
    /// <summary>Base: RECEITA BRUTA nas cinco deduções, RECEITAS LIQUIDAS no resto.</summary>
    decimal? PercentualAv,
    /// <summary>Variação sobre o mês anterior. Nulo no primeiro mês e quando o anterior é zero.</summary>
    decimal? PercentualAh);

/// <summary>Bloco TOTAL da linha, somando os meses do período.</summary>
public record TotalLinhaDto(decimal Valor, decimal Media, decimal? PercentualAv);

/// <summary>Uma linha do DRE montado, com um valor por mês e o total.</summary>
public record LinhaDreDto(
    int? Id,
    string Chave,
    string Descricao,
    IReadOnlyList<ValorMesDto> Valores,
    TotalLinhaDto Total,
    bool Totalizadora,
    bool Calculada,
    /// <summary>Não entra em totalizador: as 3 informativas e o bloco pós-LUCRO LIQUIDO.</summary>
    bool NaoSoma,
    /// <summary>
    /// Nenhum lançamento no período. É este o critério que a 9815 usa para esconder linha
    /// sem "Mostrar Contas Zeradas" — <b>não</b> é valor zero.
    ///
    /// <para>Conferido em 31/08/2026: `DESCONTO FUNCIONÁRIOS` sai com 0,00 e 16 lançamentos,
    /// `CONTRATO DE MUTUO` com 0,00 e 18, e a 9815 mostra as duas. `ALFALOG` e
    /// `VENDAS UNILEVER`, sem lançamento nenhum, ela esconde. As 44 linhas com movimento
    /// mais as 13 calculadas dão exatamente as 57 da exportação.</para>
    ///
    /// <para>Linha calculada nunca é escondida: cabeçalho e totalizadores aparecem sempre.</para>
    /// </summary>
    bool SemMovimento,
    /// <summary>Zero em todos os meses. Não decide visibilidade — ver <see cref="SemMovimento"/>.</summary>
    bool Zerada,
    string? Cor);

/// <summary>DRE apurado.</summary>
public record ApuracaoDto(
    string Regime,
    string Analise,
    DateOnly DataInicio,
    DateOnly DataFim,
    IReadOnlyList<string> Filiais,
    IReadOnlyList<PeriodoDto> Periodos,
    IReadOnlyList<LinhaDreDto> Linhas,
    IReadOnlyList<string> Avisos,
    DateTimeOffset ApuradoEm,
    long DuracaoMs);

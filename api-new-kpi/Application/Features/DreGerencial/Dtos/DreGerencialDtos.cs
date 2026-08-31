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
    decimal ReceitaBruta,
    decimal AbatDesc,
    decimal Devolucao,
    decimal ReceitaLiquida,
    decimal CmvLiq,
    decimal LucroBruto,
    decimal StLiq,
    decimal PisLiq,
    decimal CofinsLiq);

/// <summary>Uma linha do DRE montado.</summary>
public record LinhaDreDto(
    int? Id,
    string Chave,
    string Descricao,
    decimal Valor,
    /// <summary>Base: RECEITA BRUTA nas cinco deduções, RECEITAS LIQUIDAS no resto.</summary>
    decimal? PercentualAv,
    bool Totalizadora,
    bool Calculada,
    /// <summary>Não entra em totalizador nenhum: as 3 informativas e o bloco pós-LUCRO LIQUIDO.</summary>
    bool NaoSoma,
    /// <summary>Valor zero. A 9815 esconde estas quando `Mostrar Contas Zeradas` está desmarcado.</summary>
    bool Zerada,
    string? Cor);

/// <summary>DRE apurado.</summary>
public record ApuracaoDto(
    string Regime,
    string Analise,
    DateOnly DataInicio,
    DateOnly DataFim,
    IReadOnlyList<string> Filiais,
    IReadOnlyList<LinhaDreDto> Linhas,
    IReadOnlyList<string> Avisos,
    DateTimeOffset ApuradoEm,
    long DuracaoMs);

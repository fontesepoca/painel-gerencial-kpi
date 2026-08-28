using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Features.DreGerencial.Dtos;
using Epoca.Kpi.Api.Domain.Interfaces;

namespace Epoca.Kpi.Api.Application.Features.DreGerencial;

/// <summary>
/// Casos de uso da rotina DRE Gerencial (9815 do Winthor).
/// </summary>
public sealed class DreGerencialService
{
    /// <summary>Dimensões do combo "Análise" da 9815.</summary>
    public const string AnaliseGrupoDeContas = "grupo-contas";

    private static readonly string[] AnalisesConhecidas =
        [AnaliseGrupoDeContas, "conta-gerencial", "ccusto-principal", "centro-custo"];

    private readonly IDreGerencialRepository _repositorio;

    public DreGerencialService(IDreGerencialRepository repositorio) => _repositorio = repositorio;

    /// <summary>
    /// Filiais do filtro. Lista vazia é resultado válido, não erro — cadastro sem filial
    /// é problema de configuração do banco, e o front trata mostrando o filtro vazio.
    /// </summary>
    public async Task<Result<IReadOnlyList<FilialDto>>> ObterFiliaisAsync(
        CancellationToken cancellationToken = default)
    {
        var filiais = await _repositorio.ObterFiliaisAsync(cancellationToken);

        var dtos = filiais
            .Select(f => new FilialDto(
                f.CodFilial, f.Label, f.Empresa, f.EmpresaCodigo, f.Unidade, f.Uf, f.Ordem))
            .ToList();

        return Result<IReadOnlyList<FilialDto>>.Ok(dtos);
    }

    /// <summary>
    /// Estrutura de linhas do DRE. Cada dimensão tem seu próprio SQL na 9815; só
    /// Grupo de Contas está implementada até aqui.
    /// </summary>
    public async Task<Result<IReadOnlyList<LinhaEstruturaDto>>> ObterEstruturaAsync(
        string analise,
        CancellationToken cancellationToken = default)
    {
        if (!AnalisesConhecidas.Contains(analise))
        {
            return Result<IReadOnlyList<LinhaEstruturaDto>>.Invalido(
                $"Análise '{analise}' não existe. Valores aceitos: {string.Join(", ", AnalisesConhecidas)}.");
        }

        if (analise != AnaliseGrupoDeContas)
        {
            return Result<IReadOnlyList<LinhaEstruturaDto>>.Invalido(
                $"A análise '{analise}' ainda não foi implementada. " +
                "Na 9815 cada dimensão tem uma consulta de estrutura própria.");
        }

        var linhas = await _repositorio.ObterEstruturaGrupoDeContasAsync(cancellationToken);

        var dtos = linhas
            .Select(l => new LinhaEstruturaDto(
                Id: l.Id,
                Chave: l.CodGruConta,
                Descricao: l.Grupo,
                Totalizadora: l.InfContas == "S",
                // Chave negativa marca linha calculada pelo Delphi: cabeçalho, subtotais
                // e os três lucros. Positiva referencia grupo ou conta.
                Calculada: l.CodGruConta.StartsWith('-'),
                Cor: CorDelphi.ParaCss(l.Cor),
                AntesResultadoOperacional: l.AntesRo == "S",
                AntesLucroLiquido: l.AntesLl == "S",
                AntesLucroFinal: l.AntesLf == "S"))
            .ToList();

        return Result<IReadOnlyList<LinhaEstruturaDto>>.Ok(dtos);
    }

    /// <summary>
    /// Despesas do período. Só Grupo de Contas por enquanto — cada dimensão tem sua
    /// própria expressão de agrupamento na 9815.
    /// </summary>
    public async Task<Result<IReadOnlyList<DespesaDto>>> ObterDespesasAsync(
        DespesasFiltroDto filtro,
        CancellationToken cancellationToken = default)
    {
        if (filtro.Filiais.Count == 0)
        {
            return Result<IReadOnlyList<DespesaDto>>.Invalido("Selecione ao menos uma filial.");
        }

        if (filtro.DataFim < filtro.DataInicio)
        {
            return Result<IReadOnlyList<DespesaDto>>.Invalido(
                "A data final não pode ser anterior à inicial.");
        }

        // Protege o banco: a consulta varre PCLANC no período inteiro.
        if (filtro.DataInicio.AddMonths(12) < filtro.DataFim)
        {
            return Result<IReadOnlyList<DespesaDto>>.Invalido(
                "O período não pode passar de 12 meses.");
        }

        var regime = RegimeDre.Resolver(filtro.Regime);
        if (regime is null)
        {
            return Result<IReadOnlyList<DespesaDto>>.Invalido(
                $"Regime '{filtro.Regime}' não existe. Valores aceitos: " +
                $"{string.Join(", ", RegimeDre.Todos.Select(r => r.Codigo))}.");
        }

        if (filtro.Analise != AnaliseGrupoDeContas)
        {
            return Result<IReadOnlyList<DespesaDto>>.Invalido(
                $"A análise '{filtro.Analise}' ainda não foi implementada.");
        }

        var despesas = await _repositorio.ObterDespesasGrupoDeContasAsync(
            filtro.Filiais, filtro.DataInicio, filtro.DataFim, regime, cancellationToken);

        var dtos = despesas
            .Select(d => new DespesaDto(
                Chave: d.GrupoConta,
                MesAno: d.MesAno,
                AntesResultadoOperacional: d.AntesRo == "S",
                AntesLucroLiquido: d.AntesLl == "S",
                AntesLucroFinal: d.AntesLf == "S",
                Valor: d.VlRealizado,
                QuantidadeLancamentos: d.QdeReg))
            .ToList();

        return Result<IReadOnlyList<DespesaDto>>.Ok(dtos);
    }
}

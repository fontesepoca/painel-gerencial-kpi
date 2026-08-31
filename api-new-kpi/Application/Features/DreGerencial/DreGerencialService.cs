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
    /// Estrutura de linhas do DRE, já com as contas órfãs do período. Precisa de filiais,
    /// período e regime porque o bloco de órfãs varre `PCLANC`.
    /// Cada dimensão tem seu próprio SQL na 9815; só Grupo de Contas está implementada.
    /// </summary>
    public async Task<Result<IReadOnlyList<LinhaEstruturaDto>>> ObterEstruturaAsync(
        DespesasFiltroDto filtro,
        CancellationToken cancellationToken = default)
    {
        var erroBase = ValidarPeriodoEFiliais(filtro);
        if (erroBase is not null)
        {
            return Result<IReadOnlyList<LinhaEstruturaDto>>.Invalido(erroBase);
        }

        var regime = RegimeDre.Resolver(filtro.Regime);
        if (regime is null)
        {
            return Result<IReadOnlyList<LinhaEstruturaDto>>.Invalido(
                $"Regime '{filtro.Regime}' não existe.");
        }

        if (!AnalisesConhecidas.Contains(filtro.Analise))
        {
            return Result<IReadOnlyList<LinhaEstruturaDto>>.Invalido(
                $"Análise '{filtro.Analise}' não existe. Valores aceitos: {string.Join(", ", AnalisesConhecidas)}.");
        }

        if (filtro.Analise != AnaliseGrupoDeContas)
        {
            return Result<IReadOnlyList<LinhaEstruturaDto>>.Invalido(
                $"A análise '{filtro.Analise}' ainda não foi implementada. " +
                "Na 9815 cada dimensão tem uma consulta de estrutura própria.");
        }

        var linhas = await _repositorio.ObterEstruturaGrupoDeContasAsync(
            filtro.Filiais, filtro.DataInicio, filtro.DataFim, regime, cancellationToken);

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

    /// <summary>
    /// Cabeçalho do DRE. Não recebe regime — receita e CMV são iguais nos dois.
    /// </summary>
    public async Task<Result<IReadOnlyList<FaturamentoDto>>> ObterFaturamentoAsync(
        DespesasFiltroDto filtro,
        CancellationToken cancellationToken = default)
    {
        var erro = ValidarPeriodoEFiliais(filtro);
        if (erro is not null)
        {
            return Result<IReadOnlyList<FaturamentoDto>>.Invalido(erro);
        }

        var meses = await _repositorio.ObterFaturamentoPorMesAsync(
            filtro.Filiais, filtro.DataInicio, filtro.DataFim, cancellationToken);

        var dtos = meses
            .Select(f => new FaturamentoDto(
                MesAno: f.MesAno,
                ReceitaBruta: f.ReceitaBruta,
                AbatDesc: f.AbatDesc,
                Devolucao: f.Devolucao,
                ReceitaLiquida: f.ReceitaLiquida,
                CmvLiq: f.CmvLiq,
                LucroBruto: f.LucroBruto,
                StLiq: f.StLiq,
                PisLiq: f.PisLiq,
                CofinsLiq: f.CofinsLiq))
            .ToList();

        return Result<IReadOnlyList<FaturamentoDto>>.Ok(dtos);
    }

    /// <summary>Validações comuns a período e filiais. Devolve a mensagem, ou null.</summary>
    private static string? ValidarPeriodoEFiliais(DespesasFiltroDto filtro)
    {
        if (filtro.Filiais.Count == 0)
        {
            return "Selecione ao menos uma filial.";
        }

        if (filtro.DataFim < filtro.DataInicio)
        {
            return "A data final não pode ser anterior à inicial.";
        }

        if (filtro.DataInicio.AddMonths(12) < filtro.DataFim)
        {
            return "O período não pode passar de 12 meses.";
        }

        return null;
    }

    /// <summary>
    /// Apura o DRE completo: estrutura, despesas e faturamento, montados pelo
    /// <see cref="MontadorDre"/>.
    ///
    /// <para>As três consultas rodam <b>em sequência</b>, não em paralelo. Elas competem
    /// pelas mesmas tabelas e pelo mesmo pool; paralelizar aumenta a contenção sem reduzir
    /// o tempo de parede de forma previsível. Se virar gargalo, medir antes de mudar.</para>
    /// </summary>
    public async Task<Result<ApuracaoDto>> ApurarAsync(
        DespesasFiltroDto filtro,
        CancellationToken cancellationToken = default)
    {
        var erro = ValidarPeriodoEFiliais(filtro);
        if (erro is not null)
        {
            return Result<ApuracaoDto>.Invalido(erro);
        }

        var regime = RegimeDre.Resolver(filtro.Regime);
        if (regime is null)
        {
            return Result<ApuracaoDto>.Invalido(
                $"Regime '{filtro.Regime}' não existe. Valores aceitos: " +
                $"{string.Join(", ", RegimeDre.Todos.Select(r => r.Codigo))}.");
        }

        if (!AnalisesConhecidas.Contains(filtro.Analise))
        {
            return Result<ApuracaoDto>.Invalido(
                $"Análise '{filtro.Analise}' não existe. Valores aceitos: " +
                $"{string.Join(", ", AnalisesConhecidas)}.");
        }

        if (filtro.Analise != AnaliseGrupoDeContas)
        {
            return Result<ApuracaoDto>.Invalido(
                $"A análise '{filtro.Analise}' ainda não foi implementada.");
        }

        var cronometro = System.Diagnostics.Stopwatch.StartNew();

        var estrutura = await _repositorio.ObterEstruturaGrupoDeContasAsync(
            filtro.Filiais, filtro.DataInicio, filtro.DataFim, regime, cancellationToken);

        var despesas = await _repositorio.ObterDespesasGrupoDeContasAsync(
            filtro.Filiais, filtro.DataInicio, filtro.DataFim, regime, cancellationToken);

        var faturamento = await _repositorio.ObterFaturamentoPorMesAsync(
            filtro.Filiais, filtro.DataInicio, filtro.DataFim, cancellationToken);

        cronometro.Stop();

        var apuracao = MontadorDre.Montar(
            estrutura, despesas, faturamento, filtro, cronometro.ElapsedMilliseconds);

        return Result<ApuracaoDto>.Ok(apuracao);
    }
}

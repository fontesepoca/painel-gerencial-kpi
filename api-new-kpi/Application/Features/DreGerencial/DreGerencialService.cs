using Epoca.Kpi.Api.Application.Common;
using Epoca.Kpi.Api.Application.Features.DreGerencial.Dtos;
using Epoca.Kpi.Api.Domain.Interfaces;

namespace Epoca.Kpi.Api.Application.Features.DreGerencial;

/// <summary>
/// Casos de uso da rotina DRE Gerencial (9815 do Winthor).
/// </summary>
public sealed class DreGerencialService
{
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
    /// Cada dimensão tem seu próprio SQL na 9815 — ver <see cref="AnaliseDre"/>.
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

        var analise = AnaliseDre.Resolver(filtro.Analise);
        if (analise is null)
        {
            return Result<IReadOnlyList<LinhaEstruturaDto>>.Invalido(
                MensagemAnaliseInexistente(filtro.Analise));
        }

        if (!analise.Implementada)
        {
            return Result<IReadOnlyList<LinhaEstruturaDto>>.Invalido(
                MensagemAnaliseNaoImplementada(analise));
        }

        var linhas = await _repositorio.ObterEstruturaAsync(
            filtro.Filiais, filtro.DataInicio, filtro.DataFim, regime, analise, cancellationToken);

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
    /// Despesas do período. Cada dimensão tem sua própria expressão de agrupamento
    /// na 9815 — ver <see cref="AnaliseDre"/>.
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

        var analise = AnaliseDre.Resolver(filtro.Analise);
        if (analise is null)
        {
            return Result<IReadOnlyList<DespesaDto>>.Invalido(
                MensagemAnaliseInexistente(filtro.Analise));
        }

        if (!analise.Implementada)
        {
            return Result<IReadOnlyList<DespesaDto>>.Invalido(
                MensagemAnaliseNaoImplementada(analise));
        }

        var despesas = await _repositorio.ObterDespesasAsync(
            filtro.Filiais, filtro.DataInicio, filtro.DataFim, regime, analise, cancellationToken);

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

    private static string MensagemAnaliseInexistente(string? codigo) =>
        $"Análise '{codigo}' não existe. Valores aceitos: {AnaliseDre.CodigosAceitos}.";

    private static string MensagemAnaliseNaoImplementada(AnaliseDre analise) =>
        $"A análise '{analise.Rotulo}' ainda não foi implementada. " +
        "Na 9815 cada dimensão tem consultas próprias de estrutura e de despesas.";

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

        // Teto de CINCO anos — subiu de três em 18/09/2026, a pedido do Gabriel.
        //
        // O três de 10/09 foi calibrado contra um custo que não existe mais: um ano de uma
        // filial custava 316 s medidos, e cada coluna do modo `anos` é uma varredura de doze
        // meses. Com o PARALLEL(4) na consulta de faturamento, a mesma varredura ficou
        // cerca de três vezes mais rápida — ver docs/PARALELISMO.md. Cinco anos hoje custam
        // menos que os três de então.
        //
        // O teto continua existindo porque o custo continua linear no número de anos: cada
        // um é uma varredura a mais. O que mudou foi onde a conta fecha.
        //
        // O comparativo NÃO entra neste teto desde 11/09/2026: ele deixou de repetir um
        // molde em N anos e passou a ter dois intervalos livres, cada um custando o mesmo
        // que uma apuração mensal comum. Dois intervalos de três meses são mais baratos que
        // um único ano.
        var anos = filtro.Anos?.Distinct().Count() ?? 0;
        if (filtro.Modo is "anos" && anos > MaximoDeAnos)
        {
            return $"Escolha no máximo {MaximoDeAnos} anos para comparar — " +
                   $"foram {anos}. Cada ano é uma varredura da base.";
        }

        // O segundo intervalo do comparativo passa pelas MESMAS regras do primeiro. Sem
        // isto, um intervalo B invertido ou de cinco anos entraria por uma porta que o A
        // tem fechada — e o erro apareceria como consulta eterna, não como mensagem.
        if (filtro.Modo == "comparar-anos"
            && filtro.ComparacaoInicio is { } inicio2
            && filtro.ComparacaoFim is { } fim2)
        {
            if (fim2 < inicio2)
            {
                return "No segundo intervalo, a data final não pode ser anterior à inicial.";
            }

            if (inicio2.AddMonths(12) < fim2)
            {
                return "O segundo intervalo não pode passar de 12 meses.";
            }
        }

        return null;
    }

    private const int MaximoDeAnos = 5;

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

        var analise = AnaliseDre.Resolver(filtro.Analise);
        if (analise is null)
        {
            return Result<ApuracaoDto>.Invalido(MensagemAnaliseInexistente(filtro.Analise));
        }

        if (!analise.Implementada)
        {
            return Result<ApuracaoDto>.Invalido(MensagemAnaliseNaoImplementada(analise));
        }

        var recortes = RecorteDre.Resolver(filtro);
        if (recortes.Count == 0)
        {
            return Result<ApuracaoDto>.Invalido(
                "Escolha pelo menos um período para apurar.");
        }

        var cronometro = System.Diagnostics.Stopwatch.StartNew();

        // A estrutura é UMA consulta, sobre o período que cobre todos os recortes. As linhas
        // do DRE são as mesmas em qualquer coluna, e o bloco de contas órfãs sai da união —
        // uma conta que só teve movimento em 2025 precisa aparecer quando 2025 é uma das
        // colunas comparadas.
        var estrutura = await _repositorio.ObterEstruturaAsync(
            filtro.Filiais,
            recortes.Min(r => r.DataInicio),
            recortes.Max(r => r.DataFim),
            regime,
            analise,
            cancellationToken);

        // Uma consulta de despesas e uma de faturamento POR RECORTE, e os recortes rodam
        // EM PARALELO — decisão do Gabriel em 10/09/2026, com o custo declarado: três anos
        // significam três varreduras simultâneas de PCLANC e PCNFSAID no mesmo Oracle que
        // a operação usa. Em troca, três anos saem em ~6 min em vez de ~16.
        //
        // A medição que motivou a escolha: um ano de uma filial levou 316 s sequencial.
        //
        // COMO VOLTAR AO SEQUENCIAL, se a concorrência incomodar em produção: trocar o
        // `Task.WhenAll` por um `foreach` que aguarde cada recorte antes do próximo. O
        // resto do fluxo não muda — a ordem das colunas vem de `recortes`, não da ordem em
        // que as consultas terminam, então o resultado é idêntico nos dois modos.
        var porRecorte = await Task.WhenAll(recortes.Select(async recorte =>
        {
            var despesas = await _repositorio.ObterDespesasAsync(
                filtro.Filiais, recorte.DataInicio, recorte.DataFim, regime, analise,
                cancellationToken);

            var faturamento = await _repositorio.ObterFaturamentoPorMesAsync(
                filtro.Filiais, recorte.DataInicio, recorte.DataFim, cancellationToken);

            return recorte.EmColunas(despesas, faturamento);
        }));

        var colunas = porRecorte.SelectMany(c => c).ToList();

        cronometro.Stop();

        var apuracao = MontadorDre.Montar(
            estrutura, colunas, filtro, cronometro.ElapsedMilliseconds);

        return Result<ApuracaoDto>.Ok(apuracao);
    }

    /// <summary>
    /// Detalhamento de uma célula — o que a 9815 abre com duplo clique no valor.
    ///
    /// <para>São três telas com formatos diferentes, e o tipo vem pronto do
    /// <see cref="DetalheDisponivelDto"/> que a apuração colocou na linha. O front não
    /// escolhe: ele devolve o destino que recebeu.</para>
    ///
    /// <para><b>Nada aqui é concatenado a partir do que chega.</b> `Tipo` e `Bloco` passam
    /// por listas fechadas antes de virar SQL, e a chave vai como bind.</para>
    /// </summary>
    public async Task<Result<DetalhamentoDto>> ObterDetalheAsync(
        DetalheFiltroDto filtro,
        CancellationToken cancellationToken = default)
    {
        var basico = new DespesasFiltroDto(
            filtro.Filiais, filtro.DataInicio, filtro.DataFim, filtro.Regime, filtro.Analise);

        var erro = ValidarPeriodoEFiliais(basico);
        if (erro is not null)
        {
            return Result<DetalhamentoDto>.Invalido(erro);
        }

        var cronometro = System.Diagnostics.Stopwatch.StartNew();

        switch (filtro.Tipo)
        {
            case "receita-por-cliente":
            {
                var linhas = await _repositorio.ObterDetalheReceitaPorClienteAsync(
                    filtro.Filiais, filtro.DataInicio, filtro.DataFim, cancellationToken);

                cronometro.Stop();
                return Result<DetalhamentoDto>.Ok(new DetalhamentoDto(
                    filtro.Tipo, filtro.DataInicio, filtro.DataFim,
                    linhas.Select(c => new DetalheClienteDto(
                        c.CodCli, c.Cliente, c.Cidade, c.QdeNf, c.ReceitaBruta,
                        c.Desconto, c.Devolucao, c.ReceitaLiquida, c.CustoLiq)).ToList(),
                    null, null, null, cronometro.ElapsedMilliseconds));
            }

            case "devolucao-por-motivo":
            {
                var linhas = await _repositorio.ObterDetalheDevolucaoPorMotivoAsync(
                    filtro.Filiais, filtro.DataInicio, filtro.DataFim, cancellationToken);

                cronometro.Stop();
                return Result<DetalhamentoDto>.Ok(new DetalhamentoDto(
                    filtro.Tipo, filtro.DataInicio, filtro.DataFim, null,
                    linhas.Select(m => new DetalheMotivoDto(
                        m.CodMotivo, m.Motivo, m.CulpaRca, m.QdeNf,
                        m.VlDevolucao, m.PPart)).ToList(),
                    null, null, cronometro.ElapsedMilliseconds));
            }

            case "lancamentos":
            {
                if (string.IsNullOrWhiteSpace(filtro.Chave))
                {
                    return Result<DetalhamentoDto>.Invalido(
                        "O detalhamento de lançamentos precisa da chave da linha.");
                }

                if (filtro.Bloco is not ("operacional" or "pos-operacional" or "orfa"))
                {
                    return Result<DetalhamentoDto>.Invalido(
                        $"Bloco '{filtro.Bloco}' não existe. Valores aceitos: " +
                        "operacional, pos-operacional, orfa.");
                }

                var regime = RegimeDre.Resolver(filtro.Regime);
                if (regime is null)
                {
                    return Result<DetalhamentoDto>.Invalido(
                        $"Regime '{filtro.Regime}' não existe.");
                }

                var analise = AnaliseDre.Resolver(filtro.Analise);
                if (analise is null || !analise.Implementada)
                {
                    return Result<DetalhamentoDto>.Invalido(
                        $"Análise '{filtro.Analise}' não existe ou não está implementada.");
                }

                var linhas = await _repositorio.ObterDetalheLancamentosAsync(
                    filtro.Filiais, filtro.DataInicio, filtro.DataFim, regime, analise,
                    filtro.Bloco, filtro.Chave, cancellationToken);

                cronometro.Stop();
                return Result<DetalhamentoDto>.Ok(new DetalhamentoDto(
                    filtro.Tipo, filtro.DataInicio, filtro.DataFim, null, null,
                    linhas.Select(l => new DetalheLancamentoDto(
                        l.RecNum, l.CodFilial, l.CodCcPrinc, l.DescCcPrinc,
                        l.CodCentroCusto, l.DescCentroCusto, l.CodGrupo, l.Grupo,
                        l.CodConta, l.Conta, l.VPago, l.Historico, l.DtLanc,
                        l.DtCompetencia, l.DtCompensacao, l.DtPagto, l.NumTrans,
                        l.NumNota, l.Duplic, l.Indice, l.CodProjeto, l.CodFornec,
                        l.Fornecedor, l.NumBanco, l.NumCheque, l.NumBordero,
                        l.NumSeqBordero, l.NumCheque2, l.NumCar, l.Localizacao,
                        l.NomeFunc, l.NomeFuncBaixa, l.DtReclassific,
                        l.CodFuncReclassific)).ToList(),
                    null, cronometro.ElapsedMilliseconds));
            }

            case "imposto-por-produto":
            {
                // O imposto vem em `Bloco`, e passa por lista fechada antes de chegar ao
                // SQL — o mesmo tratamento que `Bloco` já recebia nos lançamentos.
                if (filtro.Bloco is not ("st" or "pis" or "cofins"))
                {
                    return Result<DetalhamentoDto>.Invalido(
                        $"Imposto '{filtro.Bloco}' não existe. Valores aceitos: st, pis, cofins.");
                }

                var linhas = await _repositorio.ObterDetalheImpostoPorProdutoAsync(
                    filtro.Bloco, filtro.Filiais, filtro.DataInicio, filtro.DataFim,
                    cancellationToken);

                // A participação é do LÍQUIDO sobre o total da tela, como na devolução por
                // motivo. Total zero não vira divisão por zero: a coluna sai zerada.
                var total = linhas.Sum(i => i.Liquido);

                cronometro.Stop();
                return Result<DetalhamentoDto>.Ok(new DetalhamentoDto(
                    filtro.Tipo, filtro.DataInicio, filtro.DataFim, null, null, null,
                    linhas.Select(i => new DetalheImpostoDto(
                        i.CodProd, i.Produto, i.QdeNf, i.Vendas, i.Devolucoes, i.Liquido,
                        total == 0m ? 0m : Math.Round(i.Liquido / total * 100m, 2))).ToList(),
                    cronometro.ElapsedMilliseconds));
            }

            default:
                return Result<DetalhamentoDto>.Invalido(
                    $"Detalhamento '{filtro.Tipo}' não existe. Valores aceitos: " +
                    "receita-por-cliente, devolucao-por-motivo, lancamentos.");
        }
    }
}

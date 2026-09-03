using Epoca.Kpi.Api.Application.Features.DreGerencial;
using Dapper;
using Epoca.Kpi.Api.Domain.Entities;
using Epoca.Kpi.Api.Domain.Interfaces;
using Epoca.Kpi.Api.Infrastructure.Persistence.Context;
using Epoca.Kpi.Api.Infrastructure.Persistence.Queries;

namespace Epoca.Kpi.Api.Infrastructure.Persistence.Repositories;

/// <inheritdoc cref="IDreGerencialRepository"/>
public sealed class DreGerencialRepository : IDreGerencialRepository
{
    private readonly IOracleConnectionFactory _conexoes;

    public DreGerencialRepository(IOracleConnectionFactory conexoes) => _conexoes = conexoes;

    public async Task<IReadOnlyList<Filial>> ObterFiliaisAsync(
        CancellationToken cancellationToken = default)
    {
        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        // Consulta de cadastro, leve. Timeout curto de propósito: se demorar mais que
        // isso o problema é de infraestrutura, e falhar rápido é melhor do que pendurar
        // a tela de filtros do usuário.
        var filiais = await conexao.QueryAsync<Filial>(
            new CommandDefinition(
                DreGerencialQueries.Filiais,
                commandTimeout: 30,
                cancellationToken: cancellationToken));

        return filiais.ToList();
    }

    public async Task<IReadOnlyList<LinhaEstruturaDre>> ObterEstruturaAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        RegimeDre regime,
        AnaliseDre analise,
        CancellationToken cancellationToken = default)
    {
        if (filiais.Count == 0)
        {
            return [];
        }

        if (analise.SqlEstrutura is null)
        {
            throw new InvalidOperationException(
                $"A análise '{analise.Codigo}' não tem consulta de estrutura. " +
                "O serviço deve barrar dimensões não implementadas antes de chegar aqui.");
        }

        var inicio = dataInicio.ToDateTime(TimeOnly.MinValue);
        var fim = dataFim.ToDateTime(TimeOnly.MinValue);
        var parametros = new DynamicParameters();
        string sql;

        // ExpressaoFiltroEstrutura, nao ExpressaoFiltro: o bloco de orfas usa
        // FIN.DTPAGTO puro em caixa, enquanto o GetValorGrupo usa nvl(DTPAGTO,DTVENC).
        if (analise.EstruturaTemDoisBlocosDeFilial)
        {
            // Dimensoes de centro de custo: a lista de filiais aparece duas vezes — no
            // subselect que descobre os centros de custo e no bloco de orfas. Com bind
            // posicional, reusar os mesmos nomes daria um parametro so para duas posicoes.
            var placeholdersA = string.Join(", ", filiais.Select((_, i) => $":filialA{i}"));
            var placeholdersB = string.Join(", ", filiais.Select((_, i) => $":filialB{i}"));

            sql = string.Format(
                analise.SqlEstrutura,
                placeholdersA,
                regime.ExpressaoFiltroEstrutura,
                placeholdersB);

            // A ORDEM DOS Add TEM QUE SER ESTA — e a ordem dos binds no SQL.
            for (var i = 0; i < filiais.Count; i++)
            {
                parametros.Add($"filialA{i}", filiais[i]);
            }
            parametros.Add("dtIniA", inicio);
            parametros.Add("dtFimA", fim);
            for (var i = 0; i < filiais.Count; i++)
            {
                parametros.Add($"filialB{i}", filiais[i]);
            }
            parametros.Add("dtIniB", inicio);
            parametros.Add("dtFimB", fim);
        }
        else
        {
            var placeholders = string.Join(", ", filiais.Select((_, i) => $":filial{i}"));

            sql = string.Format(
                analise.SqlEstrutura,
                placeholders,
                regime.ExpressaoFiltroEstrutura);

            // Filiais primeiro, depois as datas — a ordem em que os binds aparecem no SQL.
            for (var i = 0; i < filiais.Count; i++)
            {
                parametros.Add($"filial{i}", filiais[i]);
            }
            parametros.Add("dtIni", inicio);
            parametros.Add("dtFim", fim);
        }

        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        // No trace levou ~2,2 s. Agora varre PCLANC no bloco de orfas, entao merece
        // o mesmo folego das demais consultas de apuracao.
        var linhas = await conexao.QueryAsync<LinhaEstruturaDre>(
            new CommandDefinition(
                sql,
                parametros,
                commandTimeout: 600,
                cancellationToken: cancellationToken));

        return linhas.ToList();
    }

    public async Task<IReadOnlyList<DespesaDre>> ObterDespesasAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        RegimeDre regime,
        AnaliseDre analise,
        CancellationToken cancellationToken = default)
    {
        if (filiais.Count == 0)
        {
            return [];
        }

        if (analise.SqlDespesas is null)
        {
            throw new InvalidOperationException(
                $"A análise '{analise.Codigo}' não tem consulta de despesas. " +
                "O serviço deve barrar dimensões não implementadas antes de chegar aqui.");
        }

        // Dois conjuntos de placeholders porque a lista de filiais aparece duas vezes no
        // SQL — em PCLANC e em PCNFSAID. Com bind posicional, reusar os mesmos nomes daria
        // um parâmetro só para duas posições.
        var placeholdersA = string.Join(", ", filiais.Select((_, i) => $":filialA{i}"));
        var placeholdersB = string.Join(", ", filiais.Select((_, i) => $":filialB{i}"));

        var sql = string.Format(
            analise.SqlDespesas,
            placeholdersA,
            regime.ExpressaoBucket,
            regime.ExpressaoFiltro,
            placeholdersB);

        // Meia-noite nas duas pontas, de propósito: a 9815 usa
        // To_Date('27/08/2026','dd/mm/yyyy'), que é 00:00. Usar o fim do dia incluiria
        // lançamentos que a rotina antiga não conta, e o número deixaria de bater.
        var inicio = dataInicio.ToDateTime(TimeOnly.MinValue);
        var fim = dataFim.ToDateTime(TimeOnly.MinValue);

        // A ORDEM DOS Add TEM QUE SER ESTA — é a ordem em que os binds aparecem no SQL.
        var parametros = new DynamicParameters();
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialA{i}", filiais[i]);
        }
        parametros.Add("dtIni1", inicio);
        parametros.Add("dtFim1", fim);
        parametros.Add("dtIni2", inicio);
        parametros.Add("dtFim2", fim);
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialB{i}", filiais[i]);
        }

        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        // No trace a consulta levou ~3,3 s com 3 filiais e 1 mês. Com 18 filiais e 4 meses
        // o custo cresce; 600 s dá folga sem pendurar indefinidamente.
        var despesas = await conexao.QueryAsync<DespesaDre>(
            new CommandDefinition(
                sql,
                parametros,
                commandTimeout: 600,
                cancellationToken: cancellationToken));

        return despesas.ToList();
    }

    public async Task<IReadOnlyList<FaturamentoDre>> ObterFaturamentoPorMesAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        CancellationToken cancellationToken = default)
    {
        if (filiais.Count == 0)
        {
            return [];
        }

        var placeholdersA = string.Join(", ", filiais.Select((_, i) => $":filialA{i}"));
        var placeholdersB = string.Join(", ", filiais.Select((_, i) => $":filialB{i}"));

        var sql = string.Format(DreGerencialQueries.FaturamentoPorMes, placeholdersA, placeholdersB);

        var inicio = dataInicio.ToDateTime(TimeOnly.MinValue);
        var fim = dataFim.ToDateTime(TimeOnly.MinValue);

        // Ordem obrigatória: datas das vendas, filiais de PCNFSAID, filiais de PCNFENT,
        // datas das devoluções. É a ordem em que os binds aparecem no SQL.
        var parametros = new DynamicParameters();
        parametros.Add("dtIni1", inicio);
        parametros.Add("dtFim1", fim);
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialA{i}", filiais[i]);
        }
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialB{i}", filiais[i]);
        }
        parametros.Add("dtIni2", inicio);
        parametros.Add("dtFim2", fim);

        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        // A consulta mais cara da rotina: 16,9 s por mês no trace de 1 mês e 115 s no de
        // 2 meses. 600 s cobre 4 meses com folga.
        var faturamento = await conexao.QueryAsync<FaturamentoDre>(
            new CommandDefinition(
                sql,
                parametros,
                commandTimeout: 600,
                cancellationToken: cancellationToken));

        // Mês sem movimento simplesmente não aparece. Quem monta o DRE gera a lista de
        // meses a partir do período pedido, não do que voltou — senão uma coluna some.
        return faturamento.ToList();
    }

    public async Task<IReadOnlyList<DetalheClienteDre>> ObterDetalheReceitaPorClienteAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        CancellationToken cancellationToken = default)
    {
        if (filiais.Count == 0)
        {
            return [];
        }

        var placeholdersA = string.Join(", ", filiais.Select((_, i) => $":filialA{i}"));
        var placeholdersB = string.Join(", ", filiais.Select((_, i) => $":filialB{i}"));

        var sql = string.Format(DreDetalheQueries.ReceitaPorCliente, placeholdersA, placeholdersB);

        var inicio = dataInicio.ToDateTime(TimeOnly.MinValue);
        var fim = dataFim.ToDateTime(TimeOnly.MinValue);

        // Ordem obrigatória: datas das vendas, filiais das vendas, datas das devoluções,
        // filiais das devoluções. É a ordem em que os binds aparecem no SQL.
        var parametros = new DynamicParameters();
        parametros.Add("dtIni1", inicio);
        parametros.Add("dtFim1", fim);
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialA{i}", filiais[i]);
        }
        parametros.Add("dtIni2", inicio);
        parametros.Add("dtFim2", fim);
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialB{i}", filiais[i]);
        }

        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        // Cara pelo mesmo motivo que a apuração: varre as mesmas notas. Medida em 116,9 s
        // para um mês e três filiais — ver docs/DIVERGENCIAS.md §4.
        var linhas = await conexao.QueryAsync<DetalheClienteDre>(
            new CommandDefinition(
                sql,
                parametros,
                commandTimeout: 600,
                cancellationToken: cancellationToken));

        return linhas.ToList();
    }

    public async Task<IReadOnlyList<DetalheImpostoDre>> ObterDetalheImpostoPorProdutoAsync(
        string imposto,
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        CancellationToken cancellationToken = default)
    {
        if (filiais.Count == 0)
        {
            return [];
        }

        var placeholdersA = string.Join(", ", filiais.Select((_, i) => $":filialA{i}"));
        var placeholdersB = string.Join(", ", filiais.Select((_, i) => $":filialB{i}"));

        // A expressão do imposto vem de uma lista fechada, nunca do que chegou na
        // requisição. `ExpressaoDoImposto` lança se o nome não for um dos três.
        var sql = string.Format(
            DreDetalheQueries.ImpostoPorProduto,
            DreDetalheQueries.ExpressaoDoImposto(imposto, devolucao: false),
            placeholdersA,
            DreDetalheQueries.ExpressaoDoImposto(imposto, devolucao: true),
            placeholdersB);

        var inicio = dataInicio.ToDateTime(TimeOnly.MinValue);
        var fim = dataFim.ToDateTime(TimeOnly.MinValue);

        // Ordem obrigatória, igual à da receita por cliente: datas das vendas, filiais das
        // vendas, datas das devoluções, filiais das devoluções.
        var parametros = new DynamicParameters();
        parametros.Add("dtIni1", inicio);
        parametros.Add("dtFim1", fim);
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialA{i}", filiais[i]);
        }
        parametros.Add("dtIni2", inicio);
        parametros.Add("dtFim2", fim);
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialB{i}", filiais[i]);
        }

        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        var linhas = await conexao.QueryAsync<DetalheImpostoDre>(
            new CommandDefinition(
                sql,
                parametros,
                commandTimeout: 600,
                cancellationToken: cancellationToken));

        return linhas.ToList();
    }

    public async Task<IReadOnlyList<DetalheMotivoDre>> ObterDetalheDevolucaoPorMotivoAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        CancellationToken cancellationToken = default)
    {
        if (filiais.Count == 0)
        {
            return [];
        }

        var placeholders = string.Join(", ", filiais.Select((_, i) => $":filial{i}"));
        var sql = string.Format(DreDetalheQueries.DevolucaoPorMotivo, placeholders);

        var parametros = new DynamicParameters();
        parametros.Add("dtIni", dataInicio.ToDateTime(TimeOnly.MinValue));
        parametros.Add("dtFim", dataFim.ToDateTime(TimeOnly.MinValue));
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filial{i}", filiais[i]);
        }

        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        var linhas = await conexao.QueryAsync<DetalheMotivoDre>(
            new CommandDefinition(
                sql,
                parametros,
                commandTimeout: 300,
                cancellationToken: cancellationToken));

        return linhas.ToList();
    }

    public async Task<IReadOnlyList<DetalheLancamentoDre>> ObterDetalheLancamentosAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        RegimeDre regime,
        AnaliseDre analise,
        string bloco,
        string chave,
        CancellationToken cancellationToken = default)
    {
        if (filiais.Count == 0)
        {
            return [];
        }

        // O bloco chega validado do serviço; este switch fechado é a segunda barreira, e é
        // o que garante que nada montado por concatenação venha de entrada do usuário.
        var (antesRo, antesLl, orfa) = bloco switch
        {
            "operacional"     => (true, true, false),
            "pos-operacional" => (false, true, false),
            "orfa"            => (false, false, true),
            _ => throw new ArgumentOutOfRangeException(nameof(bloco), bloco, "Bloco inválido."),
        };

        var placeholdersA = string.Join(", ", filiais.Select((_, i) => $":filialA{i}"));
        var placeholdersB = string.Join(", ", filiais.Select((_, i) => $":filialB{i}"));

        var sql = string.Format(
            DreDetalheQueries.Lancamentos,
            DreDetalheQueries.PredicadoDoBloco(antesRo, antesLl),
            placeholdersA,
            placeholdersB,
            DreDetalheQueries.ColunaDoRecorte(analise.Codigo, orfa),
            regime.ExpressaoFiltro);

        var inicio = dataInicio.ToDateTime(TimeOnly.MinValue);
        var fim = dataFim.ToDateTime(TimeOnly.MinValue);

        // Ordem obrigatória: filiais do financeiro, datas do financeiro, datas da venda de
        // ativo, filiais da venda de ativo, e a chave do recorte por último — é a ordem em
        // que os binds ficam no SQL depois do string.Format.
        var parametros = new DynamicParameters();
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialA{i}", filiais[i]);
        }
        parametros.Add("dtIni1", inicio);
        parametros.Add("dtFim1", fim);
        parametros.Add("dtIni2", inicio);
        parametros.Add("dtFim2", fim);
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialB{i}", filiais[i]);
        }
        parametros.Add("chave", chave);

        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        var linhas = await conexao.QueryAsync<DetalheLancamentoDre>(
            new CommandDefinition(
                sql,
                parametros,
                commandTimeout: 300,
                cancellationToken: cancellationToken));

        return linhas.ToList();
    }
}

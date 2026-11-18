using System.Data;
using Dapper;
using Epoca.Kpi.Api.Application.Common.Bases;
using Epoca.Kpi.Api.Domain.Entities;
using Epoca.Kpi.Api.Domain.Interfaces;
using Epoca.Kpi.Api.Infrastructure.Persistence.Context;
using Epoca.Kpi.Api.Infrastructure.Persistence.Queries;

namespace Epoca.Kpi.Api.Infrastructure.Persistence.Repositories;

/// <inheritdoc cref="ISimuladorPrecoRepository"/>
public sealed class SimuladorPrecoRepository : ISimuladorPrecoRepository
{
    /// <summary>
    /// <b>Provisório.</b> O tempo da consulta numa filial inteira ainda não foi medido (spec §7,
    /// Q5, query <c>sp4</c>). 300 s é folga para não cortar a primeira medição; o número certo
    /// sai dela.
    /// </summary>
    private const int TempoLimiteSegundos = 300;

    /// <summary>Quantas vezes <c>:PCOMPRA</c> aparece no SQL v1 (A1).</summary>
    private const int OcorrenciasDoPreco = 8;

    private readonly IOracleConnectionFactory _conexoes;
    private readonly IBaseAtual _baseAtual;

    public SimuladorPrecoRepository(IOracleConnectionFactory conexoes, IBaseAtual baseAtual)
    {
        _conexoes = conexoes;
        _baseAtual = baseAtual;
    }

    public async Task<IReadOnlyList<ProdutoSimulado>> ConsultarAsync(
        string codFilial,
        int numRegiao,
        decimal? codFornec,
        int matricula,
        CancellationToken cancellationToken = default)
    {
        // A ORDEM DOS Add É A ORDEM DOS :placeholders NO TEXTO — o ODP.NET liga por posição.
        // Acrescentar ou mover uma ocorrência no SQL sem mexer aqui não dá erro de compilação:
        // dá ORA-01008 ou, pior, um valor no lugar do outro.
        var parametros = new DynamicParameters();
        parametros.Add("numRegiao", numRegiao);

        // Zero, e não nulo, para "todos": o SQL faz NVL(:codFornec, 0) e compara com 0 no
        // DECODE. Mandar 0 tipado evita deixar ao Oracle adivinhar o tipo de um nulo sem tipo.
        var fornecedor = codFornec ?? 0m;
        parametros.Add("codFornec1", fornecedor);
        parametros.Add("codFornec2", fornecedor);

        parametros.Add("matricula1", matricula);
        parametros.Add("matricula2", matricula);

        // CODFILIAL é texto no Winthor (PCEST, PCFILIAL): vai como texto.
        parametros.Add("codFilial1", codFilial);
        parametros.Add("codFilial2", codFilial);

        // NULO em todas: o SQL usa o próprio padrão, NVL(VLULTPCOMPRA, CUSTOREP), e a primeira
        // tela é a resposta dele, sem conta nossa (A3). O tipo vai explícito porque um nulo sem
        // tipo dentro de NVL com número é conversão implícita deixada ao acaso.
        for (var i = 1; i <= OcorrenciasDoPreco; i++)
        {
            parametros.Add($"pCompra{i}", null, DbType.Decimal);
        }

        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        var linhas = await conexao.QueryAsync<ProdutoSimulado>(
            new CommandDefinition(
                // A mesma porta do DRE: aplica as regras da base da sessão. O simulador não usa
                // marcador nenhum hoje, e Aplicar devolve o texto igual — mas é por aqui que
                // uma regra por base entraria, sem ninguém lembrar de ligá-la.
                _baseAtual.Base.Regras.Aplicar(SimuladorPrecoQueries.Consulta),
                parametros,
                commandTimeout: TempoLimiteSegundos,
                cancellationToken: cancellationToken));

        return linhas.ToList();
    }
}

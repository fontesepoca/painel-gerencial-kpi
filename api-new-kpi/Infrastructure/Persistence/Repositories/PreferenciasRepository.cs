using System.Data;
using Dapper;
using Epoca.Kpi.Api.Domain.Interfaces;
using Epoca.Kpi.Api.Infrastructure.Persistence.Context;
using Epoca.Kpi.Api.Infrastructure.Persistence.Queries;
using Oracle.ManagedDataAccess.Client;

namespace Epoca.Kpi.Api.Infrastructure.Persistence.Repositories;

public sealed class PreferenciasRepository : IPreferenciasRepository
{
    private const int TempoLimiteSegundos = 10;

    /// <summary>ORA-00001: chave primária duplicada.</summary>
    private const int ChaveDuplicada = 1;

    private readonly IOracleConnectionFactory _conexoes;

    public PreferenciasRepository(IOracleConnectionFactory conexoes) => _conexoes = conexoes;

    public async Task<string?> ObterAsync(int matricula, string tela, CancellationToken cancellationToken = default)
    {
        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        var parametros = new DynamicParameters();
        parametros.Add("matricula", matricula);
        parametros.Add("tela", tela);

        return await conexao.QueryFirstOrDefaultAsync<string?>(new CommandDefinition(
            PreferenciasQueries.Obter,
            parametros,
            commandTimeout: TempoLimiteSegundos,
            cancellationToken: cancellationToken));
    }

    public async Task SalvarAsync(
        int matricula,
        string tela,
        string trecho,
        CancellationToken cancellationToken = default)
    {
        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        try
        {
            await MergeAsync(conexao, matricula, tela, trecho, cancellationToken);
        }
        catch (OracleException erro) when (erro.Number == ChaveDuplicada)
        {
            // As duas PRIMEIRAS gravações da mesma pessoa ao mesmo tempo (duas abas): as duas
            // caem no NOT MATCHED, uma insere e a outra bate na PK. Na segunda vez a linha
            // existe e o MERGE cai no UPDATE — que junta, sem perder nenhum dos dois trechos.
            await MergeAsync(conexao, matricula, tela, trecho, cancellationToken);
        }
    }

    private static Task<int> MergeAsync(
        IDbConnection conexao,
        int matricula,
        string tela,
        string trecho,
        CancellationToken cancellationToken)
    {
        // A ORDEM É A DO SQL: matrícula, tela, o trecho do UPDATE, o trecho do INSERT.
        var parametros = new DynamicParameters();
        parametros.Add("matricula", matricula);
        parametros.Add("tela", tela);
        parametros.Add("trecho1", new ParametroClob(trecho));
        parametros.Add("trecho2", new ParametroClob(trecho));

        // Sem transação, o ODP.NET confirma o comando sozinho (autocommit).
        return conexao.ExecuteAsync(new CommandDefinition(
            PreferenciasQueries.Salvar,
            parametros,
            commandTimeout: TempoLimiteSegundos,
            cancellationToken: cancellationToken));
    }
}

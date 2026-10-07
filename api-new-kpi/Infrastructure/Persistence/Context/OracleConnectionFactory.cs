using System.Data;
using Epoca.Kpi.Api.Application.Common.Bases;
using Epoca.Kpi.Api.Domain.Entities;
using Oracle.ManagedDataAccess.Client;

namespace Epoca.Kpi.Api.Infrastructure.Persistence.Context;

/// <inheritdoc cref="IOracleConnectionFactory"/>
public sealed class OracleConnectionFactory : IOracleConnectionFactory
{
    private readonly IBaseAtual _baseAtual;
    private readonly ILogger<OracleConnectionFactory> _logger;

    public OracleConnectionFactory(IBaseAtual baseAtual, ILogger<OracleConnectionFactory> logger)
    {
        _baseAtual = baseAtual;
        _logger = logger;
    }

    public Task<IDbConnection> CriarConexaoAsync(CancellationToken cancellationToken = default) =>
        CriarConexaoAsync(_baseAtual.Base, cancellationToken);

    public async Task<IDbConnection> CriarConexaoAsync(
        BaseConfigurada baseAlvo,
        CancellationToken cancellationToken = default)
    {
        var conexao = new OracleConnection(baseAlvo.ConnectionString);

        // BindByName = false é o padrão do ODP.NET: os parâmetros são posicionais.
        // A ordem dos parâmetros precisa bater com a ordem dos :placeholders no SQL.
        // Ver docs/plataforma/CONVENCOES_ORACLE.md antes de escrever query.
        conexao.BindByName = false;

        try
        {
            await conexao.OpenAsync(cancellationToken);
            return conexao;
        }
        catch (OracleException excecao)
        {
            await conexao.DisposeAsync();

            // O número, e nada mais: a mensagem do ODP.NET pode citar o serviço, e a string
            // de conexão carrega credencial e não pode vazar para o log.
            _logger.LogError(
                "Falha ao abrir conexão com o Oracle da base {Base}: ORA-{Codigo:D5}.",
                baseAlvo.Id,
                excecao.Number);

            throw new BaseIndisponivelException(baseAlvo, $"ORA-{excecao.Number:D5}", excecao);
        }
        catch
        {
            await conexao.DisposeAsync();
            throw;
        }
    }
}

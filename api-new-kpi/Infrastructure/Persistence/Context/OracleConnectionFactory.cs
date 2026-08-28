using System.Data;
using Oracle.ManagedDataAccess.Client;

namespace Epoca.Kpi.Api.Infrastructure.Persistence.Context;

/// <inheritdoc cref="IOracleConnectionFactory"/>
public sealed class OracleConnectionFactory : IOracleConnectionFactory
{
    private readonly string? _connectionString;
    private readonly ILogger<OracleConnectionFactory> _logger;

    public OracleConnectionFactory(IConfiguration configuration, ILogger<OracleConnectionFactory> logger)
    {
        _connectionString = configuration.GetConnectionString("OracleEpoca");
        _logger = logger;
    }

    public bool EstaConfigurada => !string.IsNullOrWhiteSpace(_connectionString);

    public async Task<IDbConnection> CriarConexaoAsync(CancellationToken cancellationToken = default)
    {
        if (!EstaConfigurada)
        {
            throw new InvalidOperationException(
                "ConnectionStrings:OracleEpoca não está configurada. " +
                "Preencha no appsettings do ambiente (veja appsettings.example.json).");
        }

        var conexao = new OracleConnection(_connectionString);

        // BindByName = false é o padrão do ODP.NET: os parâmetros são posicionais.
        // A ordem dos parâmetros precisa bater com a ordem dos :placeholders no SQL.
        // Ver Docs/CONVENCOES_ORACLE.md antes de escrever qualquer query.
        conexao.BindByName = false;

        try
        {
            await conexao.OpenAsync(cancellationToken);
            return conexao;
        }
        catch
        {
            await conexao.DisposeAsync();
            // Sem detalhe da exceção aqui: a string de conexão carrega credencial e
            // não pode vazar para o log.
            _logger.LogError("Falha ao abrir conexão com o Oracle da Época.");
            throw;
        }
    }
}

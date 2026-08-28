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
}

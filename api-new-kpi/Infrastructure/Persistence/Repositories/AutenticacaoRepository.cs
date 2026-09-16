using Dapper;
using Epoca.Kpi.Api.Domain.Entities;
using Epoca.Kpi.Api.Domain.Interfaces;
using Epoca.Kpi.Api.Infrastructure.Persistence.Context;
using Epoca.Kpi.Api.Infrastructure.Persistence.Queries;

namespace Epoca.Kpi.Api.Infrastructure.Persistence.Repositories;

/// <inheritdoc cref="IAutenticacaoRepository"/>
public sealed class AutenticacaoRepository : IAutenticacaoRepository
{
    /// <summary>
    /// Consulta de cadastro com um <c>DECRYPT</c> no meio, buscando por coluna indexada.
    /// Se passar disto, o problema é de infraestrutura — e pendurar quem está tentando
    /// entrar é pior do que recusar depressa.
    /// </summary>
    private const int TempoLimiteSegundos = 30;

    private readonly IOracleConnectionFactory _conexoes;

    public AutenticacaoRepository(IOracleConnectionFactory conexoes) => _conexoes = conexoes;

    public async Task<CredenciaisWinthor?> VerificarCredenciaisAsync(
        string nomeGuerra,
        string senha,
        CancellationToken cancellationToken = default)
    {
        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        // A ORDEM É A DO SQL, não a da assinatura deste método: `:senha` aparece no SELECT e
        // `:login` no WHERE. Com BindByName = false quem casa é a posição. Trocar as duas
        // linhas abaixo compila, roda e recusa todo mundo — ver docs/CONVENCOES_ORACLE.md.
        var parametros = new DynamicParameters();
        parametros.Add("senha", senha);
        parametros.Add("login", nomeGuerra);

        var encontradas = await conexao.QueryAsync<CredenciaisWinthor>(
            new CommandDefinition(
                AutenticacaoQueries.Credenciais,
                parametros,
                commandTimeout: TempoLimiteSegundos,
                cancellationToken: cancellationToken));

        var lista = encontradas.ToList();

        // DUAS PESSOAS COM O MESMO NOME DE GUERRA: ninguém entra.
        //
        // O painel antigo pega a primeira linha que o Oracle devolver. Sem ORDER BY não há
        // ordem prometida, então a escolha pode mudar entre execuções — e o descarte acontece
        // antes de a senha ser conferida, de modo que a pessoa certa, com a senha certa, pode
        // não entrar. Recusar é a única resposta honesta: o banco não sabe qual das duas está
        // digitando, e adivinhar aqui é escolher a conta de alguém.
        //
        // Hoje isto não acontece — nenhum NOME_GUERRA repetido tem duas pessoas com senha
        // (dc31) —, e é justamente por ser raro que precisa estar tratado: quando acontecer,
        // ninguém vai lembrar desta conversa.
        return lista.Count == 1 ? lista[0] : null;
    }

    public async Task<IReadOnlyList<string>> ObterFiliaisDoUsuarioAsync(
        int matricula,
        CancellationToken cancellationToken = default)
    {
        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        var filiais = await conexao.QueryAsync<string>(
            new CommandDefinition(
                AutenticacaoQueries.FiliaisDoUsuario,
                new { matricula },
                commandTimeout: TempoLimiteSegundos,
                cancellationToken: cancellationToken));

        return filiais.ToList();
    }
}

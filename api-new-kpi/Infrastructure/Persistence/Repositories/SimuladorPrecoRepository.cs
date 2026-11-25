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
    /// Uma página levou ~3 s no Oracle, e uma busca 1,5 s (sp14, 24/11/2026, filial 7, região 90,
    /// todos os fornecedores). 60 s é folga larga sem deixar uma consulta presa por minutos.
    /// </summary>
    private const int TempoLimiteSegundos = 60;

    /// <summary>Quantas vezes <c>:PCOMPRA</c> aparece no SQL v2 (A1). Eram 8 na v1.</summary>
    private const int OcorrenciasDoPreco = 22;

    private readonly IOracleConnectionFactory _conexoes;
    private readonly IBaseAtual _baseAtual;

    public SimuladorPrecoRepository(IOracleConnectionFactory conexoes, IBaseAtual baseAtual)
    {
        _conexoes = conexoes;
        _baseAtual = baseAtual;
    }

    public async Task<IReadOnlyList<VinculoDeRegiao>> ObterVinculosDeRegiaoAsync(
        int matricula,
        CancellationToken cancellationToken = default)
    {
        var parametros = new DynamicParameters();
        parametros.Add("matricula", matricula);

        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        var linhas = await conexao.QueryAsync<VinculoDeRegiao>(
            new CommandDefinition(
                SimuladorPrecoQueries.VinculosDeRegiao,
                parametros,
                commandTimeout: TempoLimiteSegundos,
                cancellationToken: cancellationToken));

        return linhas.ToList();
    }

    public async Task<(IReadOnlyList<ProdutoSimulado> Itens, int Total)> ConsultarPaginaAsync(
        string codFilial,
        int numRegiao,
        IReadOnlyList<int>? fornecedores,
        int matricula,
        int pagina,
        int tamanhoPagina,
        string? busca,
        IReadOnlyList<string>? classes,
        IReadOnlyList<string>? codigos,
        CancellationToken cancellationToken = default)
    {
        // A ORDEM DOS Add É A ORDEM DOS :placeholders NO TEXTO — o ODP.NET liga por posição.
        // Acrescentar ou mover uma ocorrência no SQL sem mexer aqui não dá erro de compilação:
        // dá ORA-01008 ou, pior, um valor no lugar do outro.
        //
        // A ORDEM DA v2 (a sp5 imprime a mesma lista a partir da referência): os 22 :pCompra vêm
        // PRIMEIRO, porque estão no SELECT interno; depois :numRegiao, :fornecedoresNulo/:fornecedores (A8),
        // :matricula1/2 (as duas PCLIB) e :codFilial, no WHERE. Na v1 a ordem era outra.
        var parametros = new DynamicParameters();

        // NULO em todas: o SQL usa o próprio padrão, NVL(VLULTPCOMPRA, 0), e a primeira tela é a
        // resposta dele, sem conta nossa (A3). O tipo vai explícito porque um nulo sem tipo
        // dentro de NVL com número é conversão implícita deixada ao acaso.
        for (var i = 1; i <= OcorrenciasDoPreco; i++)
        {
            parametros.Add($"pCompra{i}", null, DbType.Decimal);
        }

        parametros.Add("numRegiao", numRegiao);

        // A LISTA de fornecedores (A8, 24/11/2026): texto "234,500" para o INSTR; nulo = todos.
        // Como texto tipado, igual às classes: um nulo sem tipo fica ao acaso do Oracle.
        var listaDeFornecedores = fornecedores is { Count: > 0 } ? string.Join(",", fornecedores) : null;
        parametros.Add("fornecedoresNulo", listaDeFornecedores, DbType.String);
        parametros.Add("fornecedores", listaDeFornecedores, DbType.String);

        parametros.Add("matricula1", matricula);
        parametros.Add("matricula2", matricula);

        // CODFILIAL é texto no Winthor (PCEST, PCFILIAL): vai como texto. Uma vez só na v2.
        parametros.Add("codFilial", codFilial);

        // ── A paginação (ConsultaPaginada), DEPOIS dos 28 da Consulta — a sp15 confere. ──
        // Cada filtro tem um bind "nulo" na frente: nulo = sem esse filtro.
        var termo = string.IsNullOrWhiteSpace(busca) ? null : busca.Trim();
        parametros.Add("buscaNula", termo, DbType.String);
        parametros.Add("buscaCodigo", termo, DbType.String);
        parametros.Add(
            "buscaLike",
            termo is null ? null : $"%{EscaparLike(termo.ToUpperInvariant())}%",
            DbType.String);

        var listaDeClasses = classes is null ? null : string.Join(",", classes);
        parametros.Add("classesNula", listaDeClasses, DbType.String);
        parametros.Add("classes", listaDeClasses, DbType.String);

        var listaDeCodigos = codigos is null ? null : string.Join(",", codigos);
        parametros.Add("codigosNulo", listaDeCodigos, DbType.String);
        parametros.Add("codigos", listaDeCodigos, DbType.String);

        parametros.Add("inicio", (pagina - 1) * tamanhoPagina);
        parametros.Add("tamanho", tamanhoPagina);

        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        var linhas = await conexao.QueryAsync<ProdutoSimulado>(
            new CommandDefinition(
                // A mesma porta do DRE: aplica as regras da base da sessão. O simulador não usa
                // marcador nenhum hoje, e Aplicar devolve o texto igual — mas é por aqui que
                // uma regra por base entraria, sem ninguém lembrar de ligá-la.
                _baseAtual.Base.Regras.Aplicar(SimuladorPrecoQueries.ConsultaPaginada),
                parametros,
                commandTimeout: TempoLimiteSegundos,
                cancellationToken: cancellationToken));

        var itens = linhas.ToList();

        // O total vem em toda linha (COUNT(*) OVER ()). Sem linha nenhuma, ou a página está além
        // do fim ou nada passou nos filtros: o total sai 0 nos dois casos, e a tela trata o
        // primeiro voltando à última página.
        var total = itens.Count == 0 ? 0 : (int)itens[0].TotalItens;
        return (itens, total);
    }

    /// <summary>
    /// <c>%</c> e <c>_</c> digitados na busca são TEXTO, não curinga (spec, casos de borda): o
    /// SQL usa <c>LIKE … ESCAPE '\'</c>, e por isso a própria barra também é escapada.
    /// </summary>
    internal static string EscaparLike(string texto) =>
        texto.Replace(@"\", @"\\").Replace("%", @"\%").Replace("_", @"\_");
}

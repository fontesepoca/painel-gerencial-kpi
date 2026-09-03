using Epoca.Kpi.Api.Application.Features.DreGerencial;
using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Domain.Interfaces;

/// <summary>
/// Acesso a dados da rotina DRE Gerencial. Somente leitura.
/// </summary>
public interface IDreGerencialRepository
{
    /// <summary>
    /// Filiais disponíveis para o filtro, na ordem de exibição do cadastro.
    /// </summary>
    Task<IReadOnlyList<Filial>> ObterFiliaisAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Estrutura de linhas do DRE na dimensão pedida, incluindo as contas órfãs do
    /// período — as que dão rótulo ao bloco final do relatório.
    /// </summary>
    /// <param name="analise">
    /// Precisa estar implementada. Cada dimensão tem um SQL próprio na 9815, não é um
    /// parâmetro do mesmo SQL.
    /// </param>
    Task<IReadOnlyList<LinhaEstruturaDre>> ObterEstruturaAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        RegimeDre regime,
        AnaliseDre analise,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Despesas do período agregadas pela chave da dimensão e por mês. Replica o
    /// `GetValorGrupo` da 9815 — SQL validado contra o original.
    /// </summary>
    Task<IReadOnlyList<DespesaDre>> ObterDespesasAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        RegimeDre regime,
        AnaliseDre analise,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Faturamento, CMV e impostos, uma linha por mês do período. Não recebe regime:
    /// caixa e competência produzem os mesmos valores aqui.
    /// </summary>
    Task<IReadOnlyList<FaturamentoDre>> ObterFaturamentoPorMesAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Detalhamento de `(+) RECEITA BRUTA` e `(=) RECEITAS LIQUIDAS` — as duas abrem a
    /// mesma tela na 9815, com a mesma consulta.
    ///
    /// <para>Não recebe regime: como o faturamento, caixa e competência dão o mesmo.</para>
    /// </summary>
    Task<IReadOnlyList<DetalheClienteDre>> ObterDetalheReceitaPorClienteAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        CancellationToken cancellationToken = default);

    /// <summary>Detalhamento de `(-) DEVOLUCAO`, agregado por motivo.</summary>
    Task<IReadOnlyList<DetalheMotivoDre>> ObterDetalheDevolucaoPorMotivoAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Detalhamento de `(-) ST`, `(-) PIS` e `(-) COFINS`, agregado por produto.
    /// <paramref name="imposto"/> é `st`, `pis` ou `cofins` — lista fechada, validada na
    /// consulta antes de virar SQL.
    /// </summary>
    Task<IReadOnlyList<DetalheImpostoDre>> ObterDetalheImpostoPorProdutoAsync(
        string imposto,
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Lançamentos de uma linha de grupo, um a um.
    /// </summary>
    /// <param name="bloco">
    /// `operacional`, `pos-operacional` ou `orfa`. Define os operadores `in`/`not in` da
    /// consulta e a coluna do recorte — é a mesma divisão em três que o `MontadorDre` faz
    /// por `AntesRO`/`AntesLL`.
    /// </param>
    /// <param name="chave">
    /// O `GRUPOCONTA` da linha clicada, o mesmo que a apuração usou para somá-la.
    /// </param>
    Task<IReadOnlyList<DetalheLancamentoDre>> ObterDetalheLancamentosAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        RegimeDre regime,
        AnaliseDre analise,
        string bloco,
        string chave,
        CancellationToken cancellationToken = default);
}

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
    /// <param name="fornecedores">
    /// Os códigos de fornecedor a apurar. Aqui o filtro <b>não</b> corta valor: ele separa o
    /// que é <b>exclusivo</b> do fornecedor — a verba do centro 90 e os centros dedicados a
    /// ele — do que vai ser rateado pela participação, e tira do DRE os centros que pertencem
    /// a outro fornecedor. Quem rateia é o montador. Nulo ou vazio é o DRE inteiro.
    /// </param>
    Task<IReadOnlyList<DespesaDre>> ObterDespesasAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        RegimeDre regime,
        AnaliseDre analise,
        IReadOnlyList<decimal>? fornecedores = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Os fornecedores que casam com <paramref name="busca"/>, por nome ou por código exato,
    /// no máximo <paramref name="limite"/> deles.
    ///
    /// <para>É BUSCA, não listagem: o cadastro tem mais de treze mil, e quem filtra o DRE sabe
    /// de quem está falando.</para>
    /// </summary>
    Task<IReadOnlyList<FornecedorDre>> BuscarFornecedoresAsync(
        string busca,
        int limite,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Faturamento, CMV e impostos, uma linha por mês do período. Não recebe regime:
    /// caixa e competência produzem os mesmos valores aqui.
    ///
    /// <para><paramref name="fornecedores"/> filtra por <c>pr.codfornec</c> — o fornecedor do
    /// PRODUTO, item a item. Cada linha traz também a receita líquida <b>sem</b> o filtro, que
    /// é o denominador da participação com que as despesas são rateadas. Nulo ou vazio é a
    /// filial inteira, e aí as duas receitas são iguais e a participação é 1.</para>
    /// </summary>
    Task<IReadOnlyList<FaturamentoDre>> ObterFaturamentoPorMesAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        IReadOnlyList<decimal>? fornecedores = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Detalhamento de `(+) RECEITA BRUTA` e `(=) RECEITAS LIQUIDAS` — as duas abrem a
    /// mesma tela na 9815, com a mesma consulta.
    ///
    /// <para>Não recebe regime: como o faturamento, caixa e competência dão o mesmo.</para>
    ///
    /// <para><paramref name="fornecedores"/> filtra pelo mesmo <c>pr.codfornec</c> da
    /// apuração, e aqui o detalhe <b>fecha com a célula</b>: a receita sai do produto, item a
    /// item, sem rateio pelo caminho.</para>
    /// </summary>
    Task<IReadOnlyList<DetalheClienteDre>> ObterDetalheReceitaPorClienteAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        IReadOnlyList<decimal>? fornecedores = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Detalhamento de `(-) DEVOLUCAO`, agregado por motivo. <paramref name="fornecedores"/>
    /// filtra como na receita, e fecha com a célula pelo mesmo motivo.
    /// </summary>
    Task<IReadOnlyList<DetalheMotivoDre>> ObterDetalheDevolucaoPorMotivoAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        IReadOnlyList<decimal>? fornecedores = null,
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
        IReadOnlyList<decimal>? fornecedores = null,
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
    /// <param name="fornecedores">
    /// Com fornecedor filtrado, o recorte é o MESMO da apuração — os centros de outro
    /// fornecedor saem — e cada lançamento volta marcado em <c>Exclusivo</c>. O que não é
    /// exclusivo entra no DRE rateado pela participação, e quem aplica isso é o serviço: a
    /// consulta devolve o lançamento como ele é.
    /// </param>
    Task<IReadOnlyList<DetalheLancamentoDre>> ObterDetalheLancamentosAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        RegimeDre regime,
        AnaliseDre analise,
        string bloco,
        string chave,
        IReadOnlyList<decimal>? fornecedores = null,
        CancellationToken cancellationToken = default);
}

using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Domain.Interfaces;

/// <summary>Leitura do simulador de preço. Nenhuma escrita: a simulação vive na tela.</summary>
public interface ISimuladorPrecoRepository
{
    /// <summary>
    /// As regiões do comprador na <c>TAB_REG_PR_FILIAL</c>, uma linha por filial, sem as de
    /// região nula (spec 2026-11-25-simulador-regiao-pelo-vinculo-do-comprador).
    /// </summary>
    /// <param name="matricula">De quem está logado, vinda do token.</param>
    Task<IReadOnlyList<VinculoDeRegiao>> ObterVinculosDeRegiaoAsync(
        int matricula,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// UMA PÁGINA dos produtos da filial e da região, com o preço de compra que o próprio SQL
    /// escolhe (<c>:PCOMPRA</c> nulo — spec A3), já filtrada e ordenada pelo Oracle (spec
    /// 2026-11-24-simulador-paginacao-no-backend).
    /// </summary>
    /// <param name="numRegiao">A do vínculo do comprador (<see cref="ObterVinculosDeRegiaoAsync"/>), nunca digitada.</param>
    /// <param name="fornecedores">Códigos de fornecedor. Nulo traz todos (spec 2026-11-24-simulador-varios-fornecedores).</param>
    /// <param name="matricula">De quem está logado: decide a liberação na <c>PCLIB</c> (D3).</param>
    /// <param name="pagina">De 1 em diante.</param>
    /// <param name="tamanhoPagina">Quantas linhas por página.</param>
    /// <param name="busca">Código exato ou trecho da descrição. Nulo ou vazio = sem busca.</param>
    /// <param name="classes">Classes de venda. Nulo = sem filtro de classe.</param>
    /// <param name="codigos">Códigos de produto ("só simulados"). Nulo = sem esse filtro.</param>
    /// <returns>As linhas da página e o total de linhas que passaram nos filtros.</returns>
    Task<(IReadOnlyList<ProdutoSimulado> Itens, int Total)> ConsultarPaginaAsync(
        string codFilial,
        int numRegiao,
        IReadOnlyList<int>? fornecedores,
        int matricula,
        int pagina,
        int tamanhoPagina,
        string? busca,
        IReadOnlyList<string>? classes,
        IReadOnlyList<string>? codigos,
        CancellationToken cancellationToken = default);
}

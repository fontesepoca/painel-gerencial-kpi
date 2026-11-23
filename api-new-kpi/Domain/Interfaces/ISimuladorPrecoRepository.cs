using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Domain.Interfaces;

/// <summary>Leitura do simulador de preço. Nenhuma escrita: a simulação vive na tela.</summary>
public interface ISimuladorPrecoRepository
{
    /// <summary>
    /// Os produtos da filial e da região, com o preço de compra que o próprio SQL escolhe
    /// (<c>:PCOMPRA</c> nulo — spec A3).
    /// </summary>
    /// <param name="codFornec">Nulo traz todos os fornecedores (o SQL trata 0 como "todos").</param>
    /// <param name="matricula">De quem está logado: decide a liberação na <c>PCLIB</c> (D3).</param>
    Task<IReadOnlyList<ProdutoSimulado>> ConsultarAsync(
        string codFilial,
        int numRegiao,
        decimal? codFornec,
        int matricula,
        CancellationToken cancellationToken = default);
}

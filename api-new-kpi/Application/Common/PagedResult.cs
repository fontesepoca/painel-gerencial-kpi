namespace Epoca.Kpi.Api.Application.Common;

/// <summary>
/// Página de resultados. Oracle 11g não tem OFFSET/FETCH — a paginação é feita com
/// ROWNUM em subconsulta aninhada (ver Docs/CONVENCOES_ORACLE.md).
/// </summary>
public record PagedResult<T>
{
    public required IReadOnlyList<T> Itens { get; init; }
    public required int Pagina { get; init; }
    public required int TamanhoPagina { get; init; }
    public required int TotalItens { get; init; }

    public int TotalPaginas => TamanhoPagina <= 0
        ? 0
        : (int)Math.Ceiling(TotalItens / (double)TamanhoPagina);

    public bool TemAnterior => Pagina > 1;
    public bool TemProxima => Pagina < TotalPaginas;

    public static PagedResult<T> Vazio(int pagina, int tamanhoPagina) => new()
    {
        Itens = [],
        Pagina = pagina,
        TamanhoPagina = tamanhoPagina,
        TotalItens = 0
    };
}

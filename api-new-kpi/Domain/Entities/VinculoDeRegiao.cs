namespace Epoca.Kpi.Api.Domain.Entities;

/// <summary>
/// Uma linha da <c>TAB_REG_PR_FILIAL</c> (schema EPCTI): a região que o comprador usa numa
/// filial. É o vínculo da rotina em operação, que o simulador passou a seguir em 25/11/2026
/// (spec 2026-11-25-simulador-regiao-pelo-vinculo-do-comprador).
/// </summary>
public class VinculoDeRegiao
{
    /// <summary>Texto, como em todo o Winthor (ver <see cref="Filial"/>).</summary>
    public string CodFilial { get; init; } = string.Empty;

    /// <summary>A região. A consulta já descarta as linhas com região nula.</summary>
    public decimal NumRegiao { get; init; }
}

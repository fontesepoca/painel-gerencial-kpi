namespace Epoca.Kpi.Api.Domain.Entities;

/// <summary>
/// Uma linha da estrutura do DRE, vinda de `EPCPARDRE`.
/// Define o que aparece na tela, em que ordem e com que cor — os valores entram depois.
/// </summary>
public class LinhaEstruturaDre
{
    /// <summary>
    /// Ordem de exibição. <b>Anulável de propósito:</b> o cadastro tem uma linha com `ID`
    /// nulo ("Pneus e Câmaras"), que por isso aparece depois do LUCRO LIQUIDO.
    /// </summary>
    public int? Id { get; init; }

    /// <summary>
    /// Chave da linha, sempre texto. Negativa (`-1` a `-4`) marca linha calculada;
    /// positiva referencia grupo ou conta, conforme a dimensão.
    /// </summary>
    public string CodGruConta { get; init; } = string.Empty;

    public string Grupo { get; init; } = string.Empty;

    /// <summary>`'S'` nas 9 linhas totalizadoras.</summary>
    public string InfContas { get; init; } = string.Empty;

    /// <summary>
    /// Cor no formato `TColor` do Delphi — <b>BGR</b>, não RGB.
    /// Converter com <see cref="Application.Features.DreGerencial.CorDelphi"/>.
    /// </summary>
    public int? Cor { get; init; }

    /// <summary>`'S'` se a linha vem antes de RESULTADO OPERACIONAL.</summary>
    public string AntesRo { get; init; } = "N";

    /// <summary>`'S'` se a linha vem antes de LUCRO LIQUIDO.</summary>
    public string AntesLl { get; init; } = "N";

    /// <summary>
    /// Em Grupo de Contas e Conta Gerencial é igual a <see cref="AntesLl"/>. Nas dimensões
    /// de centro de custo a 9815 compara com o rótulo `LUCRO FINAL` — ver
    /// `docs/ROTINA_9815_LEVANTAMENTO.md` §4.4.
    /// </summary>
    public string AntesLf { get; init; } = "N";
}

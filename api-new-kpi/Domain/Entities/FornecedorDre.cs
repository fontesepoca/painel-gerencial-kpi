namespace Epoca.Kpi.Api.Domain.Entities;

/// <summary>
/// Um fornecedor do cadastro, para o filtro do DRE.
///
/// <para><b>O filtro é por CÓDIGO, não por empresa.</b> Cada cadastro é um recorte: pedir
/// <c>29</c> traz o DRE do 29, pedir <c>2453</c> traz o do 2453, e um não puxa o outro mesmo
/// quando <see cref="CodFornecPrinc"/> diz que são a mesma empresa. Decisão registrada em
/// <c>docs/FILTRO_FORNECEDOR.md</c>.</para>
///
/// <para>O principal vem junto mesmo assim, porque a tela precisa dele para AVISAR: quem
/// escolhe a Gillette merece saber que existem outros dois cadastros da mesma empresa, e que
/// o DRE que ele está pedindo não os inclui.</para>
/// </summary>
public class FornecedorDre
{
    public decimal CodFornec { get; init; }

    public string Fornecedor { get; init; } = string.Empty;

    /// <summary>CNPJ sem máscara, como o Winthor guarda.</summary>
    public string? Cgc { get; init; }

    /// <summary>
    /// O cadastro principal do grupo. Igual a <see cref="CodFornec"/> quando não há grupo.
    /// </summary>
    public decimal? CodFornecPrinc { get; init; }
}

namespace Epoca.Kpi.Api.Application.Features.DreGerencial;

/// <summary>
/// Converte a coluna `EPCPARDRE.COR` para cor CSS.
///
/// <para>
/// <b>`TColor` do Delphi é BGR, não RGB.</b> O inteiro guarda `0x00BBGGRR`: o byte menos
/// significativo é o vermelho, e o mais significativo o azul. Tratar como RGB inverte os
/// canais — `15780518` viraria laranja (`#F0CAA6`) em vez do azul claro (`#A6CAF0`) que a
/// grade do Winthor mostra nas linhas de imposto.
/// </para>
///
/// <para>
/// Valores com o bit alto ligado (`0x80000000`) são cores de sistema do Delphi (`clWindow`,
/// `clBtnFace`), que não têm equivalente fixo em CSS: viram <c>null</c>, e a linha fica com
/// a cor padrão da tabela.
/// </para>
/// </summary>
public static class CorDelphi
{
    /// <summary>Converte `TColor` para `#RRGGBB`. Devolve <c>null</c> quando não se aplica.</summary>
    public static string? ParaCss(int? tColor)
    {
        if (tColor is null or < 0 or > 0xFFFFFF)
        {
            return null;
        }

        var valor = tColor.Value;
        var vermelho = valor & 0xFF;
        var verde = (valor >> 8) & 0xFF;
        var azul = (valor >> 16) & 0xFF;

        return $"#{vermelho:X2}{verde:X2}{azul:X2}";
    }
}

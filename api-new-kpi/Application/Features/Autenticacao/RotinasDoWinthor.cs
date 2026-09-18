namespace Epoca.Kpi.Api.Application.Features.Autenticacao;

/// <summary>
/// Os códigos das rotinas do Winthor que este sistema oferece.
///
/// <para>São os mesmos números do ERP — <c>9815</c> é a GERENCIAL / DRE. Usar o código do
/// Winthor, e não um identificador nosso, evita uma tradução a mais entre o que a permissão
/// diz no banco e o que a sessão carrega.</para>
///
/// <para><b>Existe para o front não escrever a string solta.</b> A tela inicial decide o que
/// mostrar comparando com estes valores, e uma constante de um lado só não impede ninguém de
/// digitar <c>"9815 "</c> com um espaço no outro. É o mesmo cuidado que levou o
/// <c>LinhaDreDto.Papel</c> a existir — ver <c>docs/ROTINA_9815.md</c>.</para>
/// </summary>
public static class RotinasDoWinthor
{
    /// <summary>GERENCIAL / DRE. A rotina piloto, e por enquanto a única.</summary>
    public const string DreGerencial = "9815";
}

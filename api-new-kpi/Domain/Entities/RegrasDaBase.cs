using System.Globalization;

namespace Epoca.Kpi.Api.Domain.Entities;

/// <summary>
/// O que muda de uma base para outra — e nada além disso.
///
/// <para><b>Cada campo corresponde a um literal que estava fixo no código</b>, e a lista só
/// cresce quando um literal novo for achado e medido. Não há campo "por precaução". O
/// Delphi resolve isto com <c>if bBaseMRURAL</c> espalhado pelo fonte; aqui a diferença é
/// um objeto de configuração, e uma terceira base entra sem mexer em consulta.</para>
///
/// <para>As consultas trazem MARCADORES (<c>@@SECAO_SEM_CUSTO@@</c>…), e
/// <see cref="Aplicar"/> os troca antes de a consulta ir ao Oracle. <b>Marcador que sobrar
/// dá erro</b>, em vez de seguir com o valor errado calado.</para>
/// </summary>
public sealed class RegrasDaBase
{
    public const string MarcadorSecaoSemCusto = "@@SECAO_SEM_CUSTO@@";

    /// <summary>
    /// Todo marcador que <see cref="Aplicar"/> sabe expandir. O programa
    /// <c>docs/plataforma/validacao/verificar_regras.cs</c> imprime a expansão de cada um, e
    /// o <c>dc86</c> a compara com o que a Época tinha no SQL original.
    /// </summary>
    public static readonly IReadOnlyList<string> Marcadores = [MarcadorSecaoSemCusto];

    /// <summary>Código da seção cujo custo o DRE zera. Época: 1601. Minas Rural (fonte): 1401.</summary>
    public int SecaoSemCusto { get; set; } = 1601;

    /// <summary>Se as contas de ICMS (grupo 303) viram uma conta só. Ver BASE_MINAS_RURAL.md.</summary>
    public bool AgrupaIcms { get; set; }

    /// <summary>Filiais que o filtro da tela NÃO oferece. Vazia = todas.</summary>
    public List<string> FiliaisForaDoFiltro { get; set; } = [];

    /// <summary>Filiais que a permissão (<c>PCLIB</c>) NÃO conta. Vazia = todas.</summary>
    public List<int> FiliaisForaDaPermissao { get; set; } = [];

    /// <summary>
    /// Derruba o boot com a mensagem certa quando a configuração está errada.
    ///
    /// <para><b>Código de filial é só dígito.</b> Esse valor entra no SQL por texto — não
    /// por bind —, e é esta validação que impede a configuração de virar porta de injeção.</para>
    /// </summary>
    public void Validar(string baseId)
    {
        if (SecaoSemCusto <= 0)
        {
            throw new InvalidOperationException(
                $"Bases:{baseId}:Regras:SecaoSemCusto está {SecaoSemCusto}. " +
                "Use o código da seção, que é positivo.");
        }

        foreach (var filial in FiliaisForaDoFiltro)
        {
            if (filial.Length == 0 || !filial.All(char.IsAsciiDigit))
            {
                throw new InvalidOperationException(
                    $"Bases:{baseId}:Regras:FiliaisForaDoFiltro tem \"{filial}\". Código de " +
                    "filial é só dígito: o valor entra no SQL por texto.");
            }
        }

        foreach (var filial in FiliaisForaDaPermissao)
        {
            if (filial <= 0)
            {
                throw new InvalidOperationException(
                    $"Bases:{baseId}:Regras:FiliaisForaDaPermissao tem {filial}. Use o código " +
                    "da filial, que é positivo.");
            }
        }
    }

    /// <summary>
    /// Troca os marcadores do SQL pelo que esta base manda. <b>Chame-a no SQL já montado</b>
    /// (depois do <c>string.Format</c>): os marcadores não têm chave, então o <c>Format</c>
    /// os deixa passar, e nenhuma expansão contém <c>:</c> — a ordem dos binds não muda.
    /// </summary>
    public string Aplicar(string sql)
    {
        var pronto = sql.Replace(
            MarcadorSecaoSemCusto,
            SecaoSemCusto.ToString(CultureInfo.InvariantCulture),
            StringComparison.Ordinal);

        if (pronto.Contains("@@", StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "A consulta ainda tem um marcador @@…@@ que Aplicar não expande. Um marcador " +
                "esquecido chegaria ao Oracle como texto — ou, pior, a consulta rodaria com o " +
                "valor de outra base.");
        }

        return pronto;
    }
}

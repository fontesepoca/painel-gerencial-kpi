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
    public const string MarcadorFiliaisForaDoFiltro = "@@FILIAIS_FORA_DO_FILTRO@@";
    public const string MarcadorFiliaisForaDaPermissao = "@@FILIAIS_FORA_DA_PERMISSAO@@";
    public const string MarcadorRateioRc = "@@RATEIO_RC@@";
    public const string MarcadorCodcontaLanc = "@@CODCONTA_LANC@@";

    // O grupo e a conta agrupadora do ICMS, como o Delphi os fixa (UBase.pas GetValorGrupo e
    // ULanc.pas): conta cujo nome tem ICMS e cujo grupo é 303 passa a ser a 3003007.
    private const int GrupoDeContasDoIcms = 303;
    private const int ContaAgrupadoraDoIcms = 3003007;

    // O rateio vira uma subconsulta que expõe as MESMAS quatro colunas que as consultas leem
    // de `RC` (recnum, codconta, valor, codigocentrocusto) — o Step 2 desta tarefa confere.
    private const string RateioComIcms =
        "(select rt.recnum, " +
        "case when upper(cta.conta) like '%ICMS%' and cta.grupoconta = 303 then 3003007 " +
        "else rt.codconta end as codconta, " +
        "rt.valor, rt.codigocentrocusto " +
        "from PCRATEIOCENTROCUSTO rt, PCCONTA cta where rt.codconta = cta.codconta)";

    private const string CodcontaComIcms =
        "(SELECT case when upper(conta) like '%ICMS%' and grupoconta = 303 then 3003007 " +
        "else codconta end FROM PCCONTA WHERE CODCONTA = PCLANC.CODCONTA) as codconta";

    /// <summary>
    /// Todo marcador que <see cref="Aplicar"/> sabe expandir. O programa
    /// <c>docs/plataforma/validacao/verificar_regras.cs</c> imprime a expansão de cada um, e
    /// o <c>dc86</c> a compara com o que a Época tinha no SQL original.
    /// </summary>
    public static readonly IReadOnlyList<string> Marcadores =
    [
        MarcadorSecaoSemCusto,
        MarcadorFiliaisForaDoFiltro,
        MarcadorFiliaisForaDaPermissao,
        MarcadorRateioRc,
        MarcadorCodcontaLanc,
    ];

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

        // Lista vazia vira NADA — e não `NOT IN ()`, que o Oracle recusa. Os códigos do filtro
        // entram entre aspas porque `F.CODFIL` é texto; os da permissão entram como número,
        // como a 9815 faz (`CODIGOA NOT IN (2, 99)`). Os dois já foram validados (só dígito).
        pronto = pronto
            .Replace(
                MarcadorFiliaisForaDoFiltro,
                FiliaisForaDoFiltro.Count == 0
                    ? string.Empty
                    : $"AND F.CODFIL NOT IN ({string.Join(",", FiliaisForaDoFiltro.Select(f => $"'{f}'"))})",
                StringComparison.Ordinal)
            .Replace(
                MarcadorFiliaisForaDaPermissao,
                FiliaisForaDaPermissao.Count == 0
                    ? string.Empty
                    : $"AND CODIGOA NOT IN ({string.Join(", ", FiliaisForaDaPermissao)})",
                StringComparison.Ordinal);

        // O ICMS DESLIGADO devolve o texto que as consultas tinham: `PCRATEIOCENTROCUSTO` e
        // `codconta`. É por isso que a Época não muda — o dc86 prova que a expansão é essa.
        pronto = pronto
            .Replace(MarcadorRateioRc, AgrupaIcms ? RateioComIcms : "PCRATEIOCENTROCUSTO", StringComparison.Ordinal)
            .Replace(MarcadorCodcontaLanc, AgrupaIcms ? CodcontaComIcms : "codconta", StringComparison.Ordinal);

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

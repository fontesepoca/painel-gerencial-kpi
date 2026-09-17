namespace Epoca.Kpi.Api.Infrastructure.Persistence;

/// <summary>
/// Paralelismo da consulta de faturamento, lido da seção <c>Oracle</c> do appsettings.
///
/// <para>A consulta de faturamento é 92,5% de uma apuração, e dentro dela o bloco de vendas
/// por item é 93,6% — 233 s de 249 s. Com <c>PARALLEL(4)</c> a consulta inteira caiu de
/// 70,3 s para 6,0 s. O caminho até aqui está em <c>docs/PARALELISMO.md</c>, e as medições
/// nas dc43 a dc50.</para>
///
/// <para><b>Por que isto é configuração e não uma linha fixa no SQL.</b> O hint pede processos
/// do mesmo Oracle que emite as notas da operação, e essa conta não é técnica — é de quem
/// responde pelo servidor. Além disso hint envelhece: ele congela uma decisão tomada com o
/// volume de dados de 2026, e quem precisar desfazer daqui a dois anos não terá acompanhado
/// nada disto.</para>
/// </summary>
public sealed class OpcoesDeParalelismo
{
    public const string Secao = "Oracle";

    /// <summary>
    /// Quantos processos o Oracle usa na consulta de faturamento.
    ///
    /// <para><c>0</c> ou <c>1</c> desligam: a consulta sai <b>idêntica</b> à de antes de
    /// 17/09/2026, sem nenhum hint no texto. Não é "paralelismo de grau um", é a string de
    /// sempre.</para>
    ///
    /// <para><b>4 é onde o ganho para</b>, e isso foi medido (dc49): 2 entrega 1,9x, 4 entrega
    /// 3,8x e 8 entrega 3,9x — ou seja, 8 toma o dobro dos processos para nada. Mais que isso
    /// é tomar recurso da operação sem receber nada em troca.</para>
    /// </summary>
    public int GrauDeParalelismo { get; set; } = 4;

    /// <summary>
    /// A partir de quantos meses de recorte vale pedir paralelismo.
    ///
    /// <para>Coordenar processos tem custo fixo, e numa consulta que já é rápida ele pode
    /// pesar mais do que o trabalho que divide. Uma apuração de um mês numa filial não é o
    /// caso que motivou nada disto.</para>
    ///
    /// <para><c>1</c> paraleliza sempre, e é o padrão <b>porque foi medido</b>: a dc51 mediu
    /// justamente o caso de risco — um mês numa filial — e ele ficou 1,4x mais RÁPIDO com
    /// paralelismo, não mais lento. O ganho cresce com o recorte (2,5x em um mês com nove
    /// filiais, 3,1x em três meses), que é o comportamento esperado.</para>
    ///
    /// <para>Então isto é saída de emergência, não ajuste necessário: subir para <c>2</c>
    /// devolve a apuração de um mês ao comportamento antigo, se algum dia o custo no servidor
    /// pesar mais que os dois segundos que ela ganha.</para>
    /// </summary>
    public int MesesParaParalelizar { get; set; } = 1;

    /// <summary>
    /// O texto do hint para um recorte deste tamanho, ou string vazia.
    ///
    /// <para><b>O grau nunca é interpolado como veio.</b> Ele passa por <c>Math.Clamp</c>
    /// antes de virar texto — o valor vem do appsettings, que é confiável, mas o que entra
    /// aqui é concatenado dentro de uma consulta SQL, e uma regra que só vale enquanto a
    /// origem for confiável é uma regra que alguém quebra sem perceber.</para>
    ///
    /// <para>O <c>+</c> depois da barra e do asterisco é o que separa um hint de um comentário
    /// qualquer. Sem ele o Oracle <b>ignora em silêncio</b>: nada falha, nada avisa, e a
    /// consulta continua lenta enquanto todo mundo jura que foi otimizada.</para>
    /// </summary>
    public string HintPara(int meses)
    {
        if (GrauDeParalelismo <= 1 || meses < MesesParaParalelizar)
        {
            return string.Empty;
        }

        var grau = Math.Clamp(GrauDeParalelismo, 2, 16);
        return $"/*+ PARALLEL({grau}) */";
    }
}

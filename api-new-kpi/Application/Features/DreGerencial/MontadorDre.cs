using Epoca.Kpi.Api.Application.Features.DreGerencial.Dtos;
using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Application.Features.DreGerencial;

/// <summary>
/// Monta o DRE a partir das três consultas já validadas: estrutura, despesas e faturamento.
/// Não toca no banco — é lógica pura, e é aqui que mora a aritmética da rotina.
///
/// <para>Todas as regras abaixo foram verificadas contra a exportação de parâmetros
/// conhecidos (`docs/ROTINA_9815.md` §5, §9 e §10).</para>
/// </summary>
public static class MontadorDre
{
    /// <summary>Rótulos das linhas calculadas, normalizados (sem espaço nas pontas, maiúsculas).</summary>
    private const string ReceitaBruta = "(+) RECEITA BRUTA";
    private const string AbatDesc = "(-) ABAT./DESC.";
    private const string Devolucao = "(-) DEVOLUCAO";
    private const string St = "(-) ST";
    private const string Pis = "(-) PIS";
    private const string Cofins = "(-) COFINS";
    private const string ReceitaLiquida = "(=) RECEITAS LIQUIDAS";
    private const string CmvLiq = "(=) CMV LIQ.";
    private const string LucroBruto = "LUCRO BRUTO";
    private const string SubTotal = "SUB-TOTAL -> DESPESAS OPERACIONAIS";
    private const string ResultadoOperacional = "RESULTADO OPERACIONAL";
    private const string TotalDespesas = "TOTAL DAS DESPESAS";
    private const string LucroLiquido = "LUCRO LIQUIDO";

    /// <summary>
    /// As cinco deduções têm `%AV` sobre a <b>RECEITA BRUTA</b>; todo o resto, sobre as
    /// <b>RECEITAS LIQUIDAS</b>. Usar uma base só erra cinco linhas.
    /// </summary>
    private static readonly HashSet<string> BaseReceitaBruta =
        [AbatDesc, Devolucao, St, Pis, Cofins];

    /// <summary>Informativas do cabeçalho: não entram no cálculo das Receitas Líquidas.</summary>
    private static readonly HashSet<string> NaoSomamNoCabecalho = [St, Pis, Cofins];

    public static ApuracaoDto Montar(
        IReadOnlyList<LinhaEstruturaDre> estrutura,
        IReadOnlyList<DespesaDre> despesas,
        FaturamentoDre faturamento,
        DespesasFiltroDto filtro,
        long duracaoMs)
    {
        // Índice pela TUPLA, não pela chave: o mesmo grupo aparece mais de uma vez no DRE
        // com flags diferentes, e indexar só por chave daria o mesmo valor às duas linhas.
        // Os meses são somados aqui — a quebra por mês é o incremento 8.
        var valorPorTupla = despesas
            .GroupBy(d => (d.GrupoConta, d.AntesRo, d.AntesLl, d.AntesLf))
            .ToDictionary(g => g.Key, g => g.Sum(d => d.VlRealizado));

        var avisos = new List<string>();

        // ---------------------------------------------------------------------
        // Passo 1 — valor de cada linha de conta. As calculadas ficam para depois.
        // ---------------------------------------------------------------------
        var linhas = estrutura.Select(e =>
        {
            var rotulo = Normalizar(e.Grupo);
            var calculada = e.CodGruConta.StartsWith('-');

            decimal? valor = calculada
                ? null
                : valorPorTupla.GetValueOrDefault((e.CodGruConta, e.AntesRo, e.AntesLl, e.AntesLf));

            return new LinhaEmMontagem(e, rotulo, calculada, valor ?? 0m, ValorDefinido: !calculada);
        }).ToList();

        // ---------------------------------------------------------------------
        // Passo 2 — totais, a partir das linhas de conta
        // ---------------------------------------------------------------------
        var somaOperacional = linhas
            .Where(l => l is { Calculada: false, Estrutura.AntesRo: "S" })
            .Sum(l => l.Valor);

        var somaPosOperacional = linhas
            .Where(l => l is { Calculada: false, Estrutura.AntesRo: "N", Estrutura.AntesLl: "S" })
            .Sum(l => l.Valor);

        var lucroBruto = faturamento.LucroBruto;
        var resultadoOperacional = lucroBruto + somaOperacional;
        var totalDespesas = somaOperacional + somaPosOperacional;
        var lucroLiquido = lucroBruto + totalDespesas;

        // ---------------------------------------------------------------------
        // Passo 3 — preenche as calculadas e monta o DTO
        // ---------------------------------------------------------------------
        var resultado = new List<LinhaDreDto>(linhas.Count);

        foreach (var l in linhas)
        {
            var valor = l.Valor;

            if (l.Calculada)
            {
                valor = l.Rotulo switch
                {
                    ReceitaBruta => faturamento.ReceitaBruta,
                    AbatDesc => -faturamento.AbatDesc,
                    Devolucao => -faturamento.Devolucao,
                    St => -faturamento.StLiq,
                    Pis => -faturamento.PisLiq,
                    Cofins => -faturamento.CofinsLiq,
                    ReceitaLiquida => faturamento.ReceitaLiquida,
                    CmvLiq => -faturamento.CmvLiq,
                    LucroBruto => lucroBruto,
                    SubTotal => somaOperacional,
                    ResultadoOperacional => resultadoOperacional,
                    TotalDespesas => totalDespesas,
                    LucroLiquido => lucroLiquido,
                    _ => Desconhecida(l, avisos)
                };
            }

            resultado.Add(new LinhaDreDto(
                Id: l.Estrutura.Id,
                Chave: l.Estrutura.CodGruConta,
                Descricao: l.Estrutura.Grupo,
                Valor: valor,
                PercentualAv: CalcularAv(l, valor, faturamento),
                Totalizadora: l.Estrutura.InfContas == "S",
                Calculada: l.Calculada,
                NaoSoma: EhNaoSoma(l),
                Zerada: valor == 0m,
                Cor: CorDelphi.ParaCss(l.Estrutura.Cor)));
        }

        return new ApuracaoDto(
            Regime: filtro.Regime,
            Analise: filtro.Analise,
            DataInicio: filtro.DataInicio,
            DataFim: filtro.DataFim,
            Filiais: filtro.Filiais,
            Linhas: resultado,
            Avisos: avisos,
            ApuradoEm: DateTimeOffset.Now,
            DuracaoMs: duracaoMs);
    }

    /// <summary>
    /// Linha calculada cujo rótulo não é conhecido. Devolve 0 e registra aviso — melhor
    /// uma linha zerada visível do que um número inventado passando por bom.
    /// </summary>
    private static decimal Desconhecida(LinhaEmMontagem l, List<string> avisos)
    {
        avisos.Add(
            $"Linha calculada não reconhecida: '{l.Estrutura.Grupo}' (chave {l.Estrutura.CodGruConta}). " +
            "Exibida com valor zero.");
        return 0m;
    }

    /// <summary>
    /// `%AV` com a base correta. Devolve <c>null</c> para a RECEITA BRUTA, que não exibe
    /// percentual, e quando a base é zero.
    /// </summary>
    private static decimal? CalcularAv(LinhaEmMontagem l, decimal valor, FaturamentoDre f)
    {
        if (l.Rotulo == ReceitaBruta)
        {
            return null;
        }

        var baseCalculo = BaseReceitaBruta.Contains(l.Rotulo) ? f.ReceitaBruta : f.ReceitaLiquida;

        return baseCalculo == 0m ? null : valor / baseCalculo * 100m;
    }

    /// <summary>
    /// `NÃO SOMA`: as três informativas do cabeçalho, e tudo que vem depois do LUCRO LIQUIDO.
    /// </summary>
    private static bool EhNaoSoma(LinhaEmMontagem l) =>
        NaoSomamNoCabecalho.Contains(l.Rotulo) ||
        (!l.Calculada && l.Estrutura.AntesLl == "N");

    private static string Normalizar(string descricao) =>
        descricao.Trim().ToUpperInvariant();

    private sealed record LinhaEmMontagem(
        LinhaEstruturaDre Estrutura,
        string Rotulo,
        bool Calculada,
        decimal Valor,
        bool ValorDefinido);
}

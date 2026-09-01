using Epoca.Kpi.Api.Application.Features.DreGerencial.Dtos;
using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Application.Features.DreGerencial;

/// <summary>
/// Monta o DRE a partir das três consultas já validadas: estrutura, despesas e faturamento.
/// Não toca no banco — é lógica pura, e é aqui que mora a aritmética da rotina.
///
/// <para>Todas as regras foram verificadas contra exportações de parâmetros conhecidos
/// (`docs/ROTINA_9815.md` §5, §9, §10 e §12).</para>
/// </summary>
public static class MontadorDre
{
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

    /// <summary>As cinco deduções têm `%AV` sobre a RECEITA BRUTA; o resto, sobre a LÍQUIDA.</summary>
    private static readonly HashSet<string> BaseReceitaBruta =
        [AbatDesc, Devolucao, St, Pis, Cofins];

    private static readonly HashSet<string> NaoSomamNoCabecalho = [St, Pis, Cofins];

    public static ApuracaoDto Montar(
        IReadOnlyList<LinhaEstruturaDre> estrutura,
        IReadOnlyList<DespesaDre> despesas,
        IReadOnlyList<FaturamentoDre> faturamentoPorMes,
        DespesasFiltroDto filtro,
        long duracaoMs)
    {
        var periodos = PeriodoDre.Entre(filtro.DataInicio, filtro.DataFim);
        var avisos = new List<string>();

        // Índice pela TUPLA COMPLETA, com o mês: o mesmo grupo aparece mais de uma vez no
        // DRE com flags diferentes, e cada ocorrência tem um valor por mês.
        var valorDespesa = despesas
            .GroupBy(d => (d.GrupoConta, d.AntesRo, d.AntesLl, d.AntesLf, d.MesAno))
            .ToDictionary(g => g.Key, g => g.Sum(d => d.VlRealizado));

        // Quantos lancamentos cada linha tem no periodo inteiro. E o que decide se a linha
        // aparece com "Mostrar Contas Zeradas" desmarcada — a 9815 esconde por AUSENCIA DE
        // MOVIMENTO, nao por valor zero. Sem o mes na chave: a visibilidade e da linha.
        var qtdDespesa = despesas
            .GroupBy(d => (d.GrupoConta, d.AntesRo, d.AntesLl, d.AntesLf))
            .ToDictionary(g => g.Key, g => g.Sum(d => d.QdeReg));

        var faturamento = faturamentoPorMes.ToDictionary(f => f.MesAno);

        var linhas = estrutura
            .Select(e => new LinhaEmMontagem(e, Normalizar(e.Grupo), e.CodGruConta.StartsWith('-')))
            .ToList();

        // Cada mês é montado por inteiro, de forma independente — inclusive os
        // totalizadores, que dependem só das linhas daquele mês.
        var valoresPorMes = periodos.ToDictionary(
            p => p.MesAno,
            p => MontarMes(linhas, valorDespesa, faturamento.GetValueOrDefault(p.MesAno), p.MesAno, avisos));

        var chavesOrdem = GerarChavesOrdem(linhas);

        var resultado = linhas.Select((l, indice) =>
        {
            var valores = periodos.Select((p, i) =>
            {
                // ARREDONDA AQUI, antes de somar. A 9815 leva cada mes para duas casas e
                // depois totaliza; somar a precisao cheia e arredondar no fim da um centavo
                // a mais em ABAT./DESC., por exemplo. Half-to-even e o padrao do .NET e e o
                // que a rotina faz: media -1.477.974,065 vira ,06 e -110.608,085 vira ,08.
                var valor = Arredondar(valoresPorMes[p.MesAno][indice]);
                var anterior = i == 0
                    ? (decimal?)null
                    : Arredondar(valoresPorMes[periodos[i - 1].MesAno][indice]);

                return new ValorMesDto(
                    MesAno: p.MesAno,
                    Valor: valor,
                    PercentualAv: CalcularAv(l, valor, faturamento.GetValueOrDefault(p.MesAno)),
                    PercentualAh: CalcularAh(valor, anterior));
            }).ToList();

            var somaPeriodo = valores.Sum(v => v.Valor);

            return new LinhaDreDto(
                Id: l.Estrutura.Id,
                ChaveOrdem: chavesOrdem[indice],
                Chave: l.Estrutura.CodGruConta,
                Descricao: l.Estrutura.Grupo,
                Valores: valores,
                Total: new TotalLinhaDto(
                    Valor: somaPeriodo,
                    Media: periodos.Count == 0 ? 0m : Arredondar(somaPeriodo / periodos.Count),
                    PercentualAv: CalcularAvTotal(l, somaPeriodo, faturamentoPorMes)),
                Totalizadora: l.Estrutura.InfContas == "S",
                Calculada: l.Calculada,
                NaoSoma: EhNaoSoma(l),
                // Calculada aparece sempre: cabecalho e totalizadores nao dependem de movimento.
                SemMovimento: !l.Calculada && qtdDespesa.GetValueOrDefault(
                    (l.Estrutura.CodGruConta, l.Estrutura.AntesRo,
                     l.Estrutura.AntesLl, l.Estrutura.AntesLf)) == 0,
                Zerada: valores.All(v => v.Valor == 0m),
                Cor: CorDelphi.ParaCss(l.Estrutura.Cor));
        }).ToList();

        return new ApuracaoDto(
            Regime: filtro.Regime,
            Analise: filtro.Analise,
            DataInicio: filtro.DataInicio,
            DataFim: filtro.DataFim,
            Filiais: filtro.Filiais,
            Periodos: periodos.Select(p => new PeriodoDto(p.MesAno, p.Rotulo)).ToList(),
            Linhas: resultado,
            Avisos: avisos,
            ApuradoEm: DateTimeOffset.Now,
            DuracaoMs: duracaoMs);
    }

    /// <summary>
    /// Chave estável de cada linha, na ordem da estrutura. Ver <see cref="LinhaDreDto.ChaveOrdem"/>.
    ///
    /// <para>A tupla é a mesma usada para indexar as despesas — se duas linhas a compartilhassem,
    /// as duas receberiam o mesmo valor e o DRE já estaria errado hoje. O contador de repetição
    /// existe para que, se isso um dia acontecer, a ordem salva não seja o lugar onde o problema
    /// aparece.</para>
    /// </summary>
    private static string[] GerarChavesOrdem(List<LinhaEmMontagem> linhas)
    {
        var vistas = new Dictionary<string, int>();
        var chaves = new string[linhas.Count];

        for (var i = 0; i < linhas.Count; i++)
        {
            var e = linhas[i].Estrutura;
            var chave = $"{e.CodGruConta}|{e.AntesRo}{e.AntesLl}{e.AntesLf}";

            var repeticao = vistas.GetValueOrDefault(chave) + 1;
            vistas[chave] = repeticao;

            chaves[i] = repeticao == 1 ? chave : $"{chave}#{repeticao}";
        }

        return chaves;
    }

    /// <summary>Valores de todas as linhas em um mês, na ordem da estrutura.</summary>
    private static decimal[] MontarMes(
        List<LinhaEmMontagem> linhas,
        Dictionary<(string, string, string, string, string), decimal> valorDespesa,
        FaturamentoDre? f,
        string mesAno,
        List<string> avisos)
    {
        var valores = new decimal[linhas.Count];

        for (var i = 0; i < linhas.Count; i++)
        {
            var l = linhas[i];
            valores[i] = l.Calculada
                ? 0m
                : valorDespesa.GetValueOrDefault(
                    (l.Estrutura.CodGruConta, l.Estrutura.AntesRo, l.Estrutura.AntesLl,
                     l.Estrutura.AntesLf, mesAno));
        }

        var somaOperacional = 0m;
        var somaPosOperacional = 0m;
        for (var i = 0; i < linhas.Count; i++)
        {
            if (linhas[i].Calculada) continue;
            if (linhas[i].Estrutura.AntesRo == "S") somaOperacional += valores[i];
            else if (linhas[i].Estrutura.AntesLl == "S") somaPosOperacional += valores[i];
        }

        var lucroBruto = f?.LucroBruto ?? 0m;
        var totalDespesas = somaOperacional + somaPosOperacional;

        for (var i = 0; i < linhas.Count; i++)
        {
            if (!linhas[i].Calculada) continue;

            valores[i] = linhas[i].Rotulo switch
            {
                ReceitaBruta => f?.ReceitaBruta ?? 0m,
                AbatDesc => -(f?.AbatDesc ?? 0m),
                Devolucao => -(f?.Devolucao ?? 0m),
                St => -(f?.StLiq ?? 0m),
                Pis => -(f?.PisLiq ?? 0m),
                Cofins => -(f?.CofinsLiq ?? 0m),
                ReceitaLiquida => f?.ReceitaLiquida ?? 0m,
                CmvLiq => -(f?.CmvLiq ?? 0m),
                LucroBruto => lucroBruto,
                SubTotal => somaOperacional,
                ResultadoOperacional => lucroBruto + somaOperacional,
                TotalDespesas => totalDespesas,
                LucroLiquido => lucroBruto + totalDespesas,
                _ => Desconhecida(linhas[i], avisos),
            };
        }

        return valores;
    }

    /// <summary>
    /// Linha calculada com rótulo não reconhecido: zero e aviso, nunca número inventado.
    /// O aviso sai uma vez só, não por mês.
    /// </summary>
    private static decimal Desconhecida(LinhaEmMontagem l, List<string> avisos)
    {
        var aviso =
            $"Linha calculada não reconhecida: '{l.Estrutura.Grupo}' " +
            $"(chave {l.Estrutura.CodGruConta}). Exibida com valor zero.";

        if (!avisos.Contains(aviso))
        {
            avisos.Add(aviso);
        }

        return 0m;
    }

    /// <summary>
    /// `%AV` de um mês. RECEITA BRUTA nunca tem — é a própria base.
    ///
    /// <para><b>Com base zero, os dois grupos se comportam diferente</b>, e não é capricho
    /// nosso: é o que a 9815 faz. Conferido em 31/08/2026 num mês sem movimento nenhum
    /// (dezembro/2026, filial 7), onde as 13 linhas saem zeradas nas duas telas:</para>
    ///
    /// <list type="bullet">
    ///   <item>as <b>cinco deduções</b> — base RECEITA BRUTA — mostram <c>0,000</c>;</item>
    ///   <item>de RECEITAS LIQUIDAS para baixo — base RECEITAS LIQUIDAS — a célula fica
    ///         <b>vazia</b>.</item>
    /// </list>
    ///
    /// <para>Os dois grupos já usam bases diferentes, então têm caminhos distintos no
    /// Delphi; um devolve zero quando não consegue dividir, o outro não escreve nada.</para>
    ///
    /// <para><b>Só sabemos o comportamento quando o valor também é zero.</b> Um mês com
    /// RECEITA BRUTA zerada mas com abatimento lançado seria outro caso, e não foi observado.
    /// Ver `docs/DIVERGENCIAS.md`.</para>
    /// </summary>
    private static decimal? CalcularAv(LinhaEmMontagem l, decimal valor, FaturamentoDre? f)
    {
        if (l.Rotulo == ReceitaBruta) return null;

        var ehDeducao = BaseReceitaBruta.Contains(l.Rotulo);
        if (f is null) return ehDeducao ? 0m : null;

        var baseCalculo = ehDeducao ? f.ReceitaBruta : f.ReceitaLiquida;
        if (baseCalculo != 0m) return valor / baseCalculo * 100m;

        return ehDeducao ? 0m : null;
    }

    /// <summary>
    /// `%AV` do bloco TOTAL.
    ///
    /// <para><b>As cinco deduções não têm `%AV` no total</b> — a 9815 deixa a célula em
    /// branco ali, embora as preencha nas colunas de cada mês. Verificado na exportação de
    /// dois meses: RECEITA BRUTA, ABAT./DESC., DEVOLUCAO, ST, PIS e COFINS vêm todas vazias
    /// na coluna `% AV` do TOTAL, e o preenchimento começa em RECEITAS LIQUIDAS.</para>
    /// </summary>
    private static decimal? CalcularAvTotal(
        LinhaEmMontagem l, decimal valor, IReadOnlyList<FaturamentoDre> meses)
    {
        if (l.Rotulo == ReceitaBruta || BaseReceitaBruta.Contains(l.Rotulo) || meses.Count == 0)
        {
            return null;
        }

        var baseCalculo = meses.Sum(m => m.ReceitaLiquida);
        return baseCalculo == 0m ? null : valor / baseCalculo * 100m;
    }

    /// <summary>
    /// Variação sobre o mês anterior. Duas exceções, ambas conferidas na exportação de
    /// dois meses:
    ///
    /// <list type="bullet">
    ///   <item><b>Primeiro mês do período: zero</b>, não vazio. Não há com o que comparar,
    ///         e a 9815 escreve `0,00` na coluna inteira.</item>
    ///   <item><b>Mês anterior igual a zero: vazio.</b> `AJUSTE ESTOQUE ALMOXARIFADO` sai de
    ///         0,00 para 43.490,64 e a célula fica em branco — divisão por zero vira
    ///         ausência, não infinito. Já o caminho inverso tem valor: `Receitas
    ///         Financeiras` cai de 477.269,87 para 0,00 e mostra (100,000).</item>
    /// </list>
    /// </summary>
    private static decimal? CalcularAh(decimal valor, decimal? anterior)
    {
        if (anterior is null) return 0m;
        if (anterior.Value == 0m) return null;
        return (valor / anterior.Value - 1m) * 100m;
    }

    private static bool EhNaoSoma(LinhaEmMontagem l) =>
        NaoSomamNoCabecalho.Contains(l.Rotulo) ||
        (!l.Calculada && l.Estrutura.AntesLl == "N");

    /// <summary>
    /// Duas casas, half-to-even — o padrao do .NET e o comportamento observado na 9815.
    /// Aplicado ao valor de cada mes ANTES da soma, e a media depois da divisao.
    /// </summary>
    private static decimal Arredondar(decimal valor) => Math.Round(valor, 2);

    private static string Normalizar(string descricao) => descricao.Trim().ToUpperInvariant();

    private sealed record LinhaEmMontagem(LinhaEstruturaDre Estrutura, string Rotulo, bool Calculada);
}

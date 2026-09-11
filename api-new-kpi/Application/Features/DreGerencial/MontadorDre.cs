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

    /// <summary>
    /// Monta a apuração a partir das <b>colunas</b> — ver <see cref="ColunaApuracao"/>.
    ///
    /// <para>Até 10/09/2026 a assinatura recebia despesas e faturamento do período e derivava
    /// as colunas dos meses. Agora quem monta as colunas é o serviço, porque nos modos de
    /// comparação entre anos cada coluna vem de uma consulta própria. Para o modo mensal —
    /// o padrão da tela — o resultado é idêntico: uma coluna por mês, com os dados daquele
    /// mês.</para>
    /// </summary>
    public static ApuracaoDto Montar(
        IReadOnlyList<LinhaEstruturaDre> estrutura,
        IReadOnlyList<ColunaApuracao> colunas,
        DespesasFiltroDto filtro,
        long duracaoMs)
    {
        var avisos = new List<string>();

        // Índice pela TUPLA COMPLETA, com a COLUNA: o mesmo grupo aparece mais de uma vez no
        // DRE com flags diferentes, e cada ocorrência tem um valor por coluna. Antes a chave
        // levava o mês; leva a coluna, que no modo mensal é o próprio mês.
        var valorDespesa = colunas
            .SelectMany(c => c.Despesas.Select(d => (Coluna: c.Chave, Despesa: d)))
            .GroupBy(x => (x.Despesa.GrupoConta, x.Despesa.AntesRo, x.Despesa.AntesLl,
                           x.Despesa.AntesLf, x.Coluna))
            .ToDictionary(g => g.Key, g => g.Sum(x => x.Despesa.VlRealizado));

        // Quantos lancamentos cada linha tem em TODAS as colunas. E o que decide se a linha
        // aparece com "Mostrar Contas Zeradas" desmarcada — a 9815 esconde por AUSENCIA DE
        // MOVIMENTO, nao por valor zero. Sem a coluna na chave: a visibilidade e da linha.
        var qtdDespesa = colunas
            .SelectMany(c => c.Despesas)
            .GroupBy(d => (d.GrupoConta, d.AntesRo, d.AntesLl, d.AntesLf))
            .ToDictionary(g => g.Key, g => g.Sum(d => d.QdeReg));

        var linhas = estrutura
            .Select(e => new LinhaEmMontagem(e, Normalizar(e.Grupo), e.CodGruConta.StartsWith('-')))
            .ToList();

        // Cada coluna é montada por inteiro, de forma independente — inclusive os
        // totalizadores, que dependem só das linhas daquela coluna.
        var valoresPorColuna = colunas.ToDictionary(
            c => c.Chave,
            c => MontarMes(linhas, valorDespesa, c.Faturamento, c.Chave, avisos));

        var chavesOrdem = GerarChavesOrdem(linhas);

        var resultado = linhas.Select((l, indice) =>
        {
            var valores = colunas.Select((c, i) =>
            {
                // ARREDONDA AQUI, antes de somar. A 9815 leva cada mes para duas casas e
                // depois totaliza; somar a precisao cheia e arredondar no fim da um centavo
                // a mais em ABAT./DESC., por exemplo. Half-to-even e o padrao do .NET e e o
                // que a rotina faz: media -1.477.974,065 vira ,06 e -110.608,085 vira ,08.
                var valor = Arredondar(valoresPorColuna[c.Chave][indice]);

                // A coluna anterior DO MESMO BLOCO. No comparativo, a primeira coluna do
                // segundo intervalo não tem anterior — compará-la com a última do primeiro
                // poria Jan/26 contra Mar/25, dois meses sem relação nenhuma, e o número
                // sairia grande e sem sentido bem onde a comparação começa.
                //
                // Nos modos meses e anos todas as colunas são do bloco 0, e a sequência
                // continua contínua: é assim que um ano compara com o ano anterior.
                var anterior = i == 0 || colunas[i - 1].Bloco != c.Bloco
                    ? (decimal?)null
                    : Arredondar(valoresPorColuna[colunas[i - 1].Chave][indice]);

                return new ValorMesDto(
                    MesAno: c.Chave,
                    Valor: valor,
                    PercentualAv: CalcularAv(l, valor, c.Faturamento),
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
                    Media: colunas.Count == 0 ? 0m : Arredondar(somaPeriodo / colunas.Count),
                    PercentualAv: CalcularAvTotal(
                        l, somaPeriodo, colunas.Select(c => c.Faturamento))),
                Totalizadora: l.Estrutura.InfContas == "S",
                Calculada: l.Calculada,
                NaoSoma: EhNaoSoma(l),
                // Calculada aparece sempre: cabecalho e totalizadores nao dependem de movimento.
                SemMovimento: !l.Calculada && qtdDespesa.GetValueOrDefault(
                    (l.Estrutura.CodGruConta, l.Estrutura.AntesRo,
                     l.Estrutura.AntesLl, l.Estrutura.AntesLf)) == 0,
                Zerada: valores.All(v => v.Valor == 0m),
                Cor: CorDelphi.ParaCss(l.Estrutura.Cor),
                Detalhe: ResolverDetalhe(l),
                Composicao: ResolverComposicao(l, linhas, chavesOrdem));
        }).ToList();

        return new ApuracaoDto(
            Regime: filtro.Regime,
            Analise: filtro.Analise,
            Modo: RecorteDre.ModoEfetivo(filtro),
            DataInicio: filtro.DataInicio,
            DataFim: filtro.DataFim,
            Filiais: filtro.Filiais,
            // O recorte de cada coluna vai junto: é o que o duplo clique usa para pedir o
            // detalhamento. Derivar do mês da coluna deixa de funcionar quando a coluna é um
            // ano ou um trecho dele.
            Periodos: colunas
                .Select(c => new PeriodoDto(c.Chave, c.Rotulo, c.DataInicio, c.DataFim, c.Bloco))
                .ToList(),
            Linhas: resultado,
            Avisos: avisos,
            ApuradoEm: DateTimeOffset.Now,
            DuracaoMs: duracaoMs);
    }

    /// <summary>
    /// Qual detalhamento a linha abre com duplo clique — a lista que o Gabriel levantou na
    /// 9815 em 01/09/2026.
    ///
    /// <para><b>As linhas de grupo saem das flags, não de uma lista de nomes.</b> A lista
    /// original nomeava RECEITAS FINANCEIRAS, COMPENSAÇÃO DE IMPOSTOS, RATEIO DESP.
    /// CORPORATIVAS e INDENIZACAO DE MERC. VENC., e essas quatro são exatamente as
    /// não-calculadas com `AntesRO = 'N'` e `AntesLL = 'S'` — o bloco entre RESULTADO
    /// OPERACIONAL e LUCRO LIQUIDO. Escrever os nomes aqui deixaria a tela mentir no dia em
    /// que alguém cadastrar a quinta.</para>
    ///
    /// <para>Entre as calculadas só três abrem, e essas sim vão por rótulo: não há flag que
    /// distinga RECEITA BRUTA de CMV LIQ.</para>
    /// </summary>
    private static DetalheDisponivelDto? ResolverDetalhe(LinhaEmMontagem l)
    {
        if (l.Calculada)
        {
            return l.Rotulo switch
            {
                // As duas primeiras abrem a MESMA tela na 9815, com a mesma consulta.
                //
                // `ABAT./DESC.` e `CMV LIQ.` **não abrem nada na 9815** — e passam a abrir
                // aqui porque a tela de receita por cliente já traz as duas como coluna, e
                // a dc9 mediu em 02/09/2026 que as duas colunas fecham ao centavo com as
                // respectivas linhas do DRE. Era detalhamento pronto atrás de um duplo
                // clique que ninguém tinha ligado.
                ReceitaBruta or ReceitaLiquida or AbatDesc or CmvLiq
                    => new("receita-por-cliente", null, null),
                Devolucao
                    => new("devolucao-por-motivo", null, null),

                // As três informativas quebram por PRODUTO, no mesmo formato da devolução
                // por motivo: eixo, contagem de notas, valor e participação. ST é imposto
                // de item — nasce da classificação fiscal da mercadoria —, então é nesse
                // eixo que a pergunta "por que subiu" tem resposta.
                //
                // O imposto viaja em `Bloco`, que já é o campo que passa por lista fechada
                // antes de virar SQL.
                St     => new("imposto-por-produto", "st", null),
                Pis    => new("imposto-por-produto", "pis", null),
                Cofins => new("imposto-por-produto", "cofins", null),

                _   => null,
            };
        }

        var bloco = l.Estrutura.AntesRo == "S" ? "operacional"
                  : l.Estrutura.AntesLl == "S" ? "pos-operacional"
                  : "orfa";

        return new("lancamentos", bloco, l.Estrutura.CodGruConta);
    }

    /// <summary>
    /// De que outras linhas cada totalizador é feito.
    ///
    /// <para>É o detalhamento das cinco linhas que não vêm do banco: o valor delas é
    /// aritmética sobre linhas que já estão na resposta. Perguntar ao Oracle de onde vem o
    /// `LUCRO LIQUIDO` seria refazer no banco uma conta que já foi feita aqui — e abriria a
    /// porta para os dois números discordarem.</para>
    ///
    /// <para>As parcelas vão <b>por referência</b>, e é isso que garante que a tela de
    /// composição não pode mostrar um total diferente das linhas que ela lista: os dois
    /// lados leem o mesmo valor.</para>
    ///
    /// <para>Os blocos saem das flags, como no resto do montador. `SUB-TOTAL` é a soma das
    /// linhas com `AntesRo = 'S'`; `TOTAL DAS DESPESAS` acrescenta a ele as de
    /// `AntesLl = 'S'`. Nomear as linhas aqui faria a tela mentir no dia em que o cadastro
    /// mudasse.</para>
    /// </summary>
    private static IReadOnlyList<ParcelaDto> ResolverComposicao(
        LinhaEmMontagem linha,
        List<LinhaEmMontagem> todas,
        string[] chaves)
    {
        if (!linha.Calculada) return [];

        ParcelaDto? PorRotulo(string rotulo)
        {
            var i = todas.FindIndex(x => x.Calculada && x.Rotulo == rotulo);
            return i < 0 ? null : new ParcelaDto(chaves[i], todas[i].Estrutura.Grupo.Trim(), 1);
        }


        List<ParcelaDto> DoBloco(Func<LinhaEstruturaDre, bool> pertence) =>
            todas
                .Select((x, i) => (x, i))
                .Where(p => !p.x.Calculada && pertence(p.x.Estrutura))
                .Select(p => new ParcelaDto(chaves[p.i], p.x.Estrutura.Grupo.Trim(), 1))
                .ToList();

        List<ParcelaDto?> partes = linha.Rotulo switch
        {
            // O CMV já chega negativo na linha, então aqui é soma, não subtração.
            LucroBruto => [PorRotulo(ReceitaLiquida), PorRotulo(CmvLiq)],
            ResultadoOperacional => [PorRotulo(LucroBruto), PorRotulo(SubTotal)],
            LucroLiquido => [PorRotulo(LucroBruto), PorRotulo(TotalDespesas)],
            _ => [],
        };

        var referenciadas = partes.OfType<ParcelaDto>().ToList();

        return linha.Rotulo switch
        {
            SubTotal => DoBloco(e => e.AntesRo == "S"),
            TotalDespesas => [.. PorRotulo(SubTotal) is { } s ? new[] { s } : [],
                              .. DoBloco(e => e.AntesRo != "S" && e.AntesLl == "S")],
            _ => referenciadas,
        };
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
        LinhaEmMontagem l, decimal valor, IEnumerable<FaturamentoDre?> porColuna)
    {
        // Coluna sem movimento entra como `null` e não conta na base — é o mesmo que era
        // feito quando a lista só tinha os meses que voltaram do banco.
        var comMovimento = porColuna.Where(f => f is not null).ToList();

        if (l.Rotulo == ReceitaBruta || BaseReceitaBruta.Contains(l.Rotulo)
            || comMovimento.Count == 0)
        {
            return null;
        }

        var baseCalculo = comMovimento.Sum(m => m!.ReceitaLiquida);
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

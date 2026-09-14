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
    private const string SubtotalPositivo = "SUBTOTAL POSITIVO";

    /// <summary>
    /// A identidade de uma linha do cadastro: <c>chave|AntesRoAntesLlAntesLf</c> — a mesma
    /// string que <see cref="GerarChavesOrdem"/> monta.
    ///
    /// <para><b>Por que não pelo rótulo.</b> Até 14/09/2026 as duas regras abaixo casavam o
    /// nome da linha, e isso é frágil por dois motivos medidos naquele dia:</para>
    ///
    /// <list type="bullet">
    ///   <item>os rótulos vêm de cadastros <b>diferentes</b> em cada dimensão — de
    ///   `PCCONTA.CONTA` em Conta Gerencial e de `PCCENTROCUSTO.DESCRICAO` em C. Custo
    ///   Principal. Renomear um sem o outro desliga a regra em silêncio;</item>
    ///   <item>`VERBAS MARGEM` está cadastrada com espaço não separável, e
    ///   `INDENIZACAO DE MERC. VENC. E AVARIA` convive com uma conta `Indenizacao` de nome
    ///   parecido. Texto de cadastro é terreno movediço; código não é.</item>
    /// </list>
    ///
    /// <para><b>A chave sozinha também não basta.</b> `RATEIO DESP. CORPORATIVAS` tem a
    /// mesma chave (96) nas duas ocorrências dele, operacional e pós-operacional. São as
    /// flags que separam uma da outra.</para>
    /// </summary>
    private static string Identidade(LinhaEstruturaDre e) =>
        $"{e.CodGruConta}|{e.AntesRo}{e.AntesLl}{e.AntesLf}";

    /// <summary>
    /// As linhas de crédito que sobem para logo abaixo do `LUCRO BRUTO` — ver
    /// <see cref="PromoverCreditos"/>. Só em C. Custo Principal, onde a chave é o centro de
    /// custo principal:
    ///
    /// <list type="bullet">
    ///   <item><c>96|NSS</c> — `RATEIO DESP. CORPORATIVAS`, a ocorrência dos créditos. A
    ///   operacional é <c>96|SSS</c> e <b>não</b> sobe;</item>
    ///   <item><c>90|NSS</c> — `VERBAS MARGEM`.</item>
    /// </list>
    /// </summary>
    private static readonly HashSet<string> CreditosPromovidos = ["96|NSS", "90|NSS"];

    /// <summary>
    /// Linhas que passam a <b>não somar em totalizador nenhum</b>, a pedido — o mesmo
    /// tratamento que `ST`, `PIS` e `COFINS` já têm no cabeçalho. Ver
    /// <see cref="MarcarInformativas"/>.
    ///
    /// <para>É a mesma conta vista por três eixos. Em Conta Gerencial e em Grupo de Contas a
    /// chave é a própria conta <b>3000165</b>; em C. Custo Principal é o centro de custo
    /// principal <b>97</b>, que hoje contém só ela.</para>
    ///
    /// <para><b>Grupo de Contas só tem essa linha porque a consulta a extrai do grupo 300</b>
    /// — ver a exceção em <see cref="DreGerencialQueries.EstruturaGrupoDeContas"/> e na
    /// consulta de despesas irmã. Sem a exceção, esta entrada aqui não casa com nada e a
    /// dimensão volta a somar os 177 mil em silêncio. A dc34 é quem percebe.</para>
    /// </summary>
    private static readonly Dictionary<string, HashSet<string>> InformativasPorPedido =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["ccusto-principal"] = ["97|NSS"],
            ["conta-gerencial"] = ["3000165|NSS"],
            ["grupo-contas"] = ["3000165|NSS"],
        };

    /// <summary>
    /// A dimensão onde a promoção dos créditos vale. `RATEIO DESP. CORPORATIVAS` e
    /// `VERBAS MARGEM` são os nomes desta dimensão; em Conta Gerencial as contas
    /// equivalentes se chamam `Rateio Corporativo`, `Rateio Epoca ES` e
    /// `Verba Composicao Margem`, e em Grupo de Contas não existem.
    /// </summary>
    private const string AnaliseComCreditosPromovidos = "ccusto-principal";


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

        var linhas = PromoverCreditos(
            MarcarInformativas(
                estrutura
                    .Select(e => new LinhaEmMontagem(e, Normalizar(e.Grupo), e.CodGruConta.StartsWith('-')))
                    .ToList(),
                filtro.Analise),
            filtro.Analise);

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

            // Quantos lancamentos de PCLANC a linha tem no periodo. Decide a visibilidade
            // com "Mostrar contas zeradas" desmarcada — junto com o valor, ver abaixo.
            var qdeLancamentos = qtdDespesa.GetValueOrDefault(
                (l.Estrutura.CodGruConta, l.Estrutura.AntesRo,
                 l.Estrutura.AntesLl, l.Estrutura.AntesLf));

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
                //
                // SEM LANCAMENTO **E** SEM VALOR. As duas condicoes, e a segunda entrou em
                // 11/09/2026 por causa de RECEITA VENDA ATIVO: a linha injetada de PCPREST
                // traz "0 as QdeReg" — fielmente, porque a 9815 faz igual —, entao contar
                // so lancamento escondia 225.000,00 na filial 28.
                //
                // Escondia a LINHA, nao o valor: ele continuava dentro do LUCRO LIQUIDO, e a
                // tela mostrava um total que nao fechava com as linhas visiveis. E o pior
                // tipo de defeito desta rotina, porque nada na tela denuncia.
                //
                // E o mesmo criterio que a 9815 usa para montar a estrutura —
                // "where VPAGO <> 0 or qdereg <> 0" —, e ele preserva o caso oposto, ja
                // conferido: DESCONTO FUNCIONARIOS fecha em 0,00 com 16 lancamentos e
                // continua aparecendo.
                SemMovimento: !l.Calculada
                    && qdeLancamentos == 0
                    // Por COLUNA, e nao pela soma do periodo: uma conta com +100 num mes e
                    // -100 no outro soma zero e teve movimento nos dois.
                    && valores.All(v => v.Valor == 0m),
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
    /// Tira `INDENIZACAO DE MERC. VENC. E AVARIA` dos totalizadores.
    ///
    /// <para>Pedido do Gabriel em 14/09/2026, para C. Custo Principal e — no mesmo dia —
    /// para Conta Gerencial, onde a conta tem o mesmo nome. A linha nasce no bloco
    /// pós-operacional e somava no `Total das Despesas` e, por ele, no `LUCRO LIQUIDO`.
    /// Passa a receber o mesmo tratamento que `ST`, `PIS` e `COFINS` já têm no cabeçalho:
    /// <b>aparece com valor e não entra em conta nenhuma</b>.</para>
    ///
    /// <para><b>O selo da tela não é decoração.</b> O `title` dele diz "esta linha não entra
    /// nos totalizadores" — marcar sem tirar da soma faria a tela afirmar uma coisa e fazer
    /// outra. Por isso a marca e a exclusão saem daqui juntas, e não de dois lugares que
    /// alguém pode mudar em separado.</para>
    ///
    /// <para><b>O detalhamento continua o mesmo.</b> Os lançamentos existem e a linha
    /// continua abrindo com duplo clique — o que mudou é de que soma ela participa, não de
    /// onde vem o valor dela.</para>
    /// </summary>
    private static List<LinhaEmMontagem> MarcarInformativas(
        List<LinhaEmMontagem> linhas,
        string analise)
    {
        if (analise is null || !InformativasPorPedido.TryGetValue(analise, out var identidades))
        {
            return linhas;
        }

        return linhas
            .Select(l => !l.Calculada && identidades.Contains(Identidade(l.Estrutura))
                ? l with { Informativa = true }
                : l)
            .ToList();
    }

    /// <summary>
    /// Sobe os créditos para logo abaixo do `LUCRO BRUTO` e cria o `SUBTOTAL POSITIVO`.
    ///
    /// <para>Pedido do Gabriel em 14/09/2026, para C. Custo Principal. `RATEIO DESP.
    /// CORPORATIVAS` e `VERBAS MARGEM` nascem no bloco pós-operacional, entre o `RESULTADO
    /// OPERACIONAL` e o `LUCRO LIQUIDO`, e passam a aparecer junto do lucro que ajudam a
    /// formar. A linha nova é a soma dos três.</para>
    ///
    /// <para><b>A ordem sai daqui, e não de `EPCPARDRE`.</b> A ordem de exibição é a coluna
    /// `ID` daquela tabela — que é <b>do Winthor</b>, compartilhada com a 9815 e com quem
    /// mais a leia. Reordenar no banco mudaria a rotina antiga junto; reordenar aqui muda só
    /// a nossa tela.</para>
    ///
    /// <para><b>Muda um número, e um só: o `RESULTADO OPERACIONAL`.</b> Ele era
    /// `LUCRO BRUTO + Sub-Total` e passa a ser `SUBTOTAL POSITIVO + Sub-Total`, para a tela
    /// voltar a fechar lendo de cima para baixo — decisão do Gabriel na mesma conversa,
    /// sabendo que isso o afasta da 9815. Registrado em `docs/DIVERGENCIAS.md`.</para>
    ///
    /// <para><b>O `LUCRO LIQUIDO` não muda, e não há contagem dupla</b>: ele é
    /// `LUCRO BRUTO + Total das Despesas`, e as duas promovidas continuam com
    /// <c>AntesLl = 'S'</c>, entrando no `Total das Despesas` exatamente uma vez. Vale a
    /// identidade `LUCRO LIQUIDO = RESULTADO OPERACIONAL + Σ(pós-operacional restante)` —
    /// as promovidas saem do lado direito e entram no esquerdo, e o total se conserva.</para>
    ///
    /// <para>Nas outras três dimensões a lista sai vazia, a linha nova não é criada e o
    /// `RESULTADO OPERACIONAL` continua sendo `LUCRO BRUTO + Sub-Total` — porque
    /// `SUBTOTAL POSITIVO = LUCRO BRUTO + Σ∅`.</para>
    /// </summary>
    private static List<LinhaEmMontagem> PromoverCreditos(
        List<LinhaEmMontagem> linhas,
        string analise)
    {
        if (!string.Equals(analise, AnaliseComCreditosPromovidos, StringComparison.OrdinalIgnoreCase))
        {
            return linhas;
        }

        // As flags já estão dentro da identidade (`96|NSS`), então não há o que conferir
        // além dela — era o `AntesRo`/`AntesLl` solto que separava as duas ocorrências do
        // rateio quando a regra casava o rótulo.
        static bool EhCredito(LinhaEmMontagem l) =>
            !l.Calculada && CreditosPromovidos.Contains(Identidade(l.Estrutura));

        var promovidas = linhas
            .Where(EhCredito)
            .Select(l => l with { Promovida = true })
            .ToList();

        // Sem as linhas no cadastro não há o que promover, e inventar um SUBTOTAL POSITIVO
        // igual ao LUCRO BRUTO só acrescentaria uma linha repetida à tela.
        if (promovidas.Count == 0) return linhas;

        var destino = linhas.FindIndex(l => l.Calculada && l.Rotulo == LucroBruto);
        if (destino < 0) return linhas;

        var modelo = linhas[destino].Estrutura;
        var subtotal = new LinhaEmMontagem(
            new LinhaEstruturaDre
            {
                // `-5` é o primeiro código calculado livre: o cadastro usa de `-1` a `-4`.
                // Ver `docs/SCHEMA_BANCO.md`.
                Id = modelo.Id,
                CodGruConta = "-5",
                Grupo = "SUBTOTAL POSITIVO",
                InfContas = "S",
                Cor = modelo.Cor,
                // Fora dos três blocos de propósito: totalizador não é parcela de
                // totalizador nenhum, e marcar `AntesLl = 'S'` aqui somaria o LUCRO BRUTO
                // de novo dentro do `Total das Despesas`.
                AntesRo = "N",
                AntesLl = "N",
                AntesLf = "N",
            },
            SubtotalPositivo,
            Calculada: true);

        var resultado = new List<LinhaEmMontagem>(linhas.Count + 1);
        foreach (var (linha, i) in linhas.Select((l, i) => (l, i)))
        {
            if (EhCredito(linha)) continue;

            resultado.Add(linha);
            if (i == destino)
            {
                // A ordem entre as promovidas é a do cadastro, não a da lista de nomes:
                // quem lê a tela ao lado da 9815 encontra a mesma sequência relativa.
                resultado.AddRange(promovidas);
                resultado.Add(subtotal);
            }
        }

        return resultado;
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
    ///
    /// <para><b>Linha sem lançamento em PCLANC abre detalhamento do mesmo jeito.</b> Em
    /// 11/09/2026 esta função ganhou uma guarda que devolvia <c>null</c> quando a linha não
    /// tinha lançamento, supondo que o detalhamento só sabia consultar <c>PCLANC</c> e que
    /// <c>RECEITA VENDA ATIVO</c> abriria uma tela vazia. <b>A suposição estava errada:</b>
    /// <see cref="DreDetalheQueries.Lancamentos"/> já trazia o mesmo <c>union all</c> de
    /// <c>PCNFSAID</c>/<c>PCPREST</c> que a 9815 usa, e a guarda passou a esconder um
    /// detalhamento que funcionava. Ela saiu no mesmo dia.</para>
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


        // `!Informativa` importa: a parcela é o que ENTRA na soma, e a tela de composição
        // mostra as parcelas ao lado do total. Listar uma linha que não soma faria a
        // conferência do leitor não fechar por exatamente o valor dela.
        List<ParcelaDto> DoBloco(Func<LinhaEstruturaDre, bool> pertence) =>
            todas
                .Select((x, i) => (x, i))
                .Where(p => !p.x.Calculada && !p.x.Informativa && pertence(p.x.Estrutura))
                .Select(p => new ParcelaDto(chaves[p.i], p.x.Estrutura.Grupo.Trim(), 1))
                .ToList();

        List<ParcelaDto> Promovidas() =>
            todas
                .Select((x, i) => (x, i))
                .Where(p => p.x.Promovida)
                .Select(p => new ParcelaDto(chaves[p.i], p.x.Estrutura.Grupo.Trim(), 1))
                .ToList();

        List<ParcelaDto?> partes = linha.Rotulo switch
        {
            // O CMV já chega negativo na linha, então aqui é soma, não subtração.
            LucroBruto => [PorRotulo(ReceitaLiquida), PorRotulo(CmvLiq)],
            SubtotalPositivo => [PorRotulo(LucroBruto), .. Promovidas()],
            // Parte do SUBTOTAL POSITIVO onde ele existe. Nas outras dimensões `PorRotulo`
            // não acha a linha e a composição cai no LUCRO BRUTO — a mesma que sempre foi,
            // e a mesma parcela que a fórmula usa lá em `MontarMes`.
            ResultadoOperacional =>
                [PorRotulo(SubtotalPositivo) ?? PorRotulo(LucroBruto), PorRotulo(SubTotal)],
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
            // A MESMA função que as regras de promoção e de informativa usam, de propósito:
            // se as duas montassem a string em separado, elas poderiam divergir, e a regra
            // deixaria de casar sem nada na tela mudar.
            var chave = Identidade(e);

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
        // Os créditos promovidos. Eles continuam dentro de `somaPosOperacional` — a promoção
        // é de POSIÇÃO, não de bloco —, e é por isso que o `Total das Despesas` e o
        // `LUCRO LIQUIDO` não mudam de valor. Ver `PromoverCreditos`.
        var somaPromovida = 0m;
        for (var i = 0; i < linhas.Count; i++)
        {
            if (linhas[i].Calculada) continue;

            // Informativa fica de fora dos DOIS blocos — é o que "não soma" quer dizer.
            if (!linhas[i].Informativa)
            {
                if (linhas[i].Estrutura.AntesRo == "S") somaOperacional += valores[i];
                else if (linhas[i].Estrutura.AntesLl == "S") somaPosOperacional += valores[i];
            }

            if (linhas[i].Promovida) somaPromovida += valores[i];
        }

        var lucroBruto = f?.LucroBruto ?? 0m;
        var totalDespesas = somaOperacional + somaPosOperacional;

        // Nas dimensões sem promoção a soma é zero, e o SUBTOTAL POSITIVO — que nem existe
        // como linha ali — vale o próprio LUCRO BRUTO. É o que mantém o RESULTADO
        // OPERACIONAL delas idêntico ao da 9815 com uma fórmula só.
        var subtotalPositivo = lucroBruto + somaPromovida;

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
                SubtotalPositivo => subtotalPositivo,
                SubTotal => somaOperacional,
                ResultadoOperacional => subtotalPositivo + somaOperacional,
                TotalDespesas => totalDespesas,
                // Continua saindo do LUCRO BRUTO, e não do SUBTOTAL POSITIVO: os créditos
                // promovidos já estão dentro de `totalDespesas`, e somá-los aqui de novo
                // pelo subtotal os contaria duas vezes.
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
        l.Informativa ||
        NaoSomamNoCabecalho.Contains(l.Rotulo) ||
        (!l.Calculada && l.Estrutura.AntesLl == "N");

    /// <summary>
    /// Duas casas, half-to-even — o padrao do .NET e o comportamento observado na 9815.
    /// Aplicado ao valor de cada mes ANTES da soma, e a media depois da divisao.
    /// </summary>
    private static decimal Arredondar(decimal valor) => Math.Round(valor, 2);

    /// <summary>
    /// O rótulo da linha em forma comparável: maiúsculas, sem espaço nas pontas e com
    /// <b>qualquer sequência de espaços virando um só</b>.
    ///
    /// <para><b>A última parte não é preciosismo.</b> O cadastro tem `VERBAS MARGEM` escrito
    /// com <b>espaço não separável</b> (U+00A0) no meio, e não com o espaço comum. Um
    /// `Trim().ToUpper()` devolve uma string que <i>parece</i> `"VERBAS MARGEM"` em qualquer
    /// log, em qualquer depurador e em qualquer tela — e não é igual a ela. A promoção dos
    /// créditos ficou silenciosamente pela metade até isso aparecer, em 14/09/2026, numa
    /// simulação da regra sobre a exportação da 9815.</para>
    ///
    /// <para><c>Split(null)</c> quebra por <c>char.IsWhiteSpace</c>, que inclui o U+00A0 —
    /// é o que faz a colagem seguinte devolver o texto com espaços comuns.</para>
    /// </summary>
    private static string Normalizar(string descricao) =>
        string.Join(' ', descricao.ToUpperInvariant().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));

    /// <param name="Promovida">
    /// Crédito que subiu para debaixo do LUCRO BRUTO e compõe o SUBTOTAL POSITIVO.
    /// Ver <see cref="PromoverCreditos"/>.
    /// </param>
    /// <param name="Informativa">
    /// Aparece com valor e não entra em totalizador nenhum. Ver <see cref="MarcarInformativas"/>.
    /// </param>
    private sealed record LinhaEmMontagem(
        LinhaEstruturaDre Estrutura,
        string Rotulo,
        bool Calculada,
        bool Promovida = false,
        bool Informativa = false);
}

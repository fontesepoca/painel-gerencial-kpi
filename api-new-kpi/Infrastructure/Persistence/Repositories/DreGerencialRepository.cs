using Epoca.Kpi.Api.Application.Features.DreGerencial;
using System.Text.RegularExpressions;
using Dapper;
using Epoca.Kpi.Api.Domain.Entities;
using Epoca.Kpi.Api.Domain.Interfaces;
using Epoca.Kpi.Api.Infrastructure.Persistence.Context;
using Epoca.Kpi.Api.Infrastructure.Persistence.Queries;

namespace Epoca.Kpi.Api.Infrastructure.Persistence.Repositories;

/// <inheritdoc cref="IDreGerencialRepository"/>
public sealed class DreGerencialRepository : IDreGerencialRepository
{
    private readonly IOracleConnectionFactory _conexoes;
    private readonly OpcoesDeParalelismo _paralelismo;

    public DreGerencialRepository(
        IOracleConnectionFactory conexoes,
        OpcoesDeParalelismo paralelismo)
    {
        _conexoes = conexoes;
        _paralelismo = paralelismo;
    }

    /// <summary>Meses que o recorte cobre, contando as pontas.</summary>
    private static int MesesDoRecorte(DateOnly inicio, DateOnly fim) =>
        ((fim.Year - inicio.Year) * 12) + fim.Month - inicio.Month + 1;

    public async Task<IReadOnlyList<Filial>> ObterFiliaisAsync(
        CancellationToken cancellationToken = default)
    {
        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        // Consulta de cadastro, leve. Timeout curto de propósito: se demorar mais que
        // isso o problema é de infraestrutura, e falhar rápido é melhor do que pendurar
        // a tela de filtros do usuário.
        var filiais = await conexao.QueryAsync<Filial>(
            new CommandDefinition(
                DreGerencialQueries.Filiais,
                commandTimeout: 30,
                cancellationToken: cancellationToken));

        return filiais.ToList();
    }

    /// <summary>
    /// Quanto tempo dar a uma consulta de apuração, conforme o tamanho do recorte.
    ///
    /// <para><b>Um número fixo não servia.</b> As consultas desta rotina não crescem em
    /// linha reta com o período: a de faturamento foi medida em 16,9 s para um mês e 115 s
    /// para dois. Os 600 s que havia aqui foram calibrados para "quatro meses com folga" —
    /// e o modo <c>anos</c>, criado depois, pede DOZE de uma vez.</para>
    ///
    /// <para>Um ano inteiro numa filial levou 407 s medidos (dc19), e dois anos rodam em
    /// paralelo disputando a mesma base. Foi assim que apareceu o primeiro
    /// <c>TaskCanceledException</c> da rotina, em 11/09/2026, apurando 2025 e 2026 juntos.
    /// </para>
    ///
    /// <para>120 s por mês, com piso de 600 s — para não encurtar nenhum caso que já
    /// funcionava — e teto de 2400 s. <b>O teto existe porque timeout também é proteção:</b>
    /// uma consulta que passa de quarenta minutos segurando uma conexão do pool não está
    /// demorando, está travada.</para>
    /// </summary>
    private static int FolegoDaApuracao(DateOnly inicio, DateOnly fim)
    {
        var meses = ((fim.Year - inicio.Year) * 12) + fim.Month - inicio.Month + 1;
        return Math.Clamp(meses * 120, 600, 2400);
    }

    public async Task<IReadOnlyList<LinhaEstruturaDre>> ObterEstruturaAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        RegimeDre regime,
        AnaliseDre analise,
        CancellationToken cancellationToken = default)
    {
        if (filiais.Count == 0)
        {
            return [];
        }

        if (analise.SqlEstrutura is null)
        {
            throw new InvalidOperationException(
                $"A análise '{analise.Codigo}' não tem consulta de estrutura. " +
                "O serviço deve barrar dimensões não implementadas antes de chegar aqui.");
        }

        var inicio = dataInicio.ToDateTime(TimeOnly.MinValue);
        var fim = dataFim.ToDateTime(TimeOnly.MinValue);
        var parametros = new DynamicParameters();
        string sql;

        // ExpressaoFiltroEstrutura, nao ExpressaoFiltro: o bloco de orfas usa
        // FIN.DTPAGTO puro em caixa, enquanto o GetValorGrupo usa nvl(DTPAGTO,DTVENC).
        if (analise.EstruturaTemDoisBlocosDeFilial)
        {
            // Dimensoes de centro de custo: a lista de filiais aparece duas vezes — no
            // subselect que descobre os centros de custo e no bloco de orfas. Com bind
            // posicional, reusar os mesmos nomes daria um parametro so para duas posicoes.
            var placeholdersA = string.Join(", ", filiais.Select((_, i) => $":filialA{i}"));
            var placeholdersB = string.Join(", ", filiais.Select((_, i) => $":filialB{i}"));

            sql = string.Format(
                analise.SqlEstrutura,
                placeholdersA,
                regime.ExpressaoFiltroEstrutura,
                placeholdersB);

            // A ORDEM DOS Add TEM QUE SER ESTA — e a ordem dos binds no SQL.
            for (var i = 0; i < filiais.Count; i++)
            {
                parametros.Add($"filialA{i}", filiais[i]);
            }
            parametros.Add("dtIniA", inicio);
            parametros.Add("dtFimA", fim);
            for (var i = 0; i < filiais.Count; i++)
            {
                parametros.Add($"filialB{i}", filiais[i]);
            }
            parametros.Add("dtIniB", inicio);
            parametros.Add("dtFimB", fim);
        }
        else
        {
            var placeholders = string.Join(", ", filiais.Select((_, i) => $":filial{i}"));

            sql = string.Format(
                analise.SqlEstrutura,
                placeholders,
                regime.ExpressaoFiltroEstrutura);

            // Filiais primeiro, depois as datas — a ordem em que os binds aparecem no SQL.
            for (var i = 0; i < filiais.Count; i++)
            {
                parametros.Add($"filial{i}", filiais[i]);
            }
            parametros.Add("dtIni", inicio);
            parametros.Add("dtFim", fim);
        }

        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        // No trace levou ~2,2 s. Agora varre PCLANC no bloco de orfas, entao merece
        // o mesmo folego das demais consultas de apuracao — que cresce com o periodo,
        // ver `FolegoDaApuracao`.
        var linhas = await conexao.QueryAsync<LinhaEstruturaDre>(
            new CommandDefinition(
                sql,
                parametros,
                commandTimeout: FolegoDaApuracao(dataInicio, dataFim),
                cancellationToken: cancellationToken));

        return linhas.ToList();
    }

    public async Task<IReadOnlyList<DespesaDre>> ObterDespesasAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        RegimeDre regime,
        AnaliseDre analise,
        IReadOnlyList<decimal>? fornecedores = null,
        CancellationToken cancellationToken = default)
    {
        if (filiais.Count == 0)
        {
            return [];
        }

        if (analise.SqlDespesas is null)
        {
            throw new InvalidOperationException(
                $"A análise '{analise.Codigo}' não tem consulta de despesas. " +
                "O serviço deve barrar dimensões não implementadas antes de chegar aqui.");
        }

        // Dois conjuntos de placeholders porque a lista de filiais aparece duas vezes no
        // SQL — em PCLANC e em PCNFSAID. Com bind posicional, reusar os mesmos nomes daria
        // um parâmetro só para duas posições.
        var placeholdersA = string.Join(", ", filiais.Select((_, i) => $":filialA{i}"));
        var placeholdersB = string.Join(", ", filiais.Select((_, i) => $":filialB{i}"));

        // ── O FILTRO POR FORNECEDOR, nas despesas ────────────────────────────────────
        //
        // Aqui ele NÃO filtra valor: ele SEPARA o que é exclusivo do fornecedor do que vai
        // ser rateado, e tira do DRE os centros que pertencem a outro. Quem rateia é o
        // montador, na fase seguinte.
        //
        // Sem fornecedor selecionado os dois fragmentos voltam a ser o que a consulta já
        // tinha: um `0 as VPAGO_EXCLUSIVO_FORNEC,` e nenhuma condição a mais. Não é
        // "equivalente", é o MESMO texto — e a dc76 confere isso caractere por caractere.
        var temFornecedor = fornecedores is { Count: > 0 };

        // Quatro listas, numeradas na ordem em que o SQL as apresenta. O nome não é o que
        // liga — o ODP.NET liga por POSIÇÃO —, mas numerar deixa o erro visível na depuração.
        string Lista(int n) =>
            string.Join(", ", fornecedores!.Select((_, i) => $":fd{n}_{i}"));

        var exclusivo = "0 as VPAGO_EXCLUSIVO_FORNEC,";
        var condicoes = string.Empty;

        if (temFornecedor)
        {
            // {4} — o valor que NÃO pode ser rateado. A expressão do THEN é a mesma do VPAGO
            // algumas linhas acima: o valor do lançamento, ou o do rateio quando existe.
            exclusivo =
                "case when " + EhExclusivo(Lista(0), Lista(1)) + " " +
                "then DECODE(RC.valor,NULL,NVL(FIN.VPAGO,0)*(-1),NVL(RC.valor,FIN.VPAGO)*(-1)) " +
                "else 0 end as VPAGO_EXCLUSIVO_FORNEC,";

            // {5} — quem SAI do DRE. O centro 90 só aparece para o dono da verba; o centro
            // dedicado, só para o fornecedor a quem pertence.
            //
            // O `DTINATIVACAO IS NULL` está nos DOIS ramos (ele vem dentro de
            // `DedicadoAberto`). Esquecê-lo no primeiro faria um vínculo desligado continuar
            // marcando o centro como "dedicado a alguém", e o centro sumiria do DRE de todo
            // mundo — o oposto de desligar a regra.
            condicoes = CentrosDeOutroFornecedor(Lista(2), Lista(3));
        }

        var sql = string.Format(
            analise.SqlDespesas,
            placeholdersA,
            regime.ExpressaoBucket,
            regime.ExpressaoFiltro,
            placeholdersB,
            exclusivo,
            condicoes);

        // Meia-noite nas duas pontas, de propósito: a 9815 usa
        // To_Date('27/08/2026','dd/mm/yyyy'), que é 00:00. Usar o fim do dia incluiria
        // lançamentos que a rotina antiga não conta, e o número deixaria de bater.
        var inicio = dataInicio.ToDateTime(TimeOnly.MinValue);
        var fim = dataFim.ToDateTime(TimeOnly.MinValue);

        // A ORDEM DOS Add TEM QUE SER ESTA — é a ordem em que os binds aparecem no SQL.
        //
        // As listas 0 e 1 vêm primeiro porque {4} está entre as COLUNAS, antes de qualquer
        // filtro. Depois as filiais, e só então as listas 2 e 3, que moram no WHERE.
        var parametros = new DynamicParameters();
        void LigarFornecedores(params int[] listas)
        {
            if (!temFornecedor)
            {
                return;
            }

            foreach (var n in listas)
            {
                for (var i = 0; i < fornecedores!.Count; i++)
                {
                    parametros.Add($"fd{n}_{i}", fornecedores[i]);
                }
            }
        }

        LigarFornecedores(0, 1);   // {4}: centro 90 e centro dedicado
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialA{i}", filiais[i]);
        }
        LigarFornecedores(2, 3);   // {5}: as mesmas duas, agora no WHERE
        parametros.Add("dtIni1", inicio);
        parametros.Add("dtFim1", fim);
        parametros.Add("dtIni2", inicio);
        parametros.Add("dtFim2", fim);
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialB{i}", filiais[i]);
        }

        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        // No trace a consulta levou ~3,3 s com 3 filiais e 1 mês, e o custo cresce com o
        // período — daí o fôlego sair de `FolegoDaApuracao` e não de um número fixo.
        var despesas = await conexao.QueryAsync<DespesaDre>(
            new CommandDefinition(
                sql,
                parametros,
                commandTimeout: FolegoDaApuracao(dataInicio, dataFim),
                cancellationToken: cancellationToken));

        return despesas.ToList();
    }

    public async Task<IReadOnlyList<FornecedorDre>> BuscarFornecedoresAsync(
        string busca,
        int limite,
        CancellationToken cancellationToken = default)
    {
        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        // Os SETE :busca são a MESMA palavra em sete lugares do SQL, e cada ocorrência
        // consome um parâmetro porque o ODP.NET liga por posição. Repetir o valor é o preço
        // de não concatenar texto vindo do cliente numa consulta que roda contra produção.
        //
        // Eram três até 02/10/2026, quando entrou o LENGTH que desliga a busca por nome com
        // um caractere só, e viraram sete em 06/10/2026 com a busca por NÚMERO INTEIRO no
        // nome — ver a consulta. Acrescentar uma ocorrência e esquecer este Add não dá erro
        // de compilação: dá ORA-01008, parâmetro não vinculado, em tempo de execução.
        var parametros = new DynamicParameters();
        for (var i = 1; i <= 7; i++)
        {
            parametros.Add($"busca{i}", busca);
        }

        parametros.Add("limite", limite);

        var fornecedores = await conexao.QueryAsync<FornecedorDre>(
            new CommandDefinition(
                DreGerencialQueries.Fornecedores,
                parametros,
                commandTimeout: 30,
                cancellationToken: cancellationToken));

        return fornecedores.ToList();
    }

    public async Task<IReadOnlyList<FaturamentoDre>> ObterFaturamentoPorMesAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        IReadOnlyList<decimal>? fornecedores = null,
        CancellationToken cancellationToken = default)
    {
        if (filiais.Count == 0)
        {
            return [];
        }

        var placeholdersA = string.Join(", ", filiais.Select((_, i) => $":filialA{i}"));
        var placeholdersB = string.Join(", ", filiais.Select((_, i) => $":filialB{i}"));
        var placeholdersC = string.Join(", ", filiais.Select((_, i) => $":filialC{i}"));

        // O PREDICADO DO FORNECEDOR, que entra ONZE VEZES na consulta -- seis no bloco das
        // vendas por item e cinco no das devolucoes.
        //
        // CADA OCORRENCIA PRECISA DO PROPRIO NOME DE BIND. O ODP.NET liga por POSICAO, e um
        // mesmo ":fornec0" repetido onze vezes pede onze valores: o driver recusa com
        // ORA-50028 (Invalid parameter binding) se encontrar um nome so. Dai o Regex com
        // contador no lugar de um string.Format: ele numera as ocorrencias, e os binds saem
        // f0_*, f1_*, ... f10_*, na mesma ordem em que o texto do SQL as apresenta.
        //
        // Binds, nunca os codigos concatenados: o valor vem do cliente, e concatena-lo
        // abriria injecao numa consulta que roda contra producao.
        //
        // SEM FILTRO o predicado e 1=1, e "case when 1=1 then X else 0 end" e
        // aritmeticamente o X de hoje -- o otimizador descarta o predicado constante. O
        // numero nao muda; o que precisa ser medido e o PLANO, porque esta e a consulta mais
        // cara da rotina. E o que a dc41 faz.
        var temFornecedor = fornecedores is { Count: > 0 };

        var ocorrencia = 0;
        var sqlComFornecedor = Regex.Replace(
            DreGerencialQueries.FaturamentoPorMes,
            @"\{4\}",
            _ =>
            {
                var n = ocorrencia++;
                return temFornecedor
                    ? $"pr.codfornec in ({string.Join(", ", fornecedores!.Select((_, i) => $":f{n}_{i}"))})"
                    : "1=1";
            });

        // As notas SEM item nao tem produto, logo nao tem fornecedor: com filtro ligado elas
        // entram so no denominador da participacao. Ver o bloco 3 do SQL. Este nao tem bind,
        // entao continua pelo string.Format.
        var filtroSemItem = temFornecedor ? "1=0" : "1=1";

        // {3} é o hint de paralelismo, e vem vazio quando ele está desligado — a consulta
        // volta a ser exatamente a de antes. Não é bind: hint é lido pelo otimizador antes
        // de qualquer valor ser ligado, então precisa estar no texto. Ver docs/plataforma/PARALELISMO.md.
        var hint = _paralelismo.HintPara(MesesDoRecorte(dataInicio, dataFim));

        var sql = string.Format(
            sqlComFornecedor,
            placeholdersA, placeholdersB, placeholdersC, hint, string.Empty, filtroSemItem);

        var inicio = dataInicio.ToDateTime(TimeOnly.MinValue);
        var fim = dataFim.ToDateTime(TimeOnly.MinValue);

        // Ordem obrigatória: datas das vendas, filiais de PCNFSAID, filiais de PCNFENT,
        // datas das devoluções, filiais do bloco sem item, datas dele. É a ordem em que os
        // binds aparecem no SQL — o ODP.NET liga por POSIÇÃO, não por nome.
        var parametros = new DynamicParameters();

        // CADA OCORRENCIA DE ":fornecN" CONSOME UM PARAMETRO, porque o ODP.NET liga por
        // POSICAO e nao por nome. O predicado aparece seis vezes no bloco 1 e cinco no
        // bloco 2, sempre na lista de COLUNAS -- ou seja, antes das datas e das filiais do
        // bloco a que pertence. Por isso a lista inteira e repetida a cada ocorrencia, e na
        // ordem exata em que o texto do SQL as apresenta.
        //
        // Os nomes saem sequenciais e unicos (f1_0, f1_1, f2_0...) justamente porque o nome
        // nao e o que liga: o que liga e a ordem de insercao. Nomes repetidos se
        // sobrescreveriam no DynamicParameters e a consulta receberia parametros a menos --
        // e errar a contagem aqui NAO da erro, da numero errado.
        var ligada = 0;
        void LigarFornecedores(int vezes)
        {
            if (!temFornecedor)
            {
                return;
            }

            for (var v = 0; v < vezes; v++)
            {
                for (var i = 0; i < fornecedores!.Count; i++)
                {
                    parametros.Add($"f{ligada}_{i}", fornecedores[i]);
                }

                ligada++;
            }
        }

        LigarFornecedores(6);   // bloco 1: custo, venda, tabela, ST, PIS e COFINS
        parametros.Add("dtIni1", inicio);
        parametros.Add("dtFim1", fim);
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialA{i}", filiais[i]);
        }
        LigarFornecedores(5);   // bloco 2: devolucao, CMV, ST, PIS e COFINS
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialB{i}", filiais[i]);
        }
        parametros.Add("dtIni2", inicio);
        parametros.Add("dtFim2", fim);
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialC{i}", filiais[i]);
        }
        parametros.Add("dtIni3", inicio);
        parametros.Add("dtFim3", fim);

        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        // A consulta mais cara da rotina: 92,5% de uma apuração, e o bloco de vendas por
        // item é 93,6% dela (dc43, dc45). Com PARALLEL(4) a consulta inteira saiu de 70,3 s
        // para 6,0 s em três meses e nove filiais.
        //
        // O fôlego continua generoso de propósito: ele vale para quando o paralelismo está
        // DESLIGADO, que é o caso a proteger. Ver `FolegoDaApuracao`.
        var faturamento = await conexao.QueryAsync<FaturamentoDre>(
            new CommandDefinition(
                sql,
                parametros,
                commandTimeout: FolegoDaApuracao(dataInicio, dataFim),
                cancellationToken: cancellationToken));

        // Mês sem movimento simplesmente não aparece. Quem monta o DRE gera a lista de
        // meses a partir do período pedido, não do que voltou — senão uma coluna some.
        return faturamento.ToList();
    }

    /// <summary>
    /// O centro dedicado a um fornecedor, lido da tabela de parâmetro. Na 9815 isto é o
    /// literal <c>29</c> escrito à mão (UBase.pas:27217); aqui é cadastro.
    ///
    /// <para>O <c>DTINATIVACAO IS NULL</c> respeita o desligamento sem apagar o histórico —
    /// ver <c>docs/rotinas/9815-dre-gerencial/FILTRO_FORNECEDOR.md</c>. Ele mora DENTRO deste fragmento de propósito:
    /// escrito separado, um dos dois ramos acaba sem ele, e um vínculo desligado continua
    /// marcando o centro como dedicado — o centro sumiria do DRE de todo mundo, que é o
    /// oposto de desligar a regra.</para>
    /// </summary>
    /// <summary>
    /// <b>O lançamento está no centro de custo 90</b>, o das verbas.
    ///
    /// <para>Compara os DOIS PRIMEIROS DÍGITOS, e não o <c>codccprinc</c> inteiro. Até
    /// 22/09/2026 a coluna trazia só os dois dígitos e <c>IN (90)</c> bastava; naquele dia
    /// ela passou a trazer a conta principal — <c>9001</c>, <c>9002</c> — e a comparação
    /// silenciosamente deixou de casar.</para>
    ///
    /// <para><b>O sintoma não é erro, é número plausível</b>: o exclusivo vira zero, a verba
    /// do fornecedor passa a ser rateada como despesa comum, e o DRE sai inteiro, só
    /// menor. Medido em 02/10/2026 no merge que trouxe a mudança de chave para a branch do
    /// filtro: <c>VERBAS MARGEM</c> saiu de 199.500,00 para 72.453,50 — exatamente o total
    /// da filial vezes a participação.</para>
    /// </summary>
    private const string NoCentroDeVerbas =
        "SUBSTR(CCPrinc.codccprinc, 1, 2) = '90'";

    private const string DedicadoAberto =
        "EXISTS (SELECT 1 FROM TAB_WEB_CENTROC_FORNEC D " +
        "WHERE cc.CodigoCentroCusto LIKE D.CODCENTRO || '%' AND D.DTINATIVACAO IS NULL";

    /// <summary>
    /// <b>O lançamento é do fornecedor filtrado</b> — a verba do centro 90 que tem o
    /// <c>CODFORNEC</c> dele, ou a despesa de um centro dedicado a ele.
    ///
    /// <para>É o que separa o que entra INTEIRO no DRE do que é rateado pela participação.
    /// A apuração usa esta condição para somar <c>VPAGO_EXCLUSIVO_FORNEC</c>; o detalhamento,
    /// para marcar a linha na tela. <b>As duas têm de usar a mesma</b>: divergindo num
    /// caractere, a lista deixa de explicar a célula, e em silêncio.</para>
    /// </summary>
    private static string EhExclusivo(string listaCentro90, string listaDedicado) =>
        "((" + NoCentroDeVerbas + " AND FIN.CODFORNEC IN (" + listaCentro90 + ")) " +
        "or " + DedicadoAberto + " AND D.CODFORNEC IN (" + listaDedicado + ")))";

    /// <summary>
    /// <b>Quem SAI do recorte</b>: o centro 90 só aparece para o dono da verba, e o centro
    /// dedicado só para o fornecedor a quem pertence.
    ///
    /// <para>Vai no <c>WHERE</c>, e é compartilhado pela apuração e pelo detalhamento pelo
    /// mesmo motivo de <see cref="EhExclusivo"/> — a tela não pode listar despesa que a
    /// célula não contou.</para>
    /// </summary>
    private static string CentrosDeOutroFornecedor(string listaCentro90, string listaDedicado) =>
        "AND (  (" + NoCentroDeVerbas + " AND FIN.CODFORNEC IN (" + listaCentro90 + ")) " +
        "OR (SUBSTR(CCPrinc.codccprinc, 1, 2) <> '90') )\n" +
        "             AND ( NOT " + DedicadoAberto + ")\n" +
        "                   OR " + DedicadoAberto + " AND D.CODFORNEC IN (" + listaDedicado + ")) )";

    /// <summary>
    /// O filtro por fornecedor nas telas que saem do PRODUTO — receita por cliente,
    /// devolução por motivo e imposto por produto.
    ///
    /// <para>É o mesmo <c>pr.codfornec</c> da apuração, sobre a mesma <c>PCPRODUT</c> que as
    /// três consultas já juntam. Aqui não há rateio: o detalhe fecha com a célula.</para>
    ///
    /// <para>Vazio sem filtro — e aí o SQL é, caractere por caractere, o que sempre foi.</para>
    /// </summary>
    private static string FiltroDoProduto(IReadOnlyList<decimal>? fornecedores, int lista) =>
        fornecedores is { Count: > 0 }
            ? "AND pr.codfornec in ("
              + string.Join(", ", fornecedores.Select((_, i) => $":fp{lista}_{i}"))
              + ")"
            : string.Empty;

    /// <summary>
    /// Liga os binds de <see cref="FiltroDoProduto"/>. <b>Chamar na ordem em que o SQL os
    /// pede</b> — o ODP.NET liga por posição, não por nome.
    /// </summary>
    private static void LigarFiltroDoProduto(
        DynamicParameters parametros, IReadOnlyList<decimal>? fornecedores, int lista)
    {
        if (fornecedores is not { Count: > 0 })
        {
            return;
        }

        for (var i = 0; i < fornecedores.Count; i++)
        {
            parametros.Add($"fp{lista}_{i}", fornecedores[i]);
        }
    }

    public async Task<IReadOnlyList<DetalheClienteDre>> ObterDetalheReceitaPorClienteAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        IReadOnlyList<decimal>? fornecedores = null,
        CancellationToken cancellationToken = default)
    {
        if (filiais.Count == 0)
        {
            return [];
        }

        var placeholdersA = string.Join(", ", filiais.Select((_, i) => $":filialA{i}"));
        var placeholdersB = string.Join(", ", filiais.Select((_, i) => $":filialB{i}"));

        var sql = string.Format(
            DreDetalheQueries.ReceitaPorCliente,
            placeholdersA,
            placeholdersB,
            FiltroDoProduto(fornecedores, 0),
            FiltroDoProduto(fornecedores, 1));

        var inicio = dataInicio.ToDateTime(TimeOnly.MinValue);
        var fim = dataFim.ToDateTime(TimeOnly.MinValue);

        // Ordem obrigatória: datas das vendas, filiais das vendas, FORNECEDORES das vendas,
        // datas das devoluções, filiais das devoluções, fornecedores das devoluções. É a
        // ordem em que os binds aparecem no SQL.
        var parametros = new DynamicParameters();
        parametros.Add("dtIni1", inicio);
        parametros.Add("dtFim1", fim);
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialA{i}", filiais[i]);
        }
        LigarFiltroDoProduto(parametros, fornecedores, 0);
        parametros.Add("dtIni2", inicio);
        parametros.Add("dtFim2", fim);
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialB{i}", filiais[i]);
        }
        LigarFiltroDoProduto(parametros, fornecedores, 1);

        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        // Cara pelo mesmo motivo que a apuração: varre as mesmas notas. Medida em 116,9 s
        // para um mês e três filiais — ver docs/rotinas/9815-dre-gerencial/DIVERGENCIAS.md §4.
        var linhas = await conexao.QueryAsync<DetalheClienteDre>(
            new CommandDefinition(
                sql,
                parametros,
                commandTimeout: 600,
                cancellationToken: cancellationToken));

        return linhas.ToList();
    }

    public async Task<IReadOnlyList<DetalheImpostoDre>> ObterDetalheImpostoPorProdutoAsync(
        string imposto,
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        IReadOnlyList<decimal>? fornecedores = null,
        CancellationToken cancellationToken = default)
    {
        if (filiais.Count == 0)
        {
            return [];
        }

        var placeholdersA = string.Join(", ", filiais.Select((_, i) => $":filialA{i}"));
        var placeholdersB = string.Join(", ", filiais.Select((_, i) => $":filialB{i}"));

        // A expressão do imposto vem de uma lista fechada, nunca do que chegou na
        // requisição. `ExpressaoDoImposto` lança se o nome não for um dos três.
        var sql = string.Format(
            DreDetalheQueries.ImpostoPorProduto,
            DreDetalheQueries.ExpressaoDoImposto(imposto, devolucao: false),
            placeholdersA,
            DreDetalheQueries.ExpressaoDoImposto(imposto, devolucao: true),
            placeholdersB,
            FiltroDoProduto(fornecedores, 0),
            FiltroDoProduto(fornecedores, 1));

        var inicio = dataInicio.ToDateTime(TimeOnly.MinValue);
        var fim = dataFim.ToDateTime(TimeOnly.MinValue);

        // Ordem obrigatória, igual à da receita por cliente: datas das vendas, filiais das
        // vendas, fornecedores das vendas, datas das devoluções, filiais das devoluções,
        // fornecedores das devoluções.
        var parametros = new DynamicParameters();
        parametros.Add("dtIni1", inicio);
        parametros.Add("dtFim1", fim);
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialA{i}", filiais[i]);
        }
        LigarFiltroDoProduto(parametros, fornecedores, 0);
        parametros.Add("dtIni2", inicio);
        parametros.Add("dtFim2", fim);
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialB{i}", filiais[i]);
        }
        LigarFiltroDoProduto(parametros, fornecedores, 1);

        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        var linhas = await conexao.QueryAsync<DetalheImpostoDre>(
            new CommandDefinition(
                sql,
                parametros,
                commandTimeout: 600,
                cancellationToken: cancellationToken));

        return linhas.ToList();
    }

    public async Task<IReadOnlyList<DetalheNotaDre>> ObterDetalheNotasDaDevolucaoAsync(
        int? codMotivo,
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        CancellationToken cancellationToken = default)
    {
        if (filiais.Count == 0)
        {
            return [];
        }

        var placeholders = string.Join(", ", filiais.Select((_, i) => $":filial{i}"));
        var sql = string.Format(DreDetalheQueries.NotasDaDevolucao, placeholders);

        // A ordem segue a dos binds no SQL: as datas, as filiais, e o motivo por último.
        var parametros = new DynamicParameters();
        parametros.Add("dtIni", dataInicio.ToDateTime(TimeOnly.MinValue));
        parametros.Add("dtFim", dataFim.ToDateTime(TimeOnly.MinValue));
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filial{i}", filiais[i]);
        }

        parametros.Add("codMotivo", codMotivo);

        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        var linhas = await conexao.QueryAsync<DetalheNotaDre>(
            new CommandDefinition(
                sql,
                parametros,
                commandTimeout: 300,
                cancellationToken: cancellationToken));

        return linhas.ToList();
    }

    public async Task<IReadOnlyList<DetalheMotivoDre>> ObterDetalheDevolucaoPorMotivoAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        IReadOnlyList<decimal>? fornecedores = null,
        CancellationToken cancellationToken = default)
    {
        if (filiais.Count == 0)
        {
            return [];
        }

        var placeholders = string.Join(", ", filiais.Select((_, i) => $":filial{i}"));
        var sql = string.Format(
            DreDetalheQueries.DevolucaoPorMotivo,
            placeholders,
            FiltroDoProduto(fornecedores, 0));

        var parametros = new DynamicParameters();
        parametros.Add("dtIni", dataInicio.ToDateTime(TimeOnly.MinValue));
        parametros.Add("dtFim", dataFim.ToDateTime(TimeOnly.MinValue));
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filial{i}", filiais[i]);
        }
        LigarFiltroDoProduto(parametros, fornecedores, 0);

        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        var linhas = await conexao.QueryAsync<DetalheMotivoDre>(
            new CommandDefinition(
                sql,
                parametros,
                commandTimeout: 300,
                cancellationToken: cancellationToken));

        return linhas.ToList();
    }

    public async Task<IReadOnlyList<DetalheLancamentoDre>> ObterDetalheLancamentosAsync(
        IReadOnlyList<string> filiais,
        DateOnly dataInicio,
        DateOnly dataFim,
        RegimeDre regime,
        AnaliseDre analise,
        string bloco,
        string chave,
        IReadOnlyList<decimal>? fornecedores = null,
        CancellationToken cancellationToken = default)
    {
        if (filiais.Count == 0)
        {
            return [];
        }

        // O bloco chega validado do serviço; este switch fechado é a segunda barreira, e é
        // o que garante que nada montado por concatenação venha de entrada do usuário.
        var (antesRo, antesLl, orfa) = bloco switch
        {
            "operacional"     => (true, true, false),
            "pos-operacional" => (false, true, false),
            "orfa"            => (false, false, true),
            _ => throw new ArgumentOutOfRangeException(nameof(bloco), bloco, "Bloco inválido."),
        };

        var placeholdersA = string.Join(", ", filiais.Select((_, i) => $":filialA{i}"));
        var placeholdersB = string.Join(", ", filiais.Select((_, i) => $":filialB{i}"));

        // ── O FILTRO POR FORNECEDOR, no detalhamento ─────────────────────────────────
        //
        // Os mesmos dois fragmentos da apuração, com uma diferença: aqui a marca é um
        // SINALIZADOR, não um valor. A tela mostra o lançamento como ele é — quem rateia é
        // quem soma, e é o serviço que aplica a participação sobre o que não está marcado.
        var temFornecedor = fornecedores is { Count: > 0 };

        string Lista(int n) =>
            string.Join(", ", fornecedores!.Select((_, i) => $":fd{n}_{i}"));

        var exclusivo = "0 AS EXCLUSIVO,";
        var condicoes = string.Empty;

        if (temFornecedor)
        {
            exclusivo = "case when " + EhExclusivo(Lista(0), Lista(1)) + " then 1 else 0 end AS EXCLUSIVO,";
            condicoes = CentrosDeOutroFornecedor(Lista(2), Lista(3));
        }

        var sql = string.Format(
            DreDetalheQueries.Lancamentos,
            DreDetalheQueries.PredicadoDoBloco(antesRo, antesLl),
            placeholdersA,
            placeholdersB,
            DreDetalheQueries.ColunaDoRecorte(analise.Codigo, orfa),
            regime.ExpressaoFiltro,
            exclusivo,
            condicoes);

        var inicio = dataInicio.ToDateTime(TimeOnly.MinValue);
        var fim = dataFim.ToDateTime(TimeOnly.MinValue);

        // Ordem obrigatória: FORNECEDORES da coluna EXCLUSIVO — que é projeção, e por isso
        // vem antes de tudo —, filiais do financeiro, fornecedores do WHERE, datas do
        // financeiro, datas da venda de ativo, filiais da venda de ativo, e a chave do
        // recorte por último. É a ordem em que os binds ficam no SQL depois do string.Format.
        var parametros = new DynamicParameters();

        void LigarFornecedores(params int[] listas)
        {
            if (!temFornecedor)
            {
                return;
            }

            foreach (var n in listas)
            {
                for (var i = 0; i < fornecedores!.Count; i++)
                {
                    parametros.Add($"fd{n}_{i}", fornecedores[i]);
                }
            }
        }

        LigarFornecedores(0, 1);   // a coluna EXCLUSIVO
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialA{i}", filiais[i]);
        }
        LigarFornecedores(2, 3);   // as mesmas duas, agora no WHERE
        parametros.Add("dtIni1", inicio);
        parametros.Add("dtFim1", fim);
        parametros.Add("dtIni2", inicio);
        parametros.Add("dtFim2", fim);
        for (var i = 0; i < filiais.Count; i++)
        {
            parametros.Add($"filialB{i}", filiais[i]);
        }
        parametros.Add("chave", chave);

        using var conexao = await _conexoes.CriarConexaoAsync(cancellationToken);

        var linhas = await conexao.QueryAsync<DetalheLancamentoDre>(
            new CommandDefinition(
                sql,
                parametros,
                commandTimeout: 300,
                cancellationToken: cancellationToken));

        return linhas.ToList();
    }
}

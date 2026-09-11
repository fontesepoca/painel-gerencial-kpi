using Epoca.Kpi.Api.Application.Features.DreGerencial.Dtos;
using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Application.Features.DreGerencial;

/// <summary>
/// Um trecho de tempo a consultar, e como ele se transforma nas colunas da tela.
///
/// <para>É aqui que os três modos de período viram um mecanismo só. Cada modo produz uma
/// lista de recortes, e cada recorte custa <b>um par de consultas</b> — despesas e
/// faturamento:</para>
///
/// <list type="table">
///   <listheader><term>Modo</term><description>Recortes e colunas</description></listheader>
///   <item>
///     <term><c>meses</c></term>
///     <description><b>Um</b> recorte, o intervalo pedido, que se abre em <b>uma coluna por
///     mês</b>. É o padrão da tela e o comportamento de sempre: uma consulta, colunas
///     mensais.</description>
///   </item>
///   <item>
///     <term><c>anos</c></term>
///     <description>Um recorte por ano, de 01/01 a 31/12, cada um virando <b>uma
///     coluna</b> com os doze meses somados.</description>
///   </item>
///   <item>
///     <term><c>comparar-anos</c></term>
///     <description>Um recorte por ano, com o mesmo dia e mês de início e fim, cada um
///     virando <b>uma coluna</b>.</description>
///   </item>
/// </list>
///
/// <para><b>Por que o modo mensal continua sendo um recorte só.</b> Ele poderia ser doze
/// recortes de um mês cada, o que unificaria mais o código — e multiplicaria por doze o
/// custo da consulta mais cara da rotina, que hoje resolve o intervalo inteiro num
/// <c>GROUP BY</c> de mês. A economia é o motivo de o modo mensal existir como caso próprio:
/// ver `DreGerencialQueries.FaturamentoPorMes` e a §12 de `docs/ROTINA_9815.md`.</para>
/// </summary>
/// <param name="DataInicio">Primeiro dia do recorte.</param>
/// <param name="DataFim">Último dia.</param>
/// <param name="PorMes">
/// <c>true</c> abre o recorte em uma coluna por mês; <c>false</c> soma tudo numa coluna só.
/// </param>
/// <param name="Chave">Identidade da coluna quando o recorte é uma coluna só.</param>
/// <param name="Rotulo">Cabeçalho da coluna quando o recorte é uma coluna só.</param>
public sealed record RecorteDre(
    DateOnly DataInicio,
    DateOnly DataFim,
    bool PorMes,
    string? Chave = null,
    string? Rotulo = null)
{
    private static readonly string[] MesesCurtos =
    [
        "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
        "Jul", "Ago", "Set", "Out", "Nov", "Dez",
    ];

    /// <summary>
    /// Traduz o filtro nos recortes a consultar.
    ///
    /// <para><b>Sem modo, ou modo desconhecido, é o mensal.</b> Um cliente antigo que só
    /// manda <c>dataInicio</c> e <c>dataFim</c> continua funcionando exatamente como antes —
    /// e um modo escrito errado cai no comportamento seguro em vez de devolver tela vazia.
    /// </para>
    /// </summary>
    public static IReadOnlyList<RecorteDre> Resolver(DespesasFiltroDto filtro)
    {
        var anos = AnosValidos(filtro);

        return ModoEfetivo(filtro) switch
        {
            "anos" => anos
                .Select(a => new RecorteDre(
                    DataInicio: new DateOnly(a, 1, 1),
                    DataFim: new DateOnly(a, 12, 31),
                    PorMes: false,
                    Chave: a.ToString(),
                    Rotulo: a.ToString()))
                .ToList(),

            "comparar-anos" => anos
                .Select(a => DoRecorteAnual(filtro, a))
                .ToList(),

            _ => [new RecorteDre(filtro.DataInicio, filtro.DataFim, PorMes: true)],
        };
    }

    /// <summary>
    /// O modo que a apuração de fato usou, que nem sempre é o que o filtro pediu.
    ///
    /// <para><b>Vai na resposta porque o front não tem como deduzir isso.</b> Um pedido de
    /// <c>anos</c> sem ano nenhum cai no mensal, e a tela precisa saber disso para rotular
    /// as colunas e decidir o que mostrar no bloco final — se adivinhasse pelo formato da
    /// chave, acertaria hoje e erraria no dia em que um modo novo aparecesse.</para>
    /// </summary>
    public static string ModoEfetivo(DespesasFiltroDto filtro) =>
        filtro.Modo is "anos" or "comparar-anos" && AnosValidos(filtro).Count > 0
            ? filtro.Modo
            : "meses";

    private static List<int> AnosValidos(DespesasFiltroDto filtro) =>
        (filtro.Anos ?? [])
            .Where(a => a is >= 2000 and <= 2100)
            .Distinct()
            .OrderBy(a => a)
            .ToList();

    /// <summary>
    /// O mesmo dia e mês, no ano pedido.
    ///
    /// <para><b>29 de fevereiro precisa de cuidado.</b> Comparar 01/01–29/02 de um ano
    /// bissexto com o mesmo recorte num ano comum criaria uma data que não existe; o dia é
    /// preso ao último do mês. Sem isso, um recorte válido em 2024 derruba a apuração de
    /// 2025 com exceção de data.</para>
    /// </summary>
    private static RecorteDre DoRecorteAnual(DespesasFiltroDto filtro, int ano)
    {
        var inicio = NoAno(ano, filtro.DataInicio);
        var fim = NoAno(ano, filtro.DataFim);

        var mesInicio = MesesCurtos[inicio.Month - 1];
        var mesFim = MesesCurtos[fim.Month - 1];

        // `Jan–Mar/2026` quando o recorte cruza meses; `Set/2026` quando é um mês só.
        var rotulo = inicio.Month == fim.Month
            ? $"{mesInicio}/{ano}"
            : $"{mesInicio}–{mesFim}/{ano}";

        return new RecorteDre(
            DataInicio: inicio,
            DataFim: fim,
            PorMes: false,
            Chave: $"{ano}:{inicio.Month:D2}-{fim.Month:D2}",
            Rotulo: rotulo);
    }

    private static DateOnly NoAno(int ano, DateOnly molde) =>
        new(ano, molde.Month, Math.Min(molde.Day, DateTime.DaysInMonth(ano, molde.Month)));

    /// <summary>
    /// As colunas deste recorte, com os dados que acabaram de ser consultados.
    ///
    /// <para>No recorte mensal, uma coluna por mês do intervalo — e <b>a lista de meses sai
    /// do período pedido, não dos dados</b>: mês sem movimento não volta do banco, e a
    /// coluna sumiria da tela. Quem pediu junho e julho tem que ver junho e julho, ainda que
    /// um esteja zerado.</para>
    /// </summary>
    public IReadOnlyList<ColunaApuracao> EmColunas(
        IReadOnlyList<DespesaDre> despesas,
        IReadOnlyList<FaturamentoDre> faturamentoPorMes)
    {
        if (!PorMes)
        {
            return
            [
                new ColunaApuracao(
                    Chave: Chave ?? $"{DataInicio:yyyy-MM-dd}",
                    Rotulo: Rotulo ?? $"{DataInicio:dd/MM/yyyy} a {DataFim:dd/MM/yyyy}",
                    DataInicio: DataInicio,
                    DataFim: DataFim,
                    Despesas: despesas,
                    Faturamento: FaturamentoDre.Somar(Chave ?? "", faturamentoPorMes)),
            ];
        }

        var porMes = despesas
            .GroupBy(d => d.MesAno)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<DespesaDre>)g.ToList());

        var faturamento = faturamentoPorMes.ToDictionary(f => f.MesAno);

        return PeriodoDre.Entre(DataInicio, DataFim)
            .Select(p => new ColunaApuracao(
                Chave: p.MesAno,
                Rotulo: p.Rotulo,
                DataInicio: RecorteDoMes(p.MesAno, DataInicio, inicio: true),
                DataFim: RecorteDoMes(p.MesAno, DataFim, inicio: false),
                Despesas: porMes.GetValueOrDefault(p.MesAno, []),
                Faturamento: faturamento.GetValueOrDefault(p.MesAno)))
            .ToList();
    }

    /// <summary>
    /// O recorte de um mês <b>cortado pelo período apurado</b>: com 01/08 a 27/08, agosto vai
    /// de 01/08 a 27/08, não ao mês calendário. O front já fazia isso para o duplo clique; o
    /// cálculo vem para cá porque agora a coluna carrega o próprio recorte.
    /// </summary>
    private static DateOnly RecorteDoMes(string mesAno, DateOnly limite, bool inicio)
    {
        var partes = mesAno.Split('/');
        var mes = int.Parse(partes[0]);
        var ano = int.Parse(partes[1]);

        var primeiro = new DateOnly(ano, mes, 1);
        var ultimo = new DateOnly(ano, mes, DateTime.DaysInMonth(ano, mes));

        return inicio
            ? (limite > primeiro ? limite : primeiro)
            : (limite < ultimo ? limite : ultimo);
    }
}

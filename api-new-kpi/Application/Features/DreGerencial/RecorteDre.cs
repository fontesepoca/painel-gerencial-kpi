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
///     <description><b>Dois recortes livres</b>, cada um aberto em <b>colunas mensais</b>,
///     como o modo <c>meses</c> faz. Os dois não precisam ter o mesmo tamanho nem os mesmos
///     meses.</description>
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
/// <param name="Bloco">
/// O grupo a que as colunas deste recorte pertencem. Separa os dois lados do comparativo,
/// e é o que impede o <c>%AH</c> de comparar a primeira coluna do segundo intervalo com a
/// última do primeiro. Ver <see cref="ColunaApuracao.Bloco"/>.
/// </param>
public sealed record RecorteDre(
    DateOnly DataInicio,
    DateOnly DataFim,
    bool PorMes,
    string? Chave = null,
    string? Rotulo = null,
    int Bloco = 0)
{
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

            // Dois recortes mensais, um por lado da comparação. `PorMes: true` é o ponto:
            // cada intervalo se abre nas próprias colunas de mês, e a tela fica com
            // `Jan/25 Fev/25 Mar/25 | Jan/26 Fev/26 Mar/26` em vez de duas colunas
            // agregadas — que era o desenho anterior, e respondia só à pergunta "o mesmo
            // período, um ano depois".
            "comparar-anos" =>
            [
                new RecorteDre(filtro.DataInicio, filtro.DataFim, PorMes: true, Bloco: 0),
                new RecorteDre(
                    filtro.ComparacaoInicio!.Value,
                    filtro.ComparacaoFim!.Value,
                    PorMes: true,
                    Bloco: 1),
            ],

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
    public static string ModoEfetivo(DespesasFiltroDto filtro) => filtro.Modo switch
    {
        "anos" when AnosValidos(filtro).Count > 0 => "anos",

        // Comparação com um lado só não é comparação: sem o segundo intervalo, ou com ele
        // invertido, cai no mensal — que apura exatamente o primeiro intervalo, e é o
        // resultado menos surpreendente para quem montou o filtro pela metade.
        "comparar-anos" when filtro.ComparacaoInicio is { } inicio
                          && filtro.ComparacaoFim is { } fim
                          && inicio <= fim => "comparar-anos",

        _ => "meses",
    };

    private static List<int> AnosValidos(DespesasFiltroDto filtro) =>
        (filtro.Anos ?? [])
            .Where(a => a is >= 2000 and <= 2100)
            .Distinct()
            .OrderBy(a => a)
            .ToList();

    /* O recorte anual — o mesmo dia e mês repetido em cada ano escolhido — morava aqui, com
       o cuidado de prender 29 de fevereiro ao último dia do mês. Saiu em 11/09/2026, quando
       o comparativo passou a receber DOIS INTERVALOS LIVRES: a regra de repetir o molde em
       vários anos deixou de existir, e com ela a necessidade de tratar o ano bissexto.

       Se um dia voltar um modo de "mesmo período, N anos depois", o cuidado com 29/02 volta
       junto: criar 29/02 num ano comum derruba a apuração inteira com exceção de data. */

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
                    Faturamento: FaturamentoDre.Somar(Chave ?? "", faturamentoPorMes),
                    Bloco: Bloco),
            ];
        }

        var porMes = despesas
            .GroupBy(d => d.MesAno)
            .ToDictionary(g => g.Key, g => (IReadOnlyList<DespesaDre>)g.ToList());

        var faturamento = faturamentoPorMes.ToDictionary(f => f.MesAno);

        return PeriodoDre.Entre(DataInicio, DataFim)
            .Select(p => new ColunaApuracao(
                // A chave leva o bloco quando há mais de um. Sem isso, comparar dois
                // intervalos que se sobrepõem — jan–mar/2025 contra fev–abr/2025, um pedido
                // estranho mas legítimo — produziria duas colunas com a mesma chave, e o
                // montador indexa os valores por ela: uma sobrescreveria a outra em
                // silêncio, com a tela mostrando o mesmo número duas vezes.
                Chave: Bloco == 0 ? p.MesAno : $"{Bloco}:{p.MesAno}",
                Rotulo: p.Rotulo,
                DataInicio: RecorteDoMes(p.MesAno, DataInicio, inicio: true),
                DataFim: RecorteDoMes(p.MesAno, DataFim, inicio: false),
                Despesas: porMes.GetValueOrDefault(p.MesAno, []),
                Faturamento: faturamento.GetValueOrDefault(p.MesAno),
                Bloco: Bloco))
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

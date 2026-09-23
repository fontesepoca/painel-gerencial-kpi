using Epoca.Kpi.Api.Infrastructure.Persistence.Queries;

namespace Epoca.Kpi.Api.Application.Features.DreGerencial;

/// <summary>
/// Dimensão do combo "Análise" da 9815. Cada uma tem **suas próprias consultas** de
/// estrutura e de despesas — não é um parâmetro do mesmo SQL, são SQLs diferentes.
///
/// <para>
/// Os dois templates são <b>trechos de SQL constantes desta classe</b>, nunca entrada do
/// usuário: o código da análise é resolvido contra <see cref="Todas"/> antes de chegar aqui.
/// </para>
/// </summary>
public sealed record AnaliseDre(
    string Codigo,
    string Rotulo,
    string? SqlEstrutura,
    string? SqlDespesas,
    bool EstruturaTemDoisBlocosDeFilial)
{
    /// <summary>Dimensão pronta e validada contra a 9815.</summary>
    public bool Implementada => SqlEstrutura is not null && SqlDespesas is not null;

    /// <summary>
    /// A dimensão-molde: validada ao centavo em 28/08/2026, 1305 células comparadas.
    /// </summary>
    public static readonly AnaliseDre GrupoDeContas = new(
        Codigo: "grupo-contas",
        Rotulo: "Grupo de Contas",
        SqlEstrutura: DreGerencialQueries.EstruturaGrupoDeContas,
        SqlDespesas: DreGerencialQueries.DespesasGrupoDeContas,
        EstruturaTemDoisBlocosDeFilial: false);

    /// <summary>
    /// Agrupa pela CONTA PRINCIPAL do centro de custo: o prefixo antes do ponto e, quando
    /// não há ponto, o próprio código.
    ///
    /// <para><b>Diverge da 9815 de propósito, em dois pontos.</b></para>
    ///
    /// <para><b>1. O agrupamento.</b> A 9815 agrupa pelos dois primeiros dígitos — `2801`,
    /// `2802` … `2831` viram uma linha só, rotulada pelo `min()` do grupo. Aqui cada
    /// centro sem ponto é uma linha, e as subcontas `2201.133` aparecem no detalhamento.
    /// Pedido das reuniões, decidido em 22/09/2026: o `TRANSPORTE T CD UBERLANDIA` tem que
    /// ter linha própria. A grade passa de 34 para 60 linhas na filial 7 em agosto/2026.</para>
    ///
    /// <para><b>2. A lista de centros</b> — a rotina descobre os centros de custo olhando uma
    /// filial só, e com isso apaga linhas do relatório. Aqui a lista é completa.
    /// Ver `docs/DIVERGENCIAS.md` nº 2.</para>
    /// </summary>
    public static readonly AnaliseDre CCustoPrincipal = new(
        Codigo: "ccusto-principal",
        Rotulo: "C. Custo Principal",
        SqlEstrutura: DreGerencialQueries.EstruturaCCustoPrincipal,
        SqlDespesas: DreGerencialQueries.DespesasCCustoPrincipal,
        EstruturaTemDoisBlocosDeFilial: true);

    /// <summary>
    /// Desce ao nível da conta. É a mais simples das quatro: a chave é a conta do começo ao
    /// fim, sem trocar depois do LUCRO LIQUIDO. Não diverge da 9815 em nada.
    /// </summary>
    public static readonly AnaliseDre ContaGerencial = new(
        Codigo: "conta-gerencial",
        Rotulo: "Conta Gerencial",
        SqlEstrutura: DreGerencialQueries.EstruturaContaGerencial,
        SqlDespesas: DreGerencialQueries.DespesasContaGerencial,
        EstruturaTemDoisBlocosDeFilial: false);

    /// <summary>
    /// Desce ao centro de custo inteiro. É a dimensão que **nunca funcionou** na 9815 — falha
    /// sempre com `ORA-00923`, um parêntese sobrando escondendo um `ORA-01722` —, e por isso
    /// a única sem resultado antigo para comparar. Ver `docs/DIVERGENCIAS.md` nº 3.
    ///
    /// <para>Os dois erros somem por construção, porque a chave é texto em todo o caminho.
    /// Mas <b>os números nunca foram vistos por ninguém</b>: só ficam confiáveis depois da
    /// conferência com o negócio.</para>
    /// </summary>
    public static readonly AnaliseDre CentroCusto = new(
        Codigo: "centro-custo",
        Rotulo: "Centro de Custo",
        SqlEstrutura: DreGerencialQueries.EstruturaCentroCusto,
        SqlDespesas: DreGerencialQueries.DespesasCentroCusto,
        EstruturaTemDoisBlocosDeFilial: true);

    /// <summary>Na ordem do combo da 9815.</summary>
    public static readonly IReadOnlyList<AnaliseDre> Todas =
        [GrupoDeContas, ContaGerencial, CCustoPrincipal, CentroCusto];

    /// <summary>Resolve o código vindo da API. Devolve <c>null</c> se não existir.</summary>
    public static AnaliseDre? Resolver(string? codigo) =>
        Todas.FirstOrDefault(a => string.Equals(a.Codigo, codigo, StringComparison.OrdinalIgnoreCase));

    /// <summary>Os códigos aceitos, para mensagem de erro.</summary>
    public static string CodigosAceitos => string.Join(", ", Todas.Select(a => a.Codigo));
}

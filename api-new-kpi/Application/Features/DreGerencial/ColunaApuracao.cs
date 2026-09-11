using Epoca.Kpi.Api.Domain.Entities;

namespace Epoca.Kpi.Api.Application.Features.DreGerencial;

/// <summary>
/// Uma coluna da tabela do DRE, com os dados que a alimentam.
///
/// <para><b>Coluna deixou de ser sinônimo de mês</b> — 10/09/2026. Até aqui o montador
/// derivava as colunas dos meses do intervalo e indexava tudo por <c>MesAno</c>; agora a
/// coluna é a unidade, e o mês é só o caso mais comum dela. É o que permite os três modos
/// de período sem um segundo montador:</para>
///
/// <list type="bullet">
///   <item><b>Meses</b> — uma coluna por mês do intervalo. Igual ao que sempre foi, e
///   continua sendo o padrão da tela.</item>
///   <item><b>Anos</b> — uma coluna por ano, cada uma somando os doze meses.</item>
///   <item><b>Comparar anos</b> — <b>dois intervalos livres</b>, cada um aberto em colunas
///   mensais. Os dois não precisam ter o mesmo tamanho nem os mesmos meses: comparar
///   janeiro–março de 2025 com junho–setembro de 2026 é um pedido válido.</item>
/// </list>
///
/// <para><b>Por que cada coluna carrega os próprios dados.</b> Nos dois modos novos, cada
/// coluna vem de uma consulta própria, e não de um fatiamento de uma consulta só. Não é
/// escolha de arquitetura: um intervalo contínuo de 01/01/2025 a 31/03/2026 agrupado por mês
/// devolveria <b>setembro de 2025 inteiro</b> quando o recorte pedido era 01/09 a 10/09 — o
/// filtro de data limita as pontas do intervalo, não o interior. Recorte por dia repetido em
/// vários anos não é representável numa consulta só.</para>
///
/// <para>O custo disso é <c>N × (faturamento + despesas)</c>, N igual ao número de colunas
/// dos modos novos. A estrutura de linhas continua sendo <b>uma</b> consulta, sobre o
/// período que cobre todos os recortes.</para>
/// </summary>
/// <param name="Chave">
/// Identidade da coluna, estável e legível: <c>09/2026</c> no modo meses, <c>2026</c> no
/// modo anos, <c>2026:01-03</c> no comparativo. O front usa como chave de render.
/// </param>
/// <param name="Rotulo">O que aparece no cabeçalho: <c>Setembro/2026</c>, <c>2026</c>,
/// <c>Jan–Mar/2026</c>.</param>
/// <param name="DataInicio">
/// Primeiro dia do recorte desta coluna. Vai para o front porque é o que o duplo clique
/// precisa: até aqui ele derivava o recorte do mês da coluna, o que deixa de funcionar
/// quando a coluna é um ano ou um trecho de ano.
/// </param>
/// <param name="DataFim">Último dia do recorte.</param>
/// <param name="Despesas">
/// As despesas do recorte. Vêm por mês da consulta; o montador soma por linha, então uma
/// coluna de doze meses recebe as doze parcelas.
/// </param>
/// <param name="Faturamento">
/// O faturamento do recorte, já somado. <c>null</c> quando o recorte não teve movimento —
/// e a coluna aparece zerada, que é o comportamento da 9815.
/// </param>
/// <param name="Bloco">
/// A que grupo de colunas esta pertence. <b>É o que faz o <c>%AH</c> parar na virada de
/// intervalo.</b>
///
/// <para>Com as colunas <c>Jan/25 Fev/25 Mar/25 Jan/26 Fev/26 Mar/26</c>, um <c>%AH</c>
/// sequencial compararia Jan/26 com Mar/25 — dois meses que não têm relação nenhuma, e o
/// número sairia grande e sem sentido bem na coluna que abre a comparação. Cada intervalo
/// é um bloco, e a variação só olha para trás dentro do próprio.</para>
///
/// <para>Nos modos <c>meses</c> e <c>anos</c> todas as colunas ficam no bloco <c>0</c>: lá
/// a sequência é contínua de propósito, e é assim que o ano compara com o ano anterior.</para>
/// </param>
public sealed record ColunaApuracao(
    string Chave,
    string Rotulo,
    DateOnly DataInicio,
    DateOnly DataFim,
    IReadOnlyList<DespesaDre> Despesas,
    FaturamentoDre? Faturamento,
    int Bloco = 0);

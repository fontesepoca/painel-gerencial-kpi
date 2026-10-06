using Epoca.Kpi.Api.Application.Common;

namespace Epoca.Kpi.Api.Application.Features.DreGerencial.Dtos;

/// <summary>
/// Filial no filtro da tela. `CodFilial` é texto — ver <c>Domain/Entities/Filial.cs</c>.
/// </summary>
public record FilialDto(
    string CodFilial,
    string Label,
    string Empresa,
    string EmpresaCodigo,
    string Unidade,
    string Uf,
    int? Ordem);

/// <summary>
/// Linha da estrutura do DRE, já traduzida para a tela: flags como booleano e cor em CSS.
/// </summary>
public record LinhaEstruturaDto(
    int? Id,
    string Chave,
    string Descricao,
    bool Totalizadora,
    bool Calculada,
    string? Cor,
    bool AntesResultadoOperacional,
    bool AntesLucroLiquido,
    bool AntesLucroFinal);

/// <summary>
/// Um fornecedor na busca do filtro.
///
/// <para><c>CodFornecPrinc</c> vem junto para a tela poder AVISAR que o cadastro escolhido tem
/// irmãos — o filtro continua sendo por código, e um não puxa o outro.</para>
/// </summary>
public record FornecedorDto(
    decimal CodFornec,
    string Fornecedor,
    string? Cgc,
    decimal? CodFornecPrinc);

/// <summary>Filtro da consulta de despesas. `Filiais` são códigos em texto.</summary>
public record DespesasFiltroDto(
    IReadOnlyList<string> Filiais,
    DateOnly DataInicio,
    DateOnly DataFim,
    string Regime,
    string Analise,
    /// <summary>
    /// Como as colunas são formadas — ver <c>RecorteDre</c>.
    ///
    /// <para><c>meses</c> (ou ausente) é o padrão: uma coluna por mês do intervalo, que é o
    /// comportamento de sempre. <c>anos</c> usa <see cref="Anos"/> e devolve uma coluna por
    /// ano fechado. <c>comparar-anos</c> repete o dia e o mês de
    /// <see cref="DataInicio"/>–<see cref="DataFim"/> em cada ano de <see cref="Anos"/>.
    /// </para>
    ///
    /// <para>Opcional de propósito: cliente que não conhece o campo continua apurando como
    /// antes.</para>
    /// </summary>
    string? Modo = null,
    /// <summary>
    /// Os anos das colunas no modo <c>anos</c>. Ignorado nos outros.
    /// </summary>
    IReadOnlyList<int>? Anos = null,
    /// <summary>
    /// O SEGUNDO intervalo do modo <c>comparar-anos</c> — o lado direito da comparação.
    ///
    /// <para><b>Livre em relação ao primeiro.</b> Não precisa ter o mesmo tamanho nem os
    /// mesmos meses: comparar janeiro–março de 2025 com junho–setembro de 2026 é um pedido
    /// válido, e foi o que motivou o desenho. A versão anterior repetia o dia e o mês do
    /// primeiro intervalo em cada ano escolhido, o que só respondia à pergunta "o mesmo
    /// período, um ano depois".</para>
    ///
    /// <para>Nulo fora do modo comparativo — e nulo DENTRO dele faz a apuração cair no
    /// mensal, porque comparação com um lado só não é comparação.</para>
    /// </summary>
    DateOnly? ComparacaoInicio = null,
    DateOnly? ComparacaoFim = null,
    /// <summary>
    /// Os <b>códigos de fornecedor</b> a apurar. Vazio ou nulo é o DRE inteiro, como sempre.
    ///
    /// <para><b>É código de fornecedor, não de empresa.</b> Cada cadastro é um recorte: pedir
    /// <c>29</c> traz o DRE do 29, pedir <c>2453</c> traz o do 2453, e um não puxa o outro
    /// mesmo quando o <c>CODFORNECPRINC</c> diz que são a mesma empresa. Decisão registrada em
    /// <c>docs/rotinas/9815-dre-gerencial/FILTRO_FORNECEDOR.md</c>, "A regra é por CÓDIGO DE FORNECEDOR".</para>
    ///
    /// <para><b>O filtro não é um filtro só.</b> No faturamento ele filtra de verdade, por
    /// <c>pr.codfornec</c> — o fornecedor do PRODUTO. Nas despesas, o que ele faz é ratear
    /// tudo pela participação do fornecedor na receita, menos o que for exclusivo dele. A
    /// mecânica inteira está no documento acima.</para>
    /// </summary>
    IReadOnlyList<decimal>? Fornecedores = null);

/// <summary>
/// Linha de despesa agregada. A identidade é a tupla completa, não `Chave` sozinha —
/// ver `docs/rotinas/9815-dre-gerencial/ESPECIFICACAO.md` §9.
/// </summary>
public record DespesaDto(
    string Chave,
    string MesAno,
    bool AntesResultadoOperacional,
    bool AntesLucroLiquido,
    bool AntesLucroFinal,
    decimal Valor,
    int QuantidadeLancamentos);

/// <summary>
/// Cabeçalho do DRE. `StLiq`, `PisLiq` e `CofinsLiq` são informativas — não entram no
/// cálculo das Receitas Líquidas (ver `docs/rotinas/9815-dre-gerencial/ESPECIFICACAO.md` §5).
/// </summary>
public record FaturamentoDto(
    string MesAno,
    decimal ReceitaBruta,
    decimal AbatDesc,
    decimal Devolucao,
    decimal ReceitaLiquida,
    decimal CmvLiq,
    decimal LucroBruto,
    decimal StLiq,
    decimal PisLiq,
    decimal CofinsLiq);

/// <summary>Um mês do período apurado.</summary>
/// <summary>
/// Uma coluna da tabela.
///
/// <para><c>MesAno</c> guarda o nome de quando coluna era sempre um mês. Hoje é a
/// <b>chave</b> da coluna — <c>09/2026</c> no modo mensal, <c>2026</c> por ano,
/// <c>2026:01-03</c> no comparativo entre anos.</para>
///
/// <para><c>DataInicio</c> e <c>DataFim</c> são o recorte que o duplo clique usa. Vêm do
/// servidor porque só ele sabe o recorte de uma coluna que não é um mês.</para>
/// </summary>
public record PeriodoDto(
    string MesAno,
    string Rotulo,
    DateOnly DataInicio,
    DateOnly DataFim,
    /// <summary>
    /// O grupo de colunas a que esta pertence — <c>0</c> e <c>1</c> no comparativo, sempre
    /// <c>0</c> nos outros modos. A tela usa para separar visualmente os dois intervalos e
    /// para somar o subtotal de cada um.
    /// </summary>
    int Bloco = 0);

/// <summary>Valor de uma linha em um mês.</summary>
public record ValorMesDto(
    string MesAno,
    decimal Valor,
    /// <summary>Base: RECEITA BRUTA nas cinco deduções, RECEITAS LIQUIDAS no resto.</summary>
    decimal? PercentualAv,
    /// <summary>Variação sobre o mês anterior. Nulo no primeiro mês e quando o anterior é zero.</summary>
    decimal? PercentualAh);

/// <summary>Bloco TOTAL da linha, somando os meses do período.</summary>
public record TotalLinhaDto(decimal Valor, decimal Media, decimal? PercentualAv);

/// <summary>
/// O detalhamento que esta linha abre com duplo clique, ou `null` se ela não abre nenhum.
///
/// <para>Quem decide é o servidor. O front recebe um destino pronto e não precisa saber
/// que `(+) RECEITA BRUTA` e `(=) RECEITAS LIQUIDAS` caem na mesma tela, nem em que bloco
/// do DRE cada grupo está.</para>
/// </summary>
/// <param name="Tipo">
/// `receita-por-cliente`, `devolucao-por-motivo` ou `lancamentos`.
/// </param>
/// <param name="Bloco">
/// Só para `lancamentos`: `operacional`, `pos-operacional` ou `orfa`. É o que define os
/// dois operadores `in`/`not in` da consulta e a coluna do recorte.
/// </param>
/// <param name="Chave">
/// Só para `lancamentos`: o `GRUPOCONTA` da linha — o mesmo <see cref="LinhaDreDto.Chave"/>
/// que a apuração usou para somá-la.
/// </param>
public record DetalheDisponivelDto(string Tipo, string? Bloco, string? Chave);

/// <summary>Uma linha do DRE montado, com um valor por mês e o total.</summary>
public record LinhaDreDto(
    int? Id,
    /// <summary>
    /// Identidade estável da linha, para o front guardar a ordem que o usuário escolheu.
    ///
    /// <para>Nem <see cref="Id"/> nem <see cref="Chave"/> servem para isso. O `ID` é ordem de
    /// exibição e é <b>anulável</b> — "Pneus e Câmaras" vem com nulo. E a chave se repete: o
    /// mesmo grupo aparece mais de uma vez no DRE com flags diferentes, e são linhas distintas
    /// com valores distintos.</para>
    ///
    /// <para>Por isso a chave aqui é a <b>mesma tupla que o montador usa</b> para achar o valor
    /// de cada linha — se ela não distinguisse as linhas, os valores já viriam trocados hoje.
    /// O sufixo `#n` cobre um empate hipotético, para a chave nunca colidir em silêncio.</para>
    ///
    /// <para>Índice de posição não serviria: linha sem movimento some da tela, e a ordem salva
    /// passaria a apontar para outra linha.</para>
    /// </summary>
    string ChaveOrdem,
    string Chave,
    string Descricao,
    /// <summary>
    /// Que linha do DRE esta é, em código estável — `receita-bruta`, `lucro-bruto`,
    /// `sub-total`… — ou <c>null</c> quando é uma conta do cadastro.
    ///
    /// <para><b>Existe para o front não ter de reconhecer a linha pelo rótulo em
    /// português.</b> O montador identifica as calculadas por texto (`"LUCRO BRUTO"`), e isso
    /// só é seguro aqui dentro, onde o texto nasce. Repetir a mesma comparação do outro lado
    /// da API seria plantar de novo o defeito do espaço não separável do `VERBAS MARGEM`:
    /// uma string que parece certa em todo log e não casa.</para>
    ///
    /// <para>O front usa isto para saber a fórmula de cada âncora quando o usuário reordena a
    /// tabela — ver `client-new-kpi/lib/recalculoDoDre.ts`.</para>
    /// </summary>
    string? Papel,
    IReadOnlyList<ValorMesDto> Valores,
    TotalLinhaDto Total,
    bool Totalizadora,
    bool Calculada,
    /// <summary>Não entra em totalizador: as 3 informativas e o bloco pós-LUCRO LIQUIDO.</summary>
    bool NaoSoma,
    /// <summary>
    /// Nenhum lançamento no período. É este o critério que a 9815 usa para esconder linha
    /// sem "Mostrar Contas Zeradas" — <b>não</b> é valor zero.
    ///
    /// <para>Conferido em 31/08/2026: `DESCONTO FUNCIONÁRIOS` sai com 0,00 e 16 lançamentos,
    /// `CONTRATO DE MUTUO` com 0,00 e 18, e a 9815 mostra as duas. `ALFALOG` e
    /// `VENDAS UNILEVER`, sem lançamento nenhum, ela esconde. As 44 linhas com movimento
    /// mais as 13 calculadas dão exatamente as 57 da exportação.</para>
    ///
    /// <para>Linha calculada nunca é escondida: cabeçalho e totalizadores aparecem sempre.</para>
    /// </summary>
    bool SemMovimento,
    /// <summary>Zero em todos os meses. Não decide visibilidade — ver <see cref="SemMovimento"/>.</summary>
    bool Zerada,
    string? Cor,
    /// <summary>Destino do duplo clique, ou `null` se a linha não abre detalhamento.</summary>
    DetalheDisponivelDto? Detalhe,
    /// <summary>
    /// De que outras linhas este total é feito — vazio quando a linha não é um totalizador.
    ///
    /// <para>É o detalhamento dos totalizadores, e ele <b>não passa pelo banco</b>: o valor
    /// deles já é aritmética sobre linhas que estão na mesma resposta. Mandar as parcelas por
    /// referência, e não com os valores repetidos, é o que impede a tela de mostrar um total
    /// que discorda das próprias linhas que ela lista.</para>
    ///
    /// <para>`SUB-TOTAL` referencia as dezenas de linhas do bloco operacional; os outros
    /// quatro têm duas parcelas cada.</para>
    /// </summary>
    IReadOnlyList<ParcelaDto> Composicao);

/// <summary>
/// Uma parcela de uma linha calculada. Ou aponta para outra linha da apuração, ou traz o
/// próprio valor — nunca as duas coisas.
///
/// <para><b>Por referência</b> (<see cref="ChaveOrdem"/>) nos totalizadores: o valor deles é
/// aritmética sobre linhas que já estão na resposta, e apontar em vez de copiar é o que
/// impede a tela de mostrar um total que discorda das linhas que ela lista.</para>
///
/// <para><b>Com valor</b> (<see cref="Valores"/>) no ST, PIS e COFINS: as parcelas deles não
/// são linhas do DRE, são colunas da consulta de faturamento — o ST das vendas e o das
/// devoluções não aparecem em lugar nenhum da tela.</para>
///
/// <para><see cref="Sinal"/> multiplica o valor. É `-1` na parcela de devolução, que é
/// subtraída, e `+1` no resto.</para>
/// </summary>
public record ParcelaDto(
    string? ChaveOrdem,
    string Rotulo,
    int Sinal,
    IReadOnlyList<ValorParcelaDto>? Valores = null);

/// <summary>
/// Valor de uma parcela num mês. Sem `%AV` nem `%AH`: parcela não é linha do DRE, e uma
/// análise vertical sobre o ST das vendas não significa nada.
/// </summary>
public record ValorParcelaDto(string MesAno, decimal Valor);

/// <summary>
/// Filtro do detalhamento — o duplo clique numa célula.
///
/// <para>Repete filiais, período, regime e análise da apuração, e acrescenta o destino que
/// veio em <see cref="DetalheDisponivelDto"/>. <b>O período aqui é o do mês clicado</b>,
/// recortado pelo período da apuração: se a apuração foi de 01/08 a 27/08, clicar em
/// agosto detalha 01/08 a 27/08, não o mês calendário. Do contrário a tela mostraria mais
/// do que a célula que a pessoa clicou.</para>
/// </summary>
public record DetalheFiltroDto(
    IReadOnlyList<string> Filiais,
    DateOnly DataInicio,
    DateOnly DataFim,
    string Regime,
    string Analise,
    string Tipo,
    string? Bloco,
    string? Chave,
    IReadOnlyList<decimal>? Fornecedores = null);

/// <summary>Uma linha da tela "Receita por Cliente".</summary>
public record DetalheClienteDto(
    int CodCli,
    string Cliente,
    string Cidade,
    int QdeNf,
    decimal ReceitaBruta,
    decimal Desconto,
    decimal Devolucao,
    decimal ReceitaLiquida,
    decimal CustoLiq);

/// <summary>Uma linha da tela "Devolução por Motivo". `CodMotivo` nulo é devolução sem motivo cadastrado.</summary>
public record DetalheMotivoDto(
    int? CodMotivo,
    string? Motivo,
    string? CulpaRca,
    int QdeNf,
    decimal VlDevolucao,
    decimal PPart);

/// <summary>
/// Uma nota da tela "Notas do Motivo" — o segundo nível de `(-) DEVOLUCAO`.
/// A soma de `VlDevolucao` fecha com o valor do motivo, e a contagem de linhas com a
/// coluna NOTAS dele.
/// </summary>
public record DetalheNotaDto(
    decimal NumNota,
    string? Serie,
    DateTime? DtEnt,
    decimal NumTransEnt,
    int? CodParceiro,
    string? Parceiro,
    int Itens,
    decimal VlDevolucao,
    decimal PPart);

/// <summary>Um lançamento da tela de detalhamento das linhas de grupo.</summary>
/// <param name="Exclusivo">
/// <b>O lançamento é do fornecedor filtrado</b> e entra inteiro no DRE: verba do centro 90
/// com o <c>CODFORNEC</c> dele, ou despesa de um centro dedicado a ele. Os demais entram
/// rateados pela <c>Participacao</c> do detalhamento. Sempre <c>false</c> sem filtro.
/// </param>
public record DetalheLancamentoDto(
    bool Exclusivo,
    decimal RecNum,
    string? CodFilial,
    string? CodCcPrinc,
    string? DescCcPrinc,
    string? CodCentroCusto,
    string? DescCentroCusto,
    decimal? CodGrupo,
    string? Grupo,
    decimal? CodConta,
    string? Conta,
    decimal VPago,
    string? Historico,
    DateTime? DtLanc,
    DateTime? DtCompetencia,
    DateTime? DtCompensacao,
    DateTime? DtPagto,
    decimal? NumTrans,
    decimal? NumNota,
    string? Duplic,
    string? Indice,
    decimal? CodProjeto,
    decimal? CodFornec,
    string? Fornecedor,
    decimal? NumBanco,
    string? NumCheque,
    decimal? NumBordero,
    decimal? NumSeqBordero,
    string? NumCheque2,
    decimal? NumCar,
    string? Localizacao,
    string? NomeFunc,
    string? NomeFuncBaixa,
    DateTime? DtReclassific,
    decimal? CodFuncReclassific);

/// <summary>
/// Resposta do detalhamento. **Uma coleção preenchida por vez**, conforme
/// <paramref name="Tipo"/> — as três telas têm formatos de linha diferentes e não há como
/// unificá-las sem perder coluna.
/// </summary>
/// <param name="Fornecedores">
/// Os códigos filtrados, ecoados como na apuração — a tela precisa deles para dizer de quem
/// é o recorte que está mostrando. Vazio quando não há filtro.
/// </param>
/// <param name="Participacao">
/// <b>A fatia do fornecedor na receita líquida da filial</b>, de 0 a 1, no período deste
/// detalhamento — o mesmo número que o DRE mostra como <c>P.8,221%</c>.
///
/// <para>É o fator que o detalhe de LANÇAMENTOS aplica sobre o que não é exclusivo, e é o
/// que faz a soma da tela fechar com a célula clicada. <c>1</c> sem filtro, e aí nada é
/// rateado.</para>
///
/// <para>Nas telas que saem do produto — receita, devolução e impostos — ela não é usada:
/// lá o filtro já está na consulta.</para>
/// </param>
public record DetalhamentoDto(
    string Tipo,
    DateOnly DataInicio,
    DateOnly DataFim,
    IReadOnlyList<DetalheClienteDto>? Clientes,
    IReadOnlyList<DetalheMotivoDto>? Motivos,
    IReadOnlyList<DetalheLancamentoDto>? Lancamentos,
    IReadOnlyList<DetalheImpostoDto>? Impostos,
    long DuracaoMs,
    IReadOnlyList<DetalheNotaDto>? Notas = null,
    IReadOnlyList<decimal>? Fornecedores = null,
    decimal Participacao = 1m)
{
    /// <summary>
    /// <b>Quando esta apuração foi feita</b> — a hora do SERVIDOR, não a do navegador.
    ///
    /// <para>Sai no cabeçalho da impressão, ao lado do período e das filiais: uma folha do
    /// detalhamento circula sem contexto nenhum, e numa base viva dois papéis do mesmo
    /// recorte tirados com horas de diferença trazem números diferentes — sem a hora, não
    /// há como saber qual é o mais novo.</para>
    ///
    /// <para><b>Propriedade com inicializador, e não parâmetro posicional.</b> O
    /// <c>DetalhamentoDto</c> é construído em cinco lugares do serviço, um por tipo de
    /// tela, e todos devem carimbar a mesma coisa: o instante em que a resposta ficou
    /// pronta. Como parâmetro, seriam cinco chamadas para esquecer uma. Assim o carimbo é
    /// do próprio tipo, e uma tela nova nasce com ele.</para>
    ///
    /// <para><b>De <see cref="HoraDeBrasilia"/>, e não de <c>DateTimeOffset.Now</c>.</b> O
    /// <c>Now</c> devolve a hora da MÁQUINA: no servidor, que roda em UTC, uma apuração das
    /// 12:40 saía carimbada como 15:40. Quem lê a folha lê o horário de Brasília, venha ela
    /// de onde vier.</para>
    /// </summary>
    public DateTimeOffset ApuradoEm { get; init; } = HoraDeBrasilia.Agora;
}

/// <summary>
/// Uma linha da tela de ST, PIS e COFINS: o imposto de um produto no período.
/// `Liquido` é `Vendas − Devolucoes`, e é a soma dele que fecha com a linha do DRE.
/// </summary>
public record DetalheImpostoDto(
    decimal CodProd,
    string? Produto,
    int QdeNf,
    decimal Vendas,
    decimal Devolucoes,
    decimal Liquido,
    /// <summary>Participação no total da tela, em porcento. Como na tela de devolução.</summary>
    decimal PPart);

/// <summary>DRE apurado.</summary>
public record ApuracaoDto(
    string Regime,
    string Analise,
    /// <summary>
    /// O modo que formou as colunas — <c>meses</c>, <c>anos</c> ou <c>comparar-anos</c>.
    ///
    /// <para>É o modo <b>efetivo</b>, não o pedido: um filtro de <c>anos</c> sem ano nenhum,
    /// ou um comparativo sem o segundo intervalo, volta daqui como <c>meses</c>, porque foi
    /// isso que a apuração fez. Ver <c>RecorteDre.ModoEfetivo</c>.</para>
    /// </summary>
    string Modo,
    DateOnly DataInicio,
    DateOnly DataFim,
    IReadOnlyList<string> Filiais,
    IReadOnlyList<PeriodoDto> Periodos,
    IReadOnlyList<LinhaDreDto> Linhas,
    IReadOnlyList<string> Avisos,
    DateTimeOffset ApuradoEm,
    long DuracaoMs,
    /// <summary>
    /// Os fornecedores que esta apuração usou. Vazio quando o DRE é o inteiro.
    ///
    /// <para><b>Volta junto pelo mesmo motivo das filiais:</b> a tela precisa dizer de quem
    /// são os números que está mostrando, e tem de dizê-lo a partir do que foi APURADO, não
    /// do formulário. Mexer no filtro depois de apurar não pode reescrever o cabeçalho do que
    /// já está na tela.</para>
    /// </summary>
    IReadOnlyList<decimal> Fornecedores);

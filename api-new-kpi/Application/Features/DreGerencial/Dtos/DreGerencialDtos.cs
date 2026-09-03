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

/// <summary>Filtro da consulta de despesas. `Filiais` são códigos em texto.</summary>
public record DespesasFiltroDto(
    IReadOnlyList<string> Filiais,
    DateOnly DataInicio,
    DateOnly DataFim,
    string Regime,
    string Analise);

/// <summary>
/// Linha de despesa agregada. A identidade é a tupla completa, não `Chave` sozinha —
/// ver `docs/ROTINA_9815.md` §9.
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
/// cálculo das Receitas Líquidas (ver `docs/ROTINA_9815.md` §5).
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
public record PeriodoDto(string MesAno, string Rotulo);

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
/// Uma parcela de um totalizador, apontando para outra linha da mesma apuração.
///
/// <para><see cref="Sinal"/> é sempre `+1` hoje: as despesas já chegam negativas do banco e
/// os totalizadores somam. Existe porque a alternativa seria a tela adivinhar o sinal a
/// partir do rótulo, e um dia haver um totalizador que subtrai.</para>
/// </summary>
public record ParcelaDto(string ChaveOrdem, string Rotulo, int Sinal);

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
    string? Chave);

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

/// <summary>Um lançamento da tela de detalhamento das linhas de grupo.</summary>
public record DetalheLancamentoDto(
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
public record DetalhamentoDto(
    string Tipo,
    DateOnly DataInicio,
    DateOnly DataFim,
    IReadOnlyList<DetalheClienteDto>? Clientes,
    IReadOnlyList<DetalheMotivoDto>? Motivos,
    IReadOnlyList<DetalheLancamentoDto>? Lancamentos,
    long DuracaoMs);

/// <summary>DRE apurado.</summary>
public record ApuracaoDto(
    string Regime,
    string Analise,
    DateOnly DataInicio,
    DateOnly DataFim,
    IReadOnlyList<string> Filiais,
    IReadOnlyList<PeriodoDto> Periodos,
    IReadOnlyList<LinhaDreDto> Linhas,
    IReadOnlyList<string> Avisos,
    DateTimeOffset ApuradoEm,
    long DuracaoMs);

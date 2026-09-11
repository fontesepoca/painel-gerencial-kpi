/** Espelha os DTOs de `api-new-kpi/Application/Features/DreGerencial/Dtos/`. */

export interface Filial {
  codFilial: string;
  label: string;
  empresa: string;
  empresaCodigo: string;
  unidade: string;
  uf: string;
  ordem: number | null;
}

export type Regime = "competencia" | "caixa";

export type Analise =
  | "grupo-contas"
  | "conta-gerencial"
  | "ccusto-principal"
  | "centro-custo";

/**
 * Como as colunas são formadas. Espelha `RecorteDre` na API.
 *
 * - `meses` — uma coluna por mês do intervalo. É o padrão e o comportamento de sempre.
 * - `anos` — uma coluna por ano inteiro, de 01/01 a 31/12.
 * - `comparar-anos` — o mesmo dia e mês do intervalo, repetido em cada ano.
 */
export type ModoPeriodo = "meses" | "anos" | "comparar-anos";

export interface FiltroApuracao {
  filiais: string[];
  /**
   * ISO yyyy-MM-dd. Continua sendo enviado nos modos de ano: em `comparar-anos` é o
   * **molde** do recorte, e é dele que sai o dia e o mês repetidos em cada ano.
   */
  dataInicio: string;
  dataFim: string;
  regime: Regime;
  analise: Analise;
  modo: ModoPeriodo;
  /**
   * Os anos das colunas nos dois modos de comparação. Ignorado no modo mensal — e guardado
   * mesmo assim, para quem alterna entre os modos não perder a escolha no caminho.
   */
  anos: number[];
}

/**
 * Uma coluna da tabela.
 *
 * `mesAno` guarda o nome de quando coluna era sempre um mês. Hoje é a **chave** da
 * coluna: `09/2026` no modo mensal, `2026` por ano, `2026:01-03` no comparativo.
 *
 * `dataInicio` e `dataFim` são o recorte que o duplo clique usa, e **vêm do servidor**:
 * só ele sabe o recorte de uma coluna que não é um mês. O front chegou a calcular isso
 * sozinho, com `recorteDoMes`, e essa conta só funciona enquanto coluna for sinônimo
 * de mês.
 */
export interface PeriodoDre {
  mesAno: string;
  rotulo: string;
  dataInicio: string;
  dataFim: string;
}

export interface ValorMes {
  mesAno: string;
  valor: number;
  /** Base: RECEITA BRUTA nas cinco deduções, RECEITAS LIQUIDAS no resto. */
  percentualAv: number | null;
  /** Variação sobre o mês anterior. Nulo no primeiro mês e quando o anterior é zero. */
  percentualAh: number | null;
}

export interface TotalLinha {
  valor: number;
  media: number;
  percentualAv: number | null;
}

export interface LinhaDre {
  id: number | null;
  /**
   * Identidade estável, para guardar a ordem escolhida pelo usuário. Nem `id` (ordem de
   * exibição, e anulável) nem `chave` (repete entre linhas com flags diferentes) servem.
   * Ver `LinhaDreDto.ChaveOrdem` na API.
   */
  chaveOrdem: string;
  chave: string;
  descricao: string;
  valores: ValorMes[];
  total: TotalLinha;
  totalizadora: boolean;
  calculada: boolean;
  /**
   * Não entra em totalizador: as 3 informativas e o bloco pós-LUCRO LIQUIDO.
   * Na tela o selo diz **INFORMATIVO**; o nome do campo continua o da regra.
   */
  naoSoma: boolean;
  /**
   * Nenhum lançamento no período — é isto que a 9815 esconde, e **não** valor zero.
   * `DESCONTO FUNCIONÁRIOS` sai com 0,00 e 16 lançamentos, e ela mostra.
   */
  semMovimento: boolean;
  /** Zero em todos os meses. Não decide visibilidade. */
  zerada: boolean;
  /** `#RRGGBB` vindo do `TColor` do Delphi, já convertido. */
  cor: string | null;
  /**
   * Destino do duplo clique, ou `null` se a linha não abre detalhamento.
   * Quem decide é o servidor — o front devolve o que recebeu.
   */
  detalhe: DetalheDisponivel | null;
  /**
   * De que outras linhas este total é feito. Vazio quando a linha não é totalizadora.
   *
   * As parcelas vêm por **referência** (`chaveOrdem`), não com valor: a tela lê o valor na
   * própria linha citada, e por isso a composição não tem como discordar do que a tabela
   * mostra. Espelha `LinhaDreDto.Composicao`.
   */
  composicao: Parcela[];
}

export type TipoDetalhe =
  | "receita-por-cliente"
  | "devolucao-por-motivo"
  | "imposto-por-produto"
  | "lancamentos";

/**
 * Uma parcela de um totalizador, apontando para outra linha da apuração. Espelha
 * `ParcelaDto`.
 *
 * **Por referência, nunca com o valor copiado.** A tela lê o valor na própria linha citada,
 * e é isso que impede a composição de mostrar um total que discorda das linhas que ela
 * lista: os dois lados leem o mesmo número.
 *
 * Vale só para os cinco totalizadores, cujo valor é aritmética sobre linhas que já estão
 * na resposta. Quem tem origem no banco — inclusive ST, PIS e COFINS — abre detalhamento
 * de verdade, com consulta própria, e não passa por aqui.
 */
export interface Parcela {
  chaveOrdem: string;
  rotulo: string;
  sinal: number;
}

/** Espelha `DetalheDisponivelDto`. */
export interface DetalheDisponivel {
  tipo: TipoDetalhe;
  /** Só em `lancamentos`. */
  bloco: string | null;
  /** Só em `lancamentos`: o `GRUPOCONTA` da linha. */
  chave: string | null;
}

/**
 * Filtro do detalhamento. As datas são as da **coluna clicada**, não as da apuração
 * inteira: cada `PeriodoDre` traz o próprio recorte, calculado pelo servidor.
 */
export interface FiltroDetalhe extends FiltroApuracao {
  tipo: TipoDetalhe;
  bloco: string | null;
  chave: string | null;
}

export interface DetalheCliente {
  codCli: number;
  cliente: string;
  cidade: string;
  qdeNf: number;
  receitaBruta: number;
  desconto: number;
  devolucao: number;
  receitaLiquida: number;
  custoLiq: number;
}

export interface DetalheMotivo {
  /** Nulo em devolução sem motivo cadastrado — a junção é externa de propósito. */
  codMotivo: number | null;
  motivo: string | null;
  culpaRca: string | null;
  qdeNf: number;
  vlDevolucao: number;
  pPart: number;
}

/**
 * Uma linha da tela de ST, PIS e COFINS: o imposto de um produto no período.
 *
 * Mesmo formato da devolução por motivo — eixo, contagem de notas, valor e participação.
 * `liquido` é `vendas − devolucoes`, e é a soma dele que fecha com a linha do DRE.
 *
 * `vendas` e `devolucoes` somam **imposto + FECP** no mesmo número, como a apuração faz.
 */
export interface DetalheImposto {
  codProd: number;
  produto: string | null;
  qdeNf: number;
  vendas: number;
  devolucoes: number;
  liquido: number;
  pPart: number;
}

export interface DetalheLancamento {
  recNum: number;
  codFilial: string | null;
  codCcPrinc: string | null;
  descCcPrinc: string | null;
  codCentroCusto: string | null;
  descCentroCusto: string | null;
  codGrupo: number | null;
  grupo: string | null;
  codConta: number | null;
  conta: string | null;
  /** Já vem negativo nas despesas, como na apuração. */
  vPago: number;
  historico: string | null;
  dtLanc: string | null;
  dtCompetencia: string | null;
  dtCompensacao: string | null;
  dtPagto: string | null;
  numTrans: number | null;
  numNota: number | null;
  duplic: string | null;
  indice: string | null;
  codProjeto: number | null;
  codFornec: number | null;
  fornecedor: string | null;
  numBanco: number | null;
  numCheque: string | null;
  numBordero: number | null;
  numSeqBordero: number | null;
  numCheque2: string | null;
  numCar: number | null;
  localizacao: string | null;
  nomeFunc: string | null;
  nomeFuncBaixa: string | null;
  dtReclassific: string | null;
  codFuncReclassific: number | null;
}

/**
 * Resposta do detalhamento. **Uma coleção preenchida por vez**, conforme `tipo` — as três
 * telas têm formatos de linha diferentes e não há como unificá-las sem perder coluna.
 */
export interface Detalhamento {
  tipo: TipoDetalhe;
  dataInicio: string;
  dataFim: string;
  clientes: DetalheCliente[] | null;
  motivos: DetalheMotivo[] | null;
  lancamentos: DetalheLancamento[] | null;
  impostos: DetalheImposto[] | null;
  duracaoMs: number;
}

export interface Apuracao {
  regime: Regime;
  analise: Analise;
  /** O modo que a API de fato usou, que nem sempre é o pedido. Ver `RecorteDre.ModoEfetivo`. */
  modo: ModoPeriodo;
  dataInicio: string;
  dataFim: string;
  filiais: string[];
  periodos: PeriodoDre[];
  linhas: LinhaDre[];
  avisos: string[];
  apuradoEm: string;
  duracaoMs: number;
}

export const REGIMES: ReadonlyArray<{ valor: Regime; rotulo: string }> = [
  { valor: "competencia", rotulo: "Competência" },
  { valor: "caixa", rotulo: "Caixa" },
];

/**
 * Espelha `AnaliseDre` da API. `pronta` reflete `Implementada` lá — se divergir, o filtro
 * oferece uma dimensão que a API recusa.
 *
 * **Sem textos de aviso.** C. Custo Principal e Centro de Custo carregavam uma nota sob o
 * campo, dizendo que divergem da 9815 com mais de uma filial e que Centro de Custo nunca
 * funcionou lá. As duas saíram por decisão do Gabriel em 02/09/2026: isso é assunto de
 * `docs/DIVERGENCIAS.md`, não de quem está escolhendo uma dimensão para apurar.
 */
export const ANALISES: ReadonlyArray<{
  valor: Analise;
  rotulo: string;
  pronta: boolean;
}> = [
  { valor: "grupo-contas", rotulo: "Grupo de Contas", pronta: true },
  { valor: "conta-gerencial", rotulo: "Conta Gerencial", pronta: true },
  { valor: "ccusto-principal", rotulo: "C. Custo Principal", pronta: true },
  { valor: "centro-custo", rotulo: "Centro de Custo", pronta: true },
];

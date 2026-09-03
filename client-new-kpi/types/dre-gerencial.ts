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

export interface FiltroApuracao {
  filiais: string[];
  /** ISO yyyy-MM-dd. */
  dataInicio: string;
  dataFim: string;
  regime: Regime;
  analise: Analise;
}

export interface PeriodoDre {
  mesAno: string;
  rotulo: string;
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
  | "lancamentos";

/**
 * Uma parcela de uma linha calculada. Espelha `ParcelaDto`.
 *
 * Ou aponta para outra linha da apuração (`chaveOrdem`), ou traz o próprio valor
 * (`valores`) — nunca as duas coisas. Totalizadores apontam; ST, PIS e COFINS trazem,
 * porque as parcelas deles são colunas da consulta de faturamento e não existem como
 * linha em lugar nenhum da tela.
 */
export interface Parcela {
  chaveOrdem: string | null;
  rotulo: string;
  sinal: number;
  valores: { mesAno: string; valor: number }[] | null;
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
 * Filtro do detalhamento. As datas são as do **mês clicado recortado pelo período**, não
 * as da apuração inteira — ver `recorteDoMes` em `lib/periodos.ts`.
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
  duracaoMs: number;
}

export interface Apuracao {
  regime: Regime;
  analise: Analise;
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

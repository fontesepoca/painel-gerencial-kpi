/**
 * Espelha os DTOs de `api-new-kpi/Application/Features/SimuladorPreco/Dtos/`, em camelCase —
 * o ASP.NET serializa `PercIpi` como `percIpi`. Só o conteúdo de `dados`: o `apiClient` já
 * desembrulha o envelope.
 *
 * Os números vêm `number | null`: o `decimal?` do C# chega nulo quando o SQL devolve nulo
 * (preço futuro com índice zero, CBS sem tributação).
 */

export interface FiltroSimulador {
  /**
   * A região NÃO vai no pedido desde 25/11/2026: a API a tira do vínculo do comprador na
   * TAB_REG_PR_FILIAL (spec 2026-11-25-simulador-regiao-pelo-vinculo-do-comprador), e a
   * devolve em `ConsultaSimulador.numRegiao`.
   */
  codFilial: string;
  /**
   * Os códigos de fornecedor, ORDENADOS (234,500 e 500,234 são a mesma consulta). Vazio = todos.
   * Vários desde 24/11/2026 (spec 2026-11-24-simulador-varios-fornecedores).
   */
  fornecedores: number[];
}

export interface ProdutoSimulado {
  /** A filial da linha (SQL v2). */
  codFilial: string | null;
  codProd: number;
  descricao: string;
  /** `PCPRODUT.CLASSEVENDA` (SQL v2). */
  classeVenda: string | null;
  ncm: string | null;
  codigoTributacao: string | null;
  descricaoTributacao: string | null;
  tipoImposto: string | null;

  // Entrada
  vlUltPCompra: number | null;
  percIpi: number | null;
  vlIpi: number | null;
  percSt: number | null;
  vlSt: number | null;
  percIcmsEnt: number | null;
  percBaseRedEnt: number | null;
  percIcmCusto: number | null;
  vlIcmsEnt: number | null;
  perPisEnt: number | null;
  vlPisEnt: number | null;
  perCofinsEnt: number | null;
  vlCofinsEnt: number | null;
  percFreteFobEnt: number | null;
  vlFreteFobEnt: number | null;

  // Custo e CBS
  custoAntesCbs: number | null;
  percCbs: number | null;
  baseCbs: number | null;
  vlCbs: number | null;
  custoCalc: number | null;

  // Saída
  margem: number | null;
  percIcmsSaid: number | null;
  perPisSaid: number | null;
  perCofinsSaid: number | null;
  indice: number | null;
  prFuturo: number | null;
  /** `PRECOFINAL` do SQL v2: o preço futuro mais o `VLST` da tabela de preço. */
  prFinal: number | null;
  /**
   * A n-ésima repetição desta chave (produto + tributação), de 1 em diante, numerada pelo
   * Oracle. Vira o `#n` da chave da linha (`chaveDaLinha`).
   */
  ocorrencia: number;
  /**
   * O fornecedor do produto (`PCPRODUT.CODFORNEC` / `PCFORNEC.FORNECEDOR`), ligado por fora do
   * SQL v2 (spec 2026-11-24-simulador-coluna-codigo-e-fornecedor). Nulos sem cadastro.
   */
  codFornec: number | null;
  fornecedor: string | null;
  /**
   * Da `PCTRIBUTACAO` (`CCLASSTRIB` e `CST`), ligados por fora do SQL v2 pelo código de
   * tributação (spec 2026-11-25-simulador-classe-de-tributacao-e-cst). Nulos quando o NCM não tem
   * tributação, e no produto novo. Só exibidos: nenhuma conta usa.
   */
  cClassTrib: string | null;
  cst: string | null;
  /**
   * A classe de comissão (`PCPRODUT.CLASSE`, SQL v3 de 26/11/2026). Só exibida. A classe de GIRO
   * de estoque é a `classeVenda` (no v3, `CLASSE_GIRO_EST`), que ordena e filtra.
   */
  classeComissao: string | null;
}

/** Os percentuais que o quadro do produto deixa editar (D21). */
export type CampoPercentual =
  | "percIpi"
  | "percIcmsEnt"
  | "percBaseRedEnt"
  | "perPis"
  | "perCofins"
  | "percFreteFob"
  | "percCbs"
  | "margem"
  | "percIcmsSaid";

/**
 * O que a pessoa alterou numa linha da tabela — e SÓ o que alterou (spec §3.6). O resto da
 * linha segue o banco: se o cadastro mudar, a linha mostra o novo, com a alteração por cima.
 */
export interface AjusteDaLinha {
  /** O preço como foi digitado (texto: é o que volta ao campo). Ausente = preço do SQL. */
  preco?: string;
  /** Os percentuais trocados no quadro. Ausente ou vazio = os do SQL. */
  percentuais?: Partial<Record<CampoPercentual, number>>;
  /**
   * O ST em R$ trocado no quadro (SQL v2, decisão V2). Ausente = o `VLST` do SQL — inclusive nas
   * simulações salvas antes da v2, que não têm o campo.
   */
  st?: number;
}

/** Um produto que não existe no cadastro, digitado inteiro no quadro (D23). */
export interface ProdutoNovo {
  id: string;
  descricao: string;
  preco: number;
  percentuais: Record<CampoPercentual, number>;
  /** O ST em R$ (SQL v2). Opcional: produto novo salvo antes da v2 não tem, e conta como zero. */
  st?: number;
}

/** As classes de venda (sp14, 24/11/2026: só A, B e C). */
export type Classe = "A" | "B" | "C";

/** O pedido de UMA página (spec 2026-11-24-simulador-paginacao-no-backend). */
export interface PedidoDePagina extends FiltroSimulador {
  pagina: number;
  /** Já com o debounce. Nulo = sem busca. */
  busca: string | null;
  /** Nulo = sem filtro de classe (as três marcadas). */
  classes: Classe[] | null;
  /** "Ver só os simulados". Nulo = desligado. */
  codigos: string[] | null;
}

/** O `PagedResult` da API. */
export interface PaginaSimulador {
  itens: ProdutoSimulado[];
  pagina: number;
  tamanhoPagina: number;
  totalItens: number;
  totalPaginas: number;
}

export interface ConsultaSimulador {
  pagina: PaginaSimulador;
  /** A região do vínculo do comprador que a consulta usou (25/11/2026). */
  numRegiao: number;
  base: { id: string; rotulo: string } | null;
}

/** Uma filial em que o comprador tem região vinculada (`GET /api/simulador-preco/vinculos`). */
export interface VinculoDeRegiao {
  codFilial: string;
  numRegiao: number;
}

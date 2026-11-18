/**
 * Espelha os DTOs de `api-new-kpi/Application/Features/SimuladorPreco/Dtos/`, em camelCase —
 * o ASP.NET serializa `PercIpi` como `percIpi`. Só o conteúdo de `dados`: o `apiClient` já
 * desembrulha o envelope.
 *
 * Os números vêm `number | null`: o `decimal?` do C# chega nulo quando o SQL devolve nulo
 * (preço futuro com índice zero, CBS sem tributação).
 */

export interface FiltroSimulador {
  codFilial: string;
  numRegiao: number;
  /** Nulo = todos os fornecedores (o SQL trata 0 como "todos"). */
  codFornec: number | null;
}

export interface ProdutoSimulado {
  codProd: number;
  descricao: string;
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
}

/** Um produto que não existe no cadastro, digitado inteiro no quadro (D23). */
export interface ProdutoNovo {
  id: string;
  descricao: string;
  preco: number;
  percentuais: Record<CampoPercentual, number>;
}

export interface ConsultaSimulador {
  produtos: ProdutoSimulado[];
  base: { id: string; rotulo: string } | null;
}

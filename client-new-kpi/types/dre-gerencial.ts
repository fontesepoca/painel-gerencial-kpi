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
  chave: string;
  descricao: string;
  valores: ValorMes[];
  total: TotalLinha;
  totalizadora: boolean;
  calculada: boolean;
  /** Não entra em totalizador: as 3 informativas e o bloco pós-LUCRO LIQUIDO. */
  naoSoma: boolean;
  zerada: boolean;
  /** `#RRGGBB` vindo do `TColor` do Delphi, já convertido. */
  cor: string | null;
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

export const ANALISES: ReadonlyArray<{ valor: Analise; rotulo: string; pronta: boolean }> = [
  { valor: "grupo-contas", rotulo: "Grupo de Contas", pronta: true },
  { valor: "conta-gerencial", rotulo: "Conta Gerencial", pronta: false },
  { valor: "ccusto-principal", rotulo: "C. Custo Principal", pronta: false },
  { valor: "centro-custo", rotulo: "Centro de Custo", pronta: false },
];

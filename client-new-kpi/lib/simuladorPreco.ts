import {
  type Decimal,
  ZERO,
  absoluto,
  arredondar,
  de,
  dividirArredondando,
  ehZero,
  maiorQueZero,
  multiplicar,
  paraNumero,
  porCento,
  somar,
  subtrair,
} from "@/lib/decimalExato";
import type {
  AjusteDaLinha,
  CampoPercentual,
  ProdutoNovo,
  ProdutoSimulado,
} from "@/types/simulador-preco";

/**
 * O recálculo do simulador de preço: as contas do SQL v1, refeitas na tela com o preço de
 * compra que a pessoa digita (decisão D1 da spec).
 *
 * <b>É a tradução do SQL, CTE por CTE.</b> Cada bloco abaixo leva o nome da CTE de
 * `docs/rotinas/simulador-preco/referencia/sql-v1.sql` de onde saiu, e faz as mesmas contas, na
 * mesma ordem, com os MESMOS `ROUND` nos mesmos pontos. Quando a v2 do SQL chegar, este é o
 * único arquivo de conta a reescrever — e a `sp8` prova que ficou igual.
 *
 * <b>Os percentuais NÃO são recalculados</b>: vêm do banco, já resolvidos pelo SQL (o IPI que
 * só vale para indústria, o PIS/COFINS da exceção, o frete por fornecedor). Daqui para baixo só
 * muda o preço.
 *
 * <b>Conta em decimal exato</b> (`lib/decimalExato.ts`), nunca em `number`: o ponto flutuante
 * erra a terceira casa em algumas linhas, e o critério é bater com o SQL ao milésimo.
 */

/** Os percentuais da linha que entram na conta — tudo que não é o preço. */
export type PercentuaisDaLinha = Record<CampoPercentual, number | null>;

/**
 * Os percentuais editáveis no quadro, na ordem em que aparecem (D21) — entrada, CBS, saída.
 * `info` é o que aparece embaixo do rótulo, quando o nome sozinho engana.
 */
export const CAMPOS_PERCENTUAIS: ReadonlyArray<{ campo: CampoPercentual; rotulo: string; info?: string }> = [
  { campo: "percIpi", rotulo: "IPI", info: "Já resolvido pelo SQL: só vale para indústria." },
  { campo: "percIcmsEnt", rotulo: "ICMS de entrada" },
  { campo: "percBaseRedEnt", rotulo: "Redução de base do ICMS", info: "0 = sem redução." },
  { campo: "perPis", rotulo: "PIS", info: "Vale na entrada e na saída, como no SQL." },
  { campo: "perCofins", rotulo: "COFINS", info: "Vale na entrada e na saída, como no SQL." },
  { campo: "percFreteFob", rotulo: "Frete FOB" },
  { campo: "percCbs", rotulo: "CBS" },
  { campo: "margem", rotulo: "Margem" },
  { campo: "percIcmsSaid", rotulo: "ICMS de saída" },
];

/** O resultado da conta, nos mesmos nomes das colunas calculadas da tela. */
export interface LinhaCalculada {
  vlUltPCompra: number;
  vlIpi: number;
  vlSt: number;
  percIcmCusto: number;
  vlIcmsEnt: number;
  vlPisEnt: number;
  vlCofinsEnt: number;
  vlFreteFobEnt: number;
  custoAntesCbs: number;
  baseCbs: number;
  vlCbs: number;
  custoCalc: number;
  indice: number;
  /** Nulo quando o índice é zero — o `NULLIF(…, 0)` do SQL. */
  prFuturo: number | null;
}

/** O `NVL(x, 0)` do SQL, já convertido para decimal. */
const nvl0 = (valor: number | null | undefined): Decimal =>
  valor === null || valor === undefined ? ZERO : de(valor);

/** Os percentuais de uma linha como o SQL os devolveu. */
export function percentuaisDe(p: ProdutoSimulado): PercentuaisDaLinha {
  return {
    percIpi: p.percIpi,
    percIcmsEnt: p.percIcmsEnt,
    percBaseRedEnt: p.percBaseRedEnt,
    perPis: p.perPisEnt,
    perCofins: p.perCofinsEnt,
    percFreteFob: p.percFreteFobEnt,
    percCbs: p.percCbs,
    margem: p.margem,
    percIcmsSaid: p.percIcmsSaid,
  };
}

/**
 * Refaz as contas do SQL v1 para um preço de compra.
 *
 * @param preco o preço de compra — o `NVL(:PCOMPRA, NVL(VLULTPCOMPRA, CUSTOREP))` já resolvido.
 */
export function calcular(preco: number, pc: PercentuaisDaLinha): LinhaCalculada {
  const P = de(preco);

  // ── CALCULOS_ENTRADA ──────────────────────────────────────────────────────
  const percIpi = nvl0(pc.percIpi);
  const icmsEnt = nvl0(pc.percIcmsEnt);
  const baseRed = nvl0(pc.percBaseRedEnt);

  // DECODE(NVL(PERC_BASE_RED_ENT,0), 0, PERCICMS_ENT, PERCICMS_ENT * PERC_BASE_RED_ENT / 100)
  // — SEM ROUND no SQL, então sem arredondar aqui.
  const percIcmCusto = ehZero(baseRed) ? icmsEnt : porCento(multiplicar(icmsEnt, baseRed));

  const vlIpi = arredondar(porCento(multiplicar(P, percIpi)), 3);

  // `0 AS VLST` — fixo na v1 (decisão D7, provisória até a v2).
  const vlSt = ZERO;

  const vlIcms = arredondar(porCento(multiplicar(P, percIcmCusto)), 3);

  // (P − P · PERCICM_CUSTO / 100) — o ICMS aqui é o NÃO arredondado, como no SQL, que repete a
  // expressão em vez de usar o VLICMS da coluna ao lado.
  const baseSemIcms = subtrair(P, porCento(multiplicar(P, percIcmCusto)));
  const vlPis = arredondar(porCento(multiplicar(baseSemIcms, absoluto(nvl0(pc.perPis)))), 3);
  const vlCofins = arredondar(porCento(multiplicar(baseSemIcms, absoluto(nvl0(pc.perCofins)))), 3);

  const vlFrete = arredondar(porCento(multiplicar(P, nvl0(pc.percFreteFob))), 3);

  // ── CALCULOS_CUSTO ────────────────────────────────────────────────────────
  const custoAntesCbs = arredondar(
    somar(subtrair(subtrair(subtrair(somar(somar(P, vlIpi), vlSt), vlIcms), vlPis), vlCofins), vlFrete),
    3,
  );

  // ── RESULTADO_CBS ─────────────────────────────────────────────────────────
  // P − (VLST se VLST > 0, senão VLICMS) − VLIPI. Aqui são os valores JÁ arredondados das
  // colunas, como no SQL.
  const deducao = maiorQueZero(vlSt) ? vlSt : vlIcms;
  const semBase = subtrair(subtrair(P, deducao), vlIpi);
  const baseCbs = arredondar(semBase, 3);
  const vlCbs = arredondar(porCento(multiplicar(semBase, nvl0(pc.percCbs))), 3);

  // ── RESULTADO_FINAL ───────────────────────────────────────────────────────
  const custoCalc = arredondar(subtrair(custoAntesCbs, vlCbs), 3);

  // ── SELECT final ──────────────────────────────────────────────────────────
  // 1 − (MARGEM + ICMS saída + PIS + COFINS + CBS) / 100. PIS e COFINS SEM o ABS aqui — o SQL
  // só aplica ABS no valor de entrada.
  const somaSaida = somar(
    somar(somar(somar(nvl0(pc.margem), nvl0(pc.percIcmsSaid)), nvl0(pc.perPis)), nvl0(pc.perCofins)),
    nvl0(pc.percCbs),
  );
  const indiceCru = subtrair(de(1), porCento(somaSaida));
  const indice = arredondar(indiceCru, 6);

  // ROUND(CUSTO_CALC / NULLIF(índice NÃO arredondado, 0), 3).
  const prFuturo = ehZero(indiceCru) ? null : paraNumero(dividirArredondando(custoCalc, indiceCru, 3));

  return {
    vlUltPCompra: paraNumero(P),
    vlIpi: paraNumero(vlIpi),
    vlSt: paraNumero(vlSt),
    percIcmCusto: paraNumero(percIcmCusto),
    vlIcmsEnt: paraNumero(vlIcms),
    vlPisEnt: paraNumero(vlPis),
    vlCofinsEnt: paraNumero(vlCofins),
    vlFreteFobEnt: paraNumero(vlFrete),
    custoAntesCbs: paraNumero(custoAntesCbs),
    baseCbs: paraNumero(baseCbs),
    vlCbs: paraNumero(vlCbs),
    custoCalc: paraNumero(custoCalc),
    indice: paraNumero(indice),
    prFuturo,
  };
}

/** As colunas que {@link calcular} produz — é o que a `sp8` confere contra o SQL. */
export const COLUNAS_CALCULADAS = [
  "vlUltPCompra",
  "vlIpi",
  "vlSt",
  "percIcmCusto",
  "vlIcmsEnt",
  "vlPisEnt",
  "vlCofinsEnt",
  "vlFreteFobEnt",
  "custoAntesCbs",
  "baseCbs",
  "vlCbs",
  "custoCalc",
  "indice",
  "prFuturo",
] as const satisfies ReadonlyArray<keyof LinhaCalculada & keyof ProdutoSimulado>;

/**
 * Os percentuais que valem numa linha: os do SQL, com os que a pessoa trocou no quadro por cima.
 */
export function percentuaisEfetivos(p: ProdutoSimulado, ajuste: AjusteDaLinha | undefined): PercentuaisDaLinha {
  return { ...percentuaisDe(p), ...ajuste?.percentuais };
}

/** O preço que vale numa linha: o digitado, se for válido; senão, o do SQL. */
export function precoEfetivo(p: ProdutoSimulado, ajuste: AjusteDaLinha | undefined): number {
  const digitado = lerPreco(ajuste?.preco ?? "");
  return digitado === null || Number.isNaN(digitado) ? (p.vlUltPCompra ?? 0) : digitado;
}

/** A linha está simulada — o preço digitado difere do SQL, ou algum percentual foi trocado. */
export function linhaSimulada(p: ProdutoSimulado, ajuste: AjusteDaLinha | undefined): boolean {
  if (!ajuste) return false;
  const percentuais = Object.keys(ajuste.percentuais ?? {}).length > 0;
  const digitado = lerPreco(ajuste.preco ?? "");
  const preco = digitado !== null && !Number.isNaN(digitado) && digitado !== p.vlUltPCompra;
  return percentuais || preco;
}

/**
 * Um produto novo na forma de uma linha da tabela, para a seção "Produtos novos simulados"
 * usar as mesmas colunas (D26). O que o SQL traria do cadastro fica vazio; o resto é a conta.
 */
export function linhaDeProdutoNovo(n: ProdutoNovo): ProdutoSimulado {
  const r = calcular(n.preco, n.percentuais);
  return {
    codProd: 0,
    descricao: n.descricao,
    ncm: null,
    codigoTributacao: null,
    descricaoTributacao: null,
    tipoImposto: null,
    percIpi: n.percentuais.percIpi,
    percSt: 0,
    percIcmsEnt: n.percentuais.percIcmsEnt,
    percBaseRedEnt: n.percentuais.percBaseRedEnt,
    perPisEnt: n.percentuais.perPis,
    perCofinsEnt: n.percentuais.perCofins,
    percFreteFobEnt: n.percentuais.percFreteFob,
    percCbs: n.percentuais.percCbs,
    margem: n.percentuais.margem,
    percIcmsSaid: n.percentuais.percIcmsSaid,
    perPisSaid: n.percentuais.perPis,
    perCofinsSaid: n.percentuais.perCofins,
    ...r,
  };
}

/**
 * Lê um percentual digitado. Como {@link lerPreco}, mas aceita negativo: há PIS e COFINS
 * negativos no cadastro, e é por isso que o SQL aplica `ABS` no valor de entrada.
 */
export function lerPercentual(texto: string): number | null {
  const limpo = texto.replace(/%|\s/g, "");
  if (limpo === "") return null;
  const negativo = limpo.startsWith("-");
  const valor = lerPreco(negativo ? limpo.slice(1) : limpo);
  if (valor === null || Number.isNaN(valor)) return Number.NaN;
  return negativo ? -valor : valor;
}

/**
 * Lê o que a pessoa digitou no campo de preço, no jeito brasileiro.
 *
 * Aceita `12,5`, `12.5`, `1.234,56` e `R$ 1.234,56`. Devolve `null` para vazio (volta ao preço
 * do SQL) e `NaN` para o que não é um preço — a tela avisa em vez de calcular com lixo.
 * Negativo é `NaN`: preço de compra negativo não é simulação, é digitação errada.
 */
export function lerPreco(texto: string): number | null {
  const limpo = texto.replace(/R\$|\s/g, "");
  if (limpo === "") return null;

  // Com vírgula, o ponto é separador de milhar; sem vírgula, o ponto é a casa decimal.
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  if (!/^\d+(\.\d+)?$/.test(normal)) return Number.NaN;
  return Number(normal);
}

/**
 * dc99 — as faixas da impressão do DRE (23/10/2026).
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc99_faixas_da_impressao.mjs
 *
 * Com mais de três meses o papel sai em faixas de três meses, todas no mesmo arquivo, e o
 * Total numa faixa própria no fim. Este arquivo confere a divisão, sem navegador.
 */
import assert from "node:assert/strict";
import { faixasDaImpressao, MESES_POR_FAIXA } from "../../../../client-new-kpi/lib/faixasDaImpressao.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}: esperava ${JSON.stringify(esperado)}, veio ${JSON.stringify(achou)}`);
};

eq(MESES_POR_FAIXA, 3, "três meses por faixa");

// Até três meses a impressão não se divide — continua a tabela de sempre.
for (const m of [0, 1, 2, 3]) eq(faixasDaImpressao(m), null, `${m} meses: uma tabela só`);

// A partir de quatro, faixas de três.
eq(faixasDaImpressao(4), [{ inicio: 0, fim: 3 }, { inicio: 3, fim: 4 }], "4 meses: 3 + 1");
eq(faixasDaImpressao(6), [{ inicio: 0, fim: 3 }, { inicio: 3, fim: 6 }], "6 meses: 3 + 3");
eq(faixasDaImpressao(12).length, 4, "12 meses: quatro faixas");
eq(faixasDaImpressao(12).at(-1), { inicio: 9, fim: 12 }, "12 meses: a última vai de outubro a dezembro");
eq(faixasDaImpressao(10).map((f) => f.fim - f.inicio), [3, 3, 3, 1], "10 meses: a sobra fica na última, sem roubar meses");

// Toda coluna cai em exatamente uma faixa, na ordem.
for (const m of [4, 5, 7, 11, 12, 13]) {
  const meses = faixasDaImpressao(m).flatMap((f) => Array.from({ length: f.fim - f.inicio }, (_, i) => f.inicio + i));
  eq(meses, Array.from({ length: m }, (_, i) => i), `${m} meses: cada coluna uma vez, em ordem`);
}

// Entrada que não é contagem de meses não divide nada.
eq(faixasDaImpressao(Number.NaN), null, "NaN: sem faixas");
eq(faixasDaImpressao(4.5), null, "fração: sem faixas");

console.log(`✓ dc99 passou — ${n} conferências`);

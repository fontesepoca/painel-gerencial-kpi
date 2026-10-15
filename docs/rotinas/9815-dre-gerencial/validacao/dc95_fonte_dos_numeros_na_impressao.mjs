/**
 * dc95 — a fonte dos NÚMEROS na impressão do DRE cresce até encher a folha (15/10/2026).
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc95_fonte_dos_numeros_na_impressao.mjs
 *
 * Com três meses de provisionado a tabela tem ~22 colunas, cabe na A3 deitada com fonte
 * pequena, e a largura de cada coluna sai do CABEÇALHO ("PROVISIONADO", "TOTAL (R + P)") — os
 * números ficam com vão dentro da célula. A impressão passa a ter uma fonte só dos números,
 * a maior que ainda cabe. Este arquivo testa a busca dela, sem navegador: a "tabela" é uma
 * função que diz a largura para cada fonte.
 */
import assert from "node:assert/strict";
import { LARGURA_UTIL, maiorFonteDosNumeros } from "../../../../client-new-kpi/lib/escalaDeImpressao.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}: esperava ${esperado}, veio ${achou}`);
};

const util = LARGURA_UTIL["a3-deitada"];

// Uma tabela cuja largura só passa a crescer quando o número fica maior que o cabeçalho —
// é o caso real: até ~10pt a coluna é a do rótulo, e o número cabe dentro dela.
const tabela = (fixo, porPonto, apartirDe) => (pt) => fixo + Math.max(0, pt - apartirDe) * porPonto;

// 1. Sobra folha: a fonte sobe até o maior meio ponto que ainda cabe (com a mesma folga de 2%).
{
  const medir = tabela(util * 0.8, 40, 8);
  const pt = maiorFonteDosNumeros(medir, 8, "a3-deitada");
  eq(medir(pt) <= util * 0.98, true, "a fonte escolhida cabe na largura útil");
  eq(medir(pt + 0.5) > util * 0.98 || pt === 20, true, "meio ponto a mais já não caberia (ou é o teto)");
  eq(pt > 8, true, "e é maior que a de partida");
  eq(pt * 2, Math.round(pt * 2), "em meio ponto");
}

// 2. Já não sobra nada: fica na de partida — nunca diminui por causa desta busca.
{
  const medir = tabela(util * 0.99, 40, 0);
  eq(maiorFonteDosNumeros(medir, 9, "a3-deitada"), 9, "sem folga, a fonte de partida");
}

// 3. Teto: tabela estreita não leva os números a 40pt.
{
  const medir = () => 100;
  eq(maiorFonteDosNumeros(medir, 8, "a3-deitada"), 20, "o teto dos números é 20pt");
}

// 4. Medição quebrada (0, NaN): não arrisca — fica na de partida.
{
  eq(maiorFonteDosNumeros(() => Number.NaN, 8, "a3-deitada"), 8, "medida inválida: a de partida");
}

console.log(`✓ dc95 passou — ${n} conferências`);

/**
 * dc95 — a fonte dos NÚMEROS na impressão do DRE é a maior que cabe na folha (15/10/2026).
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc95_fonte_dos_numeros_na_impressao.mjs
 *
 * Com três meses de provisionado a tabela tem ~22 colunas. A impressão tem uma fonte só dos
 * números, buscada entre 7pt e 20pt com a descrição e os cabeçalhos já fixos. Este arquivo
 * testa a busca, sem navegador: a "tabela" é uma função que diz a largura para cada fonte.
 *
 * A PRIMEIRA VERSÃO partia da fonte da tabela inteira — que já enchia a folha — e nunca subia:
 * nos PDFs de 15/10/2026 os números saíram do mesmo tamanho. A busca agora cobre a faixa toda,
 * e pode inclusive escolher MENOS que a fonte da tabela, se é o que cabe.
 */
import assert from "node:assert/strict";
import { LARGURA_UTIL, maiorFonteDosNumeros } from "../../../../client-new-kpi/lib/escalaDeImpressao.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}: esperava ${esperado}, veio ${achou}`);
};

const limite = LARGURA_UTIL["a3-deitada"] * 0.98;

// Largura = parte fixa (descrição, cabeçalhos) + o que cresce com a fonte dos números.
const tabela = (fixo, porPonto) => (pt) => fixo + pt * porPonto;

// 1. A maior fonte que cabe, em meio ponto.
{
  const medir = tabela(400, 100);
  const pt = maiorFonteDosNumeros(medir, "a3-deitada");
  eq(medir(pt) <= limite, true, "a fonte escolhida cabe");
  eq(medir(pt + 0.5) > limite, true, "meio ponto a mais já não caberia");
  eq(pt * 2, Math.round(pt * 2), "em meio ponto");
}

// 2. O caso dos PDFs de 15/10: a tabela inteira já enchia a folha numa fonte X; com a parte
//    fixa menor que a dos números, a busca acha a fonte certa mesmo abaixo de X — não desiste.
{
  const medir = tabela(200, 140);
  const pt = maiorFonteDosNumeros(medir, "a3-deitada");
  eq(pt, Math.floor(((limite - 200) / 140) * 2) / 2, "a maior que cabe, calculada");
}

// 3. Teto: tabela estreita não leva os números a 40pt.
eq(maiorFonteDosNumeros(() => 100, "a3-deitada"), 20, "o teto dos números é 20pt");

// 4. Nem a menor cabe: fica no piso, 7pt — melhor apertado que sem número.
eq(maiorFonteDosNumeros(() => limite * 2, "a3-deitada"), 7, "o piso é 7pt");

// 5. Medição quebrada (NaN): o piso, sem arriscar.
eq(maiorFonteDosNumeros(() => Number.NaN, "a3-deitada"), 7, "medida inválida: o piso");

console.log(`✓ dc95 passou — ${n} conferências`);

/**
 * dc99 — as faixas da impressão do DRE (23/10/2026).
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc99_faixas_da_impressao.mjs
 *
 * Com mais de três meses o papel sai em faixas de três meses, todas no mesmo arquivo, e o
 * Total numa faixa própria no fim. Este arquivo confere a divisão, sem navegador.
 */
import assert from "node:assert/strict";
import { faixasDaImpressao, faixasDoPapel, MESES_POR_FAIXA, trimestreDaFaixa } from "../../../../client-new-kpi/lib/faixasDaImpressao.ts";

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

// O TRIMESTRE NO ALTO DE CADA FOLHA (29/10/2026, pedido do Gabriel): o do CALENDÁRIO, lido da
// chave `MM/AAAA` de cada coluna. Faixa que atravessa dois trimestres diz os dois.
eq(trimestreDaFaixa(["01/2025", "02/2025", "03/2025"]), "1º trimestre de 2025", "jan–mar");
eq(trimestreDaFaixa(["10/2025", "11/2025", "12/2025"]), "4º trimestre de 2025", "out–dez");
eq(trimestreDaFaixa(["10/2025"]), "4º trimestre de 2025", "faixa de um mês só");
eq(trimestreDaFaixa(["02/2025", "03/2025", "04/2025"]), "1º e 2º trimestres de 2025", "fev–abr atravessa dois");
eq(trimestreDaFaixa(["11/2025", "12/2025", "01/2026"]), "4º trimestre de 2025 e 1º trimestre de 2026", "virada de ano");
eq(trimestreDaFaixa(["2024", "2025"]), null, "por ano: coluna não é mês, sem trimestre");
eq(trimestreDaFaixa(["2026:01-03"]), null, "comparativo: sem trimestre");
eq(trimestreDaFaixa([]), null, "faixa vazia");

// O TOTAL NAS ÚLTIMAS PÁGINAS TAMBÉM COM 2 E 3 MESES (29/10/2026, pedido do Gabriel): com
// Provisionado, três meses e o Total numa folha só saíam ilegíveis. Havendo coluna Total, os
// meses formam uma parte e o Total outra, no fim — como no ano inteiro.
eq(faixasDoPapel(3, true), [{ inicio: 0, fim: 3 }], "3 meses com Total: os meses numa parte, o Total depois");
eq(faixasDoPapel(2, true), [{ inicio: 0, fim: 2 }], "2 meses com Total: idem");
eq(faixasDoPapel(1, true), null, "1 mês: não há Total, uma tabela só");
eq(faixasDoPapel(3, false), null, "3 meses sem a coluna Total: uma tabela só, como sempre");
eq(faixasDoPapel(2, false), null, "2 meses sem a coluna Total: uma tabela só");
eq(faixasDoPapel(12, true), faixasDaImpressao(12), "12 meses: as faixas de três de sempre");
eq(faixasDoPapel(12, false), faixasDaImpressao(12), "12 meses sem Total: as faixas de três, sem a parte do Total");

console.log(`✓ dc99 passou — ${n} conferências`);

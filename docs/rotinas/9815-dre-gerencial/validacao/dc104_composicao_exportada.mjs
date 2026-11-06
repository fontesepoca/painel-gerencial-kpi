/**
 * dc104 — o TOTALIZADOR também se exporta: a composição dele (06/11/2026).
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc104_composicao_exportada.mjs
 *
 * Pedido do Gabriel: os totalizadores (LUCRO BRUTO, Sub-Total, RESULTADO OPERACIONAL, LUCRO
 * LIQUIDO…) podem ser selecionados e exportados como as contas. O que vai para o zip é a
 * COMPOSIÇÃO — as linhas que formam o total e o valor de cada uma, o mesmo que o duplo clique
 * mostra —, sem consultar o banco.
 */
import assert from "node:assert/strict";
import { composicaoDaLinha, planilhaDaComposicao } from "../../../../client-new-kpi/lib/composicaoDoTotal.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, oque);
};

const linha = (chave, descricao, jul, ago, extra = {}) => ({
  chaveOrdem: chave,
  descricao,
  valores: [
    { mesAno: "07/2026", valor: jul },
    { mesAno: "08/2026", valor: ago },
  ],
  total: { valor: jul + ago },
  semMovimento: false,
  ...extra,
});

const bruto = linha("lb", "LUCRO BRUTO", 1000, 1200, {
  composicao: [
    { chaveOrdem: "rl", rotulo: "(=) RECEITAS LIQUIDAS", sinal: 1 },
    { chaveOrdem: "cmv", rotulo: "(=) CMV LIQ.", sinal: 1 },
    { chaveOrdem: "sumiu", rotulo: "LINHA QUE NÃO ESTÁ NA TELA", sinal: 1 },
  ],
});
const todas = [linha("rl", "(=) RECEITAS LIQUIDAS", 3000, 3500), linha("cmv", "(=) CMV LIQ.", -2000, -2300), bruto];

// ── A composição numa coluna, e no período ────────────────────────────────────────────────
const jul = composicaoDaLinha(bruto, todas, "07/2026");
eq(jul.total, 1000, "o total é o valor do próprio totalizador");
eq(jul.parcelas.map((p) => [p.rotulo, p.valor]), [["(=) RECEITAS LIQUIDAS", 3000], ["(=) CMV LIQ.", -2000]],
  "as parcelas, com o valor lido da própria linha citada");
eq(jul.parcelas.length, 2, "parcela sem linha na tela some — não vira um zero que parece conta fechada");
eq(composicaoDaLinha(bruto, todas, null).total, 2200, "sem mês: o total do período");
eq(composicaoDaLinha(bruto, todas, null).parcelas[1].valor, -4300, "e as parcelas do período");

const comSinal = { ...bruto, composicao: [{ chaveOrdem: "cmv", rotulo: "(-) CMV", sinal: -1 }] };
eq(composicaoDaLinha(comSinal, todas, "08/2026").parcelas[0].valor, 2300, "o sinal da parcela é aplicado");

// ── A planilha: título, uma linha por parcela, e o total ──────────────────────────────────
const p = planilhaDaComposicao({
  titulo: "LUCRO BRUTO · Julho/2026",
  periodo: { dataInicio: "2026-07-01", dataFim: "2026-07-31" },
  ...jul,
});
eq(p.aba, "Composição", "aba própria");
eq(p.matriz[0].map((c) => c.v), ["Linha", "Valor"], "cabeçalho");
eq(p.matriz.slice(1, 3).map((r) => [r[0].v, r[1].v]), [["(=) RECEITAS LIQUIDAS", 3000], ["(=) CMV LIQ.", -2000]], "as parcelas");
eq([p.matriz.at(-1)[0].v, p.matriz.at(-1)[1].v], ["LUCRO BRUTO · Julho/2026", 1000], "a última linha é o total, com o título");
eq(p.matriz.at(-1)[1].s?.negrito, true, "o total em negrito");

console.log(`✓ dc104 passou — ${n} conferências`);

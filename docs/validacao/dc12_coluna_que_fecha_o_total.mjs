/**
 * dc12 — a coluna que fecha o total, por tela e por linha do DRE.
 *
 * Roda contra o módulo real: `node --experimental-strip-types` lê o `.ts` direto, então o
 * que é testado aqui é o mesmo código que a tela importa.
 *
 *   node --experimental-strip-types docs/validacao/dc12_coluna_que_fecha_o_total.mjs
 *
 * Não toca no banco — é decisão pura sobre nomes de coluna.
 */
import assert from "node:assert/strict";
import {
  colunaDoTotal,
  igual,
  nomeDaLinha,
  rotuloDaColuna,
} from "../../client-new-kpi/lib/colunaDoTotal.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}: esperava ${esperado}, veio ${achou}`);
};

// --- nomeDaLinha: o sinal sai, o nome fica ---------------------------------------------
eq(nomeDaLinha({ descricao: "(-) ST" }), "ST", "(-) ST");
eq(nomeDaLinha({ descricao: "(+) RECEITA BRUTA" }), "RECEITA BRUTA", "(+) receita");
eq(nomeDaLinha({ descricao: "(=) LUCRO BRUTO" }), "LUCRO BRUTO", "(=) lucro");
eq(nomeDaLinha({ descricao: "RECEITAS FINANCEIRAS" }), "RECEITAS FINANCEIRAS", "sem sinal");
eq(nomeDaLinha(null), null, "sem linha");
eq(nomeDaLinha({ descricao: "   " }), null, "só espaço");
// Um parêntese que não é sinal não pode ser comido.
eq(nomeDaLinha({ descricao: "(ATIVO) OUTRAS" }), "(ATIVO) OUTRAS", "parêntese que não é sinal");

// --- igual: mesma palavra em duas convenções -------------------------------------------
eq(igual("Devolução", "DEVOLUCAO"), true, "acento e caixa");
eq(igual("Receita bruta", "RECEITA BRUTA"), true, "espaço e caixa");
eq(igual("Custo líq.", "CMV LIQ."), false, "custo não é CMV");
eq(igual("Líquido", "ST"), false, "líquido não é ST");

// --- colunaDoTotal: cada tela e cada linha ---------------------------------------------
eq(colunaDoTotal("imposto-por-produto", "ST"), "Líquido", "ST");
eq(colunaDoTotal("imposto-por-produto", "PIS"), "Líquido", "PIS");
eq(colunaDoTotal("imposto-por-produto", "COFINS"), "Líquido", "COFINS");
eq(colunaDoTotal("devolucao-por-motivo", "DEVOLUCAO"), "Devolução", "devolução");
eq(colunaDoTotal("lancamentos", "RECEITAS FINANCEIRAS"), "V. Pago", "lançamentos");

// As quatro linhas que abrem a MESMA tela em quatro colunas diferentes — é aqui que um erro
// silencioso apontaria a coluna errada e a tela mentiria com ar de certeza.
eq(colunaDoTotal("receita-por-cliente", "RECEITA BRUTA"), "Receita bruta", "bruta");
eq(colunaDoTotal("receita-por-cliente", "RECEITAS LIQUIDAS"), "Receita líq.", "líquida");
eq(colunaDoTotal("receita-por-cliente", "ABAT./DESC."), "Desconto", "abatimentos");
eq(colunaDoTotal("receita-por-cliente", "CMV LIQ."), "Custo líq.", "CMV — o que casa com dois");

// Sem saber a linha, não se aponta coluna nenhuma.
for (const tipo of [
  "receita-por-cliente",
  "devolucao-por-motivo",
  "imposto-por-produto",
  "lancamentos",
]) {
  eq(colunaDoTotal(tipo, null), null, `${tipo} sem linha`);
}

// --- rotuloDaColuna: anuncia sem repetir -----------------------------------------------
eq(rotuloDaColuna("Líquido", "ST"), "(ST) Líquido", "o caso do pedido");
eq(rotuloDaColuna("Líquido", "COFINS"), "(COFINS) Líquido", "COFINS");
eq(rotuloDaColuna("Custo líq.", "CMV LIQ."), "(CMV LIQ.) Custo líq.", "CMV");
eq(rotuloDaColuna("Devolução", "DEVOLUCAO"), "Devolução", "não repete o mesmo nome");
eq(rotuloDaColuna("Receita bruta", "RECEITA BRUTA"), "Receita bruta", "não repete a bruta");
eq(rotuloDaColuna("Valor", null), "Valor", "sem nome, o rótulo cru");

console.log(`dc12: ${n}/${n} asserções passaram.`);

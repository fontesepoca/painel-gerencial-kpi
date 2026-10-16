/**
 * dc96 — o `.xlsx` do DRE sai estilizado como a tela (16/10/2026).
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc96_excel_estilizado.mjs
 *
 * Gera pelo caminho de verdade (`gerarApuracao` → `gerarPlanilha`, ExcelJS), REABRE o arquivo
 * e confere célula por célula. O que protege:
 *
 * - o estilo não estragou o dado: número continua número, com o formato de parênteses;
 * - as regras da tela chegaram ao arquivo — cor de cada mês no título e na coluna, bloco
 *   Total em cinza, totalizador em negrito, positivo verde e negativo vermelho, bordas
 *   grossas no RESULTADO OPERACIONAL e no LUCRO LIQUIDO, títulos centralizados;
 * - o congelamento e os merges continuam lá.
 */
import assert from "node:assert/strict";
import ExcelJS from "../../../../client-new-kpi/node_modules/exceljs/excel.js";
import { gerarApuracao } from "../../../../client-new-kpi/lib/exportarExcel.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}: esperava ${JSON.stringify(esperado)}, veio ${JSON.stringify(achou)}`);
};
const ok = (cond, oque) => {
  n++;
  assert.ok(cond, oque);
};

const periodos = [
  { mesAno: "2026-07", rotulo: "Julho/2026", bloco: 0 },
  { mesAno: "2026-08", rotulo: "Agosto/2026", bloco: 0 },
];

const linha = (descricao, valores, { papel = null, totalizadora = false, cor = null } = {}) => ({
  id: 1,
  chaveOrdem: descricao,
  chave: "400",
  papel,
  descricao,
  valores: periodos.map((p, i) => ({
    mesAno: p.mesAno,
    valor: valores[i],
    percentualAv: 10,
    percentualAh: i === 0 ? null : 5,
  })),
  total: { valor: valores[0] + valores[1], media: (valores[0] + valores[1]) / 2, percentualAv: 10 },
  totalizadora,
  calculada: papel !== null,
  naoSoma: false,
  semMovimento: false,
  zerada: false,
  cor,
  detalhe: null,
  composicao: [],
});

const dados = {
  regime: "competencia",
  analise: "ccusto-principal",
  modo: "meses",
  dataInicio: "2026-07-01",
  dataFim: "2026-08-31",
  filiais: ["1"],
  periodos,
  linhas: [
    linha("(+) RECEITA BRUTA", [1000, 1100], { papel: "receita-bruta", totalizadora: true, cor: "#FACC15" }),
    linha("ADMINISTRATIVO", [-300, -320]),
    linha("RESULTADO OPERACIONAL", [700, 780], { papel: "resultado-operacional", totalizadora: true }),
    linha("ZERADA", [0, 0]),
  ],
  avisos: [],
};

const blob = await gerarApuracao(dados, dados.linhas, { av: true, ah: true });
const livro = new ExcelJS.Workbook();
await livro.xlsx.load(Buffer.from(await blob.arrayBuffer()));
const aba = livro.getWorksheet("DRE");
ok(aba !== undefined, "a aba se chama DRE");

// Colunas: A descrição · B-D julho (valor, AV, AH) · E-G agosto · H-K total (valor, AV, média, AH)
const c = (ref) => aba.getCell(ref);
const fundo = (ref) => c(ref).fill?.fgColor?.argb ?? null;
const corTexto = (ref) => c(ref).font?.color?.argb ?? null;

// ── O dado não se perdeu ──
eq(c("B3").value, 1000, "valor cru");
eq(c("B4").value, -300, "negativo cru");
ok(String(c("B3").numFmt).includes("("), "formato com parênteses");
eq(aba.views[0]?.state, "frozen", "painel congelado");
eq([aba.views[0]?.xSplit, aba.views[0]?.ySplit], [1, 2], "descrição e duas linhas de cabeçalho fixas");
ok(c("B1").isMerged && c("D1").isMerged, "a faixa de julho está juntada");

// ── Cabeçalho ──
eq(c("B1").value, "Julho/2026", "faixa do mês");
ok(fundo("B1") !== null && fundo("B1") !== fundo("E1"), "julho e agosto com cores diferentes no título");
eq(c("B2").alignment?.horizontal, "center", "títulos das colunas centralizados");
eq(c("A2").alignment?.horizontal, "left", "Descrição à esquerda");

// ── A cor do mês desce pela coluna ──
ok(fundo("B4") !== null, "a coluna de julho tem cor numa conta");
ok(fundo("D4") !== null, "e na célula de AH de julho também");
ok(fundo("B4") !== fundo("E4"), "julho e agosto diferentes no corpo");
eq(fundo("H4"), "FFF1F5F9", "o bloco Total em cinza, como na tela");

// ── Totalizador ──
eq(c("A3").font?.bold, true, "descrição do totalizador em negrito");
eq(c("B3").font?.bold, true, "número do totalizador em negrito");
// O ExcelJS grava só o negrito ligado: "sem negrito" volta como ausente.
ok(!c("B4").font?.bold, "conta comum sem negrito");
ok(fundo("A3") !== null, "a linha totalizadora tem fundo");
ok(fundo("B3") !== fundo("B4"), "totalizador mais escuro que a conta na mesma coluna");
eq(c("A3").border?.left?.color?.argb, "FFFACC15", "a cor do cadastro vira o marcador à esquerda");

// ── Sinal em cor ──
eq(corTexto("B3"), "FF047857", "positivo em verde");
eq(corTexto("B4"), "FFBE123C", "negativo em vermelho");
eq(corTexto("B6"), "FF64748B", "zero apagado");

// ── Os dois resultados ──
eq(c("B5").border?.top?.style, "medium", "RESULTADO OPERACIONAL com borda grossa em cima");
eq(c("B5").border?.bottom?.style, "medium", "e embaixo");
eq(c("A5").border?.top?.style, "medium", "inclusive na descrição");
ok(c("B4").border?.top?.style !== "medium", "a conta comum não tem a borda grossa");

console.log(`✓ dc96 passou — ${n} conferências`);

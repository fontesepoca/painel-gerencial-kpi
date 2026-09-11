/**
 * dc26 — o comparativo no cenário que o motivou: um trimestre contra o mesmo trimestre do
 * ano seguinte.
 *
 *   node docs/validacao/dc26_comparativo_trimestre.mjs
 *
 * É o exemplo que o Gabriel descreveu em 11/09/2026: `01/01/2025–31/03/2025` contra
 * `01/01/2026–31/03/2026`, saindo em seis colunas mensais lado a lado.
 *
 * A dc20 já cobre as regras sem tocar no banco. O que **só** um cenário real prova é que a
 * mecânica inteira se sustenta junta: dois recortes, seis colunas com as datas certas, o
 * `%AH` reiniciando na virada de bloco e a variação somando cada lado. Um erro em qualquer
 * uma dessas peças produz uma tabela plausível e errada.
 *
 * O POST vai por `_postar.mjs`: dois trimestres em paralelo podem passar dos 300 s que o
 * `fetch` do Node concede, e a medição morreria antes do resultado.
 */
import { postar } from "./_postar.mjs";

const API = process.env.API ?? "http://localhost:5207";

const FILTRO = {
  filiais: ["7"],
  dataInicio: "2025-01-01",
  dataFim: "2025-03-31",
  regime: "competencia",
  analise: "ccusto-principal",
  modo: "comparar-anos",
  comparacaoInicio: "2026-01-01",
  comparacaoFim: "2026-03-31",
};

const dinheiro = (n) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cent = (n) => Math.round(n * 100) / 100;

let n = 0;
let falhas = 0;
const ok = (condicao, oque) => {
  n++;
  if (!condicao) {
    falhas++;
    console.log(`  ✗ ${oque}`);
  }
};

console.log(`API: ${API}`);
console.log("Filial 7 · Jan–Mar/2025 vs Jan–Mar/2026 · competência\n");

const resposta = await postar(`${API}/api/dre-gerencial/apuracao`, FILTRO);
if (!resposta.sucesso) throw new Error(resposta.erros?.[0] ?? resposta.mensagem ?? "falha");
const d = resposta.dados;

// ── as colunas ───────────────────────────────────────────────────────────────
console.log(`COLUNAS  (${(d.duracaoMs / 1000).toFixed(1)} s)`);
for (const p of d.periodos) {
  console.log(`  bloco ${p.bloco}  ${p.rotulo.padEnd(16)} ${p.dataInicio} a ${p.dataFim}`);
}

ok(d.modo === "comparar-anos", `modo devolvido: ${d.modo}`);
ok(d.periodos.length === 6, `esperava 6 colunas, vieram ${d.periodos.length}`);
ok(
  d.periodos.map((p) => p.bloco).join("") === "000111",
  `blocos: ${d.periodos.map((p) => p.bloco).join("")}`,
);
ok(
  d.periodos.map((p) => p.rotulo).join(", ") ===
    "Janeiro/2025, Fevereiro/2025, Março/2025, Janeiro/2026, Fevereiro/2026, Março/2026",
  "os rótulos são os seis meses, em ordem",
);

// As datas de cada coluna são o mês CRUZADO com o recorte — é o que o duplo clique usa.
ok(d.periodos[0].dataInicio === "2025-01-01", "a primeira coluna começa no início do recorte");
ok(d.periodos[2].dataFim === "2025-03-31", "a última do bloco 0 termina no fim do recorte");
ok(d.periodos[3].dataInicio === "2026-01-01", "o bloco 1 começa no próprio recorte");
ok(d.periodos[5].dataFim === "2026-03-31", "e termina no fim dele");

// ── o %AH reinicia na virada ─────────────────────────────────────────────────
//
// Sequencial, Janeiro/2026 compararia com Março/2025 — dois meses sem relação, e o número
// sairia grande e sem sentido bem onde a comparação começa.
const linha = (rotulo) => {
  const l = d.linhas.find((x) => x.descricao.trim() === rotulo);
  if (!l) throw new Error(`linha "${rotulo}" não existe`);
  return l;
};

const liq = linha("(=) RECEITAS LIQUIDAS");
console.log("\n(=) RECEITAS LIQUIDAS");
liq.valores.forEach((v, i) => {
  const p = d.periodos[i];
  console.log(
    `  ${p.rotulo.padEnd(16)} ${dinheiro(v.valor).padStart(18)}   AH ${v.percentualAh === null ? "—" : v.percentualAh.toFixed(3).padStart(9)}`,
  );
});

ok(liq.valores[0].percentualAh === 0, "Janeiro/2025 abre o bloco 0: AH zero");
ok(liq.valores[3].percentualAh === 0, "Janeiro/2026 abre o bloco 1: AH zero, não compara com Março/2025");
ok(liq.valores[1].percentualAh !== 0, "Fevereiro/2025 compara com Janeiro/2025");
ok(liq.valores[4].percentualAh !== 0, "Fevereiro/2026 compara com Janeiro/2026");

// ── a identidade da receita, em cada coluna ──────────────────────────────────
const bruta = linha("(+) RECEITA BRUTA");
const abat = linha("(-) ABAT./DESC.");
const devol = linha("(-) DEVOLUCAO");

console.log("\nIDENTIDADE  (bruta − abat − devolução = líquida)");
d.periodos.forEach((p, i) => {
  const v = (l) => cent(l.valores[i].valor);
  const esperado = cent(v(bruta) + v(abat) + v(devol)); // deduções já vêm negativas
  const bate = Math.abs(esperado - v(liq)) < 0.01;
  ok(bate, `${p.rotulo}: esperado ${dinheiro(esperado)}, achou ${dinheiro(v(liq))}`);
  console.log(`  ${p.rotulo.padEnd(16)} ${bate ? "ok" : "DIVERGE"}`);
});

// ── a variação compara os dois LADOS ─────────────────────────────────────────
//
// A conferência que importa para quem usa: o Δ do bloco final é a soma do segundo intervalo
// menos a do primeiro, e não a última coluna menos a primeira.
const somaDoBloco = (l, bloco) =>
  cent(l.valores.reduce((s, v, i) => (d.periodos[i].bloco === bloco ? s + v.valor : s), 0));

const de = somaDoBloco(liq, 0);
const para = somaDoBloco(liq, 1);
const delta = cent(para - de);
const percentual = de === 0 ? null : (delta / Math.abs(de)) * 100;

console.log("\nVARIAÇÃO DO TRIMESTRE");
console.log(`  Jan–Mar/2025  ${dinheiro(de).padStart(18)}`);
console.log(`  Jan–Mar/2026  ${dinheiro(para).padStart(18)}`);
console.log(`  Δ             ${dinheiro(delta).padStart(18)}   ${percentual === null ? "—" : percentual.toFixed(3) + "%"}`);

// E a diferença entre isso e a conta errada, para o registro: comparar as colunas das
// pontas dá outro número, e é o que aconteceria se o bloco final ignorasse os blocos.
const pontas = cent(liq.valores[5].valor - liq.valores[0].valor);
console.log(`  (a conta ERRADA, última coluna menos a primeira: ${dinheiro(pontas)})`);
ok(delta !== pontas, "a variação por lado difere da variação por pontas — senão o teste não prova nada");

console.log(
  falhas === 0
    ? `\n✓ dc26: ${n}/${n} conferências passaram.`
    : `\n✗ dc26: ${falhas} de ${n} falharam.`,
);
process.exitCode = falhas === 0 ? 0 : 1;

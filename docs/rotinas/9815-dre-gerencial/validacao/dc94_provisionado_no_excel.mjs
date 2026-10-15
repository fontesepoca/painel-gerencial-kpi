/**
 * dc94 — as colunas PROVISIONADO e TOTAL no Excel da apuração, e na reordenação de linhas.
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc94_provisionado_no_excel.mjs
 *
 * O arquivo conta o que a tela conta: as duas colunas só nos meses com título em aberto, e
 * no bloco do período se algum mês tiver; vazias em linha calculada; nenhuma quando o
 * checkbox está desligado. E a reordenação (`recalcular`) não pode jogar fora o provisionado
 * do total — ela remonta o objeto `total` à mão.
 *
 * Não toca no banco nem no navegador.
 */
import assert from "node:assert/strict";
import { matrizDaApuracao } from "../../../../client-new-kpi/lib/exportarExcel.ts";
import { recalcular } from "../../../../client-new-kpi/lib/recalculoDoDre.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}\n  esperado: ${JSON.stringify(esperado)}\n  achou:    ${JSON.stringify(achou)}`);
};

const periodos = [
  { mesAno: "07/2026", rotulo: "Julho/2026", dataInicio: "2026-07-01", dataFim: "2026-07-31", bloco: 0, temProvisionado: true },
  { mesAno: "08/2026", rotulo: "Agosto/2026", dataInicio: "2026-08-01", dataFim: "2026-08-31", bloco: 0, temProvisionado: false },
];

const linha = (descricao, extra = {}) => ({
  id: 1,
  chaveOrdem: descricao,
  chave: "1001",
  descricao,
  papel: null,
  valores: [
    // As versões R + P dos percentuais vêm da API (MontadorDre) — aqui só valores marcados,
    // para o teste saber de qual campo cada célula saiu.
    { mesAno: "07/2026", valor: -100, percentualAv: 1, percentualAh: 0, provisionado: -40,
      percentualAvComProvisionado: 1.4, percentualAhComProvisionado: 0 },
    { mesAno: "08/2026", valor: -50, percentualAv: 1, percentualAh: -50, provisionado: null,
      percentualAvComProvisionado: 0.5, percentualAhComProvisionado: -64 },
  ],
  total: { valor: -150, media: -75, percentualAv: 1, provisionado: -40, percentualAvComProvisionado: 0.95 },
  totalizadora: false,
  calculada: false,
  naoSoma: false,
  semMovimento: false,
  zerada: false,
  cor: null,
  detalhe: null,
  composicao: [],
  ...extra,
});

// O Sub-Total soma o P das contas (opção 1, 14/10/2026), e tem os percentuais R + P.
const calculada = linha("Sub-Total -> Despesas Operacionais", {
  papel: "sub-total",
  calculada: true,
  valores: [
    { mesAno: "07/2026", valor: -100, percentualAv: 1, percentualAh: 0, provisionado: -40,
      percentualAvComProvisionado: 1.4, percentualAhComProvisionado: 0 },
    { mesAno: "08/2026", valor: -50, percentualAv: 1, percentualAh: -50, provisionado: null,
      percentualAvComProvisionado: 0.5, percentualAhComProvisionado: -64 },
  ],
  total: { valor: -150, media: -75, percentualAv: 1, provisionado: -40, percentualAvComProvisionado: 0.95 },
});

// A RECEITA não tem P: as duas colunas novas ficam vazias.
const receita = linha("(+) RECEITA BRUTA", {
  papel: "receita-bruta",
  calculada: true,
  valores: [
    { mesAno: "07/2026", valor: 1000, percentualAv: null, percentualAh: 0, provisionado: null },
    { mesAno: "08/2026", valor: 1000, percentualAv: null, percentualAh: 0, provisionado: null },
  ],
  total: { valor: 2000, media: 1000, percentualAv: null, provisionado: null },
});

const dados = {
  regime: "competencia",
  analise: "ccusto-principal",
  modo: "meses",
  dataInicio: "2026-07-01",
  dataFim: "2026-08-31",
  filiais: ["7"],
  periodos,
  linhas: [linha("ADMINISTRATIVO"), calculada, receita],
  avisos: [],
  fornecedores: [],
  apuradoEm: "2026-10-14T12:00:00Z",
  duracaoMs: 1,
};

const v = (c) => c?.v ?? null;

// ── 1. Com o checkbox ligado ────────────────────────────────────────────────────────────────
const m = matrizDaApuracao(dados, dados.linhas, { av: true, ah: true, provisionado: true });
// A ORDEM pedida pelo Gabriel em 14/10/2026: o dinheiro junto — Valor, Provisionado, Total —
// e a análise depois. No período: Valor / Provisionado / Total / AV / Média / AH.
// E os NOMES de competência (14/10/2026): Vl. Realizado, Provisionado, Total (R + P).
eq(m[1].map(v), [
  "Descrição",
  "Vl. Realizado", "Provisionado", "Total (R + P)", "AV %", "AH %",          // julho
  "Vl. Realizado", "AV %", "AH %",                                              // agosto
  "Vl. Realizado", "Provisionado", "Total (R + P)", "AV %", "Média", "AH %", // período
], "cabeçalho: Realizado, Provisionado e Total juntos, a análise depois");

const adm = m[2].map(v);
// Com o Provisionado ligado, %AV e %AH da conta são os de R + P (opção 1, 14/10/2026).
eq(adm.slice(1, 6), [-100, -40, -140, 1.4, 0], "julho: Valor, Provisionado, Total, AV e AH sobre R + P");
eq(adm.slice(6, 9), [-50, 0.5, -64], "agosto: sem as colunas novas, mas AV e AH sobre R + P");
eq(adm.slice(9, 15), [-150, -40, -190, 0.95, -75, -64], "período: Valor, Provisionado, Total, AV R + P, Média, soma dos AH R + P");

const sub = m[3].map(v);
eq(sub.slice(1, 6), [-100, -40, -140, 1.4, 0], "Sub-Total: P das contas, Total (R + P) e %AV R + P — bate com o das contas");
eq(sub.slice(9, 12), [-150, -40, -190], "Sub-Total no período");
const rec = m[4].map(v);
eq([rec[2], rec[3], rec[10], rec[11]], [null, null, null, null], "receita: Provisionado e Total vazios");

eq(m[0].length, m[1].length, "a faixa dos meses tem a mesma largura do cabeçalho");

// ── 2. Desligado: a planilha de hoje ──────────────────────────────────────────────────────
const sem = matrizDaApuracao(dados, dados.linhas, { av: true, ah: true, provisionado: false });
eq(sem[1].map(v).includes("Provisionado"), false, "desligado: nenhuma coluna nova");
eq(sem[1].length, 1 + 3 + 3 + 4, "desligado: a largura de sempre");
eq(sem[2].map(v).slice(1, 7), [-100, 1, 0, -50, 1, -50], "desligado: %AV e %AH de sempre, sobre o Realizado");
eq(sem[2].map(v).at(-3), 1, "desligado: %AV do período de sempre");

// ── 3. Caixa ou sem nenhum aberto: nem com o checkbox ligado ──────────────────────────────
const semAberto = { ...dados, periodos: periodos.map((p) => ({ ...p, temProvisionado: false })) };
eq(matrizDaApuracao(semAberto, semAberto.linhas, { av: true, ah: true, provisionado: true })[1].length,
  1 + 3 + 3 + 4, "sem aberto em mês nenhum: nem no período");

// ── 4. A reordenação não joga fora o provisionado do total ────────────────────────────────
const reordenadas = recalcular(dados.linhas, dados.linhas);
const admR = reordenadas.find((l) => l.descricao === "ADMINISTRATIVO");
eq(admR.total.provisionado, -40, "recalcular preserva total.provisionado");
eq(admR.valores[0].provisionado, -40, "e o provisionado de cada coluna");

console.log(`✓ dc94 passou — ${n} conferências`);

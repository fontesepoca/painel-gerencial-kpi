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
    { mesAno: "07/2026", valor: -100, percentualAv: 1, percentualAh: 0, provisionado: -40 },
    { mesAno: "08/2026", valor: -50, percentualAv: 1, percentualAh: -50, provisionado: null },
  ],
  total: { valor: -150, media: -75, percentualAv: 1, provisionado: -40 },
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

const calculada = linha("Sub-Total -> Despesas Operacionais", {
  papel: "sub-total",
  calculada: true,
  valores: [
    { mesAno: "07/2026", valor: -100, percentualAv: 1, percentualAh: 0, provisionado: null },
    { mesAno: "08/2026", valor: -50, percentualAv: 1, percentualAh: -50, provisionado: null },
  ],
  total: { valor: -150, media: -75, percentualAv: 1, provisionado: null },
});

const dados = {
  regime: "competencia",
  analise: "ccusto-principal",
  modo: "meses",
  dataInicio: "2026-07-01",
  dataFim: "2026-08-31",
  filiais: ["7"],
  periodos,
  linhas: [linha("ADMINISTRATIVO"), calculada],
  avisos: [],
  fornecedores: [],
  apuradoEm: "2026-10-14T12:00:00Z",
  duracaoMs: 1,
};

const v = (c) => c?.v ?? null;

// ── 1. Com o checkbox ligado ────────────────────────────────────────────────────────────────
const m = matrizDaApuracao(dados, dados.linhas, { av: true, ah: true, provisionado: true });
eq(m[1].map(v), [
  "Descrição",
  "Valor", "AV %", "AH %", "Provisionado", "Total",      // julho: tem aberto
  "Valor", "AV %", "AH %",                              // agosto: todo pago
  "Valor", "AV %", "Média", "AH %", "Provisionado", "Total", // período
], "cabeçalho: colunas novas só em julho e no período");

const adm = m[2].map(v);
eq(adm.slice(1, 6), [-100, 1, 0, -40, -140], "julho: Valor, AV, AH, Provisionado, Total = Valor + Provisionado");
eq(adm.slice(6, 9), [-50, 1, -50], "agosto sem as colunas novas");
eq(adm.slice(-2), [-40, -190], "período: Provisionado e Total");

const sub = m[3].map(v);
eq([sub[4], sub[5], sub.at(-2), sub.at(-1)], [null, null, null, null], "linha calculada: Provisionado e Total vazios");

eq(m[0].length, m[1].length, "a faixa dos meses tem a mesma largura do cabeçalho");

// ── 2. Desligado: a planilha de hoje ──────────────────────────────────────────────────────
const sem = matrizDaApuracao(dados, dados.linhas, { av: true, ah: true, provisionado: false });
eq(sem[1].map(v).includes("Provisionado"), false, "desligado: nenhuma coluna nova");
eq(sem[1].length, 1 + 3 + 3 + 4, "desligado: a largura de sempre");

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

/**
 * dc112 — o Vl. Confirmado no Excel da apuração e na reordenação de linhas (24/11/2026,
 * divergência 23).
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc112_confirmados_no_excel.mjs
 *
 * O arquivo conta o que a tela conta (`lib/confirmados.ts`): desmarcado, a planilha de hoje;
 * marcado, o Vl. Realizado só com o pago, o Vl. Confirmado ao lado e o Total do que estiver
 * na tela. E arrastar uma conta de bloco leva o confirmado junto para os totalizadores.
 *
 * Os números são os da COMPRAS - RAT de novembro/2026, filial 7: valor −35.207,33 (pago +
 * confirmado), confirmado −14.600,15, provisionado −76.707,95.
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
  { mesAno: "10/2026", rotulo: "Outubro/2026", dataInicio: "2026-10-01", dataFim: "2026-10-31", bloco: 0, temProvisionado: false, temConfirmado: false },
  { mesAno: "11/2026", rotulo: "Novembro/2026", dataInicio: "2026-11-01", dataFim: "2026-11-23", bloco: 0, temProvisionado: true, temConfirmado: true },
];

const linha = (descricao, extra = {}) => ({
  id: 1,
  chaveOrdem: descricao,
  chave: "1101",
  descricao,
  papel: null,
  valores: [
    { mesAno: "10/2026", valor: -1000, percentualAv: 1, percentualAh: 0, provisionado: null, confirmado: null },
    { mesAno: "11/2026", valor: -35207.33, percentualAv: 2, percentualAh: 3, provisionado: -76707.95, confirmado: -14600.15 },
  ],
  total: { valor: -36207.33, media: -18103.67, percentualAv: 4, provisionado: -76707.95, confirmado: -14600.15 },
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

const receita = linha("(+) RECEITA BRUTA", {
  papel: "receita-bruta",
  calculada: true,
  valores: [
    { mesAno: "10/2026", valor: 1000, percentualAv: null, percentualAh: 0, provisionado: null, confirmado: null },
    { mesAno: "11/2026", valor: 1000, percentualAv: null, percentualAh: 0, provisionado: null, confirmado: null },
  ],
  total: { valor: 2000, media: 1000, percentualAv: null, provisionado: null, confirmado: null },
});

const dados = {
  regime: "competencia",
  analise: "ccusto-principal",
  modo: "meses",
  dataInicio: "2026-10-01",
  dataFim: "2026-11-23",
  filiais: ["7"],
  periodos,
  linhas: [linha("COMPRAS - RAT"), receita],
  avisos: [],
  fornecedores: [],
  apuradoEm: "2026-11-24T12:00:00Z",
  duracaoMs: 1,
};

const v = (c) => c?.v ?? null;

// ── 1. Desmarcado: a planilha de hoje, com o confirmado dentro do realizado ─────────────────
const hoje = matrizDaApuracao(dados, dados.linhas, { av: false, ah: false, provisionado: false });
eq(hoje[1].map(v), ["Descrição", "Vl. Realizado", "Vl. Realizado", "Vl. Realizado", "Média"],
  "desmarcado: nenhuma coluna nova");
eq(hoje[2].map(v).slice(1, 4), [-1000, -35207.33, -36207.33], "desmarcado: o Vl. Realizado de hoje (pago + confirmado)");
eq(matrizDaApuracao(dados, dados.linhas, { av: false, ah: false, provisionado: false, confirmados: undefined })[1].length,
  hoje[1].length, "ausente vale desmarcado");

// ── 2. Só Confirmados ───────────────────────────────────────────────────────────────────────
const c = matrizDaApuracao(dados, dados.linhas, { av: false, ah: false, provisionado: false, confirmados: true });
eq(c[1].map(v), [
  "Descrição",
  "Vl. Realizado",                                               // outubro: sem confirmado
  "Vl. Realizado", "Vl. Confirmado", "Total (R + C)",           // novembro
  "Vl. Realizado", "Vl. Confirmado", "Total (R + C)", "Média",  // período
], "só Confirmados: R · C · Total (R + C), só onde há confirmado");
eq(c[2].map(v).slice(1, 5), [-1000, -20607.18, -14600.15, -35207.33],
  "novembro: o pago da 9815, o confirmado, e o Total (R + C) = o realizado de hoje");
eq(c[2].map(v).slice(5, 8), [-21607.18, -14600.15, -36207.33], "período");
eq([c[3].map(v)[3], c[3].map(v)[4]], [null, null], "receita: Confirmado e Total vazios");
eq(c[3].map(v)[2], 1000, "receita: o Vl. Realizado é o valor inteiro");
eq(c[0].length, c[1].length, "a faixa dos meses tem a mesma largura do cabeçalho");

// ── 3. Os dois ──────────────────────────────────────────────────────────────────────────────
const cp = matrizDaApuracao(dados, dados.linhas, { av: false, ah: false, provisionado: true, confirmados: true });
eq(cp[1].map(v).slice(2, 6), ["Vl. Realizado", "Vl. Confirmado", "Provisionado", "Total (R + C + P)"],
  "os dois: R · C · P · Total (R + C + P)");
eq(cp[2].map(v).slice(2, 6), [-20607.18, -14600.15, -76707.95, -111915.28],
  "Total (R + C + P) = o Total (R + P) de hoje");

// ── 4. A reordenação não joga fora o confirmado ─────────────────────────────────────────────
const reordenadas = recalcular(dados.linhas, dados.linhas);
const compras = reordenadas.find((l) => l.descricao === "COMPRAS - RAT");
eq(compras.total.confirmado, -14600.15, "recalcular preserva total.confirmado");
eq(compras.valores[1].confirmado, -14600.15, "e o confirmado de cada coluna");

console.log(`✓ dc112 passou — ${n} conferências`);

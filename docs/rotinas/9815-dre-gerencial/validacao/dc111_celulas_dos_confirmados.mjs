/**
 * dc111 — as colunas de dinheiro com o checkbox "Confirmados" (24/11/2026, divergência 23).
 *
 *   node --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc111_celulas_dos_confirmados.mjs
 *
 * Não toca no banco nem na API: é a regra que a tabela e o Excel usam para desenhar a célula.
 *
 * O caso real: COMPRAS - RAT, filial 7, 01 a 23/11/2026, competência. A API manda o valor de
 * sempre (−35.207,33 = pago + confirmado), o confirmado (−14.600,15) e o provisionado
 * (−76.707,95).
 */
import { colunasDoDinheiro, partesDaCelula, rotuloDoTotal } from "@/lib/confirmados.ts";

let falhas = 0;
let n = 0;
function afirmar(ok, oque, detalhe = "") {
  n++;
  console.log(`  ${ok ? "ok   " : "FALHA"} ${oque}${detalhe ? "   " + detalhe : ""}`);
  if (!ok) falhas++;
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("\n══ dc111 — as células dos confirmados ══\n");

// ── As colunas, na ordem: o dinheiro junto ─────────────────────────────────────────────────
afirmar(igual(colunasDoDinheiro(false, false), ["valor"]), "nada ligado: só o Valor, como sempre");
afirmar(igual(colunasDoDinheiro(false, true), ["valor", "provisionado", "total"]), "só Provisionado: como hoje");
afirmar(igual(colunasDoDinheiro(true, false), ["valor", "confirmado", "total"]), "só Confirmados: R · C · Total (R + C)");
afirmar(igual(colunasDoDinheiro(true, true), ["valor", "confirmado", "provisionado", "total"]),
  "os dois: R · C · P · Total (R + C + P)");

afirmar(rotuloDoTotal(false, true) === "Total (R + P)", "rótulo: Total (R + P)");
afirmar(rotuloDoTotal(true, false) === "Total (R + C)", "rótulo: Total (R + C)");
afirmar(rotuloDoTotal(true, true) === "Total (R + C + P)", "rótulo: Total (R + C + P)");

// ── Desmarcado: a célula é a de hoje ───────────────────────────────────────────────────────
const hoje = partesDaCelula(-35207.33, -14600.15, -76707.95, false, false);
afirmar(hoje.realizado === -35207.33, "desmarcado: Vl. Realizado = pago + confirmado, como hoje", `${hoje.realizado}`);

// ── Só Confirmados ─────────────────────────────────────────────────────────────────────────
const c = partesDaCelula(-35207.33, -14600.15, -76707.95, true, false);
afirmar(c.realizado === -20607.18, "Vl. Realizado = só o pago — o número da 9815", `${c.realizado}`);
afirmar(c.confirmado === -14600.15, "Vl. Confirmado");
afirmar(c.total === -35207.33, "Total (R + C) = o Vl. Realizado de hoje", `${c.total}`);
afirmar(c.provisionado === null, "sem o Provisionado ligado, ele não aparece");

// ── Os dois ────────────────────────────────────────────────────────────────────────────────
const cp = partesDaCelula(-35207.33, -14600.15, -76707.95, true, true);
afirmar(cp.realizado === -20607.18 && cp.confirmado === -14600.15 && cp.provisionado === -76707.95,
  "R, C e P separados");
afirmar(cp.total === -111915.28, "Total (R + C + P) = o Total (R + P) de hoje", `${cp.total}`);

// ── Só Provisionado: idêntico a hoje ───────────────────────────────────────────────────────
const p = partesDaCelula(-35207.33, -14600.15, -76707.95, false, true);
afirmar(p.realizado === -35207.33 && p.total === -111915.28 && p.confirmado === null,
  "só o Provisionado: a célula de hoje, intacta");

// ── Linha sem confirmado (receita, CMV, LUCRO BRUTO): o traço, e o Valor inteiro ────────────
const r = partesDaCelula(23069194.9, null, null, true, true);
afirmar(r.realizado === 23069194.9, "receita: o Vl. Realizado é o valor inteiro");
afirmar(r.confirmado === null && r.provisionado === null && r.total === null,
  "receita: Confirmado, Provisionado e Total não se aplicam (traço)");

// Conta de despesa num mês sem nenhum confirmado na linha: zero, não traço.
const z = partesDaCelula(-100, 0, null, true, false);
afirmar(z.confirmado === 0 && z.realizado === -100 && z.total === -100, "conta sem confirmado no mês: 0,00");

// ── Centavos: a subtração não deixa resíduo de ponto flutuante ─────────────────────────────
const f = partesDaCelula(-0.3, -0.1, null, true, false);
afirmar(f.realizado === -0.2, "−0,30 − (−0,10) = −0,20, sem resíduo", `${f.realizado}`);

console.log(falhas === 0 ? `\n✓ dc111 passou — ${n} conferências\n` : `\n✗ ${falhas} falha(s) de ${n}\n`);
process.exit(falhas === 0 ? 0 : 1);

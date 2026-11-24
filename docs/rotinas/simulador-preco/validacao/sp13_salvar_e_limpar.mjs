/**
 * sp13: o "Salvar simulação" e o "Limpar simulações" (spec 2026-11-23-simulador-salvar-limpar).
 *
 * As edições da tabela vivem num RASCUNHO na memória da aba e só vão ao localStorage no Salvar.
 * Aqui se confere a lógica pura que a tela usa: o que aparece na tela, quantas alterações estão
 * pendentes, o que o Salvar grava e o que o Limpar apaga.
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs \
 *     docs/rotinas/simulador-preco/validacao/sp13_salvar_e_limpar.mjs
 */
import {
  ajustesNaTela,
  contarPendencias,
  contarPendenciasDeNovos,
  limparSimulacao,
  salvarRascunhos,
  trocarAjuste,
} from "@/lib/rascunhoSimulacao.ts";

let conferencias = 0;
let falhas = 0;
function eq(obtido, esperado, descricao) {
  conferencias++;
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    falhas++;
    console.log(`FALHA  ${descricao}\n       esperado ${b}, veio ${a}`);
  }
}

// ── ajustesNaTela ────────────────────────────────────────────────────────────
const salvo = { c: { a: { preco: "1" } } };
eq(ajustesNaTela(salvo, { c: { a: { preco: "9" } } }, "c"), { a: { preco: "9" } }, "o rascunho vence o salvo");
eq(ajustesNaTela(salvo, {}, "c"), { a: { preco: "1" } }, "sem rascunho, o salvo");
eq(ajustesNaTela(salvo, {}, "x"), {}, "consulta sem nada: vazio");
eq(ajustesNaTela(salvo, {}, null), {}, "sem consulta na tela: vazio");
eq(ajustesNaTela(salvo, { c: {} }, "c"), {}, "rascunho vazio (desfez tudo) vence o salvo");

// ── trocarAjuste ─────────────────────────────────────────────────────────────
const entrada = { a: { preco: "1" } };
eq(trocarAjuste(entrada, "a", { preco: undefined, percentuais: undefined, st: undefined }), {}, "ajuste vazio apaga a linha");
eq(trocarAjuste(entrada, "a", undefined), {}, "undefined apaga a linha");
eq(trocarAjuste(entrada, "b", { preco: "10" }), { a: { preco: "1" }, b: { preco: "10" } }, "ajuste novo entra");
eq(entrada, { a: { preco: "1" } }, "a entrada não é alterada");

// ── contarPendencias ─────────────────────────────────────────────────────────
eq(contarPendencias(salvo, {}), 0, "sem rascunho: nada pendente");
eq(contarPendencias(salvo, { c: { a: { preco: "1" } } }), 0, "rascunho igual ao salvo: 0 (editou e desfez)");
eq(contarPendencias(salvo, { c: { a: { preco: "2" } } }), 1, "valor diferente: 1");
eq(contarPendencias(salvo, { c: { a: { preco: "1" }, b: { preco: "3" } } }), 1, "linha a mais: 1");
eq(contarPendencias(salvo, { c: {} }), 1, "linha a menos: 1");
eq(contarPendencias({}, { d: { x: { preco: "5" }, y: { st: "1" } } }), 2, "consulta nova com duas linhas: 2");
eq(
  contarPendencias(
    { c: { a: { preco: "1", st: "2" } } },
    { c: { a: { st: "2", preco: "1" } } },
  ),
  0,
  "mesmo ajuste com as chaves em outra ordem: 0",
);
eq(
  contarPendencias(
    { c: { a: { percentuais: { ipi: "1", icms: "2" } } } },
    { c: { a: { percentuais: { icms: "2", ipi: "1" } } } },
  ),
  0,
  "percentuais em outra ordem: 0",
);

// ── salvarRascunhos ──────────────────────────────────────────────────────────
const salvos2 = { c: { a: { preco: "1" } }, d: { x: { preco: "2" } } };
eq(salvarRascunhos(salvos2, { c: {} }), { d: { x: { preco: "2" } } }, "consulta que ficou vazia sai do salvo");
eq(
  salvarRascunhos(salvos2, { e: { y: { preco: "3" } } }),
  { c: { a: { preco: "1" } }, d: { x: { preco: "2" } }, e: { y: { preco: "3" } } },
  "rascunho de outra consulta acrescenta e mantém o resto",
);
eq(
  salvarRascunhos(salvos2, { c: { a: { preco: "7" } } }),
  { c: { a: { preco: "7" } }, d: { x: { preco: "2" } } },
  "rascunho substitui o salvo da consulta",
);
eq(salvos2, { c: { a: { preco: "1" } }, d: { x: { preco: "2" } } }, "o salvo de entrada não é alterado");

// ── limparSimulacao ──────────────────────────────────────────────────────────
const n1 = { id: "n1", descricao: "Novo" };
const s = { consultas: { c: { a: { preco: "1" } } }, novos: [n1] };
eq(limparSimulacao(s, { edicoes: true, novos: false }), { consultas: {}, novos: [n1] }, "só edições");
eq(limparSimulacao(s, { edicoes: false, novos: true }), { consultas: { c: { a: { preco: "1" } } }, novos: [] }, "só novos");
eq(limparSimulacao(s, { edicoes: true, novos: true }), { consultas: {}, novos: [] }, "os dois");
eq(limparSimulacao(s, { edicoes: false, novos: false }), s, "nenhum: igual");

// ── contarPendenciasDeNovos: os produtos novos também esperam o Salvar (24/11/2026) ──
const novoA = { id: "a", descricao: "A", preco: 10, percentuais: {}, st: 0 };
const novoB = { id: "b", descricao: "B", preco: 20, percentuais: {}, st: 0 };
eq(contarPendenciasDeNovos([novoA], null), 0, "novos: sem rascunho, nada pendente");
eq(contarPendenciasDeNovos([novoA], [novoA]), 0, "novos: rascunho igual ao salvo, 0");
eq(contarPendenciasDeNovos([novoA], [novoA, novoB]), 1, "novos: um criado, 1");
eq(contarPendenciasDeNovos([novoA, novoB], [novoB]), 1, "novos: um removido, 1");
eq(contarPendenciasDeNovos([novoA], [{ ...novoA, preco: 11 }]), 1, "novos: um editado, 1");
eq(contarPendenciasDeNovos([], []), 0, "novos: os dois vazios, 0");

console.log(falhas === 0
  ? `sp13: ${conferencias} conferências, todas passaram.`
  : `sp13: ${falhas} de ${conferencias} conferências FALHARAM.`);
process.exit(falhas === 0 ? 0 : 1);

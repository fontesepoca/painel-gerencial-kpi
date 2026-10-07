/**
 * bf3 — as funções puras do front que decidem "de que base é isto": qual base vem marcada
 * no login, se uma resposta é da base da sessão, e as chaves de armazenamento por base.
 *
 *   node --experimental-transform-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/plataforma/validacao/bf3_front_por_base.mjs
 *
 * Roda os módulos REAIS do front no Node, sem navegador e sem banco. As Tasks 10 e 11
 * acrescentam suas seções antes do `console.log` final.
 */
import assert from "node:assert/strict";
import { escolherBaseInicial } from "../../../client-new-kpi/lib/baseInicial.ts";
import { exigirMesmaBase } from "../../../client-new-kpi/lib/baseDaResposta.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}\n  esperado: ${JSON.stringify(esperado)}\n  achou:    ${JSON.stringify(achou)}`);
};

// ── A base que vem marcada ao abrir o login ──────────────────────────────────────────
const lista = [
  { id: "Epoca", rotulo: "Época Distribuição" },
  { id: "MinasRural", rotulo: "Minas Rural" },
];

eq(escolherBaseInicial(lista, "MinasRural"), "MinasRural", "volta para a última que a pessoa usou");
eq(escolherBaseInicial(lista, null), "Epoca", "sem última, a primeira da lista");
// A lembrada pode ter saído da configuração. Devolvê-la mandaria um login para uma base que
// o servidor vai recusar — e a pessoa leria "escolha uma base" sem ter escolhido nada.
eq(escolherBaseInicial(lista, "Inventada"), "Epoca", "a última lembrada que saiu da lista é ignorada");
eq(escolherBaseInicial(lista, "minasrural"), "Epoca", "o id lembrado é comparado como está, não adivinhado");
eq(escolherBaseInicial([], "Epoca"), "", "lista vazia não inventa base: o botão de entrar fica desligado");
eq(escolherBaseInicial([], null), "", "e sem lembrança também");

// ── A resposta é da base da sessão? ──────────────────────────────────────────────────
// REVIEW FOCUS 2 e a defesa em dobro: se um token, um cache ou um proxy errarem, a tela
// NÃO pode mostrar número de outra base.
const epoca = { id: "Epoca", rotulo: "Época Distribuição" };
const minas = { id: "MinasRural", rotulo: "Minas Rural" };

const mesma = { base: epoca, linhas: [] };
eq(exigirMesmaBase(mesma, "Epoca"), mesma, "a resposta da própria base passa, e é a MESMA (não uma cópia)");

for (const [resposta, sessao, oque] of [
  [{ base: minas }, "Epoca", "resposta do Minas Rural numa sessão da Época"],
  [{ base: epoca }, "MinasRural", "e o contrário"],
  [{}, "Epoca", "resposta SEM base (API antiga): recusa, não presume"],
  [{ base: null }, "Epoca", "base nula: recusa"],
]) {
  assert.throws(
    () => exigirMesmaBase(resposta, sessao),
    (e) => e.name === "ApiError" && e.status === 409 && /outra base/.test(e.message),
    oque,
  );
  n++;
}

// Sessão ainda não carregada: não dá para conferir, e conferir é a razão de existir. Recusa.
assert.throws(
  () => exigirMesmaBase({ base: epoca }, undefined),
  (e) => e.name === "ApiError" && e.status === 0,
  "sem a base da sessão, não exibe nada",
);
n++;

// O id é comparado como está: "epoca" e "Epoca" são ids diferentes para quem confere.
assert.throws(() => exigirMesmaBase({ base: epoca }, "epoca"), /outra base/, "a caixa conta");
n++;

console.log(`bf3 — ${n} conferências, todas passaram.`);

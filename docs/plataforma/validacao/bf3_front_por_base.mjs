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
import {
  chaveDaOrdem,
  chaveDeFiliais,
  chaveDeFornecedores,
  chavesAntigasDaOrdem,
} from "../../../client-new-kpi/lib/chavesPorBase.ts";

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

// ── A mesma matrícula em duas bases NÃO divide nada ──────────────────────────────────
// REVIEW FOCUS 2. A matrícula 144 da Época e a 144 do Minas Rural são pessoas diferentes.
eq(chaveDaOrdem("Epoca", "grupo") === chaveDaOrdem("MinasRural", "grupo"), false, "a ordem salva é por base");
eq(chaveDaOrdem("Epoca", "grupo") === chaveDaOrdem("Epoca", "ccusto"), false, "e continua por análise");

eq(
  JSON.stringify(chaveDeFiliais("Epoca", 144)) === JSON.stringify(chaveDeFiliais("MinasRural", 144)),
  false,
  "as filiais em cache: mesma matrícula, bases diferentes, entradas diferentes",
);
eq(
  JSON.stringify(chaveDeFornecedores("Epoca", "29")) === JSON.stringify(chaveDeFornecedores("MinasRural", "29")),
  false,
  "o cadastro de fornecedores em cache também",
);

// A ordem que a pessoa já tinha (a v1, de antes das bases) é da ÉPOCA — era a única que
// existia — e de mais ninguém. Entregá-la ao Minas Rural aplicaria ali uma ordem de outro
// cadastro de linhas.
eq(chavesAntigasDaOrdem("Epoca", "grupo"), ["epoca:dre:ordem:v1:grupo"], "a Época herda a ordem v1");
eq(chavesAntigasDaOrdem("MinasRural", "grupo"), [], "o Minas Rural não herda nada");
eq(chaveDaOrdem("Epoca", "grupo").includes(":v2:"), true, "a chave nova é v2, para nunca colidir com a v1");

// Antes de a sessão chegar não há base: as chaves de cache aceitam `null`, e é isso que
// permite os hooks ficarem desligados (`enabled: false`) em vez de usarem uma base inventada.
eq(chaveDeFiliais(null, null)[2], null, "sem base, a chave diz null — nunca uma base presumida");

console.log(`bf3 — ${n} conferências, todas passaram.`);

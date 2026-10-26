/**
 * tb2 — a troca de base no BFF (26/10/2026). Regras R5–R7 da especificação
 * docs/superpowers/specs/2026-10-26-troca-de-base-design.md, sobre o `sessoes.ts` REAL.
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/plataforma/validacao/tb2_troca_no_bff.mjs
 */
import assert from "node:assert/strict";
import {
  criarSessao,
  encerrarSessao,
  lerSessao,
  lerSessaoPublica,
  trocarBase,
} from "../../../client-new-kpi/lib/servidor/sessoes.ts";

const usuario = (base, matricula) => ({
  matricula,
  nome: "FULANO DE TAL",
  nomeGuerra: "FULANO",
  filiais: ["1"],
  rotinas: ["9815"],
  base: { id: base, rotulo: base === "Epoca" ? "Época Distribuição" : "Minas Rural" },
});
const daqui8h = new Date(Date.now() + 8 * 3600e3);

// Sem outra base: nada a trocar.
const sozinha = criarSessao({ token: "TOKEN-EPOCA-1", usuario: usuario("Epoca", 144) }, daqui8h);
assert.deepEqual(lerSessao(sozinha).trocas, []);

// Com o Minas Rural guardado.
const id = criarSessao(
  { token: "TOKEN-EPOCA", usuario: usuario("Epoca", 144) },
  daqui8h,
  [{ token: "TOKEN-MINAS", usuario: usuario("MinasRural", 77) }],
);
let s = lerSessao(id);
assert.equal(s.token, "TOKEN-EPOCA");
assert.deepEqual(s.trocas, [{ base: { id: "MinasRural", rotulo: "Minas Rural" }, rotinas: ["9815"] }]);
const expiraAntes = s.expiraEm;

// A face pública não leva token nenhum (Review Focus 3).
const publica = JSON.stringify(lerSessaoPublica(id));
assert.ok(!publica.includes("TOKEN-"), "token vazou na sessão pública");

// Base que não está na sessão: recusada, nada muda (R5, Review Focus 4).
assert.equal(trocarBase(id, "Outra"), "base-desconhecida");
assert.equal(lerSessao(id).token, "TOKEN-EPOCA");

// A troca: o token, a matrícula e as trocas passam a ser os da outra base.
assert.equal(trocarBase(id, "MinasRural"), "trocou");
s = lerSessao(id);
assert.equal(s.token, "TOKEN-MINAS");
assert.equal(s.usuario.matricula, 77);
assert.equal(s.trocas[0].base.id, "Epoca");
assert.equal(s.expiraEm, expiraAntes, "a troca estendeu a sessão"); // R6, Review Focus 5

// E de volta.
assert.equal(trocarBase(id, "Epoca"), "trocou");
assert.equal(lerSessao(id).token, "TOKEN-EPOCA");

// Sem sessão.
assert.equal(trocarBase(undefined, "MinasRural"), "sem-sessao");
assert.equal(trocarBase("nao-existe", "MinasRural"), "sem-sessao");

// Sair apaga todas as bases (R7).
encerrarSessao(id);
assert.equal(lerSessao(id), null);
assert.equal(trocarBase(id, "MinasRural"), "sem-sessao");

console.log("✓ tb2 passou");

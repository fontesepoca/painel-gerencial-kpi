/**
 * tb3 — quais trocas de base o menu oferece (R4, 26/10/2026).
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/plataforma/validacao/tb3_trocas_na_tela.mjs
 */
import assert from "node:assert/strict";
import { avisarTroca, destinoDaTroca, ouvirTrocas, rotinaDoCaminho, trocasPermitidas } from "../../../client-new-kpi/lib/trocasDeBase.ts";
import { daBaseDaSessao } from "../../../client-new-kpi/lib/detalheAberto.ts";

const minas = (rotinas) => ({ base: { id: "MinasRural", rotulo: "Minas Rural" }, rotinas });

assert.equal(rotinaDoCaminho("/dre-gerencial"), "9815");
assert.equal(rotinaDoCaminho("/dre-gerencial/detalhe"), "9815");
assert.equal(rotinaDoCaminho("/"), null);
assert.equal(rotinaDoCaminho("/dre-gerencial-antigo"), null);

// Na rotina: só a base que tem AQUELA rotina.
assert.equal(trocasPermitidas([minas(["9815"])], "/dre-gerencial").length, 1);
assert.equal(trocasPermitidas([minas(["9999"])], "/dre-gerencial").length, 0);

// Fora de rotina: toda base com alguma rotina.
assert.equal(trocasPermitidas([minas(["9999"])], "/").length, 1);
assert.equal(trocasPermitidas([minas([])], "/").length, 0);

// Servidor antigo, sem o campo.
assert.deepEqual(trocasPermitidas(undefined, "/"), []);

// A TROCA VOLTA À RAIZ DA ROTINA (revisão final, 26/10/2026). Recarregar uma subrota como o
// detalhamento mostraria o que foi guardado na base anterior — números de uma empresa sob a
// sessão de outra.
assert.equal(destinoDaTroca("/dre-gerencial"), "/dre-gerencial");
assert.equal(destinoDaTroca("/dre-gerencial/detalhe/abc"), "/dre-gerencial");
assert.equal(destinoDaTroca("/"), "/");

// E o detalhamento guardado de outra base não é exibido (falha fechada).
const detalhe = (base) => ({ dados: { base: base === null ? null : { id: base, rotulo: base } } });
assert.ok(daBaseDaSessao(detalhe("Epoca"), "Epoca"));
assert.equal(daBaseDaSessao(detalhe("Epoca"), "MinasRural"), false);
assert.equal(daBaseDaSessao(detalhe(null), "Epoca"), false);
assert.equal(daBaseDaSessao(detalhe("Epoca"), undefined), false);

// AS OUTRAS ABAS SABEM DA TROCA (revisão final, 26/10/2026). A base ativa é da sessão, não da
// aba: sem o aviso, a outra aba continuaria dizendo "Época" e chamando a API com o token do
// Minas Rural.
const recebidas = [];
const parar = ouvirTrocas((base) => recebidas.push(base));
avisarTroca("MinasRural");
await new Promise((r) => setTimeout(r, 50));
assert.deepEqual(recebidas, ["MinasRural"]);
parar();
avisarTroca("Epoca");
await new Promise((r) => setTimeout(r, 50));
assert.deepEqual(recebidas, ["MinasRural"], "continuou ouvindo depois de parar");

console.log("✓ tb3 passou");

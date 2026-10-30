/**
 * dc102 — a tela escolhe o DRE com ou sem as baixas estornadas e da rotina 737 (30/10/2026).
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc102_tela_sem_estornos.mjs
 *
 * A API manda as duas versões montadas (`linhas` e `linhasSemEstornos`, ver dc101); o
 * checkbox "Ocultar baixas estornadas e da rotina 737" do menu Exibição só escolhe uma. Uma
 * API anterior a isto não manda a segunda, e aí a tela é a de sempre — nunca uma tabela vazia.
 */
import assert from "node:assert/strict";
import { linhasDaApuracao } from "../../../../client-new-kpi/lib/baixasEstornadas.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, oque);
};

const deSempre = [{ chaveOrdem: "4401", valores: [{ valor: -64840 }] }];
const semEstornos = [{ chaveOrdem: "4401", valores: [{ valor: -32420 }] }];

eq(linhasDaApuracao({ linhas: deSempre, linhasSemEstornos: semEstornos }, true), semEstornos, "marcado: as sem estornos");
eq(linhasDaApuracao({ linhas: deSempre, linhasSemEstornos: semEstornos }, false), deSempre, "desmarcado: as de sempre (a 9815)");
eq(linhasDaApuracao({ linhas: deSempre }, true), deSempre, "API anterior, sem a segunda lista: as de sempre");
eq(linhasDaApuracao({ linhas: deSempre, linhasSemEstornos: null }, true), deSempre, "segunda lista nula: as de sempre");

console.log(`✓ dc102 passou — ${n} conferências`);

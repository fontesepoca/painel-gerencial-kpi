/**
 * dc90 — o checkbox "Ocultar baixas estornadas e da rotina 737" do detalhamento.
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc90_ocultar_baixas_estornadas.mjs
 *
 * A regra é a do Gabriel em 08/10/2026, escrita como SQL:
 *
 *   pclanc.dtestornobaixa is null and pclanc.codrotinabaixa not like '%737%'
 *
 * com UMA correção acertada com ele: `CODROTINABAIXA` vazio CONTINUA na tela. No Oracle
 * `NULL NOT LIKE '%737%'` não é verdadeiro, e o SQL ao pé da letra esconderia os 625
 * lançamentos sem rotina de baixa da filial 7 em junho/2026 — −466.160,04 que a linha do
 * DRE soma. Medido na mesma data.
 *
 * Não toca no banco nem no navegador.
 */
import assert from "node:assert/strict";
import {
  ocultavel,
  semBaixasEstornadas,
} from "../../../../client-new-kpi/lib/baixasEstornadas.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}: esperava ${esperado}, veio ${achou}`);
};

const lanc = (vPago, dtEstornoBaixa = null, codRotinaBaixa = "750") => ({
  vPago,
  dtEstornoBaixa,
  codRotinaBaixa,
});

// ── ocultavel ───────────────────────────────────────────────────────────────────────────
eq(ocultavel(lanc(-10)), false, "baixa comum fica");
eq(ocultavel(lanc(-10, "2026-06-12T00:00:00")), true, "baixa estornada sai");
eq(ocultavel(lanc(-10, null, "737")), true, "rotina 737 sai");
eq(ocultavel(lanc(-10, null, "1737")), true, "contém 737, como o LIKE '%737%'");
eq(ocultavel(lanc(-10, null, null)), false, "SEM ROTINA DE BAIXA FICA — o NULL do Oracle não vale aqui");
eq(ocultavel(lanc(-10, null, "")), false, "rotina vazia fica");
eq(ocultavel(lanc(-10, null, "73")), false, "73 não é 737");
eq(ocultavel(lanc(-10, "2026-06-12T00:00:00", null)), true, "estornada sai mesmo sem rotina");
// Resposta de uma API anterior a esta mudança: os campos não existem. Nada some.
eq(ocultavel({ vPago: -10 }), false, "campo ausente não oculta");

// ── semBaixasEstornadas ─────────────────────────────────────────────────────────────────
const caso = [
  lanc(-100),
  lanc(-50, "2026-06-12T00:00:00"),
  lanc(50, "2026-06-12T00:00:00"),
  lanc(-30, null, "737"),
  lanc(-20, null, null),
];

const ligado = semBaixasEstornadas(caso, true);
eq(ligado.visiveis.length, 2, "ligado: sobram a baixa comum e a sem rotina");
eq(ligado.ocultos, 3, "ligado: três ocultos");
eq(Math.round(ligado.somaOculta * 100), -3000, "ligado: a soma do que saiu é dita, não escondida");

const desligado = semBaixasEstornadas(caso, false);
eq(desligado.visiveis.length, caso.length, "desligado: tudo volta");
eq(desligado.ocultos, 0, "desligado: nada oculto");
eq(desligado.somaOculta, 0, "desligado: soma oculta zero");
eq(desligado.visiveis[0], caso[0], "desligado: mesmos objetos, mesma ordem");

console.log(`✓ dc90 passou — ${n} conferências`);

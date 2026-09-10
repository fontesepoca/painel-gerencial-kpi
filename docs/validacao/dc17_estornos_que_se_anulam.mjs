/**
 * dc17 — o filtro de estornos esconde só o que se anula, e nunca muda um total.
 *
 *   node --experimental-strip-types --import ./docs/validacao/_alias.mjs docs/validacao/dc17_estornos_que_se_anulam.mjs
 *
 * O que este arquivo protege é a propriedade que torna o filtro aceitável: **a soma antes
 * e depois é a mesma**. Se um dia a regra passar a esconder algo sem par, ou um par
 * dividido entre contas, o detalhamento para de fechar com a linha do DRE — que é o defeito
 * da 9815 que a §4 corrigiu, voltando por outro caminho.
 *
 * Não toca no banco nem no navegador.
 */
import assert from "node:assert/strict";
import {
  pareceEstorno,
  semEstornosQueSeAnulam,
} from "../../client-new-kpi/lib/estornosQueSeAnulam.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}: esperava ${esperado}, veio ${achou}`);
};

// ── pareceEstorno ───────────────────────────────────────────────────────────────────────
eq(pareceEstorno("REF.ESTORN.BORDERO JA BAIXADO"), true, "o caso do reporte");
eq(pareceEstorno("ESTORNO DO CONTAS A PAGAR LANCADO"), true, "estorno");
eq(pareceEstorno("estornado em 09/2026"), true, "minúscula");
eq(pareceEstorno("ESTÔRNO com acento"), true, "acento não escapa");
eq(pareceEstorno("REF.CANCEL.BORDERO JA BAIXADO"), false, "cancelamento não é estorno");
eq(pareceEstorno("PAGAMENTO NORMAL"), false, "lançamento comum");
eq(pareceEstorno(null), false, "histórico nulo");
eq(pareceEstorno(""), false, "histórico vazio");

// ── O caso medido: par que se cancela na mesma conta ────────────────────────────────────
const lanc = (vPago, historico, conta = 3000019, cc = "10") => ({
  vPago,
  historico,
  codConta: conta,
  codCcPrinc: cc,
});

const soma = (linhas) => linhas.reduce((s, l) => s + l.vPago, 0);

const caso = [
  lanc(-2490.06, "CONDOMINIO VM5 AP2A DIRETORIA"),
  lanc(22000, "REF.ESTORN.BORDERO JA BAIXADO. ESTORNO DO CONTAS A PAGAR", 3000068),
  lanc(-45394.24, "CONDOMINIO VM5 GP2 LOGISTICA"),
  lanc(-22000, "REF.ESTORN.BORDERO JA BAIXADO.", 3000068),
  lanc(-1047.8, "POSTAGEM DE CORREIOS 08/2026", 3000024),
];

const r = semEstornosQueSeAnulam(caso);
eq(r.omitidos, 2, "o par sai");
eq(r.visiveis.length, 3, "sobram os três lançamentos de verdade");
eq(Math.round(soma(r.visiveis) * 100), Math.round(soma(caso) * 100), "A SOMA NÃO MUDA");
eq(
  r.visiveis.some((l) => l.historico.includes("ESTORN")),
  false,
  "nenhum estorno do par sobrou",
);

// ── O que NÃO pode ser escondido ────────────────────────────────────────────────────────

// Estorno sem par: afeta o total, e esconder seria mentir sobre a soma.
const semPar = [lanc(-500, "PAGAMENTO"), lanc(300, "ESTORNO DE BAIXA")];
const r2 = semEstornosQueSeAnulam(semPar);
eq(r2.omitidos, 0, "estorno sem par fica");
eq(r2.visiveis.length, 2, "as duas linhas continuam");

// Par dividido entre contas: o total geral fecharia, mas os DOIS subtotais mudariam —
// exatamente o defeito da 9815 com outro nome.
const entreContas = [
  lanc(36726, "REF.ESTORN.BORDERO JA BAIXADO", 3000010),
  lanc(-36726, "REF.ESTORN.BORDERO JA BAIXADO", 3000020),
];
eq(semEstornosQueSeAnulam(entreContas).omitidos, 0, "par em contas diferentes fica");

// Par dividido entre centros de custo, mesma conta: mesmo motivo.
const entreCentros = [
  lanc(1000, "ESTORNO", 3000010, "10"),
  lanc(-1000, "ESTORNO", 3000010, "20"),
];
eq(semEstornosQueSeAnulam(entreCentros).omitidos, 0, "par em centros diferentes fica");

// Valores parecidos mas não opostos: não é par.
const naoCasa = [lanc(1000, "ESTORNO"), lanc(-999.99, "ESTORNO")];
eq(semEstornosQueSeAnulam(naoCasa).omitidos, 0, "um centavo de diferença não casa");

// Lançamento comum de valor oposto a um estorno: não é par de estorno.
const comumOposto = [lanc(1000, "ESTORNO"), lanc(-1000, "PAGAMENTO NORMAL")];
eq(semEstornosQueSeAnulam(comumOposto).omitidos, 0, "o par tem de ser de dois estornos");

// ── Casos de borda que quebram implementação ingênua ────────────────────────────────────

// O negativo vem ANTES do positivo: uma passada só não casaria.
const invertido = [lanc(-700, "ESTORNO"), lanc(700, "ESTORNO")];
eq(semEstornosQueSeAnulam(invertido).omitidos, 2, "ordem invertida casa");

// Três estornos do mesmo valor: dois casam, o terceiro fica.
const tres = [lanc(500, "ESTORNO"), lanc(-500, "ESTORNO"), lanc(-500, "ESTORNO")];
const r3 = semEstornosQueSeAnulam(tres);
eq(r3.omitidos, 2, "só um par casa");
eq(r3.visiveis.length, 1, "o ímpar sobra");
eq(r3.visiveis[0].vPago, -500, "e é o que não achou par");

// Dois pares do mesmo valor: os quatro saem.
const doisPares = [
  lanc(800, "ESTORNO"),
  lanc(-800, "ESTORNO"),
  lanc(800, "ESTORNO"),
  lanc(-800, "ESTORNO"),
];
eq(semEstornosQueSeAnulam(doisPares).omitidos, 4, "dois pares saem");

// Lista sem estorno nenhum não é tocada.
const limpa = [lanc(-100, "PAGAMENTO"), lanc(-200, "OUTRO")];
const r4 = semEstornosQueSeAnulam(limpa);
eq(r4.omitidos, 0, "lista limpa fica igual");
eq(r4.visiveis.length, 2, "sem perder linha");

// A propriedade central, em 200 listas aleatórias: a soma nunca muda.
let iguais = 0;
for (let i = 0; i < 200; i++) {
  const linhas = [];
  const quantas = 1 + ((i * 7) % 9);
  for (let j = 0; j < quantas; j++) {
    const v = (((i * 13 + j * 31) % 41) - 20) * 100 + ((i + j) % 7) / 100;
    const ehEstorno = (i + j) % 3 === 0;
    linhas.push(lanc(v, ehEstorno ? "ESTORNO X" : "PAGTO", 3000000 + ((i + j) % 3)));
  }
  const res = semEstornosQueSeAnulam(linhas);
  if (Math.round(soma(res.visiveis) * 100) === Math.round(soma(linhas) * 100)) iguais++;
}
eq(iguais, 200, "em 200 listas aleatórias, a soma nunca mudou");
n += 199; // as outras 199 comparações do laço

console.log(`dc17: ${n}/${n} asserções passaram.`);

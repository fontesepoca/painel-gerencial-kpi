/**
 * dc85 — a leitura do campo de fornecedor quando ele vira LISTA (`29,253,`).
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/9815-dre-gerencial/validacao/dc85_codigos_digitados.mjs
 *
 * Não toca no banco nem no navegador: a função é pura, e é aqui que mora a regra que a tela
 * só obedece. O que este teste protege é o engano SILENCIOSO — um código a mais ou a menos
 * no filtro não dá erro nenhum, só muda o DRE.
 */
import assert from "node:assert/strict";
import {
  codigosAoFechar,
  codigosDigitados,
  lerDigitacao,
} from "../../../../client-new-kpi/lib/codigosDigitados.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}: esperava ${JSON.stringify(esperado)}, veio ${JSON.stringify(achou)}`);
};

// ── A VÍRGULA FECHA O CÓDIGO ──────────────────────────────────────────────────
eq(lerDigitacao("29,").confirmados, [29], "`29,` fecha o 29");
eq(lerDigitacao("29,253,").confirmados, [29, 253], "`29,253,` fecha os dois");
eq(lerDigitacao("29,253").confirmados, [29], "sem a vírgula final, o 253 ainda está sendo digitado");

// O PONTO DA REGRA: o último pedaço não entra enquanto pode crescer. Selecionar o 2 no
// caminho de quem digita 253 poria um fornecedor errado no filtro, e alguém teria de tirá-lo.
eq(lerDigitacao("29,2").confirmados, [29], "o 2 a caminho do 253 NÃO entra");
eq(lerDigitacao("29,2").pendente, "2", "ele fica pendente, à espera da vírgula ou do fechamento");

// ── MODO LISTA ────────────────────────────────────────────────────────────────
eq(lerDigitacao("29").modoLista, false, "sem vírgula é busca comum");
eq(lerDigitacao("PROCTER").modoLista, false, "nome é busca comum");
eq(lerDigitacao("29,").modoLista, true, "a vírgula liga o modo lista");

// ── O QUE VALE AO FECHAR ──────────────────────────────────────────────────────
eq(codigosAoFechar("29,253"), [29, 253], "fechar com `29,253` leva os dois");
eq(codigosAoFechar("29,253,"), [29, 253], "e a vírgula sobrando não muda nada");

// Sem vírgula nenhuma, fechar é desistir — não confirmar. Escolher por quem só estava
// olhando a lista faria o DRE sair menor sem nada na tela explicando por quê.
eq(codigosAoFechar("29"), [], "`29` sozinho é busca: fechar não seleciona");
eq(codigosAoFechar("PROCTER"), [], "nome sozinho também não");

// ── O QUE O ENTER LEVA ────────────────────────────────────────────────────────
// Teclar Enter é confirmação explícita, e por isso ele leva MAIS do que o clique fora: o
// `29` sozinho entra. A diferença é o gesto — Enter é dizer "este", clicar fora é ir embora.
eq(codigosDigitados("29,253"), [29, 253], "Enter com `29,253` leva os dois");
eq(codigosDigitados("29,253,"), [29, 253], "e a vírgula sobrando não muda nada");
eq(codigosDigitados("29"), [29], "Enter com `29` sozinho leva o 29 — o clique fora não leva");
eq(codigosDigitados(" 29 "), [29], "espaço em volta não atrapalha");
eq(codigosDigitados("PROCTER"), [], "Enter sobre nome não escolhe ninguém: a escolha é na lista");
eq(codigosDigitados(""), [], "Enter no campo vazio não faz nada");

// ── O QUE NÃO É CÓDIGO ────────────────────────────────────────────────────────
eq(lerDigitacao("PROCTER,").confirmados, [], "nome antes da vírgula não vira código");
eq(lerDigitacao("29,,253,").confirmados, [29, 253], "vírgula dobrada é pedaço vazio, e some");
eq(lerDigitacao(" 29 , 253 ,").confirmados, [29, 253], "espaço em volta não atrapalha");
eq(lerDigitacao("0,").confirmados, [], "zero não é fornecedor");
eq(lerDigitacao("29.5,").confirmados, [], "ponto não é dígito");
eq(lerDigitacao("-29,").confirmados, [], "nem o sinal");

// Repetido entra uma vez só: a tela trata cada código como uma decisão, e pedir o 29 duas
// vezes é a mesma decisão.
eq(lerDigitacao("29,29,").confirmados, [29], "repetido entra uma vez");
eq(codigosAoFechar("29,253,29"), [29, 253], "e também na colheita do fechamento");

console.log(`\ndc85 — ${n} conferências, todas passaram.`);

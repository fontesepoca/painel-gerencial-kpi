/**
 * sp8: o recálculo da tela reproduz o SQL, ao milésimo.
 *
 * O simulador tem duas aritméticas para a mesma linha: a do SQL v1, que dá a primeira tela, e a
 * de `client-new-kpi/lib/simuladorPreco.ts`, que refaz tudo a cada preço digitado (decisão D1).
 * Elas são livres para divergir, e **este arquivo é o que as amarra**.
 *
 * DUAS PARTES:
 *
 *   1. Casos feitos à mão, sem banco: o arredondamento do Oracle (meio para longe do zero), a
 *      conta de uma linha inteira e os cantos (índice zero, base reduzida, preço digitado).
 *   2. Com o JSON que a sp6 grava, a resposta REAL do SQL: para cada linha, `calcular()` com o
 *      preço que o próprio SQL usou tem de devolver EXATAMENTE as colunas que o SQL devolveu.
 *      Igualdade exata, sem tolerância: as duas contas são decimais e arredondam nos mesmos
 *      pontos.
 *
 *   node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs \
 *     docs/rotinas/simulador-preco/validacao/sp8_recalculo_reproduz_o_sql.mjs [resposta-da-sp6.json]
 */
import { readFileSync } from "node:fs";
import {
  arredondar,
  de,
  dividirArredondando,
  iguais,
  paraTexto,
} from "@/lib/decimalExato.ts";
import {
  COLUNAS_CALCULADAS,
  calcular,
  lerPercentual,
  lerPreco,
  linhaDeProdutoNovo,
  linhaSimulada,
  percentuaisDe,
  ajusteVazio,
  percentuaisEfetivos,
  precoEfetivo,
  stEfetivo,
} from "@/lib/simuladorPreco.ts";

let conferencias = 0;
let falhas = 0;

function eq(obtido, esperado, descricao) {
  conferencias++;
  const ok = Object.is(obtido, esperado) || JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`FALHA  ${descricao}\n       esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(obtido)}`);
  }
}

// ── 1a. O ROUND do Oracle ─────────────────────────────────────────────────────
eq(paraTexto(arredondar(de(2.5), 0)), "3", "ROUND(2,5) = 3");
eq(paraTexto(arredondar(de(-2.5), 0)), "-3", "ROUND(-2,5) = -3: meio para LONGE do zero (Math.round daria -2)");
eq(paraTexto(arredondar(de(1.0005), 3)), "1.001", "ROUND(1,0005; 3) = 1,001 (em ponto flutuante sairia 1,000)");
eq(paraTexto(arredondar(de(1.0004999), 3)), "1.000", "abaixo do meio desce");
eq(paraTexto(arredondar(de(12), 3)), "12.000", "inteiro ganha as casas");
eq(paraTexto(dividirArredondando(de(10), de(3), 3)), "3.333", "10 / 3");
eq(paraTexto(dividirArredondando(de(2), de(3), 3)), "0.667", "2 / 3 sobe");
eq(paraTexto(dividirArredondando(de(-2), de(3), 3)), "-0.667", "-2 / 3: o sinal não muda o sentido");
eq(paraTexto(dividirArredondando(de(1), de(8), 2)), "0.13", "1 / 8 = 0,125 → 0,13: meio exato, sem perda");
eq(iguais(de(1.5), de(1.50)), true, "1,5 = 1,50");
eq(paraTexto(de(1e-7)), "0.0000001", "notação científica");

// ── 1b. Uma linha inteira, conferida à mão ────────────────────────────────────
// P = 100 · IPI 10% · ICMS entrada 18% sem redução · PIS 1,65% · COFINS 7,6% · sem frete ·
// CBS 0,9% · margem 20% · ICMS saída 18%.
//
//   VLIPI = 10 · VLICMS = 18 · base sem ICMS = 82 · VLPIS = 1,353 · VLCOFINS = 6,232
//   CUSTO_ANTES_CBS = 100 + 10 − 18 − 1,353 − 6,232 = 84,415
//   BASE_CBS = 100 − 18 − 10 = 72 · VLCBS = 0,648 · CUSTO_CALC = 83,767
//   ÍNDICE = 1 − (20 + 18 + 1,65 + 7,6 + 0,9)/100 = 0,5185
//   PR_FUTURO = 83,767 / 0,5185 = 161,5564… → 161,556
//   SQL v2: com ST = 5 (o VLST da tabela de preço), PRECOFINAL = ROUND(161,5564… + 5; 3) = 166,556
//   — o ST entra só no fim, e NÃO no custo nem na base da CBS.
const base = {
  percIpi: 10, percIcmsEnt: 18, percBaseRedEnt: 0, perPis: 1.65, perCofins: 7.6,
  percFreteFob: 0, percCbs: 0.9, margem: 20, percIcmsSaid: 18,
};
eq(calcular(100, base, 5), {
  vlUltPCompra: 100, vlIpi: 10, vlSt: 5, percIcmCusto: 18, vlIcmsEnt: 18, vlPisEnt: 1.353,
  vlCofinsEnt: 6.232, vlFreteFobEnt: 0, custoAntesCbs: 84.415, baseCbs: 72, vlCbs: 0.648,
  custoCalc: 83.767, indice: 0.5185, prFuturo: 161.556, prFinal: 166.556,
}, "linha conferida à mão (v2, ST 5)");

// O ARREDONDAMENTO DA v2 (achado por busca em 23/11/2026): com P = 10,001 e os mesmos
// percentuais, a v1 somava os valores JÁ arredondados e dava custo 8,443; a v2 arredonda a soma
// crua UMA vez e dá 8,442. Se a conta voltasse à forma da v1, este caso acusaria.
eq(calcular(10.001, base, 0).custoAntesCbs, 8.442, "v2: custo antes da CBS é UM ROUND sobre a soma crua (v1 daria 8,443)");

// VLST nulo na PCTABPR: o SQL faz NVL(TP.VLST, 0), e o preço final é o preço futuro.
eq(calcular(100, base, 0).prFinal, 161.556, "ST zero: preço final = preço futuro");

// Base reduzida: 18% × 61,11% = 10,9998, SEM arredondar (o SQL não arredonda PERCICM_CUSTO).
eq(calcular(100, { ...base, percBaseRedEnt: 61.11 }, 0).percIcmCusto, 10.9998, "PERCICM_CUSTO com base reduzida não arredonda");

// Índice zero: NULLIF devolve nulo, e o preço futuro também.
eq(calcular(100, { ...base, margem: 100, percIcmsSaid: 0, perPis: 0, perCofins: 0, percCbs: 0 }, 0).prFuturo,
  null, "índice zero: preço futuro nulo (NULLIF)");
eq(calcular(100, { ...base, margem: 100, percIcmsSaid: 0, perPis: 0, perCofins: 0, percCbs: 0 }, 7).prFinal,
  null, "índice zero com ST: preço final também nulo — não soma ST a um nulo (D16)");

// Índice negativo: o SQL devolve o número negativo, e a conta também (a TELA é quem avisa, D16).
eq(calcular(100, { ...base, margem: 80 }, 0).prFuturo < 0, true, "índice negativo: preço futuro negativo, como o SQL");

// Percentuais nulos contam como zero (o NVL do SQL).
eq(calcular(50, { percIpi: null, percIcmsEnt: null, percBaseRedEnt: null, perPis: null, perCofins: null,
  percFreteFob: null, percCbs: null, margem: null, percIcmsSaid: null }, 0).prFuturo, 50, "tudo nulo: preço futuro = preço");

// PIS negativo: ABS no valor de entrada, mas NÃO no índice.
{
  const r = calcular(100, { ...base, perPis: -1.65 }, 0);
  eq(r.vlPisEnt, 1.353, "PIS negativo: ABS no valor de entrada");
  eq(r.indice, 0.5515, "PIS negativo: sem ABS no índice (1 − 44,85/100)");
}

// ── 1c. O que a pessoa digita ─────────────────────────────────────────────────
eq(lerPreco(""), null, "vazio volta ao preço do SQL");
eq(lerPreco("12,5"), 12.5, "vírgula decimal");
eq(lerPreco("12.5"), 12.5, "ponto decimal, sem vírgula");
eq(lerPreco("1.234,56"), 1234.56, "milhar com ponto e decimal com vírgula");
eq(lerPreco("R$ 1.234,56"), 1234.56, "com símbolo de moeda");
eq(Number.isNaN(lerPreco("abc")), true, "texto não é preço");
eq(Number.isNaN(lerPreco("-5")), true, "negativo não é preço");

eq(lerPercentual("-1,65"), -1.65, "percentual aceita negativo (há PIS/COFINS negativo no cadastro)");
eq(lerPercentual("7,6%"), 7.6, "percentual com o símbolo");
eq(Number.isNaN(lerPercentual("x")), true, "percentual inválido");

// ── 1d. O ajuste da linha: só o que foi alterado, o resto segue o SQL (§3.6) ──
{
  // Uma linha "do SQL" montada a partir da linha conferida à mão.
  const sql = { codProd: 1, descricao: "X", ncm: null, codigoTributacao: null, descricaoTributacao: null,
    tipoImposto: null, percSt: 0, perPisEnt: 1.65, perCofinsEnt: 7.6, percFreteFobEnt: 0,
    perPisSaid: 1.65, perCofinsSaid: 7.6, ...base, ...calcular(100, base, 5) };
  delete sql.perPis; delete sql.perCofins; delete sql.percFreteFob;

  eq(linhaSimulada(sql, undefined), false, "sem ajuste, a linha não é simulada");
  eq(linhaSimulada(sql, { preco: "100" }), false, "preço digitado IGUAL ao do SQL não é simulação");
  eq(linhaSimulada(sql, { preco: "abc" }), false, "preço inválido não simula (a tela avisa)");
  eq(linhaSimulada(sql, { percentuais: { margem: 25 } }), true, "percentual trocado no quadro simula");
  eq(precoEfetivo(sql, { preco: "120,5" }), 120.5, "preço efetivo é o digitado");
  eq(precoEfetivo(sql, { preco: "" }), 100, "preço vazio volta ao do SQL");
  eq(percentuaisEfetivos(sql, { percentuais: { margem: 25 } }).margem, 25, "o trocado vale");
  eq(percentuaisEfetivos(sql, { percentuais: { margem: 25 } }).percIcmsEnt, 18, "o não trocado segue o SQL");

  // Com o ajuste "trocado" para os MESMOS valores do SQL, a conta dá o número do SQL.
  const mesma = calcular(precoEfetivo(sql, { preco: "100" }), percentuaisEfetivos(sql, { percentuais: { margem: 20 } }), stEfetivo(sql, undefined));
  eq(mesma.prFuturo, sql.prFuturo, "ajuste com os valores do SQL dá o preço futuro do SQL");
  eq(mesma.prFinal, sql.prFinal, "e o preço final do SQL");

  // ST (SQL v2): ajuste antigo, sem `st`, vale o do SQL; com `st`, vale o digitado e simula.
  eq(stEfetivo(sql, { percentuais: { margem: 25 } }), 5, "ajuste sem st (salvo antes da v2): vale o ST do SQL");
  eq(stEfetivo(sql, { st: 9 }), 9, "st no ajuste: vale o digitado");
  eq(linhaSimulada(sql, { st: 9 }), true, "ST trocado no quadro simula");
  eq(linhaSimulada(sql, { st: 5 }), false, "ST igual ao do SQL não é simulação");

  // Revisão final de 23/11/2026: a página apagava o ajuste que só tinha ST, porque olhava só
  // preço e percentuais. "Vazio" é não ter NENHUM dos três.
  eq(ajusteVazio(undefined), true, "sem ajuste: vazio");
  eq(ajusteVazio({}), true, "ajuste sem campos: vazio");
  eq(ajusteVazio({ st: 9 }), false, "ajuste só com ST NÃO é vazio");
  eq(ajusteVazio({ preco: undefined, st: 9 }), false, "apagar o preço (Esc) mantém o ST");
  eq(ajusteVazio({ preco: "12" }), false, "ajuste só com preço não é vazio");
  eq(ajusteVazio({ percentuais: { margem: 25 } }), false, "ajuste só com percentual não é vazio");
}

// ── 1e. O produto novo vira uma linha com a mesma conta (D26) ─────────────────
{
  const linha = linhaDeProdutoNovo({ id: "a", descricao: "Teste", preco: 100, percentuais: { ...base } });
  eq(linha.prFuturo, 161.556, "produto novo: mesma conta da linha conferida à mão");
  eq(linha.perPisSaid, 1.65, "produto novo: PIS de saída é o mesmo da entrada, como no SQL");
  eq(linha.vlSt, 0, "produto novo salvo antes da v2, sem st: ST zero");
  eq(linhaDeProdutoNovo({ id: "b", descricao: "T", preco: 100, percentuais: { ...base }, st: 5 }).prFinal, 166.556,
    "produto novo com ST: preço final soma o ST");
}

// ── 2. Contra a resposta REAL do SQL (o JSON da sp6) ──────────────────────────
const arquivo = process.argv[2];
if (arquivo) {
  const { produtos } = JSON.parse(readFileSync(arquivo, "utf8"));
  let linhasComDiferenca = 0;

  for (const p of produtos) {
    if (p.vlUltPCompra === null) continue;
    const r = calcular(p.vlUltPCompra, percentuaisDe(p), p.vlSt ?? 0);
    let difere = false;

    for (const coluna of COLUNAS_CALCULADAS) {
      const sql = p[coluna];
      const tela = r[coluna];
      conferencias++;
      const igual = sql === null || tela === null ? sql === tela : iguais(de(sql), de(tela));
      if (!igual) {
        falhas++;
        difere = true;
        console.log(`DIVERGE  produto ${p.codProd}  ${coluna}: SQL ${sql}  tela ${tela}`);
      }
    }
    if (difere) linhasComDiferenca++;
  }

  console.log(`\nContra o SQL: ${produtos.length} linha(s), ${linhasComDiferenca} com diferença.`);
} else {
  console.log("(Sem o JSON da sp6: só a parte 1. Passe o arquivo para conferir contra o SQL.)");
}

console.log(falhas === 0
  ? `sp8: ${conferencias} conferências, todas passaram.`
  : `sp8: ${falhas} de ${conferencias} conferências FALHARAM.`);
process.exit(falhas === 0 ? 0 : 1);

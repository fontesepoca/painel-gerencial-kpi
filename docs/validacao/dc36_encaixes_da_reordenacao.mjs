/**
 * dc36 — o que acontece com os totais quando uma conta muda de encaixe.
 *
 *   node --import ./docs/validacao/_alias.mjs docs/validacao/dc36_encaixes_da_reordenacao.mjs
 *
 * A dc35 prova que o front reproduz o servidor **na ordem do cadastro**. Esta aqui prova o
 * resto: que mover uma conta muda os totais certos, e só eles.
 *
 * Sem banco e sem API — um DRE de brinquedo com números redondos, onde dá para conferir
 * cada conta de cabeça. É o contrário da dc35, que usa dado real e não deixa ver a
 * aritmética; as duas juntas cobrem o que nenhuma cobre sozinha.
 *
 * O CASO QUE MOTIVOU A MUDANÇA, do Gabriel em 15/09/2026: *"movi verbas margem para baixo de
 * receitas liquidas — o valor de subtotal positivo e lucro bruto devem ser alterados"*.
 */
import assert from "node:assert/strict";
import { ancoraDoEncaixe, recalcular, media } from "@/lib/recalculoDoDre.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}\n  esperado: ${JSON.stringify(esperado)}\n  achou:    ${JSON.stringify(achou)}`);
};

/** Uma linha do payload, com uma coluna só para a conta caber na cabeça. */
const linha = (chaveOrdem, descricao, valor, extra = {}) => ({
  id: null,
  chaveOrdem,
  papel: null,
  chave: chaveOrdem,
  descricao,
  valores: [{ mesAno: "06/2026", valor, percentualAv: null, percentualAh: null }],
  total: { valor, media: valor, percentualAv: null },
  totalizadora: false,
  calculada: false,
  naoSoma: false,
  semMovimento: false,
  zerada: valor === 0,
  cor: null,
  detalhe: null,
  composicao: [],
  ...extra,
});

const ancora = (papel, descricao, valor, composicao = []) =>
  linha(papel, descricao, valor, { papel, calculada: true, totalizadora: true, composicao });

/**
 * O DRE de brinquedo. Os números são os que o servidor mandaria, já coerentes entre si:
 *
 *   RECEITA BRUTA 1000 − ABAT 100 − DEVOL 50 = RECEITAS LIQUIDAS 850
 *   850 + CMV (−400) = LUCRO BRUTO 450
 *   450 + CREDITO 60 = SUBTOTAL POSITIVO 510
 *   Sub-Total = DESPESA A (−200) + DESPESA B (−90) = −290
 *   RESULTADO OPER. = 510 − 290 = 220
 *   Total das Despesas = 60 − 290 + 30 = −200
 *   LUCRO LIQUIDO = 450 − 200 = 250
 */
const DRE = [
  ancora("receita-bruta", "(+) RECEITA BRUTA", 1000),
  ancora("abat-desc", "(-) ABAT./DESC.", -100),
  ancora("devolucao", "(-) DEVOLUCAO", -50),
  ancora("st", "(-) ST", -30),
  ancora("receitas-liquidas", "(=) RECEITAS LIQUIDAS", 850, [{ chaveOrdem: "receita-bruta", rotulo: "x", sinal: 1 }]),
  ancora("cmv", "(=) CMV LIQ.", -400),
  ancora("lucro-bruto", "LUCRO BRUTO", 450, [{ chaveOrdem: "receitas-liquidas", rotulo: "x", sinal: 1 }]),
  linha("credito", "CREDITO PROMOVIDO", 60),
  ancora("subtotal-positivo", "SUBTOTAL POSITIVO", 510, [{ chaveOrdem: "lucro-bruto", rotulo: "x", sinal: 1 }]),
  linha("despA", "DESPESA A", -200),
  linha("despB", "DESPESA B", -90),
  ancora("sub-total", "Sub-Total -> Despesas Operacionais", -290, [{ chaveOrdem: "despA", rotulo: "x", sinal: 1 }]),
  ancora("resultado-operacional", "RESULTADO OPERACIONAL", 220, [{ chaveOrdem: "sub-total", rotulo: "x", sinal: 1 }]),
  linha("posC", "CREDITO POS-OPERACIONAL", 30),
  linha("info", "INFORMATIVA", 999, { naoSoma: true }),
  ancora("total-despesas", "Total das Despesas", -200, [{ chaveOrdem: "sub-total", rotulo: "x", sinal: 1 }]),
  ancora("lucro-liquido", "LUCRO LIQUIDO", 250, [{ chaveOrdem: "lucro-bruto", rotulo: "x", sinal: 1 }]),
  linha("orfa", "ORFA DEPOIS DO LUCRO LIQUIDO", 7, { naoSoma: true }),
];

const valorDe = (linhas, chave) => linhas.find((l) => l.chaveOrdem === chave)?.total.valor;

/** Move `chave` para logo depois de `destino` (ou para o começo, se `destino` for null). */
function mover(linhas, chave, destino) {
  const resto = linhas.filter((l) => l.chaveOrdem !== chave);
  const alvo = linhas.find((l) => l.chaveOrdem === chave);
  const i = destino === null ? -1 : resto.findIndex((l) => l.chaveOrdem === destino);
  return [...resto.slice(0, i + 1), alvo, ...resto.slice(i + 1)];
}

// ── quem recebe o encaixe de cada posição ────────────────────────────────────
//
// O contrato que o modal e o recálculo leem. É aqui que se vê, sem aritmética nenhuma, que
// as sete âncoras do cabeçalho são ATRAVESSADAS: elas são números do faturamento, não somas
// de um bloco, e uma conta arrastada para junto delas não pode alterá-las.
{
  const papelDa = (i) => (i === null ? null : DRE[i].papel);

  eq(papelDa(ancoraDoEncaixe(DRE, 0)), "receitas-liquidas", "logo abaixo da RECEITA BRUTA: atravessa ABAT, DEVOL e ST");
  eq(papelDa(ancoraDoEncaixe(DRE, 3)), "receitas-liquidas", "ao lado do ST: idem — o imposto não recebe conta");
  eq(papelDa(ancoraDoEncaixe(DRE, 4)), "lucro-bruto", "abaixo das RECEITAS LIQUIDAS: atravessa o CMV");
  eq(papelDa(ancoraDoEncaixe(DRE, 7)), "subtotal-positivo", "onde mora o crédito promovido");
  eq(papelDa(ancoraDoEncaixe(DRE, 10)), "sub-total", "no meio das despesas operacionais");
  eq(papelDa(ancoraDoEncaixe(DRE, 13)), "total-despesas", "no bloco pós-operacional");
  eq(ancoraDoEncaixe(DRE, DRE.length - 1), null, "depois do LUCRO LIQUIDO não há âncora nenhuma");
}

// ── a invariante, sem banco ──────────────────────────────────────────────────
// A dc35 já cobre isto com dado real. Aqui é a rede de contenção deste arquivo: se o DRE de
// brinquedo não reproduzir a si mesmo, todos os casos abaixo estão medindo outra coisa.
{
  const igual = recalcular(DRE, DRE);
  for (const l of DRE) {
    eq(valorDe(igual, l.chaveOrdem), l.total.valor, `ordem do cadastro: ${l.descricao} não se mexe`);
  }
}

// ── o caso do Gabriel: o crédito sobe para dentro do cabeçalho ───────────────
{
  const r = recalcular(mover(DRE, "credito", "receitas-liquidas"), DRE);

  eq(valorDe(r, "receitas-liquidas"), 850, "RECEITAS LIQUIDAS não muda: o crédito ficou abaixo dela");
  eq(valorDe(r, "cmv"), -400, "o CMV não recebe nada — ele é o custo apurado, não um bloco que acumula");
  eq(valorDe(r, "lucro-bruto"), 510, "o crédito atravessa o CMV e para no LUCRO BRUTO");
  eq(valorDe(r, "subtotal-positivo"), 510, "o SUBTOTAL POSITIVO chega ao mesmo lugar por outro caminho");
  eq(valorDe(r, "sub-total"), -290, "o Sub-Total não tem nada com isso");
  eq(valorDe(r, "resultado-operacional"), 220, "nem o RESULTADO OPERACIONAL");
  eq(valorDe(r, "total-despesas"), -260, "o Total das Despesas perde o crédito, que subiu para cima do LUCRO BRUTO");
  eq(valorDe(r, "lucro-liquido"), 250, "e o LUCRO LIQUIDO se conserva — o dinheiro mudou de lado, não sumiu");
}

// ── uma despesa operacional vira pós-operacional ─────────────────────────────
{
  const r = recalcular(mover(DRE, "despA", "resultado-operacional"), DRE);

  eq(valorDe(r, "sub-total"), -90, "o Sub-Total perde a DESPESA A");
  eq(valorDe(r, "resultado-operacional"), 420, "e o RESULTADO OPERACIONAL sobe os mesmos 200");
  eq(valorDe(r, "total-despesas"), -200, "o Total das Despesas não muda: a conta continua entre LUCRO BRUTO e LUCRO LIQUIDO");
  eq(valorDe(r, "lucro-liquido"), 250, "e o LUCRO LIQUIDO também não");
}

// ── mover dentro do MESMO encaixe não muda número nenhum ─────────────────────
{
  const r = recalcular(mover(DRE, "despB", "subtotal-positivo"), DRE);
  for (const l of DRE) {
    eq(valorDe(r, l.chaveOrdem), l.total.valor, `troca de vizinho: ${l.descricao} fica igual`);
  }
}

// ── o cabeçalho: a conta ATRAVESSA os impostos e cai nas RECEITAS LIQUIDAS ───
//
// O defeito que o Gabriel encontrou pela tela em 15/09/2026: ele soltou VERBAS MARGEM entre
// RECEITA BRUTA e RECEITAS LIQUIDAS, e a conta caiu no encaixe do `(-) ST`. O ST de janeiro
// encolheu 922 mil e nenhum total se mexeu — a tela passou a mostrar um imposto que não era o
// imposto, que é pior que qualquer total errado: não há contra o que conferir.
//
// `ST`, `PIS`, `COFINS`, `ABAT./DESC.`, `DEVOLUCAO`, `RECEITA BRUTA` e `CMV LIQ.` não somam
// bloco nenhum — são números próprios do faturamento. Hoje a conta os atravessa.
{
  const r = recalcular(mover(DRE, "despA", "devolucao"), DRE);

  eq(valorDe(r, "st"), -30, "o ST continua valendo o imposto apurado — a despesa passou por ele");
  eq(valorDe(r, "receitas-liquidas"), 650, "ela para nas RECEITAS LIQUIDAS, a primeira âncora que soma bloco");
  eq(valorDe(r, "lucro-bruto"), 250, "e desce daí para o LUCRO BRUTO");
  eq(valorDe(r, "sub-total"), -90, "o Sub-Total perde a despesa");
  eq(valorDe(r, "resultado-operacional"), 220, "o RESULTADO OPERACIONAL se conserva: saiu de um lado, entrou do outro");
  eq(valorDe(r, "lucro-liquido"), 250, "e o LUCRO LIQUIDO também — a conta mudou de lugar, não sumiu do cálculo");
}

// ── o caso exato do Gabriel: um crédito solto logo abaixo da RECEITA BRUTA ───
//
// Três âncoras separam essa posição da primeira que soma (ABAT./DESC., DEVOLUCAO, ST). O
// crédito atravessa as três.
{
  const r = recalcular(mover(DRE, "credito", "receita-bruta"), DRE);

  eq(valorDe(r, "abat-desc"), -100, "o ABAT./DESC. não recebe o crédito");
  eq(valorDe(r, "st"), -30, "nem o ST");
  eq(valorDe(r, "receitas-liquidas"), 910, "as RECEITAS LIQUIDAS recebem");
  eq(valorDe(r, "lucro-bruto"), 510, "o LUCRO BRUTO sobe junto");
  eq(valorDe(r, "subtotal-positivo"), 510, "e o SUBTOTAL POSITIVO chega ao mesmo lugar por outro caminho");
  eq(valorDe(r, "lucro-liquido"), 250, "LUCRO LIQUIDO intacto");
}

// ── depois do LUCRO LIQUIDO não há âncora: a conta sai da conta ──────────────
{
  const r = recalcular(mover(DRE, "despB", "orfa"), DRE);
  eq(valorDe(r, "sub-total"), -200, "o Sub-Total perde a DESPESA B");
  eq(valorDe(r, "lucro-liquido"), 340, "e o LUCRO LIQUIDO sobe os 90 que deixaram de ser despesa");
}

// ── linha naoSoma não contribui, esteja onde estiver ─────────────────────────
//
// A INFORMATIVA vale 999 de propósito: se ela fosse somada em algum lugar, o número apareceria
// gritando em qualquer um destes totais.
{
  const r = recalcular(mover(DRE, "info", "despA"), DRE);
  eq(valorDe(r, "sub-total"), -290, "a informativa não entra no Sub-Total nem quando é largada nele");
  eq(valorDe(r, "lucro-liquido"), 250, "e o LUCRO LIQUIDO não se mexe");
}

// ── %AV: a base acompanha o que a tela mostra ────────────────────────────────
{
  const r = recalcular(mover(DRE, "credito", "receitas-liquidas"), DRE);
  const av = (chave) => r.find((l) => l.chaveOrdem === chave)?.valores[0].percentualAv;

  eq(av("receitas-liquidas"), 100, "RECEITAS LIQUIDAS continua marcando 100,000");
  eq(av("receita-bruta"), null, "RECEITA BRUTA não tem %AV — é a própria base das deduções");
  eq(Math.round(av("abat-desc") * 1000) / 1000, -10, "a dedução é percentual da RECEITA BRUTA: −100/1000");
  eq(Math.round(av("lucro-bruto") * 1000) / 1000, 60, "e o LUCRO BRUTO, da LÍQUIDA: 510/850");
}

// ── a composição é refeita pela posição ──────────────────────────────────────
//
// A composição que a API manda descreve os blocos do cadastro. Depois de reordenar ela
// mentiria — e a tela existe para alguém conferir um total somando as parcelas à mão.
{
  const r = recalcular(mover(DRE, "despA", "resultado-operacional"), DRE);
  const parcelas = (chave) => r.find((l) => l.chaveOrdem === chave)?.composicao.map((p) => p.chaveOrdem);

  eq(parcelas("sub-total"), ["despB"], "o Sub-Total passa a listar só a DESPESA B");
  // A conta foi solta DEPOIS do RESULTADO OPERACIONAL, então a âncora dela é a próxima
  // abaixo — o Total das Despesas. O encaixe do RESULTADO OPERACIONAL continua vazio.
  eq(parcelas("resultado-operacional"), ["subtotal-positivo", "sub-total"], "o RESULTADO OPERACIONAL não ganha parcela: nada caiu no encaixe dele");
  eq(parcelas("total-despesas"), ["sub-total", "despA", "posC"], "a DESPESA A vira parcela do Total das Despesas, ao lado do crédito pós-operacional");
  eq(
    r.find((l) => l.chaveOrdem === "total-despesas").composicao.some((p) => p.chaveOrdem === "info"),
    false,
    "e a informativa fica de fora das parcelas, como fica da soma",
  );
}

// ── a média, em centavos inteiros ────────────────────────────────────────────
//
// Dez linhas erraram um centavo aqui na primeira rodada da dc35, todas em `,xx5`: o servidor
// divide `decimal` e vai para o par, e o ponto flutuante do JavaScript não chega lá sozinho.
eq(media(-1222.39, 2), -611.2, "−611,195 vai para o par: −611,20");
eq(media(2175422.55, 2), 1087711.28, "1.087.711,275 vai para o par: ,28");
eq(media(-1222.41, 2), -611.2, "−611,205 vai para o par: −611,20");
eq(media(300, 2), 150, "sem resto, sem arredondamento");
eq(media(100, 3), 33.33, "33,333… trunca para baixo");
eq(media(0, 0), 0, "sem coluna nenhuma, zero — e sem dividir por zero");

console.log(`✓ ${n} conferências`);

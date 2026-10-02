/**
 * dc34 — as três dimensões fecham no mesmo LUCRO LIQUIDO.
 *
 *   node docs/validacao/dc34_tres_dimensoes_concordam.mjs
 *
 * Grupo de Contas, Conta Gerencial e C. Custo Principal são **três recortes do mesmo
 * dinheiro**. Elas agrupam por objetos diferentes — grupo, conta e centro de custo —, e por
 * isso as LINHAS não se comparam. O `LUCRO LIQUIDO`, sim: é a mesma soma vista de três
 * ângulos, e tem que dar o mesmo número.
 *
 * ── Por que esta conferência existe ──
 *
 * Em 14/09/2026 `INDENIZACAO DE MERC. VENC. E AVARIA` passou a não somar. A regra precisou
 * ser escrita três vezes, uma por eixo, e em Grupo de Contas exigiu **extrair a conta do
 * grupo 300 na própria consulta** — a linha não existia ali.
 *
 * Isso é muita peça para manter alinhada por atenção. As formas de quebrar que eu consigo
 * listar são:
 *
 *   • a exceção da consulta de estrutura e a da consulta de despesas discordarem — a linha
 *     aparece zerada e o valor volta calado para dentro do grupo;
 *   • alguém lançar outra conta no centro de custo principal 97, e C. Custo Principal passar
 *     a excluir mais que as outras duas;
 *   • o cadastro reaproveitar um dos códigos (90, 96, 97, 3000165) para outra coisa;
 *   • uma dimensão nova entrar sem a regra.
 *
 * **E as que eu não consigo listar são o motivo de o teste ser este.** Ele não confere
 * nenhuma dessas causas: confere o efeito que todas elas produzem. Se os três números se
 * separarem, alguma coisa quebrou — inclusive alguma que ninguém previu.
 *
 * `Centro de Custo` fica de fora: é a dimensão que nunca funcionou na 9815 e cujos números
 * ninguém conferiu ainda. Ver `docs/DIVERGENCIAS.md` nº 3.
 *
 * PRECISA DA API NO AR, em http://localhost:5207, com o banco alcançável.
 */
import { postar } from "./_postar.mjs";

// A porta sai do ambiente, como nas dc35, dc41 e dc51.
const API = `${process.env.API ?? "http://localhost:5207"}/api/dre-gerencial/apuracao`;

const BASE = {
  filiais: ["7", "12", "25"],
  dataInicio: "2026-06-01",
  dataFim: "2026-07-31",
  regime: "competencia",
  modo: "meses",
};

const DIMENSOES = ["grupo-contas", "conta-gerencial", "ccusto-principal"];

let falhas = 0;
const ok = (condicao, oque) => {
  console.log(`${condicao ? "  ok  " : "FALHA "} ${oque}`);
  if (!condicao) falhas++;
};

const rotulo = (l) => l.descricao.toUpperCase().split(/\s+/).filter(Boolean).join(" ");
const achar = (linhas, nome) => linhas.find((l) => rotulo(l) === nome) ?? null;
const fmt = (v) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function apurar(analise) {
  const r = await postar(API, { ...BASE, analise });
  if (!r?.sucesso) throw new Error(`${analise}: ${r?.mensagem ?? "resposta sem sucesso"}`);
  return r.dados;
}

console.log(`\nCenário: ${BASE.dataInicio} a ${BASE.dataFim}, filiais ${BASE.filiais.join("/")}, ${BASE.regime}\n`);

const medidas = [];
for (const analise of DIMENSOES) {
  const d = await apurar(analise);
  const L = d.linhas;

  const informativa = L.filter((l) => l.naoSoma && !l.calculada && Math.abs(l.total.valor) > 0.005);
  medidas.push({
    analise,
    lucroBruto: achar(L, "LUCRO BRUTO").total.valor,
    lucroLiquido: achar(L, "LUCRO LIQUIDO").total.valor,
    indenizacao: achar(L, "INDENIZACAO DE MERC. VENC. E AVARIA"),
    informativasComValor: informativa,
  });
}

// A LINHA `TOTAL DAS DESPESAS` NÃO EXISTE MAIS — saiu da tela em 21/09/2026, a pedido do
// Gabriel. O que ela mostrava continua valendo como CONCEITO, e é isso que a coluna abaixo
// calcula: tudo o que separa o LUCRO BRUTO do LUCRO LIQUIDO.
//
// Continua sendo conferência útil, e não enfeite: se as três dimensões chegam ao mesmo
// LUCRO LIQUIDO partindo do mesmo LUCRO BRUTO, a diferença tem de ser a mesma nas três. Uma
// delas fora de linha aponta para onde procurar.
const larg = 20;
console.log("  " + "dimensão".padEnd(20) + ["LUCRO BRUTO", "LL - LB", "LUCRO LIQUIDO"].map((c) => c.padStart(larg)).join(""));
for (const m of medidas) {
  console.log(
    "  " + m.analise.padEnd(20)
    + fmt(m.lucroBruto).padStart(larg)
    + fmt(m.lucroLiquido - m.lucroBruto).padStart(larg)
    + fmt(m.lucroLiquido).padStart(larg),
  );
}

// ── a invariante ─────────────────────────────────────────────────────────────
const referencia = medidas[0];
for (const m of medidas.slice(1)) {
  ok(
    Math.abs(m.lucroLiquido - referencia.lucroLiquido) <= 0.005,
    `${m.analise} fecha no mesmo LUCRO LIQUIDO que ${referencia.analise}`
      + (Math.abs(m.lucroLiquido - referencia.lucroLiquido) > 0.005
        ? ` — diferença de ${fmt(m.lucroLiquido - referencia.lucroLiquido)}`
        : ""),
  );
}

// O LUCRO BRUTO vem do faturamento, que não depende de dimensão nenhuma. Se ele divergir,
// o problema não é a regra da informativa — é bem mais fundo, e vale saber disso antes.
for (const m of medidas.slice(1)) {
  ok(
    Math.abs(m.lucroBruto - referencia.lucroBruto) <= 0.005,
    `${m.analise} tem o mesmo LUCRO BRUTO — o faturamento não depende da dimensão`,
  );
}

// ── e a linha existe mesmo nas três ──────────────────────────────────────────
//
// Sem isto a invariante passaria também no cenário em que a regra parou de casar nas TRÊS
// ao mesmo tempo — os números continuariam iguais, e errados nos três.
for (const m of medidas) {
  ok(
    m.indenizacao !== null && m.indenizacao.naoSoma === true,
    `${m.analise}: a linha da indenização existe e está marcada`,
  );
  if (m.indenizacao) {
    ok(
      Math.abs(m.indenizacao.total.valor) > 0.005,
      `${m.analise}: e tem valor (${fmt(m.indenizacao.total.valor)})`,
    );
  }
}

// As três têm que excluir o MESMO valor. É a conferência que pega o caso em que o centro de
// custo 97 recebe uma conta a mais: os LUCRO LIQUIDO se separam, mas esta aqui diz por quê.
const valores = medidas.map((m) => m.indenizacao?.total.valor ?? null);
ok(
  valores.every((v) => v !== null && Math.abs(v - valores[0]) <= 0.005),
  `as três excluem o mesmo valor: ${valores.map(fmt).join(" · ")}`,
);

console.log(falhas === 0 ? "\n✓ dc34 passou" : `\n✗ ${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);

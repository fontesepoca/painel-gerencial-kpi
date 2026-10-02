/**
 * dc62 — A conta principal na tela: as linhas novas, e as subcontas no duplo clique.
 *
 * A dc34 e a dc35 já garantem que a MUDANÇA NÃO MEXEU EM NENHUM TOTAL — as três dimensões
 * seguem fechando no mesmo LUCRO LIQUIDO, e o recálculo do front reproduz a API. O que falta
 * é o outro lado da mesma moeda: que a granularidade realmente mudou, e que o detalhamento
 * acompanhou.
 *
 * As duas pontas precisam concordar. A apuração soma por conta principal; o detalhamento
 * recorta por `CODCCPRINC`. Se as duas expressões divergirem, o duplo clique traz um conjunto
 * diferente do que somou a linha — e o total deixa de fechar SEM NADA QUEBRAR. A dc61 confere
 * isso lendo o fonte; esta aqui confere com dado real.
 *
 * O QUE ELE VERIFICA
 *   1. as linhas de conta agora têm código de conta principal, não de dois dígitos;
 *   2. os centros que antes se fundiam aparecem separados — o caso que motivou a mudança;
 *   3. o detalhamento de uma linha traz SUBCONTAS daquela principal;
 *   4. e a soma do detalhamento bate ao centavo com o valor da linha.
 *
 * USO
 *   node docs/validacao/dc62_subcontas_no_detalhamento.mjs
 */

const API = process.env.API ?? "http://localhost:5207";

const FILTRO = {
  filiais: ["7"],
  dataInicio: "2026-08-01",
  dataFim: "2026-08-31",
  regime: "competencia",
  analise: "ccusto-principal",
};

const dinheiro = (n) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cent = (n) => Math.round(n * 100) / 100;

async function chamar(rota, corpo) {
  const r = await fetch(`${API}/api/dre-gerencial/${rota}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const json = await r.json();
  if (!json.sucesso) throw new Error(json.erros?.[0] ?? json.mensagem ?? "falha");
  return json.dados;
}

let falhas = 0;
const afirmar = (ok, texto, detalhe = "") => {
  console.log(`  ${ok ? "ok  " : "FALHA"} ${texto}${detalhe ? "   " + detalhe : ""}`);
  if (!ok) falhas++;
};

console.log(`\n══ dc62 — a conta principal na tela ══\n`);
console.log(`  API ${API}   ·   filial 7, agosto/2026, competência\n`);

const apuracao = await chamar("apuracao", FILTRO);
const contas = apuracao.linhas.filter((l) => !l.calculada);

// ── 1. As chaves são contas principais ──────────────────────────────────────
// A chave de uma linha de conta é o código do centro principal. Dois dígitos era o formato
// antigo; agora são quatro. O `99` sintético ("NÃO USA/NÃO INFORMADO") é a exceção legítima,
// e continua com dois — ele não é centro de custo nenhum, é o balde de quem não tem.
const chaves = contas.map((l) => l.detalhe?.chave).filter(Boolean);
const curtas = chaves.filter((k) => String(k).length <= 2 && String(k) !== "99");

afirmar(chaves.length > 0, "a apuração devolveu linhas de conta com chave", `${chaves.length}`);
afirmar(curtas.length === 0, "nenhuma chave de dois dígitos sobrou",
  curtas.length ? `sobrou: ${[...new Set(curtas)].join(", ")}` : "");

// ── 2. Os centros que antes se fundiam agora estão separados ────────────────
// O caso que motivou a mudança: `2801` e `2802` eram uma linha só, rotulada pelo `min()` do
// grupo — o nome do 2801. Agora cada um é uma linha.
const rotulos = new Map(contas.map((l) => [String(l.detalhe?.chave), l.descricao]));
const doGrupo28 = [...rotulos.keys()].filter((k) => k.startsWith("28"));

console.log(`\n  ── o grupo 28, que antes era uma linha só ──`);
for (const k of doGrupo28.sort()) console.log(`     ${k}  ${rotulos.get(k)}`);

afirmar(doGrupo28.length > 1, "o antigo grupo 28 virou várias linhas",
  `${doGrupo28.length} linhas`);

// ── 3 e 4. O detalhamento traz as subcontas, e soma a linha ─────────────────
// Escolho a linha de maior valor absoluto entre as que têm detalhamento de lançamentos: é a
// que mais dói se estiver errada, e a que tem mais chance de ter subconta.
const comDetalhe = contas
  .filter((l) => l.detalhe?.tipo === "lancamentos" && Math.abs(l.total?.valor ?? 0) > 0)
  .sort((a, b) => Math.abs(b.total.valor) - Math.abs(a.total.valor));

afirmar(comDetalhe.length > 0, "há linha de conta com detalhamento de lançamentos");

for (const linha of comDetalhe.slice(0, 3)) {
  const { bloco, chave } = linha.detalhe;
  console.log(`\n  ── ${linha.descricao}  (chave ${chave}, bloco ${bloco}) ──`);

  const dados = await chamar("detalhe", { ...FILTRO, tipo: "lancamentos", bloco, chave });
  const lancamentos = dados.lancamentos ?? [];

  const total = cent(lancamentos.reduce((s, l) => s + l.vPago, 0));
  const esperado = cent(linha.total.valor);

  // Os centros que apareceram no detalhamento, e quais são subcontas desta principal.
  const centros = [...new Set(lancamentos.map((l) => String(l.codCentroCusto ?? "")))].sort();
  const subcontas = centros.filter((c) => c.startsWith(`${chave}.`));
  const forasteiros = centros.filter((c) => c !== String(chave) && !c.startsWith(`${chave}.`));

  console.log(`     ${lancamentos.length} lançamentos · ${centros.length} centros distintos`);
  console.log(`     subcontas: ${subcontas.slice(0, 8).join(", ")}${subcontas.length > 8 ? ` … (+${subcontas.length - 8})` : ""}`);

  afirmar(Math.abs(total - esperado) < 0.005,
    `o detalhamento soma a linha`, `${dinheiro(esperado)} · ${dinheiro(total)}`);

  // O coração da mudança: o duplo clique mostra o detalhe que a grade deixou de mostrar.
  // `9998`/`9999` são os sintéticos de "não informou" e "não usa rateio" — não são subconta
  // de ninguém e podem aparecer legitimamente junto do próprio código.
  const soSinteticos = forasteiros.every((c) => c === "9998" || c === "9999" || c === "");
  afirmar(soSinteticos, "o detalhamento não traz centro de outra principal",
    forasteiros.length ? `de fora: ${forasteiros.join(", ")}` : "");
}

console.log(falhas === 0
  ? `\n✓ dc62 passou — a grade agrupa por conta principal e o duplo clique abre as subcontas\n`
  : `\n✗ ${falhas} falha(s)\n`);
process.exit(falhas === 0 ? 0 : 1);

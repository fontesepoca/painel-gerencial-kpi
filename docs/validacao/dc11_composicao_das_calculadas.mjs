/**
 * dc11 — As composições fecham, e a apuração não se moveu?
 *
 * Em 03/09/2026 a consulta de faturamento ganhou SEIS colunas: `STVENDAS`,
 * `STDEVOLUCAO`, `PISVENDAS`, `PISDEVOLUCAO`, `COFINSVENDAS`, `COFINSDEVOLUCAO`. Elas
 * são as MESMAS somas que a consulta já fazia — a linha `STLIQ` é literalmente
 * `sum(VLST) - sum(VLST_DEV)` —, só que devolvidas separadas em vez de subtraídas, para
 * o duplo clique nas três linhas informativas poder mostrar de onde o líquido saiu.
 *
 * <b>Acrescentar coluna a um SELECT não pode mover o valor das outras.</b> É verdade, e é
 * exatamente o tipo de afirmação que este projeto já viu falhar por um motivo lateral —
 * um alias com underscore que zerou uma coluna inteira em silêncio. Daí este script.
 *
 * O QUE CONFERE
 *   1. Cada linha calculada com composição fecha: soma das parcelas = valor da linha,
 *      em CADA mês e no total do período.
 *   2. As três informativas fecham pela identidade nova:
 *        (ST+FECP das vendas) − (ST+FECP das devoluções) = a linha (-) ST
 *      e o mesmo para PIS e COFINS.
 *   3. O cabeçalho não se mexeu: os valores das nove linhas de cabeçalho são impressos
 *      para comparar com a execução anterior, à mão.
 *
 * O QUE ESTE SCRIPT NÃO CONFERE
 *   Que o detalhamento das linhas de despesa continua fechando — isso é a dc6, e ela
 *   precisa ser rodada TAMBÉM, porque é a conferência que cobre as 157 linhas.
 *
 * PREVISÃO REGISTRADA ANTES DE RODAR (commitar antes de executar)
 *   a. Toda composição fecha ao centavo. Zero linhas com diferença.
 *   b. As seis colunas novas voltam DIFERENTES DE ZERO. Se `STVENDAS` vier 0,00 com
 *      `STLIQ` valendo milhões, é o mapeamento do Dapper, não o dado — foi assim que a
 *      coluna de notas apareceu zerada em 02/09.
 *   c. `STVENDAS` é MAIOR que `STLIQ`, porque a devolução é subtraída dele.
 *   d. Os valores do cabeçalho batem com a execução anterior. Se moverem, a hipótese de
 *      que acrescentar coluna é inócuo está errada, e a mudança se reverte apagando as
 *      seis linhas do SELECT.
 *
 * USO
 *   node docs/validacao/dc11_composicao_das_calculadas.mjs
 */

const API = process.env.API ?? "http://localhost:5207";

const FILTRO = {
  filiais: ["7", "12", "25"],
  dataInicio: "2026-08-01",
  dataFim: "2026-08-31",
  regime: "caixa",
  analise: "ccusto-principal",
};

const dinheiro = (n) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CENTAVO = 0.005;

async function apurar() {
  const r = await fetch(`${API}/api/dre-gerencial/apurar`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(FILTRO),
  });
  const j = await r.json();
  if (!j.sucesso) throw new Error("apuração falhou: " + JSON.stringify(j.erros ?? j.mensagem));
  return j.dados;
}

const valorNoMes = (linha, mesAno) =>
  mesAno === null
    ? linha.total.valor
    : (linha.valores.find((v) => v.mesAno === mesAno)?.valor ?? 0);

function somaDasParcelas(linha, todas, mesAno) {
  let total = 0;
  for (const p of linha.composicao ?? []) {
    if (p.valores) {
      total +=
        p.sinal *
        (mesAno === null
          ? p.valores.reduce((s, v) => s + v.valor, 0)
          : (p.valores.find((v) => v.mesAno === mesAno)?.valor ?? 0));
      continue;
    }
    const alvo = todas.find((l) => l.chaveOrdem === p.chaveOrdem);
    if (!alvo) return { total, orfa: p.rotulo };
    total += p.sinal * valorNoMes(alvo, mesAno);
  }
  return { total, orfa: null };
}

const dados = await apurar();
const linhas = dados.linhas;
const meses = [...dados.periodos.map((p) => p.mesAno), null];

console.log(
  `Apurado em ${(dados.duracaoMs / 1000).toFixed(1)} s · ` +
    `${dados.periodos.length} mês(es) · ${linhas.length} linhas\n`,
);

// ── 1 e 2 · toda composição fecha ────────────────────────────────────────────
const comComposicao = linhas.filter((l) => (l.composicao ?? []).length > 0);
let falhas = 0;

for (const linha of comComposicao) {
  for (const mesAno of meses) {
    const { total, orfa } = somaDasParcelas(linha, linhas, mesAno);
    const esperado = valorNoMes(linha, mesAno);
    const dif = esperado - total;
    const rotulo = mesAno ?? "TOTAL";

    if (orfa) {
      console.log(`  FALHOU  ${linha.descricao.trim()} · ${rotulo}: parcela órfã "${orfa}"`);
      falhas++;
    } else if (Math.abs(dif) >= CENTAVO) {
      console.log(
        `  FALHOU  ${linha.descricao.trim()} · ${rotulo}: ` +
          `linha ${dinheiro(esperado)}, parcelas ${dinheiro(total)}, diferença ${dinheiro(dif)}`,
      );
      falhas++;
    }
  }
}

console.log(
  `${comComposicao.length} linhas com composição × ${meses.length} colunas = ` +
    `${comComposicao.length * meses.length} conferências, ${falhas} falha(s).\n`,
);

// ── As três informativas, decompostas ────────────────────────────────────────
console.log("As três informativas — a identidade nova:\n");
for (const rotulo of ["(-) ST", "(-) PIS", "(-) COFINS"]) {
  const linha = linhas.find((l) => l.descricao.trim().toUpperCase() === rotulo);
  if (!linha) {
    console.log(`  ${rotulo}: linha não encontrada`);
    continue;
  }
  console.log(`  ${rotulo} = ${dinheiro(linha.total.valor)}`);
  for (const p of linha.composicao ?? []) {
    const v = (p.valores ?? []).reduce((s, x) => s + x.valor, 0);
    console.log(
      `      ${p.sinal < 0 ? "−" : "+"} ${p.rotulo.padEnd(34)} ${dinheiro(v).padStart(18)}` +
        (v === 0 ? "   ← ZERO: conferir o mapeamento (previsão b)" : ""),
    );
  }
}

// ── 3 · o cabeçalho, para comparar com a execução anterior ───────────────────
console.log("\nCabeçalho — comparar à mão com a execução de antes da mudança:\n");
for (const l of linhas.filter((x) => x.calculada).slice(0, 13)) {
  console.log(`  ${l.descricao.trim().padEnd(36)} ${dinheiro(l.total.valor).padStart(18)}`);
}

console.log(falhas === 0 ? "\nTUDO FECHA." : `\n${falhas} FALHA(S).`);

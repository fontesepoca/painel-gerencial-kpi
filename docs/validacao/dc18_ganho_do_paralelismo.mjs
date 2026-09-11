/**
 * dc18 — O paralelismo entre recortes devolve o tempo esperado?
 *
 * O modo `comparar-anos` custa um par de consultas POR ANO. Em sequência, dois anos custam
 * a soma dos dois; com `Task.WhenAll`, o esperado é o tempo do ano mais lento, mais o que
 * o Oracle cobrar por atender duas varreduras ao mesmo tempo.
 *
 * <b>Os três tempos saem da mesma rodada, e essa é a parte que não pode ser encurtada.</b>
 * Comparar contra um tempo anotado em outro momento não mede paralelismo: o buffer cache
 * do Oracle muda o custo da mesma consulta por um fator de quatro — a primeira execução
 * deste cenário levou 30,3 s e a segunda, idêntica, 7,9 s. Um número frio contra um quente
 * inventa ganho ou perda que não existe.
 *
 * Confere também o que o tempo não diz: as colunas continuam nas datas certas, na ordem
 * certa, e a identidade da receita fecha em cada uma. Paralelismo que embaralha coluna
 * seria um defeito silencioso.
 *
 * USO
 *   node docs/validacao/dc18_ganho_do_paralelismo.mjs
 */

const API = process.env.API ?? "http://localhost:5207";

const FILTRO = {
  filiais: ["7"],
  dataInicio: "2026-09-01",
  dataFim: "2026-09-10",
  regime: "caixa",
  analise: "ccusto-principal",
  modo: "comparar-anos",
  anos: [2025, 2026],
};

const dinheiro = (n) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cent = (n) => Math.round(n * 100) / 100;

async function apurar(corpo) {
  const t = Date.now();
  const r = await fetch(`${API}/api/dre-gerencial/apuracao`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const j = await r.json();
  if (!j.sucesso) throw new Error(j.erros?.[0] ?? j.mensagem ?? "falha");
  return { dados: j.dados, relogioS: (Date.now() - t) / 1000 };
}

console.log(`API: ${API}`);
console.log(
  `Cenário: filial ${FILTRO.filiais.join(", ")}, ${FILTRO.dataInicio.slice(5)} a ${FILTRO.dataFim.slice(5)}, anos ${FILTRO.anos.join(" x ")}\n`,
);

// Uma passada solta primeiro, para que a medição não pague o cache frio de todas as
// outras. O tempo dela é descartado de propósito.
console.log("Aquecendo…");
await apurar({ ...FILTRO, anos: [FILTRO.anos[0]] });

const isolados = [];
for (const ano of FILTRO.anos) {
  const { dados } = await apurar({ ...FILTRO, anos: [ano] });
  isolados.push(dados.duracaoMs / 1000);
}

const { dados, relogioS } = await apurar(FILTRO);
const juntosS = dados.duracaoMs / 1000;

const soma = isolados.reduce((s, x) => s + x, 0);
const maior = Math.max(...isolados);

console.log("\nTEMPO");
FILTRO.anos.forEach((a, i) => console.log(`  ${a} sozinho${" ".repeat(15)}${isolados[i].toFixed(1)} s`));
console.log(`  soma dos anos (o sequencial)   ${soma.toFixed(1)} s`);
console.log(`  os dois juntos, em paralelo    ${juntosS.toFixed(1)} s`);
console.log(`  relógio, com a rede            ${relogioS.toFixed(1)} s`);
console.log(`  ganho sobre o sequencial       ${((1 - juntosS / soma) * 100).toFixed(1)}%`);
console.log(`  custo da concorrência          ${(juntosS - maior).toFixed(1)} s além do ano mais lento\n`);

console.log("COLUNAS");
for (const p of dados.periodos) {
  console.log(`  ${p.rotulo.padEnd(12)} ${p.dataInicio} a ${p.dataFim}`);
}
console.log();

const linha = (rotulo) => {
  const l = dados.linhas.find((x) => x.descricao.trim() === rotulo);
  if (!l) throw new Error(`linha "${rotulo}" não existe`);
  return l;
};

const bruta = linha("(+) RECEITA BRUTA");
const abat = linha("(-) ABAT./DESC.");
const devol = linha("(-) DEVOLUCAO");
const liq = linha("(=) RECEITAS LIQUIDAS");

console.log("IDENTIDADE POR COLUNA  (bruta − abat − devolução = líquida)");
let falhas = 0;
dados.periodos.forEach((p, i) => {
  const v = (l) => cent(l.valores[i].valor);
  const esperado = cent(v(bruta) + v(abat) + v(devol)); // deduções já vêm negativas
  const obtido = v(liq);
  const ok = Math.abs(esperado - obtido) < 0.01;
  if (!ok) falhas++;
  console.log(
    `  ${p.rotulo.padEnd(12)} ${dinheiro(obtido).padStart(18)}  ${ok ? "ok" : `DIVERGE (esperado ${dinheiro(esperado)})`}`,
  );
});

console.log(falhas === 0 ? "\n✓ colunas coerentes" : `\n✗ ${falhas} coluna(s) divergem`);

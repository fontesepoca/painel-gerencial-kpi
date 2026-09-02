/**
 * dc7 — Por que 21 linhas não fecham com o próprio detalhamento?
 *
 * A dc6 mostrou 136/157 fechando ao centavo. As que sobraram se dividem em três casos, e
 * este script busca o dado que distingue um do outro em vez de deduzir.
 *
 * O QUE ELE COMPARA
 *
 * A apuração soma agrupando pela TUPLA COMPLETA — chave mais as três flags
 * (`AntesRO`, `AntesLL`, `AntesLF`) —, e a mesma chave aparece mais de uma vez no DRE com
 * flags diferentes. O detalhamento recorta por chave e por BLOCO, que é uma leitura das
 * flags, não as flags. Se a tradução bloco → flags não for exata, o detalhamento pega um
 * conjunto que a apuração dividiu entre duas linhas.
 *
 * O endpoint `/despesas` devolve justamente essa tupla crua. Para cada chave que falhou,
 * o script mostra:
 *
 *   - todas as linhas de `/despesas` com aquela chave, com as flags e o valor;
 *   - o total do detalhamento de cada bloco daquela chave;
 *   - a quebra do detalhamento por conta, para localizar de onde vem a diferença.
 *
 * USO
 *   node docs/validacao/dc7_diagnostico_do_detalhamento.mjs
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

console.log(`API: ${API}\nApurando e buscando as despesas cruas…\n`);

const [apuracao, despesas] = [
  await chamar("apuracao", FILTRO),
  await chamar("despesas", FILTRO),
];

// Índice das despesas por chave: é a soma que a apuração usou, com a tupla à mostra.
const porChave = new Map();
for (const d of despesas) {
  if (!porChave.has(d.chave)) porChave.set(d.chave, []);
  porChave.get(d.chave).push(d);
}

const comDetalhe = apuracao.linhas.filter((l) => l.detalhe?.tipo === "lancamentos");

console.log(`${comDetalhe.length} linhas de lançamento. Conferindo…\n`);

const problemas = [];
const cacheDetalhe = new Map();

for (const linha of comDetalhe) {
  const { bloco, chave } = linha.detalhe;
  const id = `${bloco}|${chave}`;

  if (!cacheDetalhe.has(id)) {
    cacheDetalhe.set(
      id,
      await chamar("detalhe", { ...FILTRO, tipo: "lancamentos", bloco, chave }),
    );
  }
  const dados = cacheDetalhe.get(id);
  const total = cent((dados.lancamentos ?? []).reduce((s, l) => s + l.vPago, 0));
  const esperado = cent(linha.total.valor);

  if (total !== esperado) {
    problemas.push({ linha, bloco, chave, esperado, total, dados });
  }
}

console.log(`${problemas.length} não fecham.\n${"=".repeat(78)}\n`);

for (const p of problemas) {
  console.log(`${p.linha.descricao.trim()}`);
  console.log(`  chave ${p.chave} · bloco ${p.bloco} · semMovimento=${p.linha.semMovimento}`);
  console.log(`  linha ${dinheiro(p.esperado)}   detalhe ${dinheiro(p.total)}   ` +
              `diferença ${dinheiro(p.total - p.esperado)}`);

  const linhasDaChave = porChave.get(p.chave) ?? [];
  console.log(`\n  /despesas com a chave ${p.chave} — a tupla que a apuração somou:`);
  if (linhasDaChave.length === 0) {
    console.log("    (nenhuma — a apuração não achou despesa para esta chave)");
  }
  for (const d of linhasDaChave) {
    const flags = `RO=${d.antesResultadoOperacional ? "S" : "N"} ` +
                  `LL=${d.antesLucroLiquido ? "S" : "N"} ` +
                  `LF=${d.antesLucroFinal ? "S" : "N"}`;
    console.log(`    ${flags}  ${d.mesAno}  ${dinheiro(d.valor).padStart(16)}  ` +
                `${d.quantidadeLancamentos} lanç.`);
  }

  // De onde vem a diferença: quebra o detalhamento por conta.
  const porConta = new Map();
  for (const l of p.dados.lancamentos ?? []) {
    const k = l.conta ?? "(sem conta)";
    porConta.set(k, (porConta.get(k) ?? 0) + l.vPago);
  }
  const contas = [...porConta.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  console.log(`\n  detalhamento por conta (${contas.length} contas, 6 maiores):`);
  for (const [conta, valor] of contas.slice(0, 6)) {
    console.log(`    ${dinheiro(cent(valor)).padStart(16)}  ${conta}`);
  }

  console.log(`\n${"-".repeat(78)}\n`);
}

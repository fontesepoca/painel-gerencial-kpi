/**
 * dc9 — As CINCO colunas da tela de receita fecham com as linhas do DRE?
 *
 * A dc6 confere só as linhas que abrem duplo clique, e por isso deixou duas colunas do
 * modal sem conferência: `ABAT./DESC.` e `CMV LIQ.` não abrem detalhamento, então o
 * `DESCONTO` e o `CUSTO Liq` da tela nunca foram comparados com a linha correspondente.
 *
 * Este script fecha esse buraco, e de quebra confere a identidade que liga as colunas:
 *
 *     REC.BRUTA − DESCONTO − DEVOLUÇÃO = REC.LÍQUIDA
 *
 * <b>Por que a identidade importa.</b> As colunas do detalhamento não são independentes:
 * a receita bruta é `Σ ptabela·qt`, o desconto é `Σ ptabela·qt − Σ punit·qt`, e a receita
 * líquida é `Σ punit·qt − devolução`. Foi por isso que remover o ST da receita bruta
 * exigiu removê-lo também de `punit` — tirar de um lado só inflaria o desconto pelo ST e
 * deixaria a líquida curta pelo mesmo valor. A prova de que o ST estava nos dois é que o
 * `ABAT./DESC.` era a ÚNICA das quatro linhas que já batia antes da correção: ele é a
 * diferença entre as duas, e o ST se cancelava ali.
 *
 * Uma execução só, para o banco não se mover entre a apuração e o detalhamento.
 *
 * USO
 *   node docs/validacao/dc9_colunas_da_receita.mjs
 *
 * Leva alguns minutos: a apuração e depois a receita por cliente, que sozinha foi medida
 * em 116,9 s.
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
  const j = await r.json();
  if (!j.sucesso) throw new Error(j.erros?.[0] ?? j.mensagem ?? "falha");
  return j.dados;
}

console.log(`API: ${API}\nApurando…`);
const apuracao = await chamar("apuracao", FILTRO);
console.log(`  ${(apuracao.duracaoMs / 1000).toFixed(1)} s\n`);

const linha = (rotulo) => {
  const l = apuracao.linhas.find((x) => x.descricao.trim() === rotulo);
  if (!l) throw new Error(`linha "${rotulo}" não existe na apuração`);
  return cent(l.total.valor);
};

console.log("Buscando a receita por cliente… (pode passar de dois minutos)");
const det = await chamar("detalhe", {
  ...FILTRO,
  tipo: "receita-por-cliente",
  bloco: null,
  chave: null,
});
const c = det.clientes ?? [];
console.log(`  ${c.length} clientes em ${(det.duracaoMs / 1000).toFixed(1)} s\n`);

const soma = (campo) => cent(c.reduce((s, x) => s + x[campo], 0));

// As linhas de dedução são NEGATIVAS no DRE e positivas no detalhamento — o mesmo
// espelhamento de sinal que a tela mostra.
const casos = [
  ["REC.BRUTA", "(+) RECEITA BRUTA", soma("receitaBruta"), linha("(+) RECEITA BRUTA")],
  ["DESCONTO", "(-) ABAT./DESC.", soma("desconto"), -linha("(-) ABAT./DESC.")],
  ["DEVOLUÇÃO", "(-) DEVOLUCAO", soma("devolucao"), -linha("(-) DEVOLUCAO")],
  ["REC.LÍQUIDA", "(=) RECEITAS LIQUIDAS", soma("receitaLiquida"), linha("(=) RECEITAS LIQUIDAS")],
  ["CUSTO Liq", "(=) CMV LIQ.", soma("custoLiq"), -linha("(=) CMV LIQ.")],
];

let falhas = 0;
for (const [coluna, rotulo, detalhe, esperado] of casos) {
  const bate = detalhe === esperado;
  if (!bate) falhas++;
  console.log(
    `${bate ? "ok    " : "FALHOU"} ${coluna.padEnd(12)} ${rotulo.padEnd(24)} ` +
      `detalhe ${dinheiro(detalhe).padStart(16)}  linha ${dinheiro(esperado).padStart(16)}` +
      (bate ? "" : `  DIFERENÇA ${dinheiro(detalhe - esperado)}`),
  );
}

// A identidade, dos dois lados. Se as colunas batem uma a uma, ela fecha por
// construção — mas conferir separa "cada coluna certa" de "o conjunto coerente".
console.log();
const idDet = cent(soma("receitaBruta") - soma("desconto") - soma("devolucao"));
const idLin = cent(
  linha("(+) RECEITA BRUTA") + linha("(-) ABAT./DESC.") + linha("(-) DEVOLUCAO"),
);

for (const [onde, calculado, direto] of [
  ["no detalhamento", idDet, soma("receitaLiquida")],
  ["na linha do DRE", idLin, linha("(=) RECEITAS LIQUIDAS")],
]) {
  const bate = calculado === direto;
  if (!bate) falhas++;
  console.log(
    `${bate ? "ok    " : "FALHOU"} identidade ${onde.padEnd(18)} ` +
      `bruta − desconto − devolução = ${dinheiro(calculado)}, ` +
      `líquida = ${dinheiro(direto)}`,
  );
}

console.log(`\n${falhas === 0 ? "TUDO FECHA" : `${falhas} NÃO FECHA(M)`}`);
process.exit(falhas === 0 ? 0 : 1);

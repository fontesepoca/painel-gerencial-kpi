/**
 * dc6 — O detalhamento soma o valor da linha que foi clicada?
 *
 * Roda a apuração UMA vez e, a partir dela, pede o detalhamento de cada linha que abre
 * duplo clique, comparando o total com o valor da própria linha.
 *
 * **É de propósito que a apuração e os detalhamentos saiam da mesma execução.** Comparar
 * um retrato de ontem com um de hoje mistura diferença de código com diferença de dado —
 * e o dado se move mesmo: entre duas execuções da 9815 em 01/09/2026, sete notas
 * migraram de motivo de devolução e a receita bruta cresceu R$ 547,70 (ver
 * `DIVERGENCIAS.md`, armadilha 2). Aqui não há número de ontem: cada linha é conferida
 * contra ela mesma, no mesmo instante.
 *
 * O que se espera de cada comparação é igualdade exata, ao centavo. É isso que a
 * divergência 4 promete, e a única forma de saber se ela sobreviveu ao caminho inteiro.
 *
 * USO
 *   node docs/validacao/dc6_ponta_a_ponta.mjs
 *   API=http://localhost:5207 node docs/validacao/dc6_ponta_a_ponta.mjs
 *
 * Leva alguns minutos: a apuração sozinha demora, e a receita por cliente foi medida em
 * 116,9 s. As linhas de lançamento respondem entre 0,2 s e 2,3 s.
 */

const API = process.env.API ?? "http://localhost:5207";

/** O cenário do print de 01/09/2026 — o único com referência exportada da 9815. */
const FILTRO = {
  filiais: ["7", "12", "25"],
  dataInicio: "2026-08-01",
  dataFim: "2026-08-31",
  regime: "caixa",
  analise: "ccusto-principal",
};

const dinheiro = (n) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Duas casas antes de comparar: são milhares de decimais somados em ponto flutuante. */
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

/**
 * O que somar em cada tela, e com que sinal.
 *
 * A devolução é o único caso com sinal trocado: o DRE mostra `(-) DEVOLUCAO` negativa e o
 * detalhamento lista os valores positivos, como a 9815 faz nas duas telas.
 */
function totalDoDetalhe(detalhe, dados, descricao) {
  const soma = (linhas, campo) => cent(linhas.reduce((s, l) => s + l[campo], 0));

  if (detalhe.tipo === "lancamentos") return soma(dados.lancamentos ?? [], "vPago");
  if (detalhe.tipo === "devolucao-por-motivo") return -soma(dados.motivos ?? [], "vlDevolucao");

  // ST, PIS e COFINS: a linha do DRE mostra a dedução negativa, e a coluna soma positivo.
  if (detalhe.tipo === "imposto-por-produto") return -soma(dados.impostos ?? [], "liquido");

  // QUATRO linhas abrem a MESMA tela de receita por cliente; o que muda é a coluna que
  // fecha com cada uma. `ABAT./DESC.` e `CMV LIQ.` entraram em 03/09/2026 — antes disso
  // este trecho mandava tudo que não fosse "LIQUIDA" para `receitaBruta`, e as duas
  // apareceram como falha de 60 e 94 milhões. Era a conferência que não sabia ler a tela
  // nova, não a tela.
  //
  // As duas novas são deduções: a linha do DRE mostra negativo, a coluna soma positivo.
  if (descricao.includes("ABAT")) return -soma(dados.clientes ?? [], "desconto");
  if (descricao.includes("CMV")) return -soma(dados.clientes ?? [], "custoLiq");

  const campo = descricao.includes("LIQUIDA") ? "receitaLiquida" : "receitaBruta";
  return soma(dados.clientes ?? [], campo);
}

const quantas = (dados) =>
  (dados.lancamentos ?? dados.motivos ?? dados.impostos ?? dados.clientes ?? []).length;

console.log(`API: ${API}`);
console.log(
  `Cenário: ${FILTRO.dataInicio} a ${FILTRO.dataFim}, ${FILTRO.regime}, ` +
    `${FILTRO.analise}, filiais ${FILTRO.filiais.join("/")}\n`,
);

console.log("Apurando…");
const inicio = Date.now();
const apuracao = await chamar("apuracao", FILTRO);
console.log(
  `  ${apuracao.linhas.length} linhas em ${(apuracao.duracaoMs / 1000).toFixed(1)} s\n`,
);

const comDetalhe = apuracao.linhas.filter((l) => l.detalhe !== null);
console.log(`${comDetalhe.length} linhas abrem detalhamento.\n`);

// As duas linhas de receita usam a mesma consulta; uma chamada serve para as duas, e
// cada chamada dessas custa quase dois minutos.
let receita = null;
const resultados = [];

for (const linha of comDetalhe) {
  const nome = linha.descricao.trim();
  const esperado = cent(linha.total.valor);

  try {
    let dados;
    if (linha.detalhe.tipo === "receita-por-cliente" && receita) {
      dados = receita;
    } else {
      dados = await chamar("detalhe", {
        ...FILTRO,
        tipo: linha.detalhe.tipo,
        bloco: linha.detalhe.bloco,
        chave: linha.detalhe.chave,
      });
      if (linha.detalhe.tipo === "receita-por-cliente") receita = dados;
    }

    const obtido = totalDoDetalhe(linha.detalhe, dados, nome);
    const bate = obtido === esperado;

    resultados.push({ nome, esperado, obtido, bate, itens: quantas(dados) });
    console.log(
      `${bate ? "ok    " : "FALHOU"} ${nome.padEnd(36).slice(0, 36)} ` +
        `linha ${dinheiro(esperado).padStart(16)}  detalhe ${dinheiro(obtido).padStart(16)}` +
        `  ${String(quantas(dados)).padStart(6)} itens` +
        (bate ? "" : `  DIFERENÇA ${dinheiro(obtido - esperado)}`),
    );
  } catch (e) {
    resultados.push({ nome, erro: String(e.message) });
    console.log(`ERRO   ${nome.padEnd(36).slice(0, 36)} ${e.message}`);
  }
}

const falhas = resultados.filter((r) => !r.bate);
console.log(
  `\n${resultados.length - falhas.length}/${resultados.length} fecham ao centavo. ` +
    `Tempo total: ${((Date.now() - inicio) / 1000).toFixed(0)} s.`,
);

if (falhas.length > 0) {
  console.log("\nNão fecharam:");
  for (const f of falhas) {
    console.log(
      f.erro
        ? `  ${f.nome}: ${f.erro}`
        : `  ${f.nome}: linha ${dinheiro(f.esperado)}, detalhe ${dinheiro(f.obtido)}`,
    );
  }
}

process.exit(falhas.length === 0 ? 0 : 1);

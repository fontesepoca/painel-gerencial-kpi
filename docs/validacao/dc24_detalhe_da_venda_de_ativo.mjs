/**
 * dc24 — o detalhamento de RECEITA VENDA ATIVO, campo a campo contra a 9815.
 *
 *   node docs/validacao/dc24_detalhe_da_venda_de_ativo.mjs
 *
 * O valor esperado não é um total: é **o lançamento inteiro**, como a 9815 exportou em
 * `receita_venda.xlsx` (11/09/2026, filial 28, agosto/2026, C. Custo Principal). Conferir só
 * a soma deixaria passar data trocada, fornecedor vazio ou histórico nulo — e é justamente o
 * histórico que vem por um caminho que nenhum outro lançamento usa, o CIAP.
 *
 * **As quatro dimensões entram.** A linha injetada tem uma CHAVE DIFERENTE em cada uma
 * (`400`, `85`, `4000004`, `8501`), e o detalhamento recorta por essa chave: basta uma
 * divergir entre a apuração e o detalhamento para a tela abrir vazia numa dimensão só, que é
 * o tipo de defeito que ninguém encontra por acaso.
 *
 * Este arquivo também é a lápide de um erro meu: em 11/09/2026 eu bloqueei este
 * detalhamento, supondo — sem verificar — que a consulta de lançamentos só sabia ler
 * `PCLANC`. Ela já trazia o mesmo `union all` de `PCNFSAID`/`PCPREST` que a 9815 usa.
 */

const API = process.env.API ?? "http://localhost:5207";

const BASE = {
  filiais: ["28"],
  dataInicio: "2026-08-01",
  dataFim: "2026-08-31",
  regime: "competencia",
  tipo: "lancamentos",
  // AntesRO = 'N' e AntesLL = 'S': o bloco entre RESULTADO OPERACIONAL e LUCRO LIQUIDO.
  bloco: "pos-operacional",
};

/** A chave da linha injetada em cada dimensão — ver os `union all` de `DreGerencialQueries`. */
const CHAVES = {
  "grupo-contas": "400",
  "ccusto-principal": "85",
  "conta-gerencial": "4000004",
  "centro-custo": "8501",
};

/** A linha de `receita_venda.xlsx`, como a 9815 a exportou. */
const DA_9815 = {
  recNum: 0,
  historico: "CHASSI C/ MOTOR E CAB. 10/11 CH 9534N8242BR118465",
  vPago: 225000,
  numNota: 400,
  duplic: "1",
  codFornec: 174697,
  fornecedor: "TOP AGRONEGOCIOS LTDA",
  nomeFunc: "LORRANI.BEATRIZ",
  indice: "A",
  numTrans: 3081026,
  numBanco: 168,
  // Serial 46259 da planilha, nas quatro colunas de data.
  dtLanc: "2026-08-25",
  dtPagto: "2026-08-25",
  dtCompetencia: "2026-08-25",
  dtCompensacao: "2026-08-25",
};

const soData = (v) => (typeof v === "string" ? v.slice(0, 10) : v);

let n = 0;
let falhas = 0;
const eq = (achou, esperado, oque) => {
  n++;
  if (achou !== esperado) {
    falhas++;
    console.log(`  ✗ ${oque}: esperado ${JSON.stringify(esperado)}, achou ${JSON.stringify(achou)}`);
  }
};

async function detalhar(analise) {
  const r = await fetch(`${API}/api/dre-gerencial/detalhe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...BASE, analise, chave: CHAVES[analise] }),
  });
  const j = await r.json();
  if (!j.sucesso) throw new Error(j.erros?.[0] ?? j.mensagem ?? "falha");
  return j.dados.lancamentos ?? [];
}

console.log(`API: ${API}`);
console.log("Filial 28, agosto/2026, competência — contra receita_venda.xlsx\n");

for (const analise of Object.keys(CHAVES)) {
  const lancamentos = await detalhar(analise);
  console.log(`${analise} (chave ${CHAVES[analise]}): ${lancamentos.length} lançamento(s)`);

  eq(lancamentos.length, 1, `${analise}: quantidade de lançamentos`);
  const l = lancamentos[0];
  if (!l) continue;

  // Campo a campo. O histórico merece destaque: ele não vem de PCLANC.HISTORICO como todos
  // os outros, e sim do produto do CIAP — `max(PCPRODCIAP.DESCRICAO)`. Se esse subselect
  // quebrar, a linha continua somando certo e aparece sem descrição nenhuma.
  for (const [campo, esperado] of Object.entries(DA_9815)) {
    const achou = campo.startsWith("dt") ? soData(l[campo]) : l[campo];
    eq(achou, esperado, `${analise}.${campo}`);
  }
}

// ── o detalhamento fecha com a linha do DRE ──────────────────────────────────
//
// A conferência que importa para quem usa: o total da tela de detalhe é o valor da célula
// que foi clicada. Sem ela, os dois lados podem estar consistentes consigo mesmos e
// discordar entre si.
console.log("\nO DETALHE FECHA COM A LINHA DO DRE");
const apuracao = await (
  await fetch(`${API}/api/dre-gerencial/apuracao`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filiais: BASE.filiais,
      dataInicio: BASE.dataInicio,
      dataFim: BASE.dataFim,
      regime: BASE.regime,
      analise: "ccusto-principal",
    }),
  })
).json();

const linha = apuracao.dados.linhas.find((x) => x.descricao.trim() === "RECEITA VENDA ATIVO");
const lancamentos = await detalhar("ccusto-principal");
const soma = lancamentos.reduce((s, x) => s + x.vPago, 0);

eq(Math.round(soma * 100) / 100, 225000, "soma do detalhamento");
eq(Math.round((linha?.total.valor ?? 0) * 100) / 100, 225000, "valor da linha no DRE");
console.log(`  linha ${linha?.total.valor}  ·  detalhe ${soma}`);

// A linha precisa OFERECER o detalhamento. Foi o que a guarda de 11/09/2026 tirou.
eq(linha?.detalhe?.tipo, "lancamentos", "a linha abre detalhamento");
eq(linha?.detalhe?.bloco, "pos-operacional", "no bloco certo");
eq(linha?.detalhe?.chave, "85", "com a chave certa");

console.log(
  falhas === 0
    ? `\n✓ dc24: ${n}/${n} conferências passaram.`
    : `\n✗ dc24: ${falhas} de ${n} falharam.`,
);
process.exitCode = falhas === 0 ? 0 : 1;

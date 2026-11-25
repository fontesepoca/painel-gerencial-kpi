// ============================================================================
// sp6: a consulta PAGINADA do simulador, pela API, com a sessão de quem roda
//
// Desde 24/11/2026 cada página é uma consulta ao Oracle (spec 2026-11-24-simulador-
// paginacao-no-backend). Este script confere, contra o banco de verdade, o que os
// testes sem banco não alcançam:
//   - página 1 e página 2 sem linha repetida entre elas (a ordem é estável);
//   - o total igual ao da consulta inteira de antes (filial 7, região 90: 9.811);
//   - a página 1 começando na classe A;
//   - a busca "VANISH" (32 na medição da sp14), a classe A sozinha (1.102) e uma busca
//     com "%" (texto, não curinga — não pode dar erro);
//   - os códigos do "ver só os simulados" trazendo só esses produtos;
//   - as recusas: página 0, classe "D", busca de 61 caracteres, 501 códigos, fornecedor 0 ou
//     negativo, 51 fornecedores;
//   - vários fornecedores (24/11/2026): com dois ou mais na linha de comando ("234,500"), o
//     total da lista é a soma dos totais de cada um; sem nenhum, a lista vazia = todos;
//   - coluna sempre nula ou zero (alias que o Dapper não casou — armadilha 4 da 9815).
//
// Grava a união das páginas 1, 2 e 50 em JSON no formato { produtos: [...] }: é a
// entrada da parte 2 da sp8 (o recálculo da tela contra o SQL).
// A credencial vem do ambiente e nunca é impressa:
//
//   node --env-file=.env.validacao \
//     --import ./docs/rotinas/9815-dre-gerencial/validacao/_autenticar.mjs \
//     docs/rotinas/simulador-preco/validacao/sp6_consulta_pela_api.mjs <filial> <regiao> [fornecedores, ex.: 234,500]
// ============================================================================
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { postar } from "../../9815-dre-gerencial/validacao/_postar.mjs";

const API = process.env.API ?? "http://localhost:5207";
const [codFilial, regiao, fornecedor] = process.argv.slice(2);

if (!codFilial || !regiao) {
  console.error("Uso: sp6_consulta_pela_api.mjs <filial> <regiao> [fornecedores, ex.: 234,500]");
  process.exit(2);
}

const filtro = {
  codFilial,
  numRegiao: Number(regiao),
  fornecedores: fornecedor ? fornecedor.split(",").map(Number) : [],
};
const ehAMedicao = codFilial === "7" && regiao === "90" && !fornecedor;

let conferencias = 0;
let falhas = 0;
function ok(condicao, descricao, detalhe = "") {
  conferencias++;
  console.log(`${condicao ? "ok   " : "FALHA"}  ${descricao}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!condicao) falhas++;
}

/** Pede uma página e devolve { pagina, segundos } — ou o envelope de erro em `erro`. */
async function pedir(extra) {
  const inicio = Date.now();
  // O `postar` devolve o envelope já lido: { sucesso, dados, mensagem, erros }.
  const corpo = await postar(`${API}/api/simulador-preco/consulta`, { ...filtro, ...extra });
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  return corpo?.sucesso
    ? { pagina: corpo.dados.pagina, base: corpo.dados.base, segundos }
    : { erro: corpo?.mensagem ?? "sem mensagem", segundos };
}

const chave = (p) => `${p.codProd}|${p.codigoTributacao ?? "-"}#${p.ocorrencia}`;

// ── Páginas sem filtro ────────────────────────────────────────────────────────
const p1 = await pedir({ pagina: 1 });
if (p1.erro) {
  console.error(`A página 1 falhou em ${p1.segundos} s: ${p1.erro}`);
  process.exit(1);
}
console.log(`Base: ${p1.base?.rotulo} · filial ${codFilial} · região ${regiao}` +
  (fornecedor ? ` · fornecedores ${fornecedor}` : ""));
console.log(`Página 1: ${p1.segundos} s · ${p1.pagina.itens.length} linhas · total ${p1.pagina.totalItens} · ${p1.pagina.totalPaginas} páginas\n`);

const p2 = await pedir({ pagina: 2 });
const p50 = await pedir({ pagina: 50 });
console.log(`Página 2: ${p2.segundos} s · página 50: ${p50.segundos} s`);

ok(p1.pagina.itens.length === Math.min(100, p1.pagina.totalItens), "a página 1 tem 100 linhas (ou o total, se menor)");
if (ehAMedicao) ok(p1.pagina.totalItens === 9811, "total = 9.811 (o da consulta inteira, filial 7 região 90)", `veio ${p1.pagina.totalItens}`);
ok(p1.pagina.itens[0]?.classeVenda === "A", "a página 1 começa na classe A", `veio ${p1.pagina.itens[0]?.classeVenda}`);
if (!p2.erro) {
  const naPrimeira = new Set(p1.pagina.itens.map(chave));
  const repetidas = p2.pagina.itens.filter((p) => naPrimeira.has(chave(p)));
  ok(repetidas.length === 0, "nenhuma linha da página 2 repete a página 1", repetidas.map(chave).join(", "));
}
const ocorrencias = p1.pagina.itens.map((p) => p.ocorrencia);
ok(ocorrencias.every((n) => Number.isInteger(n) && n >= 1), "toda linha tem ocorrência ≥ 1 (o Oracle numerou as repetições)");

// O fornecedor do produto (spec 2026-11-24-simulador-coluna-codigo-e-fornecedor).
const semFornecedor = p1.pagina.itens.filter((p) => p.codFornec === null || p.codFornec === undefined);
ok(semFornecedor.length === 0, "toda linha da página 1 traz codFornec",
  semFornecedor.map((p) => p.codProd).join(", "));
if (filtro.fornecedores.length > 0) {
  const fora = p1.pagina.itens.filter((p) => !filtro.fornecedores.includes(p.codFornec));
  ok(fora.length === 0, "com filtro de fornecedor, o codFornec de cada linha está na lista",
    fora.map((p) => `${p.codProd}→${p.codFornec}`).join(", "));
}

// A classe de tributação e o CST (spec 2026-11-25-simulador-classe-de-tributacao-e-cst): as duas
// propriedades vêm em toda linha (nulas quando o NCM não tem tributação). A contagem de baixo é o
// sinal do Dapper: se NENHUMA linha com tributação trouxer cClassTrib, desconfie do nome da coluna
// — o Dapper deixa vazio sem erro quando não casa o nome.
const semAsChaves = p1.pagina.itens.filter((p) => !("cClassTrib" in p) || !("cst" in p));
ok(semAsChaves.length === 0, "toda linha da página 1 traz as propriedades cClassTrib e cst",
  semAsChaves.map((p) => p.codProd).join(", "));
const comTributacao = p1.pagina.itens.filter((p) => p.codigoTributacao !== null && p.codigoTributacao !== undefined);
const comClasse = comTributacao.filter((p) => p.cClassTrib !== null);
console.log(`  ${comClasse.length} de ${comTributacao.length} linhas com tributação trazem cClassTrib.`);

// ── Filtros ──────────────────────────────────────────────────────────────────
const vanish = await pedir({ pagina: 1, busca: "VANISH" });
ok(!vanish.erro, `busca "VANISH" responde (${vanish.segundos} s)`, vanish.erro ?? `${vanish.pagina?.totalItens} linhas`);
if (ehAMedicao && !vanish.erro) ok(vanish.pagina.totalItens === 32, "busca VANISH = 32 (sp14)", `veio ${vanish.pagina.totalItens}`);

const porCodigo = await pedir({ pagina: 1, busca: String(p1.pagina.itens[0].codProd) });
ok(!porCodigo.erro && porCodigo.pagina.itens.every((p) => p.codProd === p1.pagina.itens[0].codProd),
  "busca pelo código traz só esse produto");

const soA = await pedir({ pagina: 1, classes: ["A"] });
ok(!soA.erro && soA.pagina.itens.every((p) => p.classeVenda === "A"), "classe A sozinha traz só A");
if (ehAMedicao && !soA.erro) ok(soA.pagina.totalItens === 1102, "classe A = 1.102 (sp14)", `veio ${soA.pagina.totalItens}`);

const abc = await pedir({ pagina: 1, classes: ["A", "B", "C"] });
ok(!abc.erro && abc.pagina.totalItens === p1.pagina.totalItens, "A, B e C juntas = sem filtro (mesmo total)");

const porcento = await pedir({ pagina: 1, busca: "50%" });
ok(!porcento.erro, `busca "50%" não dá erro (o % é texto, não curinga)`, porcento.erro ?? `${porcento.pagina.totalItens} linhas`);

const tres = [...new Set(p1.pagina.itens.map((p) => String(p.codProd)))].slice(0, 3);
const soSimulados = await pedir({ pagina: 1, codigos: tres });
ok(!soSimulados.erro && soSimulados.pagina.itens.length > 0 &&
  soSimulados.pagina.itens.every((p) => tres.includes(String(p.codProd))),
  `"só simulados" com ${tres.join(", ")} traz só esses produtos`);

// ── Vários fornecedores (spec 2026-11-24-simulador-varios-fornecedores) ────
if (filtro.fornecedores.length >= 2) {
  let soma = 0;
  for (const um of filtro.fornecedores) {
    const r = await pedir({ pagina: 1, fornecedores: [um] });
    soma += r.pagina?.totalItens ?? Number.NaN;
  }
  ok(soma === p1.pagina.totalItens, "o total da lista = a soma dos totais de cada fornecedor",
    `lista ${p1.pagina.totalItens}, soma ${soma}`);
}
if (filtro.fornecedores.length === 0) {
  const vazia = await pedir({ pagina: 1, fornecedores: [] });
  ok(!vazia.erro && vazia.pagina.totalItens === p1.pagina.totalItens, "lista vazia de fornecedores = todos");
}

// ── Recusas ──────────────────────────────────────────────────────────────────
const recusas = [
  [{ pagina: 0 }, "página 0"],
  [{ pagina: 1, classes: ["D"] }, 'classe "D"'],
  [{ pagina: 1, classes: [] }, "nenhuma classe"],
  [{ pagina: 1, busca: "X".repeat(61) }, "busca de 61 caracteres"],
  [{ pagina: 1, codigos: Array.from({ length: 501 }, (_, i) => String(i + 1)) }, "501 códigos"],
  [{ pagina: 1, codigos: ["12,13"] }, 'código "12,13"'],
  [{ pagina: 1, fornecedores: [0] }, "fornecedor 0"],
  [{ pagina: 1, fornecedores: [-1] }, "fornecedor -1"],
  [{ pagina: 1, fornecedores: Array.from({ length: 51 }, (_, i) => i + 1) }, "51 fornecedores"],
];
for (const [extra, nome] of recusas) {
  const r = await pedir(extra);
  ok(Boolean(r.erro), `recusa ${nome}`, r.erro ?? "foi aceito");
}

// ── Coluna sempre nula ou zero ───────────────────────────────────────────────
const todas = [p1, p2, p50].flatMap((r) => r.pagina?.itens ?? []);
if (todas.length > 0) {
  const suspeitas = Object.keys(todas[0]).filter((c) =>
    todas.every((p) => p[c] === null || p[c] === 0 || p[c] === ""),
  );
  console.log(suspeitas.length === 0
    ? "\nNenhuma coluna sempre nula ou zero."
    : `\nSempre nulas ou zero (confira se é o dado ou o mapeamento): ${suspeitas.join(", ")}`);
}

const arquivo = join(tmpdir(), `sp6_${codFilial}_${regiao}${fornecedor ? "_" + fornecedor : ""}.json`);
writeFileSync(arquivo, JSON.stringify({ produtos: todas }, null, 2));
console.log(`\n${todas.length} linhas (páginas 1, 2 e 50) gravadas em ${arquivo}`);

console.log(falhas === 0
  ? `\nsp6: ${conferencias} conferências, todas passaram.`
  : `\nsp6: ${falhas} de ${conferencias} conferências FALHARAM.`);
process.exit(falhas === 0 ? 0 : 1);

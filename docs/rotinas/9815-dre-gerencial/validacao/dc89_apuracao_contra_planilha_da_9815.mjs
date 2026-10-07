/**
 * dc89 — a apuração da API, AGORA, contra uma exportação `.xlsx` da 9815 (uma coluna de mês).
 *
 * Feito para a medição do Minas Rural (BASE_MINAS_RURAL.md, "Como confirmar"), mas serve a
 * qualquer base: o que decide a base é a sessão do `_autenticar.mjs` (`KPI_BASE`).
 *
 * USO (credencial só no ambiente, nunca no comando):
 *   KPI_LOGIN=… KPI_SENHA=… KPI_BASE=MinasRural \
 *     node --import ./docs/rotinas/9815-dre-gerencial/validacao/_autenticar.mjs \
 *       docs/rotinas/9815-dre-gerencial/validacao/dc89_apuracao_contra_planilha_da_9815.mjs \
 *       <9815.xlsx> <filiais, ex. 10 ou 10,37> <início AAAA-MM-DD> <fim AAAA-MM-DD> \
 *       [competencia|caixa] [ccusto-principal|grupo|...]
 *
 * O que sai:
 *   1. cada linha da 9815 contra a SOMA das nossas linhas de mesmo rótulo (a 9815 agrupa por
 *      rótulo; nós podemos ter mais de uma linha com o mesmo nome);
 *   2. as linhas que só existem de um lado — as nossas só quando têm valor, porque a 9815 foi
 *      exportada sem contas zeradas;
 *   3. o que é só APRESENTAÇÃO, já aprovada no DIVERGENCIAS.md, conferido ao centavo: a nº 12
 *      (no C. Custo Principal a 9815 agrupa pelos dois primeiros dígitos; a diferença tem de
 *      ser exatamente a soma das nossas linhas avulsas do grupo), a nº 11 (sem a linha `Total
 *      das Despesas`, confere-se LUCRO LIQUIDO − LUCRO BRUTO) e a nº 9 (o `SUBTOTAL POSITIVO`).
 *
 * Não corrige nada: mede. Sai com código 1 se sobrar diferença acima de meio centavo.
 */
import fs from "node:fs";
import zlib from "node:zlib";

const [xlsx, filiaisArg, dataInicio, dataFim, regime = "competencia", analise = "ccusto-principal"] =
  process.argv.slice(2);
if (!xlsx || !filiaisArg || !dataInicio || !dataFim) {
  console.error("Uso: dc89 <9815.xlsx> <filiais> <início AAAA-MM-DD> <fim AAAA-MM-DD> [regime] [análise]");
  process.exit(2);
}

const API = process.env.API ?? "http://localhost:5207";
const FILTRO = { filiais: filiaisArg.split(","), dataInicio, dataFim, regime, analise };

// ── a planilha da 9815 (o mesmo leitor do dc28) ──────────────────────────────────────
const fonte = fs.readFileSync(new URL("./dc28_impressao_contra_planilha.mjs", import.meta.url), "utf8");
const linhasDoXlsx = new Function(
  "fs",
  "zlib",
  fonte.slice(fonte.indexOf("function linhasDoXlsx("), fonte.indexOf("// ── ler os dois lados")) +
    "\nreturn linhasDoXlsx;",
)(fs, zlib);

const num = (s) => {
  const t = String(s ?? "").trim();
  if (t === "" || t === "—") return null;
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
  const v = Number(t.replace(/[()\-\s]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) ? (neg ? -v : v) : null;
};
const norm = (s) =>
  String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/ ->.*/, "");

// Linha 1 é o título, linha 2 o cabeçalho; dali em diante: descrição, vazio, valor, % AV.
const planilha = linhasDoXlsx(xlsx)
  .filter((r) => r.n >= 3 && r.celulas[0]?.trim())
  .map((r) => ({ rotulo: norm(r.celulas[0]), original: r.celulas[0].trim(), valor: num(r.celulas[2]) ?? 0 }));

// ── a nossa apuração ─────────────────────────────────────────────────────────────────
// Pelo `fetch` global, que o `_autenticar.mjs` embrulha com o token. Um mês de uma filial
// volta em segundos: o teto de 300 s do `fetch` do Node não chega a pesar aqui.
const t0 = Date.now();
const r = await fetch(`${API}/api/dre-gerencial/apuracao`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(FILTRO),
});
const j = await r.json();
if (!j.sucesso) throw new Error(`apuração recusada (${r.status}): ${j.mensagem ?? j.erros?.[0] ?? "sem mensagem"}`);
const dados = j.dados;
const segundos = ((Date.now() - t0) / 1000).toFixed(1);

const nossas = new Map();
for (const l of dados.linhas) {
  const k = norm(l.descricao);
  const v = l.total?.valor ?? 0;
  const atual = nossas.get(k) ?? { valor: 0, partes: [], chaves: [], calculada: l.calculada };
  // Linha calculada vale uma vez; conta soma com as homônimas.
  atual.valor = l.calculada ? v : atual.valor + v;
  atual.partes.push(`${l.chave ?? "?"}=${v.toFixed(2)}`);
  if (!l.calculada && /^\d+$/.test(String(l.chave ?? ""))) atual.chaves.push(String(l.chave));
  nossas.set(k, atual);
}

// ── comparar ─────────────────────────────────────────────────────────────────────────
const fmt = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const igual = (a, b) => Math.abs(a - b) <= 0.005;
console.log(`\n══ dc89 — API contra a 9815 ══`);
console.log(`  base da sessão: ${dados.base?.rotulo ?? "(a API não disse)"}  ·  ${JSON.stringify(FILTRO)}`);
console.log(`  apurado em ${segundos} s  ·  planilha: ${xlsx}\n`);
console.log("  " + "linha da 9815".padEnd(40) + "9815".padStart(16) + "nosso".padStart(16) + "diferença".padStart(16));

const vistas = new Set(planilha.map((p) => p.rotulo));
// As nossas que a 9815 não tem, com valor: candidatas a explicar uma diferença.
const soNossas = new Map([...nossas].filter(([k, n]) => !vistas.has(k) && !igual(n.valor, 0)));
const valorNosso = (rotulo) => nossas.get(norm(rotulo))?.valor;

let divergencias = 0;
const explicadas = [];
for (const p of planilha) {
  const n = nossas.get(p.rotulo);
  const linha = (nosso, dif, nota) =>
    console.log(
      `  ${p.original.slice(0, 39).padEnd(40)}${fmt(p.valor).padStart(16)}${nosso.padStart(16)}${dif.padStart(16)}${nota}`,
    );

  if (!n) {
    // DIVERGÊNCIA 11: a linha `Total das Despesas` saiu da nossa tela. O número não sumiu —
    // é LUCRO LIQUIDO − LUCRO BRUTO —, e é ele que se confere, não a ausência da linha.
    if (p.rotulo === "TOTAL DAS DESPESAS") {
      const ll = valorNosso("LUCRO LIQUIDO");
      const lb = valorNosso("LUCRO BRUTO");
      if (ll !== undefined && lb !== undefined && igual(ll - lb, p.valor)) {
        linha("(sem linha)", "", "   ok pela div. 11: LUCRO LIQUIDO − LUCRO BRUTO bate");
        explicadas.push("11");
        continue;
      }
    }
    linha("—", "", "   FALTA NO NOSSO");
    if (!igual(p.valor, 0)) divergencias++;
    continue;
  }

  const d = n.valor - p.valor;
  if (igual(d, 0)) {
    linha(fmt(n.valor), "", "");
    continue;
  }

  // DIVERGÊNCIA 12: no C. Custo Principal a 9815 agrupa pelos DOIS primeiros dígitos, e nós
  // mostramos cada conta principal. A diferença tem de ser, ao centavo, a soma das nossas
  // linhas avulsas do mesmo grupo — senão não é agrupamento, é número errado.
  const grupos = new Set(n.chaves.map((c) => c.slice(0, 2)));
  const doGrupo = [...soNossas].filter(([, s]) => s.chaves.some((c) => grupos.has(c.slice(0, 2))));
  const soma = doGrupo.reduce((t, [, s]) => t + s.valor, 0);
  if (analise === "ccusto-principal" && doGrupo.length > 0 && igual(n.valor + soma, p.valor)) {
    linha(fmt(n.valor), fmt(d), `   ok pela div. 12: + ${doGrupo.map(([k]) => k).join(", ")}`);
    for (const [k] of doGrupo) soNossas.delete(k);
    explicadas.push("12");
    continue;
  }

  divergencias++;
  linha(fmt(n.valor), fmt(d), `  ◄${n.partes.length > 1 ? `   [${n.partes.join(" ")}]` : ""}`);
}

// DIVERGÊNCIA 9: o `SUBTOTAL POSITIVO` é linha nossa, pedida em 14/09/2026; a 9815 não a tem.
if (soNossas.has("SUBTOTAL POSITIVO")) {
  soNossas.delete("SUBTOTAL POSITIVO");
  explicadas.push("9");
}

if (soNossas.size > 0) {
  console.log("\n  Só no nosso (com valor), sem explicação:");
  for (const [k, n] of soNossas) {
    divergencias++;
    console.log(`  ${k.slice(0, 39).padEnd(40)}${"—".padStart(16)}${fmt(n.valor).padStart(16)}   [${n.partes.join(" ")}]`);
  }
}

const aprovadas = [...new Set(explicadas)].sort((a, b) => a - b);
if (aprovadas.length > 0) {
  console.log(`\n  Diferenças de apresentação, já aprovadas no DIVERGENCIAS.md: ${aprovadas.map((d) => `nº ${d}`).join(", ")}`);
}
console.log(`\n  ${divergencias === 0 ? "BATE — todos os valores conferem" : `${divergencias} divergência(s) sem explicação`}\n`);

// `exitCode`, e não `process.exit()`: sair à força com a conexão do `fetch` ainda aberta
// derruba o Node no Windows com uma asserção da libuv (`UV_HANDLE_CLOSING`).
process.exitCode = divergencias === 0 ? 0 : 1;

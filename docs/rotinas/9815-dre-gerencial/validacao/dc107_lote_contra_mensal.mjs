/**
 * dc107 — o LOTE traz exatamente os lançamentos do detalhamento mês a mês (06/11/2026).
 *
 * QUEM RODA É O GABRIEL — o script fala com a API, e a API com o Oracle. Com a API rodando,
 * num terminal PowerShell (as credenciais ficam só na sessão do terminal, nunca em arquivo):
 *
 *   $env:KPI_LOGIN="..."; $env:KPI_SENHA="..."
 *   $env:FILIAL="7"; $env:INICIO="2025-01-01"; $env:FIM="2025-03-31"
 *   $env:REGIME="competencia"; $env:ANALISE="grupo-contas"
 *   node --import ./docs/rotinas/9815-dre-gerencial/validacao/_autenticar.mjs docs/rotinas/9815-dre-gerencial/validacao/dc107_lote_contra_mensal.mjs
 *
 * O login é o do _autenticar.mjs (KPI_BASE=MinasRural para a outra base).
 * Opcionais: API (padrão http://localhost:5207), MAX_LINHAS (padrão 8).
 * Para o comparativo, rode uma vez com INICIO/FIM de um ano e outra com o outro.
 *
 * Para cada linha de lançamentos da apuração e cada mês: o /detalhe (o caminho de hoje) e o
 * /detalhe/lote têm de devolver o MESMO conjunto de (RECNUM, VPAGO) e a mesma participação.
 * Também cronometra os dois caminhos.
 */
const API = process.env.API ?? "http://localhost:5207";
const { FILIAL, INICIO, FIM } = process.env;
const REGIME = process.env.REGIME ?? "competencia";
const ANALISE = process.env.ANALISE ?? "grupo-contas";
const MAX_LINHAS = Number(process.env.MAX_LINHAS ?? 8);
if (!FILIAL || !INICIO || !FIM || !globalThis.__kpiObterToken) {
  console.error("Defina FILIAL, INICIO e FIM e rode com --import _autenticar.mjs — ver o cabeçalho.");
  process.exit(2);
}

async function post(caminho, corpo) {
  // O token entra pelo _autenticar.mjs, que embrulha o fetch.
  return fetch(`${API}${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}
async function dados(resposta) {
  const envelope = await resposta.json();
  if (!resposta.ok || envelope.sucesso === false) throw new Error(envelope.mensagem ?? `HTTP ${resposta.status}`);
  return envelope.dados;
}

/** Os meses do recorte: [1º dia, último dia], aparados pelo INICIO e pelo FIM. */
function meses(inicio, fim) {
  const saida = [];
  let [a, m] = inicio.split("-").map(Number);
  for (;;) {
    const mm = String(m).padStart(2, "0");
    const primeiro = `${a}-${mm}-01`;
    const ultimo = `${a}-${mm}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
    saida.push({ dataInicio: primeiro < inicio ? inicio : primeiro, dataFim: ultimo > fim ? fim : ultimo });
    if (ultimo >= fim) return saida;
    m++;
    if (m === 13) {
      m = 1;
      a++;
    }
  }
}

const assinatura = (d) =>
  (d.lancamentos ?? []).map((l) => `${l.recNum}|${Number(l.vPago).toFixed(2)}`).sort().join("\n");

const filtro = { filiais: [FILIAL], regime: REGIME, analise: ANALISE };
const colunas = meses(INICIO, FIM);

console.log(`\n══ dc107 — lote × mês a mês · filial ${FILIAL} · ${INICIO} a ${FIM} · ${REGIME} · ${ANALISE} ══\n`);
const apuracao = await dados(await post("/api/dre-gerencial/apuracao", { ...filtro, dataInicio: INICIO, dataFim: FIM, modo: "meses" }));
const linhas = apuracao.linhas
  .filter((l) => l.detalhe?.tipo === "lancamentos")
  .slice(0, MAX_LINHAS)
  .map((l, id) => ({ id, descricao: l.descricao.trim(), destino: l.detalhe }));
console.log(`${linhas.length} linhas × ${colunas.length} meses\n`);

// O caminho de hoje: uma requisição por linha × mês.
const t0 = Date.now();
const mensal = new Map();
for (const l of linhas) {
  for (const [c, col] of colunas.entries()) {
    const d = await dados(await post("/api/dre-gerencial/detalhe", {
      ...filtro,
      ...col,
      tipo: "lancamentos",
      bloco: l.destino.bloco,
      chave: l.destino.chave,
      ...(l.destino.sobra?.length ? { sobra: l.destino.sobra } : {}),
    }));
    mensal.set(`${l.id}:${c}`, d);
  }
}
const tMensal = Date.now() - t0;

// O lote.
const t1 = Date.now();
const r = await post("/api/dre-gerencial/detalhe/lote", {
  ...filtro,
  colunas,
  linhas: linhas.map((l) => ({ id: l.id, tipo: "lancamentos", bloco: l.destino.bloco, chave: l.destino.chave, sobra: l.destino.sobra ?? null })),
});
if (!r.ok) throw new Error(`lote: HTTP ${r.status} ${await r.text()}`);
console.log(`cabeçalhos do lote: ${r.headers.get("content-type")} · ${r.headers.get("cache-control")}`);
const texto = await r.text();
const tLote = Date.now() - t1;
const pacotes = texto.split("\n").filter(Boolean).map((s) => JSON.parse(s));
const lote = new Map(pacotes.filter((p) => p.t === "parte").map((p) => [`${p.linha}:${p.coluna}`, p.dados]));

let diferencas = 0;
for (const l of linhas) {
  for (const [c] of colunas.entries()) {
    const a = mensal.get(`${l.id}:${c}`);
    const b = lote.get(`${l.id}:${c}`);
    const ok = b && assinatura(a) === assinatura(b) && Math.abs(a.participacao - b.participacao) < 1e-9;
    if (!ok) {
      diferencas++;
      console.log(`  DIFERE  ${l.descricao} · ${colunas[c].dataInicio}  mensal=${a.lancamentos?.length ?? 0}  lote=${b?.lancamentos?.length ?? "ausente"}`);
    }
  }
}
const falhas = pacotes.filter((p) => p.t === "falha");
const batidas = pacotes.filter((p) => p.t === "aguarde").length;
const ultimo = pacotes.at(-1)?.t;
console.log(`\nmês a mês: ${(tMensal / 1000).toFixed(1)} s · lote: ${(tLote / 1000).toFixed(1)} s · batimentos: ${batidas} · falhas: ${falhas.length} · último pacote: ${ultimo}`);
for (const f of falhas) console.log(`  FALHA  linhas ${f.linhas.join(", ")} · coluna ${f.coluna}: ${f.mensagem}`);

const passou = diferencas === 0 && falhas.length === 0 && ultimo === "fim";
console.log(passou ? "\n✓ dc107 passou — o lote traz os mesmos lançamentos\n" : `\n✗ dc107: ${diferencas} diferença(s), ${falhas.length} falha(s)\n`);
process.exit(passou ? 0 : 1);

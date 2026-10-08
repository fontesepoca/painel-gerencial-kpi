/**
 * bf2 — login por base, token com base, e o que acontece quando o banco não responde.
 *
 *   node docs/plataforma/validacao/bf2_login_por_base.mjs
 *
 * Sem credencial e sem banco: a Época aponta para uma porta onde ninguém escuta, então o
 * login chega à conexão e falha como falharia com o banco fora do ar — que é justamente o
 * que se quer provar (503, e nunca "senha incorreta"). Os tokens são forjados com a chave de
 * teste, para exercitar o que a API faz com um token sem `base`.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

const SAIDA = path.join(os.tmpdir(), "bf-api");
execFileSync(
  "dotnet",
  ["build", "api-new-kpi/api-new-kpi.csproj", "-c", "Debug", "-o", SAIDA, "--nologo", "-v", "q"],
  { stdio: "inherit" },
);

const CHAVE = "chave-de-teste-".padEnd(48, "x");
const PORTA = 5295;
const API = `http://127.0.0.1:${PORTA}`;

const proc = spawn("dotnet", [path.join(SAIDA, "api-new-kpi.dll")], {
  cwd: SAIDA,
  env: {
    ...process.env,
    ASPNETCORE_ENVIRONMENT: "Production",
    ASPNETCORE_URLS: API,
    Jwt__Chave: CHAVE,
    // Porta onde ninguém escuta: ORA-12541, rápido.
    ConnectionStrings__OracleEpoca: "User Id=u;Password=p;Data Source=//127.0.0.1:1/x;Connection Timeout=5",
  },
});
let log = "";
proc.stdout.on("data", (d) => (log += d));
proc.stderr.on("data", (d) => (log += d));

await new Promise((resolve, reject) => {
  const t = setInterval(() => {
    if (/Now listening on/.test(log)) { clearInterval(t); resolve(); }
  }, 100);
  proc.on("close", () => { clearInterval(t); reject(new Error(`a API não subiu\n${log}`)); });
});

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}\n  esperado: ${JSON.stringify(esperado)}\n  achou:    ${JSON.stringify(achou)}`);
};
const ok = (condicao, oque) => {
  n++;
  assert.ok(condicao, oque);
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function token(claims) {
  const cab = b64({ alg: "HS256", typ: "JWT" });
  const corpo = b64({
    iss: "epoca-analytics-api",
    aud: "epoca-analytics",
    exp: Math.floor(Date.now() / 1000) + 600,
    sub: "123",
    matricula: "123",
    nome: "Fulano de Tal",
    ...claims,
  });
  const assinatura = crypto.createHmac("sha256", CHAVE).update(`${cab}.${corpo}`).digest("base64url");
  return `${cab}.${corpo}.${assinatura}`;
}

const chamar = async (metodo, rota, { corpo, bearer } = {}) => {
  const r = await fetch(`${API}${rota}`, {
    method: metodo,
    headers: {
      ...(corpo ? { "Content-Type": "application/json" } : {}),
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* corpo sem JSON */ }
  return { status: r.status, json, texto };
};

try {
  // ── as bases oferecidas ──────────────────────────────────────────────────────────
  const bases = await chamar("GET", "/api/auth/bases");
  eq(bases.status, 200, "GET /bases é público");
  eq(bases.json.dados, [{ id: "Epoca", rotulo: "Época Distribuição" }], "só a base configurada, com id e rótulo");
  ok(!bases.texto.includes("127.0.0.1") && !/password/i.test(bases.texto), "não vaza host nem credencial");

  // ── REVIEW FOCUS 3: base ausente, vazia, inventada, ou de uma base sem conexão ────
  const MSG_BASE = "Escolha uma base de dados da lista.";
  for (const [corpo, oque] of [
    [{ login: "a", senha: "b" }, "sem base"],
    [{ login: "a", senha: "b", base: "" }, "base vazia"],
    [{ login: "a", senha: "b", base: "Inventada" }, "base inventada"],
    [{ login: "a", senha: "b", base: "MinasRural" }, "base existente mas sem string de conexão"],
  ]) {
    const r = await chamar("POST", "/api/auth/login", { corpo });
    eq(r.status, 400, `${oque}: 400, e nunca cai na Época`);
    eq(r.json.mensagem, MSG_BASE, `${oque}: mensagem`);
  }

  // ── REVIEW FOCUS 4: o banco não responde → 503, e NUNCA "senha incorreta" ─────────
  for (const base of ["Epoca", "epoca"]) {
    const r = await chamar("POST", "/api/auth/login", { corpo: { login: "a", senha: "b", base } });
    eq(r.status, 503, `banco fora do ar com base "${base}": 503`);
    ok(/não respondeu/.test(r.json.mensagem), `a mensagem diz que a base não respondeu: ${r.json.mensagem}`);
    ok(/Época Distribuição/.test(r.json.mensagem), "e diz QUAL base");
    ok(!/incorretos/.test(r.texto), "infraestrutura nunca vira 'senha incorreta'");
  }

  // ── REVIEW FOCUS 1: token sem base, ou de base que não existe ─────────────────────
  const MSG_ANTIGA = "Sua sessão é anterior a esta atualização. Entre de novo.";
  for (const [claims, oque] of [
    [{}, "token anterior à mudança (sem claim base)"],
    [{ base: "Inventada" }, "base que não existe"],
    [{ base: "MinasRural" }, "base existente mas não configurada neste ambiente"],
  ]) {
    const r = await chamar("GET", "/api/auth/eu", { bearer: token(claims) });
    eq(r.status, 401, `${oque}: 401`);
    eq(r.json.mensagem, MSG_ANTIGA, `${oque}: mensagem`);
  }

  const semToken = await chamar("GET", "/api/auth/eu");
  eq(semToken.status, 401, "sem token: 401");
  eq(semToken.json.mensagem, "Sessão expirada ou ausente. Entre novamente.", "e a mensagem de sempre");

  // ── token bom: a base volta no /eu ───────────────────────────────────────────────
  const bom = await chamar("GET", "/api/auth/eu", { bearer: token({ base: "Epoca" }) });
  eq(bom.status, 200, "token com base válida passa");
  eq(bom.json.dados.base, { id: "Epoca", rotulo: "Época Distribuição" }, "e /eu devolve a base da sessão");

  // ── a rota do DRE exige sessão E resolve a base pelo token ───────────────────────
  eq((await chamar("GET", "/api/dre-gerencial/filiais")).status, 401, "DRE sem token: 401");
  const dre = await chamar("GET", "/api/dre-gerencial/filiais", { bearer: token({ base: "Epoca" }) });
  eq(dre.status, 503, "DRE com token: a conexão é tentada NA BASE DO TOKEN, e falha como 503, não 500");
  ok(/Época Distribuição/.test(dre.json.mensagem), "e o 503 diz de que base");

  // ── saúde ────────────────────────────────────────────────────────────────────────
  const saude = await chamar("GET", "/api/health");
  eq(saude.status, 200, "health é anônimo");
  eq(saude.json.dados.bases, [{ id: "Epoca", rotulo: "Época Distribuição" }], "health lista as bases");
  eq((await chamar("GET", "/api/health/oracle")).status, 503, "health/oracle com uma base só dispensa ?base= e testa a conexão");
  eq((await chamar("GET", "/api/health/oracle?base=Inventada")).status, 400, "?base= desconhecida: 400");
} finally {
  proc.kill();
}

console.log(`bf2 — ${n} conferências, todas passaram.`);

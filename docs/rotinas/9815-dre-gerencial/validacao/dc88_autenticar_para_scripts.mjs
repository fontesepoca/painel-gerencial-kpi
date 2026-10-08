/**
 * dc88 — `_autenticar.mjs`: os scripts de validação que chamam a API direto seguem rodando
 * depois do [Authorize], sem editar nenhum deles.
 *
 *   node docs/rotinas/9815-dre-gerencial/validacao/dc88_autenticar_para_scripts.mjs
 *
 * Usa uma API de mentira, sem credencial real. Roda `node --import _autenticar.mjs` num
 * script-filho que faz `fetch` como os dc34/dc64 fazem.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}\n  esperado: ${JSON.stringify(esperado)}\n  achou:    ${JSON.stringify(achou)}`);
};

const vistas = [];
const servidor = http.createServer((req, res) => {
  const pedacos = [];
  req.on("data", (c) => pedacos.push(c));
  req.on("end", () => {
    vistas.push({ url: req.url, auth: req.headers.authorization, corpo: Buffer.concat(pedacos).toString() });
    res.writeHead(200, { "content-type": "application/json" });
    if (req.url === "/api/auth/login") {
      res.end(JSON.stringify({ sucesso: true, dados: { token: "TOKEN-SIMULADO" } }));
    } else {
      res.end(JSON.stringify({ sucesso: true }));
    }
  });
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const API = `http://127.0.0.1:${servidor.address().port}`;

const filho = path.join(os.tmpdir(), "dc88-filho.mjs");
fs.writeFileSync(
  filho,
  `await fetch(process.env.API + "/api/dre-gerencial/apuracao", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
   await fetch(process.env.API + "/api/dre-gerencial/filiais");`,
);

// No Windows o `--import` com caminho ABSOLUTO exige URL `file://`; com `./relativo`, não.
const autenticar = pathToFileURL(
  path.resolve("docs/rotinas/9815-dre-gerencial/validacao/_autenticar.mjs"),
).href;
// ASSÍNCRONO DE PROPÓSITO. A API de mentira roda NESTE processo: com `spawnSync` o pai
// ficaria bloqueado esperando o filho, e o filho esperando o pai responder — um impasse.
const rodar = (env) =>
  new Promise((resolve) => {
    const proc = spawn("node", ["--import", autenticar, filho], {
      env: { ...process.env, API, ...env },
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (status) => resolve({ status, stdout, stderr }));
  });

// 1. com credencial: faz UM login e anexa o token nas duas chamadas
const com = await rodar({ KPI_LOGIN: "fulano", KPI_SENHA: "segredo", KPI_BASE: "MinasRural" });
eq(com.status, 0, `o script-filho rodou\n${com.stderr}`);
const login = vistas.filter((v) => v.url === "/api/auth/login");
eq(login.length, 1, "um login só, mesmo com duas chamadas");
eq(JSON.parse(login[0].corpo), { login: "fulano", senha: "segredo", base: "MinasRural" }, "o login leva a base escolhida");
const chamadas = vistas.filter((v) => v.url.startsWith("/api/dre-gerencial"));
eq(chamadas.map((v) => v.auth), ["Bearer TOKEN-SIMULADO", "Bearer TOKEN-SIMULADO"], "as duas chamadas levam o token");

// 2. base padrão é a Época
vistas.length = 0;
await rodar({ KPI_LOGIN: "fulano", KPI_SENHA: "segredo" });
eq(JSON.parse(vistas.find((v) => v.url === "/api/auth/login").corpo).base, "Epoca", "KPI_BASE ausente = Epoca");

// 3. sem credencial: falha ALTO, dizendo o que definir — nunca segue sem token
vistas.length = 0;
const sem = await rodar({ KPI_LOGIN: "", KPI_SENHA: "" });
eq(sem.status !== 0, true, "sem credencial o script-filho falha");
eq(/KPI_LOGIN/.test(sem.stderr) && /KPI_SENHA/.test(sem.stderr), true, "a mensagem diz quais variáveis definir");
eq(vistas.length, 0, "e não chega a bater na API");

// 4. nunca imprime a senha
eq(com.stdout.includes("segredo") || com.stderr.includes("segredo"), false, "a senha não aparece na saída");

servidor.close();
console.log(`dc88 — ${n} conferências, todas passaram.`);

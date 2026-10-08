/**
 * bf1 — o registro de bases: sobe a API de verdade com configurações diferentes.
 *
 *   node docs/plataforma/validacao/bf1_registro_de_bases.mjs
 *
 * Não precisa de banco nem de credencial: o registro lê a configuração, e ninguém conecta.
 * Compila a API numa pasta temporária (para não esbarrar no `apphost.exe` da API que o
 * Gabriel deixa rodando) e sobe `dotnet api-new-kpi.dll` com variáveis de ambiente.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

const SAIDA = path.join(os.tmpdir(), "bf-api");
execFileSync(
  "dotnet",
  ["build", "api-new-kpi/api-new-kpi.csproj", "-c", "Debug", "-o", SAIDA, "--nologo", "-v", "q"],
  { stdio: "inherit" },
);

let n = 0;
const ok = (condicao, oque) => {
  n++;
  assert.ok(condicao, oque);
};

let porta = 5290;

function subir(env) {
  const proc = spawn("dotnet", [path.join(SAIDA, "api-new-kpi.dll")], {
    cwd: SAIDA,
    env: {
      ...process.env,
      ASPNETCORE_ENVIRONMENT: "Production",
      ASPNETCORE_URLS: `http://127.0.0.1:${porta++}`,
      Jwt__Chave: "x".repeat(40),
      ...env,
    },
  });

  let saida = "";
  proc.stdout.on("data", (d) => (saida += d));
  proc.stderr.on("data", (d) => (saida += d));

  const fim = new Promise((resolve) => proc.on("close", (codigo) => resolve(codigo)));
  const pronto = new Promise((resolve) => {
    const t = setInterval(() => {
      if (/Now listening on/.test(saida)) {
        clearInterval(t);
        resolve(true);
      }
    }, 100);
    fim.then(() => {
      clearInterval(t);
      resolve(false);
    });
  });

  return { texto: () => saida, pronto, fim, parar: () => proc.kill() };
}

const CONEXAO = "User Id=u;Password=p;Data Source=//127.0.0.1:1/x";

// 1. As duas bases com conexão: as duas disponíveis.
{
  const a = subir({
    ConnectionStrings__OracleEpoca: CONEXAO,
    ConnectionStrings__OracleMinasRural: CONEXAO,
  });
  ok(await a.pronto, `a API sobe com as duas bases\n${a.texto()}`);
  // `.{1,3}` no lugar do acento: o console do Windows entrega a saída numa página de código
  // que não é UTF-8, e `disponíveis` chega como `dispon?veis`.
  ok(/Bases dispon.{1,3}veis: Epoca, MinasRural/.test(a.texto()), `lista as duas\n${a.texto()}`);
  ok(!a.texto().includes("Password=p"), "a string de conexão não vai ao log");
  a.parar();
}

// 2. Só a Época: o Minas Rural não é oferecido, e a API sobe do mesmo jeito.
{
  const a = subir({ ConnectionStrings__OracleEpoca: CONEXAO });
  ok(await a.pronto, `a API sobe só com a Época\n${a.texto()}`);
  ok(/Bases dispon.{1,3}veis: Epoca/.test(a.texto()), "só a Época");
  ok(!/Bases dispon.{1,3}veis: .*MinasRural/.test(a.texto()), "o Minas Rural não é oferecido");
  ok(/MinasRural sem string de conex.{1,3}o/.test(a.texto()), "e o aviso diz por quê");
  a.parar();
}

// 3. Código de filial com letra DERRUBA O BOOT: o valor entra no SQL por texto.
{
  const a = subir({
    ConnectionStrings__OracleEpoca: CONEXAO,
    Bases__Epoca__Regras__FiliaisForaDoFiltro__0: "2A",
  });
  ok(!(await a.pronto), "a API NÃO sobe com filial '2A'");
  ok((await a.fim) !== 0, "e sai com código de erro");
  ok(/FiliaisForaDoFiltro/.test(a.texto()), `a mensagem diz o campo\n${a.texto()}`);
}

// 4. Seção zero também derruba.
{
  const a = subir({
    ConnectionStrings__OracleEpoca: CONEXAO,
    Bases__Epoca__Regras__SecaoSemCusto: "0",
  });
  ok(!(await a.pronto), "a API NÃO sobe com SecaoSemCusto = 0");
  ok(/SecaoSemCusto/.test(a.texto()), "a mensagem diz o campo");
}

// 5. Toda base do appsettings chega ao CONTAINER. O compose lista as variáveis da API uma a
//    uma: uma conexão que ele não repasse faz a base sumir do login em produção, sem erro.
{
  const config = JSON.parse(fs.readFileSync("api-new-kpi/appsettings.json", "utf8"));
  const compose = fs.readFileSync("docker-compose.yml", "utf8");
  for (const chave of Object.keys(config.ConnectionStrings ?? {})) {
    ok(compose.includes(`ConnectionStrings__${chave}:`), `docker-compose.yml repassa ConnectionStrings__${chave}`);
  }
}

console.log(`bf1 — ${n} conferências, todas passaram.`);

/**
 * dc87 — o proxy do BFF: repassa com o token, transmite em fluxo, cancela, não tem teto.
 *
 *   node --experimental-strip-types docs/rotinas/9815-dre-gerencial/validacao/dc87_proxy_do_bff.mjs
 *
 * Sobe uma "API" de mentira em porta livre e chama `repassarParaApi` de verdade. Não toca no
 * banco nem no navegador, e não precisa de credencial.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { repassarParaApi } from "../../../../client-new-kpi/lib/servidor/repassarParaApi.ts";
import { decidirRepasse, sessaoMorreu } from "../../../../client-new-kpi/lib/servidor/decidirRepasse.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(
    achou,
    esperado,
    `${oque}\n  esperado: ${JSON.stringify(esperado)}\n  achou:    ${JSON.stringify(achou)}`,
  );
};
const ok = (condicao, oque) => {
  n++;
  assert.ok(condicao, oque);
};
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Uma API de mentira: guarda o que viu e responde como o teste mandar. */
function subirApi(responder) {
  return new Promise((resolve) => {
    const vistas = [];
    const fechadas = [];
    const servidor = http.createServer((req, res) => {
      const pedacos = [];
      req.on("data", (c) => pedacos.push(c));
      req.on("close", () => fechadas.push(req.url));
      req.on("end", () => {
        const vista = {
          metodo: req.method,
          url: req.url,
          cab: req.headers,
          corpo: Buffer.concat(pedacos).toString(),
        };
        vistas.push(vista);
        responder(req, res, vista);
      });
    });
    servidor.listen(0, "127.0.0.1", () => {
      resolve({
        vistas,
        fechadas,
        url: new URL(`http://127.0.0.1:${servidor.address().port}`),
        parar: () => {
          servidor.closeAllConnections?.();
          servidor.close();
        },
      });
    });
  });
}

const pedido = (url, init = {}) => new Request(`http://bff.local${url}`, init);

// ── 1. repassa método, caminho, consulta, corpo, token e a pedir SEM compressão ──────────
{
  const api = await subirApi((_req, res) => {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ sucesso: true }));
  });
  const r = await repassarParaApi(
    pedido("/api/dre-gerencial/apuracao?x=1", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
      headers: { "content-type": "application/json" },
    }),
    api.url,
    "/api/dre-gerencial/apuracao?x=1",
    "TOKEN-DE-TESTE",
  );
  const v = api.vistas[0];
  eq(v.metodo, "POST", "o método segue");
  eq(v.url, "/api/dre-gerencial/apuracao?x=1", "caminho e consulta seguem");
  eq(v.cab.authorization, "Bearer TOKEN-DE-TESTE", "o JWT da sessão é anexado");
  eq(v.cab["accept-encoding"], "identity", "pede sem compressão: o Next recomprime pra fora");
  eq(v.corpo, '{"a":1}', "o corpo segue");
  eq(v.cab["content-type"], "application/json", "o content-type segue");
  eq(r.status, 200, "o status volta");
  eq(await r.json(), { sucesso: true }, "o corpo volta");
  api.parar();
}

// ── 2. sem token, sem Authorization (a rota de saúde é anônima) ─────────────────────────
{
  const api = await subirApi((_req, res) => res.end("{}"));
  await repassarParaApi(pedido("/api/health"), api.url, "/api/health", null);
  eq(api.vistas[0].cab.authorization, undefined, "sem sessão não inventa Authorization");
  eq(api.vistas[0].metodo, "GET", "GET segue como GET");
  eq(api.vistas[0].corpo, "", "GET não leva corpo");
  api.parar();
}

// ── 3. o status da API é o status do proxy — 401 não vira 200 nem 500 ───────────────────
{
  const api = await subirApi((_req, res) => {
    res.writeHead(401, { "content-type": "application/json" });
    res.end('{"sucesso":false}');
  });
  const r = await repassarParaApi(pedido("/api/dre-gerencial/x"), api.url, "/api/dre-gerencial/x", "T");
  eq(r.status, 401, "401 da API continua 401");
  api.parar();
}

// ── 4. TRANSMITE EM FLUXO: o primeiro pedaço chega ANTES de a API terminar ───────────────
{
  const api = await subirApi((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.write("a");
    setTimeout(() => res.end("b"), 800);
  });
  const t0 = Date.now();
  const r = await repassarParaApi(pedido("/api/dre-gerencial/x"), api.url, "/api/dre-gerencial/x", "T");
  const leitor = r.body.getReader();
  const primeiro = await leitor.read();
  const ate = Date.now() - t0;
  eq(new TextDecoder().decode(primeiro.value), "a", "o primeiro pedaço é o 'a'");
  ok(ate < 500, `o primeiro pedaço chegou em ${ate} ms — antes de a API terminar (800 ms)`);
  const segundo = await leitor.read();
  eq(new TextDecoder().decode(segundo.value), "b", "e o resto vem depois");
  api.parar();
}

// ── 5. O NAVEGADOR DESISTE → a requisição à API é destruída (o Oracle para de trabalhar) ─
{
  const api = await subirApi(() => {
    /* nunca responde: uma apuração de minutos */
  });
  const cancelar = new AbortController();
  const chamada = repassarParaApi(
    pedido("/api/dre-gerencial/apuracao", { method: "POST", body: "{}", signal: cancelar.signal }),
    api.url,
    "/api/dre-gerencial/apuracao",
    "T",
  );
  await dormir(200);
  eq(api.vistas.length, 1, "a API recebeu a requisição");
  cancelar.abort();
  await dormir(500);
  eq(api.fechadas.length, 1, "o cancelamento fechou a conexão com a API");
  await chamada; // não pode ficar pendurada
  api.parar();
}

// ── 6. API fora do ar → 502 com a mensagem certa, e não um erro não tratado ─────────────
{
  const morta = new URL("http://127.0.0.1:1"); // porta 1: ninguém escuta
  const r = await repassarParaApi(pedido("/api/dre-gerencial/x"), morta, "/api/dre-gerencial/x", "T");
  eq(r.status, 502, "API fora do ar vira 502");
  const corpo = await r.json();
  eq(corpo.sucesso, false, "o envelope diz que falhou");
  ok(/Não foi possível falar com o servidor/.test(corpo.mensagem), "a mensagem é a do BFF");
}

// ── 7. NÃO HÁ TETO DE TEMPO: uma apuração leva até 407 s e o fetch do Node corta em 300 s ─
{
  const fonte = fs.readFileSync("client-new-kpi/lib/servidor/repassarParaApi.ts", "utf8");
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  ok(!/\btimeout\b/i.test(codigo), "repassarParaApi não define timeout");
  ok(!/\bfetch\s*\(/.test(codigo), "repassarParaApi não usa fetch — o headersTimeout dele é de 300 s");
  ok(/node:http/.test(codigo), "usa node:http");
}

// ── 8. O QUE O ROUTE HANDLER REPASSA — e o que ele recusa sem chamar a API ────────────
{
  // `/api/auth/*` NÃO passa: o navegador não pode chamar o login da API pulando o freio de
  // tentativas do BFF. Nem qualquer outra coisa fora da lista.
  for (const caminho of [["auth", "login"], ["auth", "bases"], ["qualquercoisa"], []]) {
    const d = decidirRepasse(caminho, true);
    eq(d.tipo === "recusar" && d.status, 404, `/api/${caminho.join("/")} não é repassado, nem com sessão`);
  }

  const semSessao = decidirRepasse(["dre-gerencial", "apuracao"], false);
  eq(semSessao.tipo === "recusar" && semSessao.status, 401, "DRE sem sessão: 401, sem chamar a API");

  eq(decidirRepasse(["health"], false), { tipo: "repassar", caminho: "/api/health" }, "health é anônimo");
  eq(
    decidirRepasse(["dre-gerencial", "fornecedores"], true),
    { tipo: "repassar", caminho: "/api/dre-gerencial/fornecedores" },
    "DRE com sessão: repassa",
  );
  eq(
    decidirRepasse(["dre-gerencial", "a/b"], true),
    { tipo: "repassar", caminho: "/api/dre-gerencial/a%2Fb" },
    "cada segmento é codificado: uma barra no segmento não vira outro caminho",
  );
}

// ── 9. REVIEW FOCUS 1: um 401 DA API encerra a sessão do BFF ─────────────────────────────
// Token sem o claim `base`, ou de base que saiu da configuração: se a sessão ficasse, o
// navegador teria cookie vivo e sessão morta, e cada tela daria 401 sem mandar entrar.
eq(sessaoMorreu(401, true), true, "401 da API com sessão: encerra");
eq(sessaoMorreu(401, false), false, "sem sessão, não há o que encerrar");
for (const status of [200, 400, 403, 500, 502, 503]) {
  eq(sessaoMorreu(status, true), false, `${status} não encerra a sessão`);
}

// E o route handler USA as duas funções — sem isto, testá-las não provaria nada da rota.
{
  const rota = fs.readFileSync("client-new-kpi/app/api/[...caminho]/route.ts", "utf8");
  ok(rota.includes("decidirRepasse("), "o route.ts decide por decidirRepasse");
  ok(rota.includes("sessaoMorreu(") && rota.includes("encerrarSessao("), "e encerra a sessão por sessaoMorreu");
}

console.log(`dc87 — ${n} conferências, todas passaram.`);

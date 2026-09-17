/**
 * dc42 — A compressão comprime, e a rota do token continua de fora.
 *
 * Duas perguntas, e a segunda é a que importa:
 *
 *   1. as rotas do DRE encolhem quando o cliente pede compressão?
 *   2. a rota de autenticação **não** encolhe?
 *
 * A segunda é a proteção contra o BREACH, explicada em `docs/COMPRESSAO.md`: a resposta do
 * login carrega o JWT no corpo, e comprimir um corpo que tem segredo é metade do ataque.
 * Um `RotasIsentas` mal digitado não quebra nada visível — a API responde normalmente, só
 * que comprimindo o que não devia. É exatamente o tipo de defeito que só um teste pega.
 *
 * <b>Não mede valor apurado.</b> Compressão não muda um centavo de nada; se mudasse, seria
 * defeito grave, e por isso o script também confere que o JSON descomprimido é idêntico ao
 * cru, byte a byte.
 *
 * A rota de login é exercitada com credencial INVÁLIDA de propósito: o que interessa é se
 * a resposta veio comprimida, não se alguém consegue entrar. Nenhuma senha aparece aqui.
 *
 * USO
 *   node docs/validacao/dc42_compressao.mjs
 */
import http from "node:http";

const API = process.env.API ?? "http://localhost:5207";

let passou = 0;
let falhou = 0;

function conferir(afirmacao, condicao, detalhe = "") {
  if (condicao) {
    passou++;
    console.log(`  ok    ${afirmacao}${detalhe ? `  (${detalhe})` : ""}`);
  } else {
    falhou++;
    console.log(`  FALHA ${afirmacao}${detalhe ? `  (${detalhe})` : ""}`);
  }
}

/** Requisição crua: devolve os bytes como chegaram, sem descomprimir nada. */
function pedir(caminho, { metodo = "GET", corpo = null, aceitar = null } = {}) {
  const { hostname, port } = new URL(API);
  const dados = corpo === null ? null : JSON.stringify(corpo);

  const cabecalhos = {};
  if (dados !== null) {
    cabecalhos["Content-Type"] = "application/json";
    cabecalhos["Content-Length"] = Buffer.byteLength(dados);
  }
  // `identity` é como se pede explicitamente "não comprima".
  cabecalhos["Accept-Encoding"] = aceitar ?? "identity";

  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname, port, path: caminho, method: metodo, headers: cabecalhos },
      (res) => {
        const pedacos = [];
        res.on("data", (p) => pedacos.push(p));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            codificacao: res.headers["content-encoding"] ?? null,
            vary: res.headers["vary"] ?? null,
            bytes: Buffer.concat(pedacos),
          }),
        );
      },
    );
    req.on("error", reject);
    req.setTimeout(0);
    if (dados !== null) req.write(dados);
    req.end();
  });
}

const razao = (cru, comprimido) => `${(cru / comprimido).toFixed(1)}x`;

console.log(`API: ${API}\n`);

// ── 1. Uma rota do DRE comprime ────────────────────────────────────────────
console.log("Rota do DRE — /api/dre-gerencial/filiais");

const cru = await pedir("/api/dre-gerencial/filiais");
const gzip = await pedir("/api/dre-gerencial/filiais", { aceitar: "gzip" });
const brotli = await pedir("/api/dre-gerencial/filiais", { aceitar: "br" });

conferir("sem pedir compressão, vem texto cru", cru.codificacao === null,
  `${cru.bytes.length} bytes`);
conferir("pedindo gzip, vem gzip", gzip.codificacao === "gzip",
  `${gzip.bytes.length} bytes, ${razao(cru.bytes.length, gzip.bytes.length)}`);
conferir("pedindo br, vem br", brotli.codificacao === "br",
  `${brotli.bytes.length} bytes, ${razao(cru.bytes.length, brotli.bytes.length)}`);
conferir("comprimido é menor que o cru", gzip.bytes.length < cru.bytes.length);
conferir("a resposta avisa que varia com Accept-Encoding",
  (gzip.vary ?? "").toLowerCase().includes("accept-encoding"), gzip.vary ?? "sem Vary");

// ── 2. Os dados são os MESMOS ──────────────────────────────────────────────
// Se a compressão mudasse um único byte do conteúdo, seria defeito grave e silencioso.
const { gunzipSync, brotliDecompressSync } = await import("node:zlib");
conferir("o gzip descomprimido é idêntico ao cru",
  gunzipSync(gzip.bytes).equals(cru.bytes));
conferir("o brotli descomprimido é idêntico ao cru",
  brotliDecompressSync(brotli.bytes).equals(cru.bytes));

// ── 3. A autenticação NÃO comprime ─────────────────────────────────────────
// Credencial inválida de propósito: o que se mede é o cabeçalho da resposta, não o acesso.
//
// A rota vem da branch da autenticação e pode ainda não existir aqui. Quando não existe, o
// bloco AVISA e não falha — a isenção está configurada e passa a ser exercitada no dia em
// que as duas branches se encontrarem. Falhar aqui só ensinaria a ignorar a dc42.
console.log("\nRota isenta — /api/auth/login");

const login = await pedir("/api/auth/login", {
  metodo: "POST",
  corpo: { login: "USUARIO-QUE-NAO-EXISTE-DC42", senha: "x" },
  aceitar: "gzip, br",
});

if (login.status === 404) {
  console.log("  --    a rota ainda não existe nesta branch; a isenção segue configurada");
} else {
  conferir("a rota respondeu", login.status !== undefined, `HTTP ${login.status}`);
  conferir("NÃO veio comprimida, mesmo com o cliente pedindo",
    login.codificacao === null,
    login.codificacao ?? "sem Content-Encoding — é o que se quer");
  conferir("o corpo é JSON legível, não bytes comprimidos",
    (() => { try { JSON.parse(login.bytes.toString("utf8")); return true; } catch { return false; } })());
}

// ── 4. O health, que não é isento, comprime ────────────────────────────────
// Prova que a isenção é da rota de autenticação e não um "nada comprime, afinal".
//
// Também fixa o comportamento em corpo curto. O `ResponseCompression` do ASP.NET não tem
// limiar mínimo: ou comprime o tipo de conteúdo, ou não comprime, e num corpo pequeno o
// cabeçalho do algoritmo pode custar mais do que há para economizar. No `Fastest` era o
// que acontecia aqui — 212 bytes viravam 225. No `Optimal`, que é o nível em uso, esta
// resposta ainda encolhe. Se um dia voltar a crescer, o nível mudou.
console.log("\nControle — /api/health");

const healthCru = await pedir("/api/health");
const healthGzip = await pedir("/api/health", { aceitar: "gzip" });

conferir("o health comprime quando pedem — não é isento", healthGzip.codificacao === "gzip");
conferir("e ainda encolhe, apesar de curta — no Fastest esta crescia",
  healthGzip.bytes.length < healthCru.bytes.length,
  `${healthCru.bytes.length} → ${healthGzip.bytes.length} bytes`);

console.log(`\n${passou} asserções passaram, ${falhou} falharam.`);
process.exit(falhou === 0 ? 0 : 1);

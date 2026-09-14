/**
 * POST sem teto de tempo, para os cenários que passam de cinco minutos.
 *
 * O `fetch` do Node desiste sozinho: o undici traz `headersTimeout` de 300 s, e um ano
 * inteiro de apuração estoura isso — o erro é `UND_ERR_HEADERS_TIMEOUT`, que parece falha
 * da API e não é. O cliente HTTP cru não tem esse relógio.
 *
 * <b>Isto vale para a medição, não para a tela.</b> O navegador tem limites próprios, e o
 * mesmo cenário que aqui só demora, no front pode morrer no meio — é um risco a tratar na
 * camada de front, não algo que este arquivo resolva.
 */
import http from "node:http";

export function postar(url, corpo) {
  const { hostname, port, pathname } = new URL(url);
  const dados = JSON.stringify(corpo);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname,
        port,
        path: pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(dados),
        },
      },
      (res) => {
        let texto = "";
        res.setEncoding("utf8");
        res.on("data", (p) => (texto += p));
        res.on("end", () => {
          try {
            resolve(JSON.parse(texto));
          } catch {
            reject(new Error(`resposta não é JSON (HTTP ${res.statusCode}): ${texto.slice(0, 200)}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(0);
    req.end(dados);
  });
}

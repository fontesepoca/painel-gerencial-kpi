import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";

/**
 * Repassa uma requisição do navegador para a API .NET, anexando o JWT da sessão.
 *
 * <b>Por que `node:http`, e não `fetch`.</b> Uma apuração leva até 407 s (dc19), e o `fetch`
 * do Node corta a resposta em 300 s (`headersTimeout`) — teto que só se altera instalando o
 * pacote `undici`, biblioteca nova que exige aprovação. `node:http` vem com o Node, não tem
 * esse teto e entrega a resposta em fluxo, sem guardá-la inteira na memória: o primeiro
 * pedaço chega ao navegador antes de a API terminar. <b>Não ponha `timeout` aqui</b>: o
 * `dc87` falha se puser.
 *
 * <b>`accept-encoding: identity` na ida.</b> A API comprime a resposta; o Node descomprime ao
 * ler e o cabeçalho `content-encoding` continuaria dizendo que há compressão — o navegador
 * receberia lixo. Entre o Next e a API, na mesma rede, comprimir só gasta CPU, e o Next
 * recomprime para fora.
 *
 * <b>Cancelamento.</b> Se o navegador desiste (fecha a aba, recarrega), o `signal` da
 * requisição dispara e a conexão com a API é destruída. A API vê a desistência
 * (`RequestAborted`) e cancela o comando Oracle: sem isto, a consulta de minutos continuaria
 * rodando no banco para ninguém.
 */
const CABECALHOS_DA_RESPOSTA = ["content-type", "cache-control", "content-disposition"] as const;

export function repassarParaApi(
  requisicao: Request,
  api: URL,
  caminhoComConsulta: string,
  token: string | null,
): Promise<Response> {
  return new Promise<Response>((resolve) => {
    const cliente = api.protocol === "https:" ? https : http;

    const cabecalhos: http.OutgoingHttpHeaders = {
      accept: "application/json",
      "accept-encoding": "identity",
    };
    const tipo = requisicao.headers.get("content-type");
    if (tipo) cabecalhos["content-type"] = tipo;
    // O token é do servidor: nunca vem do navegador e nunca volta para ele.
    if (token) cabecalhos.authorization = `Bearer ${token}`;

    const saida = cliente.request(
      {
        hostname: api.hostname,
        port: api.port || undefined,
        method: requisicao.method,
        path: caminhoComConsulta,
        headers: cabecalhos,
      },
      (entrada) => {
        const resposta = new Headers();
        for (const nome of CABECALHOS_DA_RESPOSTA) {
          const valor = entrada.headers[nome];
          if (typeof valor === "string") resposta.set(nome, valor);
        }

        const status = entrada.statusCode ?? 502;
        // 204 e 304 não admitem corpo: dar um a `Response` lança.
        const semCorpo = status === 204 || status === 304;

        resolve(
          new Response(
            semCorpo ? null : (Readable.toWeb(entrada) as unknown as ReadableStream<Uint8Array>),
            { status, headers: resposta },
          ),
        );
      },
    );

    saida.on("error", () => {
      // Depois do `resolve` de cima isto é no-op — o corpo já está a caminho e quem lê vê o
      // fluxo terminar com erro. Antes dele, é "a API não respondeu".
      resolve(
        Response.json(
          { sucesso: false, mensagem: "Não foi possível falar com o servidor. Tente de novo." },
          { status: 502 },
        ),
      );
    });

    requisicao.signal.addEventListener("abort", () => saida.destroy(), { once: true });

    if (requisicao.method === "GET" || requisicao.method === "HEAD") {
      saida.end();
      return;
    }

    requisicao.arrayBuffer().then(
      (corpo) => saida.end(Buffer.from(corpo)),
      () => saida.destroy(),
    );
  });
}

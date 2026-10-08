/**
 * Anexa o token a todo `fetch` para a API — para os scripts de validação que chamam a API
 * direto continuarem rodando depois que as rotas do DRE passaram a exigir `[Authorize]`.
 *
 *   KPI_LOGIN=… KPI_SENHA=… [KPI_BASE=Epoca|MinasRural] \
 *     node --import ./docs/rotinas/9815-dre-gerencial/validacao/_autenticar.mjs <script>
 *
 * Funciona por `--import`, e não por edição, porque são 21 scripts que montam o `fetch` cada
 * um do seu jeito — e editar 21 arquivos para acrescentar um cabeçalho é o tipo de mudança
 * em que um deles fica para trás sem ninguém notar.
 *
 * <b>A credencial vem de variável de ambiente, nunca de argumento nem de arquivo</b>, e
 * nunca é impressa. A base é a que a sessão de teste usará: `KPI_BASE`, padrão `Epoca`.
 *
 * Falha ALTO sem credencial: seguir sem token daria 401 em cada chamada e um relatório de
 * "divergência" que é só falta de login.
 */
const API = process.env.API ?? "http://localhost:5207";
const original = globalThis.fetch;
let token = null;

async function obterToken() {
  if (token) return token;

  const login = process.env.KPI_LOGIN;
  const senha = process.env.KPI_SENHA;
  if (!login || !senha) {
    throw new Error(
      "Defina KPI_LOGIN e KPI_SENHA (e, se for o Minas Rural, KPI_BASE=MinasRural) para o " +
        "script falar com a API: as rotas do DRE agora exigem sessão.",
    );
  }

  const r = await original(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, senha, base: process.env.KPI_BASE ?? "Epoca" }),
  });
  const corpo = await r.json().catch(() => null);

  if (!r.ok || !corpo?.dados?.token) {
    throw new Error(`Login recusado pela API (${r.status}): ${corpo?.mensagem ?? "sem mensagem"}`);
  }

  token = corpo.dados.token;
  return token;
}

// O `_postar.mjs` não usa `fetch` (usa `node:http`, para não ter o teto de 300 s do undici),
// então o embrulho abaixo não o alcança. Ele pede o token por aqui — sem `--import`, a
// função não existe e ele segue sem cabeçalho, como antes.
globalThis.__kpiObterToken = obterToken;

globalThis.fetch = async (entrada, init = {}) => {
  const url = typeof entrada === "string" ? entrada : (entrada.url ?? String(entrada));

  // Só a API, e nunca o próprio login (que é o que obtém o token).
  if (!url.startsWith(API) || url.startsWith(`${API}/api/auth/login`)) {
    return original(entrada, init);
  }

  const cabecalhos = new Headers(init.headers ?? {});
  cabecalhos.set("Authorization", `Bearer ${await obterToken()}`);
  return original(entrada, { ...init, headers: cabecalhos });
};

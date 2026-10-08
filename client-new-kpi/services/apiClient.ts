import type { ApiResponse } from "@/types/api";

/**
 * Cliente HTTP da API. Fetch nativo — sem axios nem wrapper de terceiros.
 *
 * Desembrulha o envelope ApiResponse<T> e devolve só os dados, para o componente
 * não repetir `resposta.dados!` em todo lugar. Falha vira ApiError, que o React
 * Query trata como erro da query.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly erros: string[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Parâmetros de querystring; undefined e null são omitidos. */
  params?: Record<string, string | number | boolean | undefined | null>;
}

async function request<T>(caminho: string, options: RequestOptions = {}): Promise<T> {
  const { body, params, headers, ...resto } = options;

  // MESMA ORIGEM. As chamadas do DRE passam pelo BFF (`app/api/[...caminho]`), que anexa o
  // JWT da sessão — o navegador nunca o tem. `NEXT_PUBLIC_API_URL` deixou de valer aqui: se
  // ainda valesse, uma build com ela definida iria direto à API, sem token, e receberia 401.
  const url = new URL(caminho, "http://origem.local");
  if (params) {
    for (const [chave, valor] of Object.entries(params)) {
      if (valor !== undefined && valor !== null) {
        url.searchParams.set(chave, String(valor));
      }
    }
  }
  const destino = `${url.pathname}${url.search}`;

  let resposta: Response;
  try {
    resposta = await fetch(destino, {
      ...resto,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // Dado financeiro nunca sai de cache.
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Não foi possível conectar à API.", 0);
  }

  // SESSÃO MORTA: o BFF já a encerrou. Ficar na tela mostrando "erro 401" não ajuda ninguém;
  // a saída é entrar de novo, e voltar para onde estava (`destinoSeguro` valida o caminho).
  if (
    resposta.status === 401 &&
    typeof window !== "undefined" &&
    !window.location.pathname.startsWith("/login")
  ) {
    const volta = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/login?destino=${encodeURIComponent(volta)}`);
  }

  let envelope: ApiResponse<T> | null = null;
  try {
    envelope = (await resposta.json()) as ApiResponse<T>;
  } catch {
    // Resposta sem corpo JSON (204, erro de proxy). Segue para o tratamento de status.
  }

  if (!resposta.ok || envelope?.sucesso === false) {
    throw new ApiError(
      envelope?.mensagem ?? `Erro ${resposta.status} ao chamar ${caminho}.`,
      resposta.status,
      envelope?.erros ?? [],
    );
  }

  return (envelope?.dados ?? null) as T;
}

export const apiClient = {
  get: <T>(caminho: string, options?: RequestOptions) =>
    request<T>(caminho, { ...options, method: "GET" }),

  post: <T>(caminho: string, body?: unknown, options?: RequestOptions) =>
    request<T>(caminho, { ...options, method: "POST", body }),

  put: <T>(caminho: string, body?: unknown, options?: RequestOptions) =>
    request<T>(caminho, { ...options, method: "PUT", body }),

  delete: <T>(caminho: string, options?: RequestOptions) =>
    request<T>(caminho, { ...options, method: "DELETE" }),
};

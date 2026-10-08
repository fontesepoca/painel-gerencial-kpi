/**
 * As decisões do BFF das rotas do DRE (`app/api/[...caminho]/route.ts`), separadas da cola
 * do Next para serem testáveis sem servidor: o `dc87` as exercita.
 *
 * <b>Só `dre-gerencial` e `health` passam.</b> `/api/auth/*` NÃO: o navegador não pode
 * chamar o login da API pulando o freio de tentativas de `app/api/sessao/route.ts`. Trocar
 * esta lista é trocar o que o navegador alcança na API — por isso ela é testada.
 */
const REPASSADOS = new Set(["dre-gerencial", "health"]);

/** O que fazer com uma chamada do navegador a `/api/<caminho>`. */
export type Repasse =
  | { tipo: "recusar"; status: 401 | 404; mensagem: string }
  | { tipo: "repassar"; caminho: string };

export function decidirRepasse(caminho: readonly string[], temSessao: boolean): Repasse {
  const primeiro = caminho[0] ?? "";

  if (!REPASSADOS.has(primeiro)) {
    return { tipo: "recusar", status: 404, mensagem: "Rota inexistente." };
  }

  // `health` é anônimo na API e serve para diagnosticar; o resto exige sessão.
  if (!temSessao && primeiro !== "health") {
    return {
      tipo: "recusar",
      status: 401,
      mensagem: "Sessão expirada ou ausente. Entre novamente.",
    };
  }

  // Cada segmento codificado: uma barra DENTRO de um segmento não pode virar outro caminho.
  return { tipo: "repassar", caminho: `/api/${caminho.map(encodeURIComponent).join("/")}` };
}

/**
 * Se a resposta da API mata a sessão do BFF. <b>Só o 401</b>: token sem o claim `base`,
 * expirado, ou de uma base que saiu da configuração. Se a sessão ficasse, o navegador teria
 * cookie vivo e sessão morta, e cada tela daria 401 sem nunca mandar a pessoa entrar de novo.
 * Um 503 (a base não respondeu) ou um 500 não dizem nada sobre a sessão.
 */
export function sessaoMorreu(status: number, temSessao: boolean): boolean {
  return temSessao && status === 401;
}

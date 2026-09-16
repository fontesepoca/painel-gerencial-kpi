import { randomBytes } from "node:crypto";

/**
 * As sessões, guardadas **no servidor Next**.
 *
 * ── Por que o token não vai para o navegador ──
 *
 * O JWT que a API emite carrega matrícula, nome e filiais, e vale oito horas. No navegador
 * ele estaria ao alcance de qualquer script da página — uma extensão, um XSS, um pacote
 * comprometido —, e não há como revogá-lo antes da expiração. Aqui ele fica na memória do
 * processo Node, e o navegador recebe apenas um identificador opaco de 256 bits num cookie
 * `HttpOnly`: um número que não diz nada e não serve em nenhum outro lugar.
 *
 * <b>O preço, aceito pelo Gabriel em 14/09/2026:</b> reiniciar o Next derruba todas as
 * sessões. Com 28 pessoas e um servidor só, isso é um novo login de vez em quando. Se um dia
 * houver mais de uma instância, este arquivo é o que precisa virar Redis — e é por isso que
 * ele é a única porta de entrada para a sessão.
 */

/** O que uma sessão guarda. O `token` nunca sai deste módulo. */
export interface Sessao {
  readonly token: string;
  readonly expiraEm: number;
  readonly usuario: UsuarioDaSessao;
  readonly criadaEm: number;
}

export interface UsuarioDaSessao {
  readonly matricula: number;
  readonly nome: string;
  readonly nomeGuerra: string;
  readonly filiais: readonly string[];
}

/** O que pode ser entregue ao navegador: tudo menos o token. */
export type SessaoPublica = Omit<Sessao, "token">;

export const NOME_DO_COOKIE = "epoca_analytics_sessao";

/**
 * O Map vive em `globalThis` de propósito.
 *
 * Em desenvolvimento, o Fast Refresh recarrega o módulo a cada edição — e um `Map` declarado
 * no escopo do módulo seria recriado vazio, deslogando quem estiver testando a cada vez que eu
 * salvar um arquivo. Pendurar no objeto global é o padrão do Next para estado de processo, e
 * em produção não muda nada: o módulo carrega uma vez só.
 */
const global = globalThis as typeof globalThis & {
  __sessoesEpocaAnalytics?: Map<string, Sessao>;
};

const sessoes = (global.__sessoesEpocaAnalytics ??= new Map<string, Sessao>());

/**
 * Cria a sessão e devolve o identificador que vai no cookie.
 *
 * **256 bits de `randomBytes`**, não `randomUUID`: um UUID v4 tem 122 bits de entropia e
 * carrega estrutura conhecida. Este identificador é a única coisa que separa um estranho da
 * sessão de alguém, e adivinhá-lo tem de ser impossível, não improvável.
 */
export function criarSessao(
  token: string,
  expiraEm: Date,
  usuario: UsuarioDaSessao,
): string {
  limparExpiradas();

  const id = randomBytes(32).toString("base64url");

  sessoes.set(id, {
    token,
    expiraEm: expiraEm.getTime(),
    usuario,
    criadaEm: Date.now(),
  });

  return id;
}

/**
 * A sessão, se existir e não tiver expirado.
 *
 * <b>Expirada é apagada aqui</b>, e não só ignorada: uma sessão morta que continua no Map é
 * memória retida e uma janela a mais para quem tivesse o identificador.
 */
export function lerSessao(id: string | undefined): Sessao | null {
  if (!id) return null;

  const sessao = sessoes.get(id);
  if (!sessao) return null;

  if (sessao.expiraEm <= Date.now()) {
    sessoes.delete(id);
    return null;
  }

  return sessao;
}

/** A sessão sem o token — o que pode atravessar a fronteira do servidor. */
export function lerSessaoPublica(id: string | undefined): SessaoPublica | null {
  const sessao = lerSessao(id);
  if (!sessao) return null;

  const { token: _token, ...publica } = sessao;
  return publica;
}

export function encerrarSessao(id: string | undefined): void {
  if (id) sessoes.delete(id);
}

/**
 * Varre as expiradas.
 *
 * Chamada na criação, e não num `setInterval`: um timer que roda para sempre num processo
 * Next é um recurso a mais para alguém lembrar de desligar, e o momento em que uma sessão
 * nova aparece é exatamente quando vale a pena pagar a varredura. Com dezenas de sessões,
 * percorrer o Map inteiro não custa nada mensurável.
 */
function limparExpiradas(): void {
  const agora = Date.now();
  for (const [id, sessao] of sessoes) {
    if (sessao.expiraEm <= agora) sessoes.delete(id);
  }
}

/** Quantas sessões vivas existem. Só para diagnóstico. */
export function totalDeSessoes(): number {
  limparExpiradas();
  return sessoes.size;
}

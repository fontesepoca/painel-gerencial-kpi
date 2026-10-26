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

/** O token e o usuário de UMA base. O `token` nunca sai deste módulo. */
export interface SessaoDeBase {
  readonly token: string;
  readonly usuario: UsuarioDaSessao;
}

/** Uma base para a qual dá para trocar sem novo login — o que a tela precisa, sem token. */
export interface TrocaDeBase {
  readonly base: { readonly id: string; readonly rotulo: string };
  readonly rotinas: readonly string[];
}

/**
 * A sessão como os outros módulos a veem: o token e o usuário são os da base ATIVA, e quem
 * repassa à API (`app/api/[...caminho]`) não precisa saber que existem outras.
 */
export interface Sessao {
  readonly token: string;
  readonly expiraEm: number;
  readonly usuario: UsuarioDaSessao;
  readonly criadaEm: number;
  /** As OUTRAS bases guardadas — a troca sem novo login (26/10/2026). Vazia quando não há. */
  readonly trocas: readonly TrocaDeBase[];
}

/**
 * O que o Map guarda: um token por base e qual está ativa.
 *
 * TROCA DE BASE SEM NOVO LOGIN (26/10/2026, pedido do Gabriel). O login já conferiu a senha
 * em cada base guardada aqui — ver `ConferirOutrasBasesAsync` na API —, e trocar é só passar
 * a usar outro token. Nenhuma chamada à API, nenhuma senha guardada.
 */
interface Guardada {
  readonly porBase: ReadonlyMap<string, SessaoDeBase>;
  baseAtiva: string;
  readonly expiraEm: number;
  readonly criadaEm: number;
}

export interface UsuarioDaSessao {
  readonly matricula: number;
  readonly nome: string;
  readonly nomeGuerra: string;
  readonly filiais: readonly string[];
  /**
   * Os códigos das rotinas do Winthor que esta pessoa pode abrir — `9815` é o DRE.
   *
   * **Vazia é estado válido.** Desde 18/09/2026 quem não tem permissão nenhuma entra do
   * mesmo jeito: antes era barrado no login e lia "você não tem acesso ao DRE" numa tela
   * onde não havia nada a fazer. Agora entra e a tela inicial mostra que não há o que abrir.
   */
  readonly rotinas: readonly string[];

  /**
   * A base em que esta pessoa entrou. <b>Faz parte da identidade:</b> a matrícula 144 da
   * Época e a 144 do Minas Rural são pessoas diferentes. Vem da API, que a leu do token que
   * ela mesma emitiu.
   */
  readonly base: { readonly id: string; readonly rotulo: string };
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
 *
 * A chave mudou com a troca de base (26/10/2026): uma sessão no formato antigo, que o Fast
 * Refresh manteria na memória, não tem `porBase`. Chave nova derruba as sessões de
 * desenvolvimento uma vez, em vez de cada leitura precisar reconhecer os dois formatos.
 */
const global = globalThis as typeof globalThis & {
  __sessoesPorBaseEpocaAnalytics?: Map<string, Guardada>;
};

const sessoes = (global.__sessoesPorBaseEpocaAnalytics ??= new Map<string, Guardada>());

/**
 * Cria a sessão e devolve o identificador que vai no cookie.
 *
 * **256 bits de `randomBytes`**, não `randomUUID`: um UUID v4 tem 122 bits de entropia e
 * carrega estrutura conhecida. Este identificador é a única coisa que separa um estranho da
 * sessão de alguém, e adivinhá-lo tem de ser impossível, não improvável.
 */
export function criarSessao(
  principal: SessaoDeBase,
  expiraEm: Date,
  outras: readonly SessaoDeBase[] = [],
): string {
  limparExpiradas();

  const id = randomBytes(32).toString("base64url");

  const porBase = new Map<string, SessaoDeBase>();
  for (const sessao of [principal, ...outras]) porBase.set(sessao.usuario.base.id, sessao);

  sessoes.set(id, {
    porBase,
    baseAtiva: principal.usuario.base.id,
    expiraEm: expiraEm.getTime(),
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

  const guardada = sessoes.get(id);
  if (!guardada) return null;

  if (guardada.expiraEm <= Date.now()) {
    sessoes.delete(id);
    return null;
  }

  const sessao = guardada.porBase.get(guardada.baseAtiva);
  if (!sessao) {
    sessoes.delete(id);
    return null;
  }

  // Sessão criada antes de as rotinas existirem no `UsuarioDaSessao` (18/09/2026) morre
  // aqui, e não é preguiça de migrar: sem a lista, `podeAbrir` devolve `false` para tudo, e
  // quem estava logado veria a tela inicial dizendo que não tem acesso a nada — sem entender,
  // e sem que sair e entrar fosse a primeira coisa a tentar. Preferimos o login a mais.
  //
  // Na prática isto quase nunca dispara: o Map vive na memória do processo, e subir a versão
  // nova já derruba todas as sessões. Fica para o Fast Refresh em desenvolvimento, que
  // recarrega o módulo sem reiniciar o processo.
  if (!Array.isArray(sessao.usuario.rotinas)) {
    sessoes.delete(id);
    return null;
  }

  // Mesma razão, para a base: sessão sem ela é de antes da bifurcação (Fast Refresh em
  // desenvolvimento, que recarrega o módulo sem reiniciar o processo). Sem base nenhuma
  // consulta saberia onde rodar, e o proxy a recusaria de qualquer jeito — só que com um 401
  // sem explicação. Melhor encerrar aqui e mandar a pessoa entrar.
  if (!sessao.usuario.base?.id) {
    sessoes.delete(id);
    return null;
  }

  return {
    token: sessao.token,
    usuario: sessao.usuario,
    expiraEm: guardada.expiraEm,
    criadaEm: guardada.criadaEm,
    trocas: [...guardada.porBase.values()]
      .filter((s) => s.usuario.base.id !== guardada.baseAtiva)
      .map((s) => ({ base: s.usuario.base, rotinas: s.usuario.rotinas })),
  };
}

/**
 * Passa a usar o token de outra base JÁ GUARDADA nesta sessão (R5).
 *
 * Só troca para base que está no Map: quem forjar o corpo da requisição com outra base recebe
 * `base-desconhecida`, porque aqui não há senha para conferir — a conferência foi no login.
 * A validade não muda (R6): trocar não é entrar de novo.
 */
export function trocarBase(
  id: string | undefined,
  base: string,
): "trocou" | "sem-sessao" | "base-desconhecida" {
  if (!id || !lerSessao(id)) return "sem-sessao";

  const guardada = sessoes.get(id)!;
  if (!guardada.porBase.has(base)) return "base-desconhecida";

  guardada.baseAtiva = base;
  return "trocou";
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

/**
 * Freio nas tentativas de login.
 *
 * A senha é a do Winthor, tem oito horas de validade por sessão e é comparada **sem
 * diferenciar maiúsculas** — herança do painel antigo, registrada em `docs/AUTENTICACAO.md`.
 * Isso encurta o espaço de busca, e sem freio nenhum a tela de login aceitaria milhares de
 * tentativas por minuto contra a senha de qualquer funcionário cujo nome de guerra alguém
 * conheça.
 *
 * Não substitui um WAF nem bloqueio de conta; é o mínimo que impede força bruta caseira.
 *
 * <b>Por chave, e não só por IP.</b> A chave combina IP e nome digitado: dois problemas
 * diferentes, uma solução. Só por IP, um escritório inteiro atrás do mesmo NAT se trancaria
 * junto. Só por nome, quem conhece vários nomes de guerra contorna o freio trocando de alvo.
 */

interface Janela {
  tentativas: number;
  /** Quando esta janela começou. */
  desde: number;
}

const JANELA_MS = 5 * 60 * 1000;
const MAXIMO_POR_JANELA = 10;

const global = globalThis as typeof globalThis & {
  __tentativasEpocaKpi?: Map<string, Janela>;
};

const janelas = (global.__tentativasEpocaKpi ??= new Map<string, Janela>());

export interface ResultadoDoFreio {
  readonly liberado: boolean;
  /** Quantos segundos faltam para poder tentar de novo. */
  readonly esperarSegundos: number;
}

/**
 * Registra uma tentativa e diz se ela pode seguir.
 *
 * A contagem sobe **antes** da consulta ao banco, e é por isso que a chamada acontece no
 * começo do handler: contar só as que falham deixaria o caminho livre para quem não espera
 * resposta nenhuma — dispara mil requisições e ignora todas as respostas.
 */
export function registrarTentativa(ip: string, login: string): ResultadoDoFreio {
  limpar();

  const chave = `${ip}|${login.toUpperCase()}`;
  const agora = Date.now();
  const janela = janelas.get(chave);

  if (!janela || agora - janela.desde >= JANELA_MS) {
    janelas.set(chave, { tentativas: 1, desde: agora });
    return { liberado: true, esperarSegundos: 0 };
  }

  janela.tentativas += 1;

  if (janela.tentativas > MAXIMO_POR_JANELA) {
    const restante = JANELA_MS - (agora - janela.desde);
    return { liberado: false, esperarSegundos: Math.ceil(restante / 1000) };
  }

  return { liberado: true, esperarSegundos: 0 };
}

/** Login concluído zera o contador: quem acertou a senha não é quem estávamos freando. */
export function esquecerTentativas(ip: string, login: string): void {
  janelas.delete(`${ip}|${login.toUpperCase()}`);
}

function limpar(): void {
  const agora = Date.now();
  for (const [chave, janela] of janelas) {
    if (agora - janela.desde >= JANELA_MS) janelas.delete(chave);
  }
}

/** Uma base como o seletor do login a recebe de `GET /api/bases`. */
export interface BaseOferecida {
  id: string;
  rotulo: string;
}

/** Onde este navegador lembra a última base usada — conveniência por pessoa, nada além. */
export const CHAVE_ULTIMA_BASE = "epoca:login:ultimaBase";

/**
 * Qual base vem selecionada ao abrir o login: a última que a pessoa usou NESTE navegador, se
 * ela ainda estiver na lista; senão a primeira.
 *
 * <b>Nunca devolve uma base que não está na lista.</b> A lembrada pode ter saído da
 * configuração, e devolvê-la mandaria um login para uma base que o servidor vai recusar.
 * Lista vazia devolve `""`, que é o que mantém o botão de entrar desligado: sem base, não há
 * login.
 */
export function escolherBaseInicial(
  lista: readonly BaseOferecida[],
  ultima: string | null,
): string {
  if (ultima !== null) {
    const achada = lista.find((b) => b.id === ultima);
    if (achada) return achada.id;
  }

  return lista[0]?.id ?? "";
}

/** `try/catch` porque o armazenamento falha em janela anônima e com dados de site bloqueados. */
export function lerUltimaBase(): string | null {
  try {
    return localStorage.getItem(CHAVE_ULTIMA_BASE);
  } catch {
    return null;
  }
}

export function guardarUltimaBase(id: string): void {
  try {
    localStorage.setItem(CHAVE_ULTIMA_BASE, id);
  } catch {
    // Sem armazenamento a pessoa perde a conveniência de voltar à última base. Nada além.
  }
}

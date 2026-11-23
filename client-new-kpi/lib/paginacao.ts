/**
 * Paginação da tabela do simulador (spec de 23/11/2026, paginação).
 *
 * <b>Por que existe.</b> ~9.800 produtos desenhados de uma vez são ~176 mil células na página, e
 * qualquer mudança de estado (abrir o quadro, confirmar, digitar) custava ~0,3 s só para o
 * navegador recalcular estilo e layout — medido em 23/11/2026, igual com qualquer CSS. Só
 * resolve desenhar menos linhas. A lista inteira continua na memória da aba: a busca, as
 * contagens e a simulação valem para todos os produtos; isto só decide quais viram HTML.
 */

/** Quantos produtos a tabela desenha por vez. */
export const TAMANHO_DA_PAGINA = 100;

/**
 * A fatia de `lista` que cabe na `pagina` (contada a partir de 1).
 *
 * A página devolvida é a EFETIVA, presa entre 1 e o total: uma busca que reduz a lista estando
 * na página 50 cai na última que existe, e nunca mostra uma tabela vazia por engano.
 */
export function paginar<T>(
  lista: readonly T[],
  pagina: number,
  tamanho: number,
): { itens: T[]; pagina: number; totalPaginas: number } {
  const totalPaginas = Math.max(1, Math.ceil(lista.length / tamanho));
  const efetiva = Math.min(Math.max(1, Math.floor(pagina)), totalPaginas);
  const inicio = (efetiva - 1) * tamanho;
  return { itens: lista.slice(inicio, inicio + tamanho), pagina: efetiva, totalPaginas };
}

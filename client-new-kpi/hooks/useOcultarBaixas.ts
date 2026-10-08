"use client";

import { useSyncExternalStore } from "react";

/**
 * O checkbox "Ocultar baixas estornadas e da rotina 737", **um só para a página**.
 *
 * Um valor de módulo, e não `useState` na tabela, porque quem lê não é só a tabela: o Excel
 * sai pelo botão do cabeçalho do modal (`TabelaDre`) e pelo da página dedicada, e o arquivo
 * tem de contar a mesma coisa que a tela — senão a pessoa desmarca, vê 160 linhas a mais,
 * exporta e não as encontra na planilha.
 *
 * **Não é guardado.** Todo carregamento começa marcado, que é o padrão pedido; a escolha vale
 * enquanto a página estiver aberta, inclusive de um detalhamento para o outro.
 */
let ocultar = true;
const ouvintes = new Set<() => void>();

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function definirOcultarBaixas(valor: boolean) {
  if (valor === ocultar) return;
  ocultar = valor;
  for (const o of ouvintes) o();
}

export function useOcultarBaixas(): [boolean, (valor: boolean) => void] {
  // No servidor também começa marcado: o HTML inicial e a hidratação concordam.
  const valor = useSyncExternalStore(assinar, () => ocultar, () => true);
  return [valor, definirOcultarBaixas];
}

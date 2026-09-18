"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";

/**
 * Tema da aplicação. `escuro` é o padrão — a paleta Época Analytics nasceu escura, e
 * é assim que a tela é entregue.
 */
export type Tema = "escuro" | "claro";

const CHAVE = "epoca:tema";

/**
 * Escrito em `data-tema` no `<html>`, **não** numa classe.
 *
 * O `className` do `<html>` é controlado pelo React, que o reescreve a cada render a
 * partir do JSX do layout — uma classe posta por fora seria apagada na primeira
 * atualização. Atributo `data-` não está no JSX, então ninguém disputa com ele. É o
 * mesmo motivo pelo qual `data-leitura` funciona hoje.
 */
export const SCRIPT_TEMA_INICIAL = `try{var t=localStorage.getItem(${JSON.stringify(CHAVE)});document.documentElement.dataset.tema=t==="claro"?"claro":"escuro"}catch(e){document.documentElement.dataset.tema="escuro"}`;

/**
 * ── O `<html>` é a fonte da verdade, e o React só o lê ──
 *
 * Até 16/09/2026 este provedor guardava o tema em `useState` e o escrevia no `<html>` por
 * efeito. Isso produzia uma **piscada em toda navegação de quem usa o tema claro**, e a
 * sequência explica por quê:
 *
 *   1. o script acima roda no `<head>` e escreve `data-tema="claro"` antes da primeira
 *      pintura — exatamente o que ele existe para fazer;
 *   2. o React hidrata com o estado nascendo `"escuro"`, e o efeito de sincronização
 *      **sobrescreve o atributo com `"escuro"`** — a tela inteira clareia por um quadro;
 *   3. o outro efeito lê o `localStorage`, chama `setTema("claro")`, e o atributo volta.
 *
 * O provedor desfazia o trabalho do script e refazia logo depois. Agora o estado não é dele:
 * `useSyncExternalStore` lê o atributo que o script já pôs, e escrever só acontece quando
 * alguém aperta o interruptor.
 */

/**
 * O valor corrente, em memória.
 *
 * `useSyncExternalStore` compara snapshots por identidade e chama `getSnapshot` várias vezes
 * por render. Ler o DOM a cada chamada funcionaria — são strings, comparadas por valor —, mas
 * este cache existe por outro motivo: durante a impressão o atributo é trocado para `claro` e
 * não pode arrastar o tema da tela junto. Ver o efeito de impressão abaixo.
 */
let corrente: Tema | null = null;

const ouvintes = new Set<() => void>();

function lerDoDocumento(): Tema {
  return document.documentElement.dataset.tema === "claro" ? "claro" : "escuro";
}

function inscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

function snapshot(): Tema {
  corrente ??= lerDoDocumento();
  return corrente;
}

/** No servidor não há `<html>` para ler; o HTML sai no padrão, e o script corrige antes da pintura. */
function snapshotDoServidor(): Tema {
  return "escuro";
}

const Contexto = createContext<{
  tema: Tema;
  claro: boolean;
  alternar: (claro: boolean) => void;
} | null>(null);

export function TemaProvider({ children }: { children: React.ReactNode }) {
  const tema = useSyncExternalStore(inscrever, snapshot, snapshotDoServidor);

  /**
   * Impressão sai sempre no tema claro, seja qual for o tema da tela.
   *
   * A maioria das impressoras descarta fundo por padrão: o tema escuro sairia como
   * texto quase branco em papel branco. Forçar o claro aqui, e não duplicar a paleta
   * dentro de `@media print`, mantém uma fonte de verdade só para as cores.
   *
   * Escreve direto no `<html>` **sem avisar os inscritos**: é uma troca temporária de
   * aparência, não uma escolha do usuário. O `afterprint` devolve o tema de antes, lido de
   * `corrente` — e não do documento, que nesse instante está mentindo.
   */
  useEffect(() => {
    const raiz = document.documentElement;
    const aoImprimir = () => {
      raiz.dataset.tema = "claro";
    };
    const aoTerminar = () => {
      raiz.dataset.tema = snapshot();
    };

    window.addEventListener("beforeprint", aoImprimir);
    window.addEventListener("afterprint", aoTerminar);
    return () => {
      window.removeEventListener("beforeprint", aoImprimir);
      window.removeEventListener("afterprint", aoTerminar);
    };
  }, []);

  const alternar = useCallback((claro: boolean) => {
    const novo: Tema = claro ? "claro" : "escuro";

    corrente = novo;
    document.documentElement.dataset.tema = novo;

    try {
      localStorage.setItem(CHAVE, novo);
    } catch {
      // Sem persistência, a escolha vale só para esta sessão.
    }

    for (const ouvinte of ouvintes) ouvinte();
  }, []);

  return (
    <Contexto.Provider value={{ tema, claro: tema === "claro", alternar }}>
      {children}
    </Contexto.Provider>
  );
}

export function useTema() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useTema precisa estar dentro de <TemaProvider>.");
  return ctx;
}

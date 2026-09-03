"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

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

const Contexto = createContext<{
  tema: Tema;
  claro: boolean;
  alternar: (claro: boolean) => void;
} | null>(null);

export function TemaProvider({ children }: { children: React.ReactNode }) {
  // Nasce escuro para bater com o que o script já escreveu no <html>.
  const [tema, setTema] = useState<Tema>("escuro");

  // Só depois da hidratação: no servidor não existe localStorage, e divergir do
  // HTML inicial quebraria a hidratação.
  useEffect(() => {
    try {
      if (localStorage.getItem(CHAVE) === "claro") setTema("claro");
    } catch {
      // Armazenamento bloqueado: fica no escuro.
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
  }, [tema]);

  /**
   * Impressão sai sempre no tema claro, seja qual for o tema da tela.
   *
   * A maioria das impressoras descarta fundo por padrão: o tema escuro sairia como
   * texto quase branco em papel branco. Forçar o claro aqui, e não duplicar a paleta
   * dentro de `@media print`, mantém uma fonte de verdade só para as cores.
   *
   * Escreve direto no `<html>` em vez de mexer no estado: assim não persiste em
   * `localStorage` nem pisca a tela, e o `afterprint` devolve o tema de antes.
   */
  useEffect(() => {
    const raiz = document.documentElement;
    const aoImprimir = () => {
      raiz.dataset.tema = "claro";
    };
    const aoTerminar = () => {
      raiz.dataset.tema = tema;
    };

    window.addEventListener("beforeprint", aoImprimir);
    window.addEventListener("afterprint", aoTerminar);
    return () => {
      window.removeEventListener("beforeprint", aoImprimir);
      window.removeEventListener("afterprint", aoTerminar);
    };
  }, [tema]);

  const alternar = useCallback((claro: boolean) => {
    const novo: Tema = claro ? "claro" : "escuro";
    setTema(novo);
    try {
      localStorage.setItem(CHAVE, novo);
    } catch {
      // Sem persistência, a escolha vale só para esta sessão.
    }
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

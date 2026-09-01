"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * Modo de leitura da tela.
 *
 * `ampliada` é o **padrão** — quem abre o DRE é o dono da empresa, e a tela precisa
 * ser legível antes de ser compacta. Quem quiser mais linhas na tela desliga.
 */
export type ModoLeitura = "ampliada" | "padrao";

const CHAVE = "epoca:leitura";

/**
 * Script que roda **antes da primeira pintura**, injetado no `<head>`. Sem ele a página
 * nasceria no modo padrão e saltaria para o ampliado quando o React hidratasse — um
 * pulo de tamanho de fonte na cara de quem justamente precisa de fonte grande.
 *
 * Só o valor `padrao` desliga; qualquer outra coisa, inclusive erro de acesso ao
 * `localStorage`, cai no ampliado.
 */
export const SCRIPT_LEITURA_INICIAL = `try{var m=localStorage.getItem(${JSON.stringify(CHAVE)});document.documentElement.dataset.leitura=m==="padrao"?"padrao":"ampliada"}catch(e){document.documentElement.dataset.leitura="ampliada"}`;

const Contexto = createContext<{
  modo: ModoLeitura;
  ampliada: boolean;
  alternar: (ampliada: boolean) => void;
} | null>(null);

export function LeituraProvider({ children }: { children: React.ReactNode }) {
  // Nasce ampliada para bater com o que o script já escreveu no <html>.
  const [modo, setModo] = useState<ModoLeitura>("ampliada");

  // Lê a preferência salva só depois da hidratação: no servidor não existe
  // localStorage, e divergir do HTML inicial quebraria a hidratação.
  useEffect(() => {
    try {
      if (localStorage.getItem(CHAVE) === "padrao") setModo("padrao");
    } catch {
      // Navegador com armazenamento bloqueado: fica no padrão ampliado.
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.leitura = modo;
  }, [modo]);

  const alternar = useCallback((ampliada: boolean) => {
    const novo: ModoLeitura = ampliada ? "ampliada" : "padrao";
    setModo(novo);
    try {
      localStorage.setItem(CHAVE, novo);
    } catch {
      // Sem persistência, a escolha vale só para esta sessão.
    }
  }, []);

  return (
    <Contexto.Provider value={{ modo, ampliada: modo === "ampliada", alternar }}>
      {children}
    </Contexto.Provider>
  );
}

export function useLeitura() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("useLeitura precisa estar dentro de <LeituraProvider>.");
  return ctx;
}

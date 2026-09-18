"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

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

/**
 * ── O `<html>` é a fonte da verdade, e o React só o lê ──
 *
 * Mesma correção do `TemaProvider`, em 16/09/2026, e pelo mesmo motivo: guardar o modo em
 * `useState` e escrevê-lo por efeito fazia o provedor **sobrescrever o atributo que o script
 * acima já tinha posto**, para só então corrigi-lo no render seguinte. No tema isso aparecia
 * como a tela clareando por um quadro em toda navegação; aqui apareceria como um pulo de
 * tamanho de fonte — justamente o que o script existe para evitar.
 *
 * O defeito ficou escondido porque o padrão é `ampliada`: quem nunca desligou não via nada.
 */

let corrente: ModoLeitura | null = null;

const ouvintes = new Set<() => void>();

function inscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

function snapshot(): ModoLeitura {
  corrente ??= document.documentElement.dataset.leitura === "padrao" ? "padrao" : "ampliada";
  return corrente;
}

/** No servidor não há `<html>` para ler; o HTML sai no padrão, e o script corrige antes da pintura. */
function snapshotDoServidor(): ModoLeitura {
  return "ampliada";
}

const Contexto = createContext<{
  modo: ModoLeitura;
  ampliada: boolean;
  alternar: (ampliada: boolean) => void;
} | null>(null);

export function LeituraProvider({ children }: { children: React.ReactNode }) {
  const modo = useSyncExternalStore(inscrever, snapshot, snapshotDoServidor);

  const alternar = useCallback((ampliada: boolean) => {
    const novo: ModoLeitura = ampliada ? "ampliada" : "padrao";

    corrente = novo;
    document.documentElement.dataset.leitura = novo;

    try {
      localStorage.setItem(CHAVE, novo);
    } catch {
      // Sem persistência, a escolha vale só para esta sessão.
    }

    for (const ouvinte of ouvintes) ouvinte();
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

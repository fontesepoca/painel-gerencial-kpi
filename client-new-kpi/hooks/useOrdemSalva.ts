"use client";

import { useCallback, useEffect, useState } from "react";
import type { Analise } from "@/types/dre-gerencial";

/**
 * A ordem é **por dimensão de análise**. Grupo de Contas e Centro de Custo não
 * compartilham uma linha sequer — uma ordem salva numa não diz nada sobre a outra.
 * Não entra filial nem período na chave: a estrutura do DRE é a mesma nos dois.
 */
const chaveArmazenamento = (analise: Analise) => `epoca:dre:ordem:v1:${analise}`;

/** Lê e valida. Conteúdo estragado é descartado, nunca aplicado pela metade. */
function ler(analise: Analise): string[] | null {
  try {
    const bruto = localStorage.getItem(chaveArmazenamento(analise));
    if (!bruto) return null;

    const valor: unknown = JSON.parse(bruto);
    if (!Array.isArray(valor) || !valor.every((x) => typeof x === "string")) return null;

    return valor as string[];
  } catch {
    // localStorage bloqueado (janela anônima, política do navegador) ou JSON quebrado.
    // A tela funciona sem: cai na ordem do cadastro.
    return null;
  }
}

/**
 * Ordem manual das linhas, guardada no navegador.
 *
 * Fica só na máquina de quem mexeu, de propósito: é preferência de leitura, não
 * cadastro. Duas pessoas conferindo o mesmo DRE não deveriam ver a tabela de um jeito
 * porque a outra arrastou uma linha.
 */
export function useOrdemSalva(analise: Analise) {
  const [ordem, setOrdem] = useState<string[] | null>(null);

  // Só no cliente: no servidor não existe localStorage, e a tabela nasce na ordem do
  // cadastro até este efeito rodar.
  useEffect(() => {
    setOrdem(ler(analise));
  }, [analise]);

  const salvar = useCallback(
    (chaves: string[]) => {
      setOrdem(chaves);
      try {
        localStorage.setItem(chaveArmazenamento(analise), JSON.stringify(chaves));
      } catch {
        // Sem espaço ou sem permissão: a ordem vale para esta sessão e não persiste.
      }
    },
    [analise],
  );

  const limpar = useCallback(() => {
    setOrdem(null);
    try {
      localStorage.removeItem(chaveArmazenamento(analise));
    } catch {
      /* idem */
    }
  }, [analise]);

  return { ordem, salvar, limpar };
}

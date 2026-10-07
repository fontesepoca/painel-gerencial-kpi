"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Analise } from "@/types/dre-gerencial";

import { chaveDaOrdem, chavesAntigasDaOrdem } from "@/lib/chavesPorBase";

/**
 * A ordem é **por base e por dimensão de análise**. Grupo de Contas e Centro de Custo não
 * compartilham uma linha sequer — uma ordem salva numa não diz nada sobre a outra — e as
 * linhas do Minas Rural não são as da Época. Não entra filial nem período na chave: a
 * estrutura do DRE é a mesma nos dois recortes. As chaves moram em `lib/chavesPorBase.ts`.
 */

/**
 * ── Por que isto não é `useState` + `useEffect` ──
 *
 * Era, até 16/09/2026: um efeito lia o `localStorage` e chamava `setOrdem`. Funcionava, e o
 * lint do React 19 reclamava com razão — `setState` síncrono dentro de efeito provoca um
 * segundo render logo depois do primeiro, e a tabela nascia na ordem do cadastro para só então
 * saltar para a ordem salva. Num DRE de 140 linhas, esse salto é visível.
 *
 * `useSyncExternalStore` existe exatamente para isto: um dado que vive **fora** do React, que
 * precisa ser lido no render sem quebrar a hidratação. O servidor devolve `null` (não há
 * `localStorage` lá), o cliente devolve o valor guardado, e o React sabe conciliar os dois.
 *
 * De graça vem a sincronia entre abas: duas telas do mesmo DRE abertas lado a lado deixam de
 * divergir quando alguém arrasta uma linha numa delas.
 */

/**
 * O texto cru que estava no armazenamento na última leitura, por chave.
 *
 * <b>É o que torna o snapshot estável, e sem ele nada disto funciona.</b>
 * `useSyncExternalStore` compara o retorno de `getSnapshot` por identidade: devolver um array
 * novo a cada chamada — que é o que `JSON.parse` faz — convenceria o React de que o valor
 * mudou a cada render, e o resultado é um laço infinito de renderizações. Guardando o texto
 * cru, só reanalisamos quando ele de fato mudou.
 */
const cache = new Map<string, { bruto: string | null; valor: string[] | null }>();

/** Quem avisar quando a ordem mudar nesta aba. */
const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const ouvinte of ouvintes) ouvinte();
}

function inscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);

  // `storage` só dispara em OUTRAS abas — nunca na que escreveu. É por isso que `salvar` e
  // `limpar` chamam `avisar()` à mão: um cobre as outras abas, o outro cobre esta.
  window.addEventListener("storage", ouvinte);

  return () => {
    ouvintes.delete(ouvinte);
    window.removeEventListener("storage", ouvinte);
  };
}

/** Lê e valida. Conteúdo estragado é descartado, nunca aplicado pela metade. */
function ler(baseId: string, analise: Analise): string[] | null {
  // Sem base conhecida (a sessão ainda não chegou), não há ordem a ler: aplicar a de outra
  // base seria exatamente o engano que a chave por base existe para impedir.
  if (!baseId) return null;

  const chave = chaveDaOrdem(baseId, analise);

  let bruto: string | null;
  try {
    // A chave desta base; e, só para a Época, a de ANTES das bases (v1), para ninguém perder
    // a ordem que já tinha. Na primeira vez que a pessoa reordenar, a v2 passa a valer.
    bruto = localStorage.getItem(chave);
    for (const antiga of chavesAntigasDaOrdem(baseId, analise)) {
      if (bruto !== null) break;
      bruto = localStorage.getItem(antiga);
    }
  } catch {
    // localStorage bloqueado (janela anônima, política do navegador).
    // A tela funciona sem: cai na ordem do cadastro.
    return null;
  }

  const guardado = cache.get(chave);
  if (guardado && guardado.bruto === bruto) return guardado.valor;

  let valor: string[] | null = null;
  try {
    const analisado: unknown = bruto ? JSON.parse(bruto) : null;
    if (Array.isArray(analisado) && analisado.every((x) => typeof x === "string")) {
      valor = analisado as string[];
    }
  } catch {
    // JSON quebrado: ignora e segue com a ordem do cadastro.
  }

  cache.set(chave, { bruto, valor });
  return valor;
}

/**
 * Ordem manual das linhas, guardada no navegador.
 *
 * Fica só na máquina de quem mexeu, de propósito: é preferência de leitura, não
 * cadastro. Duas pessoas conferindo o mesmo DRE não deveriam ver a tabela de um jeito
 * porque a outra arrastou uma linha.
 */
export function useOrdemSalva(baseId: string, analise: Analise) {
  const ordem = useSyncExternalStore(
    inscrever,
    () => ler(baseId, analise),
    // No servidor não existe `localStorage`, e a tabela nasce na ordem do cadastro. Sem este
    // terceiro argumento, o React não teria o que renderizar no servidor e a rota inteira
    // falharia na primeira passagem.
    () => null,
  );

  const salvar = useCallback(
    (chaves: string[]) => {
      if (!baseId) return;
      try {
        localStorage.setItem(chaveDaOrdem(baseId, analise), JSON.stringify(chaves));
      } catch {
        // Sem espaço ou sem permissão: a ordem não persiste, e o aviso abaixo faz a tela
        // voltar para o que está guardado — que é a verdade. Fingir que salvou seria pior.
      }
      avisar();
    },
    [baseId, analise],
  );

  const limpar = useCallback(() => {
    if (!baseId) return;
    try {
      localStorage.removeItem(chaveDaOrdem(baseId, analise));
      // E as antigas: sem isto, "Restaurar ordem do cadastro" devolveria a v1 pela porta dos
      // fundos, e a pessoa veria a ordem voltar sozinha.
      for (const antiga of chavesAntigasDaOrdem(baseId, analise)) {
        localStorage.removeItem(antiga);
      }
    } catch {
      /* idem */
    }
    avisar();
  }, [baseId, analise]);

  return { ordem, salvar, limpar };
}

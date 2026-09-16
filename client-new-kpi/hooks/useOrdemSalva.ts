"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Analise } from "@/types/dre-gerencial";

/**
 * A ordem é **por dimensão de análise**. Grupo de Contas e Centro de Custo não
 * compartilham uma linha sequer — uma ordem salva numa não diz nada sobre a outra.
 * Não entra filial nem período na chave: a estrutura do DRE é a mesma nos dois.
 */
const chaveArmazenamento = (analise: Analise) => `epoca:dre:ordem:v1:${analise}`;

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
function ler(analise: Analise): string[] | null {
  const chave = chaveArmazenamento(analise);

  let bruto: string | null;
  try {
    bruto = localStorage.getItem(chave);
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
export function useOrdemSalva(analise: Analise) {
  const ordem = useSyncExternalStore(
    inscrever,
    () => ler(analise),
    // No servidor não existe `localStorage`, e a tabela nasce na ordem do cadastro. Sem este
    // terceiro argumento, o React não teria o que renderizar no servidor e a rota inteira
    // falharia na primeira passagem.
    () => null,
  );

  const salvar = useCallback(
    (chaves: string[]) => {
      try {
        localStorage.setItem(chaveArmazenamento(analise), JSON.stringify(chaves));
      } catch {
        // Sem espaço ou sem permissão: a ordem não persiste, e o aviso abaixo faz a tela
        // voltar para o que está guardado — que é a verdade. Fingir que salvou seria pior.
      }
      avisar();
    },
    [analise],
  );

  const limpar = useCallback(() => {
    try {
      localStorage.removeItem(chaveArmazenamento(analise));
    } catch {
      /* idem */
    }
    avisar();
  }, [analise]);

  return { ordem, salvar, limpar };
}

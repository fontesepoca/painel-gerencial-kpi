"use client";

import { useCallback, useSyncExternalStore } from "react";
import { chaveDaSimulacao } from "@/lib/chavesPorBase";
import type { AjusteDaLinha, ProdutoNovo } from "@/types/simulador-preco";

/**
 * A simulação de preço que "se guarda sozinha" (decisão D22, revista em 18/11/2026): o que a
 * pessoa alterou na tabela e os produtos novos ficam no navegador e voltam quando ela consulta
 * de novo a mesma filial, região e fornecedor.
 *
 * <b>Por que `useSyncExternalStore`, e não `useState` + efeito.</b> É o mesmo motivo do
 * `useOrdemSalva` do DRE, que explica em detalhe: ler o `localStorage` num efeito faz a tela
 * nascer vazia e saltar no render seguinte. Aqui o dado vive FORA do React, e a tela o lê no
 * próprio render. De graça, duas abas abertas ficam em sincronia.
 *
 * <b>Com o armazenamento bloqueado</b> (janela anônima, política do navegador), a simulação
 * vive só na memória desta aba: a tela funciona igual, e só não sobrevive a um recarregar.
 */

export interface SimulacaoGuardada {
  /** Por consulta (`chaveDaConsulta`), e dentro dela por linha (`chaveDaLinha`). */
  consultas: Record<string, Record<string, AjusteDaLinha>>;
  novos: ProdutoNovo[];
}

const VAZIA: SimulacaoGuardada = { consultas: {}, novos: [] };

/** A consulta que a simulação acompanha: os mesmos três filtros do SQL. */
export const chaveDaConsulta = (codFilial: string, numRegiao: number, codFornec: number | null) =>
  `${codFilial}|${numRegiao}|${codFornec ?? 0}`;

/** O texto cru da última leitura, por chave: o snapshot tem de ser estável (ver useOrdemSalva). */
const cache = new Map<string, { bruto: string | null; valor: SimulacaoGuardada }>();
/** Quando o navegador recusa o armazenamento, a simulação fica aqui. */
const memoria = new Map<string, string>();
const ouvintes = new Set<() => void>();

function avisar() {
  for (const ouvinte of ouvintes) ouvinte();
}

function inscrever(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  // `storage` só dispara nas OUTRAS abas; esta é avisada à mão por `gravar`.
  window.addEventListener("storage", ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
    window.removeEventListener("storage", ouvinte);
  };
}

function lerBruto(chave: string): string | null {
  try {
    return localStorage.getItem(chave) ?? memoria.get(chave) ?? null;
  } catch {
    return memoria.get(chave) ?? null;
  }
}

function ler(chave: string | null): SimulacaoGuardada {
  if (chave === null) return VAZIA;
  const bruto = lerBruto(chave);
  const anterior = cache.get(chave);
  if (anterior && anterior.bruto === bruto) return anterior.valor;

  let valor = VAZIA;
  if (bruto) {
    try {
      const lido = JSON.parse(bruto) as Partial<SimulacaoGuardada>;
      valor = { consultas: lido.consultas ?? {}, novos: lido.novos ?? [] };
    } catch {
      // Texto corrompido (edição à mão, versão antiga): começa limpo em vez de quebrar a tela.
      valor = VAZIA;
    }
  }
  cache.set(chave, { bruto, valor });
  return valor;
}

function gravar(chave: string, valor: SimulacaoGuardada) {
  const texto = JSON.stringify(valor);
  memoria.set(chave, texto);
  try {
    localStorage.setItem(chave, texto);
  } catch {
    // Bloqueado ou cheio: fica na memória desta aba (ver o comentário do topo).
  }
  avisar();
}

/**
 * A simulação guardada da pessoa logada, e a função para alterá-la.
 *
 * `baseId` e `matricula` nulos (sessão ainda carregando) dão uma simulação vazia que não grava
 * nada: guardar antes de saber de quem é poria a simulação na chave errada.
 */
export function useSimulacaoGuardada(baseId: string | null, matricula: number | null) {
  const chave = baseId !== null && matricula !== null ? chaveDaSimulacao(baseId, matricula) : null;

  const simulacao = useSyncExternalStore(
    inscrever,
    () => ler(chave),
    () => VAZIA,
  );

  const alterar = useCallback(
    (mudanca: (atual: SimulacaoGuardada) => SimulacaoGuardada) => {
      if (chave === null) return;
      gravar(chave, mudanca(ler(chave)));
    },
    [chave],
  );

  return { simulacao, alterar };
}

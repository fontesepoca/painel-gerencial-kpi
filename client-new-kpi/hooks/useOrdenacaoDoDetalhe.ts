"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ordenarLinhas,
  proximaOrdem,
  type ColunaOrdenavel,
  type Ordem,
  type TipoDaColuna,
} from "@/lib/ordenacaoDoDetalhe";

/**
 * O estado de ordenação de uma tabela do detalhamento.
 *
 * Cada tabela tem o seu: ordenar a de clientes e depois abrir a de motivos não deve
 * carregar a ordem de uma para a outra — as colunas nem sequer são as mesmas.
 *
 * O estado morre junto com a tabela, e isso é proposital. Voltar de um detalhamento e abrir
 * outro devolve a ordem da consulta, que é a que a 9815 mostra.
 */
export function useOrdenacaoDoDetalhe<T>(
  linhas: readonly T[],
  colunas: readonly ColunaOrdenavel<T>[],
) {
  const [ordem, setOrdem] = useState<Ordem>(null);

  const ordenar = useCallback((rotulo: string, tipo: TipoDaColuna) => {
    setOrdem((atual) => proximaOrdem(atual, rotulo, tipo));
  }, []);

  const ordenadas = useMemo(
    () => ordenarLinhas(linhas, colunas, ordem),
    [linhas, colunas, ordem],
  );

  return { ordem, ordenar, ordenadas };
}

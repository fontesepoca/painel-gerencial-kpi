"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/apiClient";
import { exigirMesmaBase } from "@/lib/baseDaResposta";
import { useSessao } from "@/hooks/useSessao";
import type { ConsultaSimulador, PedidoDePagina } from "@/types/simulador-preco";

/**
 * UMA PÁGINA do simulador (spec docs/superpowers/specs/2026-11-24-simulador-paginacao-no-
 * backend-design.md). Pela orientação do Dev, o dado fica no back-end: cada página é uma
 * consulta ao Oracle com só as suas 100 linhas, e o cache do React Query guarda só páginas.
 *
 * - `pedido` nulo (ainda não houve Consultar) = desligado.
 * - O `signal` do React Query vai ao `fetch`: quando a busca muda, o pedido anterior é
 *   cancelado — e o BFF (`repassarParaApi`) repassa o cancelamento até a API e o Oracle.
 * - Página fora de uso sai do cache em 60 s (`gcTime`): menos dado guardado no navegador.
 * - Enquanto a próxima página carrega, a anterior continua na tela — mas SÓ dentro da mesma
 *   consulta (filial, região, fornecedores). Trocar de filial não pode mostrar a tabela da filial
 *   antiga como se fosse a nova.
 *
 * <b>A resposta só passa se for da base da sessão</b> — a mesma segunda barreira do DRE.
 */
export function usePaginaSimulador(pedido: PedidoDePagina | null) {
  const { data: usuario } = useSessao();
  const baseId = usuario?.base.id;

  return useQuery({
    queryKey: ["simulador-preco", baseId, pedido] as const,
    enabled: pedido !== null && baseId !== undefined,
    queryFn: async ({ signal }) =>
      exigirMesmaBase(
        await apiClient.post<ConsultaSimulador>("/api/simulador-preco/consulta", pedido, { signal }),
        baseId,
      ),
    gcTime: 60_000,
    placeholderData: (anterior, consultaAnterior) => {
      const pedidoAnterior = consultaAnterior?.queryKey[2] as PedidoDePagina | null | undefined;
      return pedidoAnterior && pedido && mesmaConsulta(pedidoAnterior, pedido) ? anterior : undefined;
    },
  });
}

function mesmaConsulta(a: PedidoDePagina, b: PedidoDePagina): boolean {
  return (
    a.codFilial === b.codFilial &&
    a.numRegiao === b.numRegiao &&
    a.fornecedores.join(",") === b.fornecedores.join(",")
  );
}

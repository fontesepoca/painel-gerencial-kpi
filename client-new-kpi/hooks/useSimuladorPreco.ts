"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/apiClient";
import { exigirMesmaBase } from "@/lib/baseDaResposta";
import { useSessao } from "@/hooks/useSessao";
import { normalizarCodigo, useFiliais } from "@/hooks/useDreGerencial";
import type { Filial } from "@/types/dre-gerencial";
import type { ConsultaSimulador, PedidoDePagina, VinculoDeRegiao } from "@/types/simulador-preco";

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
 *   consulta (filial e fornecedores; a região vem da filial). Trocar de filial não pode mostrar a tabela da filial
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
  // Sem a região: ela vem do vínculo da filial (25/11/2026), então a mesma filial é a mesma região.
  return a.codFilial === b.codFilial && a.fornecedores.join(",") === b.fornecedores.join(",");
}

/**
 * As filiais do filtro do simulador: as da lista do DRE (já recortada pelo PCLIB da sessão) em
 * que o comprador TAMBÉM tem região vinculada na TAB_REG_PR_FILIAL (Gabriel, 25/11/2026; spec
 * 2026-11-25-simulador-regiao-pelo-vinculo-do-comprador). Cada uma leva a região do vínculo.
 *
 * <b>Filtro de tela.</b> A API confere o vínculo de novo a cada consulta e recusa filial sem
 * região: quem montar a chamada à mão não passa.
 */
export function useFiliaisDoSimulador() {
  const { data: usuario } = useSessao();
  const baseId = usuario?.base.id ?? null;
  const matricula = usuario?.matricula ?? null;
  const filiais = useFiliais();

  const vinculos = useQuery({
    // A matrícula na chave: trocar de usuário no mesmo navegador não serve os vínculos do outro.
    queryKey: ["simulador-preco", "vinculos", baseId, matricula] as const,
    queryFn: () => apiClient.get<VinculoDeRegiao[]>("/api/simulador-preco/vinculos"),
    enabled: baseId !== null && matricula !== null,
    staleTime: 30 * 60 * 1000,
  });

  const regiaoPorFilial = new Map((vinculos.data ?? []).map((v) => [normalizarCodigo(v.codFilial), v.numRegiao]));
  const data: FilialDoSimulador[] | undefined =
    filiais.data && vinculos.data
      ? filiais.data.flatMap((f) => {
          const numRegiao = regiaoPorFilial.get(normalizarCodigo(f.codFilial));
          return numRegiao === undefined ? [] : [{ ...f, numRegiao }];
        })
      : undefined;

  return {
    data,
    isLoading: filiais.isLoading || vinculos.isLoading,
    isError: filiais.isError || vinculos.isError,
  };
}

/** Uma filial do filtro do simulador, com a região do vínculo do comprador. */
export type FilialDoSimulador = Filial & { numRegiao: number };

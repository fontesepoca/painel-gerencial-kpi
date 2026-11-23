"use client";

import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/services/apiClient";
import { exigirMesmaBase } from "@/lib/baseDaResposta";
import { useSessao } from "@/hooks/useSessao";
import type { ConsultaSimulador, FiltroSimulador } from "@/types/simulador-preco";

/**
 * A consulta do simulador. `useMutation`, e não `useQuery`: quem decide quando ir ao banco é
 * o botão Consultar, e a consulta pode demorar (o tempo de uma filial inteira ainda não foi
 * medido — spec §7, Q5). Depois dela, mudar o preço não volta ao servidor: o recálculo é na
 * tela (D1).
 *
 * <b>A resposta só passa se for da base da sessão</b> — a mesma segunda barreira do DRE.
 */
export function useConsultaSimulador() {
  const { data: usuario } = useSessao();

  return useMutation({
    mutationFn: async (filtro: FiltroSimulador) =>
      exigirMesmaBase(
        await apiClient.post<ConsultaSimulador>("/api/simulador-preco/consulta", filtro),
        usuario?.base.id,
      ),
  });
}

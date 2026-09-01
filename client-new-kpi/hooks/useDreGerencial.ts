"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/apiClient";
import type {
  Apuracao,
  Detalhamento,
  Filial,
  FiltroApuracao,
  FiltroDetalhe,
} from "@/types/dre-gerencial";

/** Filiais do filtro. Cadastro muda raramente, então segura por meia hora. */
export function useFiliais() {
  return useQuery({
    queryKey: ["dre-gerencial", "filiais"],
    queryFn: () => apiClient.get<Filial[]>("/api/dre-gerencial/filiais"),
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Apuração do DRE. `useMutation` e não `useQuery`: a consulta leva dezenas de
 * segundos e quem decide quando rodar é o usuário, no botão Apurar.
 */
export function useApuracao() {
  return useMutation({
    mutationFn: (filtro: FiltroApuracao) =>
      apiClient.post<Apuracao>("/api/dre-gerencial/apuracao", filtro),
  });
}

/**
 * Detalhamento de uma célula — o duplo clique.
 *
 * `useMutation` pelo mesmo motivo da apuração: quem dispara é o gesto do usuário, não o
 * render. E a receita por cliente varre as mesmas notas da apuração — 116,9 s medidos com
 * um mês e três filiais.
 */
export function useDetalhe() {
  return useMutation({
    mutationFn: (filtro: FiltroDetalhe) =>
      apiClient.post<Detalhamento>("/api/dre-gerencial/detalhe", filtro),
  });
}

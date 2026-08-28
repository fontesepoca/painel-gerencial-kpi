"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/apiClient";
import type { HealthResponse } from "@/types/api";

/**
 * Estado da API. Serve de verificação ponta a ponta do encanamento
 * front → apiClient → React Query → API → módulos registrados.
 */
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => apiClient.get<HealthResponse>("/api/health"),
    staleTime: 30_000,
  });
}

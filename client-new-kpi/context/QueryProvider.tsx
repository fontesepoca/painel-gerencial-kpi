"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * Provider do React Query.
 *
 * O QueryClient é criado dentro de useState e não em escopo de módulo: no App Router
 * o módulo é avaliado no servidor, e um client compartilhado vazaria cache entre
 * requisições de usuários diferentes.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Apuração de DRE é cara (minutos no Winthor). Vale segurar o
            // resultado enquanto o usuário navega, mas nunca reaproveitar às cegas.
            staleTime: 5 * 60 * 1000,
            gcTime: 15 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Quem está logado, do ponto de vista do navegador.
 *
 * Vem de `/api/sessao` — a nossa rota, não a API .NET. O que chega aqui é o usuário e nada
 * mais: o token fica no servidor, e nem o nome dele aparece neste arquivo.
 */

export interface UsuarioLogado {
  matricula: number;
  nome: string;
  nomeGuerra: string;
  filiais: string[];
  /** Códigos das rotinas que esta pessoa pode abrir. Vazia é estado válido. */
  rotinas: string[];
}

export function useSessao() {
  return useQuery<UsuarioLogado | null>({
    queryKey: ["sessao"],
    queryFn: async () => {
      const resposta = await fetch("/api/sessao");

      // 401 é resposta esperada, não erro: significa "não está logado". Tratá-lo como falha
      // faria o React Query tentar de novo três vezes antes de aceitar o óbvio.
      if (resposta.status === 401) return null;

      if (!resposta.ok) throw new Error("Não foi possível ler a sessão.");

      const conteudo = await resposta.json();
      return conteudo.dados as UsuarioLogado;
    },
    // A sessão não muda enquanto a pessoa está na tela: quem muda é o cadastro no Winthor, e
    // isso só vale no próximo login. Refazer esta consulta a cada foco de janela seria pagar
    // uma requisição para receber sempre a mesma resposta.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

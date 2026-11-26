"use client";

import { aplicarExibicaoSemGravar, definirExibicao, useExibicao } from "@/hooks/useExibicao";

/**
 * O checkbox "Ocultar títulos estornados ou desdobrados", **um só para a página**.
 *
 * Um valor de módulo, e não `useState` na tabela, porque quem lê não é só a tabela: o Excel
 * sai pelo botão do cabeçalho do modal (`TabelaDre`) e pelo da página dedicada, e o arquivo
 * tem de contar a mesma coisa que a tela — senão a pessoa desmarca, vê 160 linhas a mais,
 * exporta e não as encontra na planilha.
 *
 * **É guardado por usuário desde 25/11/2026**: é uma das opções do menu Exibição
 * (`useExibicao`, docs/plataforma/PREFERENCIAS.md), e mudar no menu ou no detalhamento é a
 * mesma escolha. Abre marcado para quem nunca mexeu.
 *
 * Dois setters, porque são dois gestos: o checkbox (o setter do hook) é escolha da pessoa e
 * grava; `definirOcultarBaixas` é a página dedicada do detalhe recebendo o valor de quem a
 * abriu — não é escolha, e nunca grava, nem se a pessoa navegar dali para o DRE.
 */
export function definirOcultarBaixas(valor: boolean) {
  aplicarExibicaoSemGravar({ "ocultar-baixas": valor });
}

function escolherOcultarBaixas(valor: boolean) {
  definirExibicao({ "ocultar-baixas": valor });
}

export function useOcultarBaixas(): [boolean, (valor: boolean) => void] {
  const [exibicao] = useExibicao();
  return [exibicao["ocultar-baixas"], escolherOcultarBaixas];
}

"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useSessao } from "@/hooks/useSessao";
import {
  criarLojaDaExibicao,
  PADRAO_DA_EXIBICAO,
  type Exibicao,
  type MudancasDaExibicao,
} from "@/lib/preferenciasDaExibicao";
import { apiClient } from "@/services/apiClient";

/**
 * As opções do menu Exibição do DRE, guardadas por usuário no banco (25/11/2026) — a tela abre
 * como a pessoa deixou, em qualquer aba e em qualquer máquina. A regra mora em
 * `lib/preferenciasDaExibicao.ts`; aqui é só a rede. Ver docs/plataforma/PREFERENCIAS.md.
 *
 * **Estado de módulo, e não `useState`**, pelo mesmo motivo do `useOrdemSalva`: o valor salvo
 * chega depois do primeiro render, e aplicá-lo com `setState` dentro de efeito é o que o lint
 * do React 19 recusa. E o Ocultar baixas já era um estado de módulo lido pela tabela, pelo
 * modal, pelo Excel e pela página do detalhe — agora é uma das opções desta loja.
 */

const CAMINHO = "/api/preferencias/dre-gerencial";

/**
 * Uma gravação de cada vez: dois cliques rápidos na mesma opção não podem chegar fora de
 * ordem ao banco e deixar lá o primeiro. Falhou, segue a fila — sem nova tentativa e sem
 * mensagem: a escolha vale até fechar a aba.
 */
let fila: Promise<unknown> = Promise.resolve();

const loja = criarLojaDaExibicao((trecho) => {
  fila = fila.then(() => apiClient.post(CAMINHO, trecho)).catch(() => undefined);
});

export function definirExibicao(mudancas: MudancasDaExibicao): void {
  loja.mudar(mudancas);
}

/** Um valor que não é escolha da pessoa (ver `aplicarSemGravar`): muda a tela, nunca grava. */
export function aplicarExibicaoSemGravar(mudancas: MudancasDaExibicao): void {
  loja.aplicarSemGravar(mudancas);
}

export function useExibicao():[Exibicao, (mudancas: MudancasDaExibicao) => void] {
  // No servidor, o padrão: o HTML inicial e a hidratação concordam.
  const exibicao = useSyncExternalStore(loja.inscrever, loja.ler, () => PADRAO_DA_EXIBICAO);
  return [exibicao, definirExibicao];
}

/**
 * Lê o que a pessoa guardou, uma vez por base e matrícula. Só a página do DRE chama: a página
 * dedicada do detalhe recebe o Ocultar baixas de quem a abriu e não carrega nem grava nada.
 *
 * `GET` que falhou carrega como `{}`: a tela fica no padrão, e o próximo clique grava só a si
 * mesmo — o `JSON_MERGEPATCH` não apaga o que o banco tinha das outras opções.
 */
export function useCarregarExibicao(): void {
  const { data: usuario } = useSessao();
  const baseId = usuario?.base.id;
  const matricula = usuario?.matricula;

  useEffect(() => {
    if (!baseId || matricula === undefined) return;
    const chave = `${baseId}:${matricula}`;
    if (loja.jaCarregou(chave)) return;

    let viva = true;
    apiClient
      .get<unknown>(CAMINHO)
      .catch(() => ({}))
      .then((salvo) => {
        if (viva) loja.carregar(chave, salvo);
      });
    return () => {
      viva = false;
    };
  }, [baseId, matricula]);
}

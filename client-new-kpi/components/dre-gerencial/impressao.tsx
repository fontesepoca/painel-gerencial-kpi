"use client";

import { MEDIDA_DA_FOLHA } from "@/lib/escalaDeImpressao";
import type { Folha } from "@/lib/folhaDoDetalhe";

/**
 * As duas peças de impressão que a tela do DRE e a do detalhamento compartilham.
 *
 * Nasceram dentro de `app/dre-gerencial/page.tsx` e saíram de lá quando o detalhamento
 * também passou a imprimir: duas cópias começariam iguais e divergiriam na primeira
 * correção feita em uma delas — o mesmo motivo de `CorpoDoDetalhe` ser um componente só
 * para o modal e para a página.
 */

/**
 * A impressora de sempre: tampa, corpo e a folha saindo.
 *
 * O botão solto de imprimir que morava aqui saiu em 09/09/2026, quando *Imprimir* virou
 * item do `MenuExportar` — nas duas telas. O ícone ficou, porque o menu usa.
 */
export function IconeImpressora({ classe = "size-4" }: { classe?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${classe} shrink-0`}
    >
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v7H6z" />
    </svg>
  );
}

/**
 * Escreve o tamanho da folha de impressão.
 *
 * **Por que não está no `globals.css`.** `@page` não aceita variável CSS no `size`, e as
 * duas formas de contornar isso falharam, as duas com o mesmo sintoma — A4 em pé com a
 * tabela cortada:
 *
 * 1. `size: A2 landscape` não vale nada: **`A2` não existe** na especificação. Os nomes
 *    param no A3, e nome desconhecido invalida a declaração inteira.
 * 2. Páginas nomeadas (`page: folha-larga`) têm suporte irregular.
 *
 * Aqui não há nome de página nem palavra-chave de tamanho: só dois comprimentos em
 * milímetros, que é a forma que a especificação garante. `420mm 297mm` é largura por
 * altura — deitado é escrever a maior primeiro, sem depender de `landscape`.
 *
 * A2 foi testada e descartada em 03/09/2026: além de o nome não existir em CSS, é formato
 * que a empresa não imprime. Sobram A4 em pé e A3 deitada, e o que se ajusta ao número de
 * colunas é a fonte, nas classes `folha-media`, `folha-larga` e `folha-cheia`.
 */
export function FolhaDaImpressao({ folha }: { folha: Folha }) {
  return <style id={ID_DA_FOLHA}>{`@page { size: ${MEDIDA_DA_FOLHA[folha]}; }`}</style>;
}

/**
 * O `id` existe para `useEscalaDeImpressao` reescrever esta regra no `beforeprint`, quando
 * a medição da tabela mostra que uma folha menor serve. O valor que o React põe aqui é a
 * folha **segura** — se aquele ajuste não pegar, sobra papel, que é o erro barato.
 */
export const ID_DA_FOLHA = "folha-da-impressao";

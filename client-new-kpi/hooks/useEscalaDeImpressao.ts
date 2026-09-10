"use client";

import { useEffect, type RefObject } from "react";
import {
  FONTE_BASE_PT,
  MEDIDA_DA_FOLHA,
  folhaEFonte,
  tokensDaFonte,
} from "@/lib/escalaDeImpressao";
import { ID_DA_FOLHA } from "@/components/dre-gerencial/impressao";

/**
 * Ajusta a fonte da impressão à largura real da tabela, antes de cada impressão.
 *
 * Ligado ao `beforeprint`, e não ao botão: `Ctrl+P` tem que sair igual ao botão, e o
 * navegador dispara o evento nos dois caminhos.
 *
 * ## A sequência, e por que é nessa ordem
 *
 * 1. **Medir** com a fonte base da impressão, em `width: max-content` — a largura que a
 *    tabela pede quando nada a comprime. A classe `calibrando` faz isso; sem soltar o
 *    `overflow` do contêiner, `max-content` mede a caixa de rolagem, não a tabela.
 * 2. **Calcular** a fonte por regra de três contra a largura útil da folha.
 * 3. **Aplicar** as variáveis no elemento, com `important` — as classes do `@media print`
 *    declaram as mesmas variáveis com `!important`, e só o estilo inline com `important`
 *    passa por cima.
 * 4. **Limpar** no `afterprint`, senão a tela fica com a tipografia do papel.
 *
 * A medição acontece **na tela**, com métricas de tela. É o oposto da armadilha antiga
 * deste projeto — calcular escala no `beforeprint` esperando as medidas do papel, que
 * ainda não existem nesse instante. Aqui a folha entra como número conhecido, não como
 * medição.
 */
export function useEscalaDeImpressao(alvo: RefObject<HTMLElement | null>, pronto: boolean) {
  useEffect(() => {
    if (!pronto) return;

    const antes = () => {
      const el = alvo.current;
      if (!el) return;
      const tabela = el.querySelector("table");
      if (!tabela) return;

      // Fonte base para medir, e a tabela solta para dar a largura natural.
      for (const [nome, valor] of Object.entries(tokensDaFonte(FONTE_BASE_PT))) {
        el.style.setProperty(nome, valor, "important");
      }
      el.classList.add("calibrando");

      // Leitura de layout — é aqui que o reflow acontece, uma vez.
      const medida = tabela.getBoundingClientRect().width;

      el.classList.remove("calibrando");

      const { folha, pt } = folhaEFonte(medida);

      for (const [nome, valor] of Object.entries(tokensDaFonte(pt))) {
        el.style.setProperty(nome, valor, "important");
      }

      /**
       * A folha, reescrita direto no `<style>` que o React desenhou.
       *
       * Imperativo de propósito: um `setState` aqui agendaria um render que a impressão não
       * espera. O elemento existe porque `FolhaDaImpressao` está na página, e o valor que
       * ele já tinha é a folha segura — se este ajuste não pegar, sobra papel em vez de
       * cortar conteúdo.
       */
      const estilo = document.getElementById(ID_DA_FOLHA);
      if (estilo) estilo.textContent = `@page { size: ${MEDIDA_DA_FOLHA[folha]}; }`;
    };

    const depois = () => {
      const el = alvo.current;
      if (!el) return;
      el.classList.remove("calibrando");
      for (const nome of Object.keys(tokensDaFonte(FONTE_BASE_PT))) {
        el.style.removeProperty(nome);
      }
    };

    window.addEventListener("beforeprint", antes);
    window.addEventListener("afterprint", depois);
    return () => {
      window.removeEventListener("beforeprint", antes);
      window.removeEventListener("afterprint", depois);
      depois();
    };
  }, [alvo, pronto]);
}

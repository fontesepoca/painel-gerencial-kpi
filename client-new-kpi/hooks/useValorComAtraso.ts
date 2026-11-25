"use client";

import { useEffect, useState } from "react";

/**
 * O valor, só depois de `atrasoMs` sem mudar — o "debounce" (spec do simulador, 24/11/2026).
 *
 * Quem digita "VANISH" muda o valor seis vezes; sem isto, seriam seis consultas ao Oracle. Cada
 * mudança reinicia o relógio, e só a última, depois da pausa, sai daqui. O campo continua
 * mostrando o que foi digitado na hora: o atraso é só de quem CONSULTA.
 *
 * Reutilizável: a busca de fornecedores do DRE (`SelecaoDeFornecedores.tsx`) tem um debounce
 * escrito à mão e pode passar a usar este depois.
 */
export function useValorComAtraso<T>(valor: T, atrasoMs: number): T {
  const [atrasado, setAtrasado] = useState(valor);

  useEffect(() => {
    const relogio = setTimeout(() => setAtrasado(valor), atrasoMs);
    return () => clearTimeout(relogio);
  }, [valor, atrasoMs]);

  return atrasado;
}

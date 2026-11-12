import type { ReactNode } from "react";
import type { IconeDeModulo, IconeDeTela } from "@/lib/navegacao";

/**
 * Os ícones da navegação — dos módulos e das telas —, desenhados aqui: são poucos, e uma
 * biblioteca de ícones seria dependência nova para meia dúzia de traços.
 *
 * Grade de 20, traço de 1,6, cor do texto (`currentColor`): quem usa decide a cor e o tamanho.
 * Sem `"use client"` de propósito — a tela inicial é componente de servidor e usa os mesmos.
 */

function Traco({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={className ?? "size-5"}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function IconeDoModulo({ icone, className }: { icone: IconeDeModulo; className?: string }) {
  switch (icone) {
    case "gerencial":
      // Colunas crescentes sobre a linha de base: resultado ao longo do tempo.
      return (
        <Traco className={className}>
          <path d="M3 16.5h14" />
          <rect x="4.5" y="10" width="2.6" height="6.5" rx="0.6" />
          <rect x="8.7" y="7" width="2.6" height="9.5" rx="0.6" />
          <rect x="12.9" y="3.5" width="2.6" height="13" rx="0.6" />
        </Traco>
      );
  }
}

export function IconeDaTela({ icone, className }: { icone: IconeDeTela; className?: string }) {
  switch (icone) {
    case "dre":
      // Um demonstrativo: a folha, as linhas de conta com o valor à direita e, embaixo, o
      // traço duplo do contador — o resultado.
      return (
        <Traco className={className}>
          <rect x="3.5" y="2.5" width="13" height="15" rx="1.8" />
          <path d="M6.5 6.5h4.5M13 6.5h0.5" />
          <path d="M6.5 9.5h4.5M13 9.5h0.5" />
          <path d="M6.5 12.6h7" />
          <path d="M6.5 14.6h7" />
        </Traco>
      );
  }
}

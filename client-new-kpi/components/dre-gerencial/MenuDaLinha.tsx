"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** Uma ação do menu. `motivo` desabilita e diz por quê, no hover — como no `MenuDeExibicao`. */
export interface AcaoDaLinha {
  id: string;
  rotulo: string;
  apoio?: string;
  motivo?: string | null;
  onEscolher: () => void;
}

/**
 * O menu do BOTÃO DIREITO na descrição de uma linha do DRE (16/10/2026).
 *
 * Mesmo visual e mesmo comportamento dos atalhos de período e do menu Exibição — caixa com
 * sombra, grupos com título em versalete, `Esc` e clique fora fecham —, só que aberto NO
 * PONTO do clique, e preso à janela para não nascer cortado na borda. Fecha também ao rolar:
 * um menu flutuando sobre outra linha que passou por baixo dele mentiria sobre a que conta
 * ele se refere.
 *
 * O título repete o nome da linha: com a tabela rolando por baixo, é o que garante a quem
 * clica que a ação vai para a conta certa.
 */
export function MenuDaLinha({
  x,
  y,
  titulo,
  grupos,
  onFechar,
}: {
  x: number;
  y: number;
  titulo: string;
  grupos: { titulo: string; acoes: AcaoDaLinha[] }[];
  onFechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState({ left: x, top: y });

  // Preso à janela: medido depois de desenhar, porque a altura depende das ações.
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margem = 8;
    setPosicao({
      left: Math.max(margem, Math.min(x, window.innerWidth - r.width - margem)),
      top: Math.max(margem, Math.min(y, window.innerHeight - r.height - margem)),
    });
  }, [x, y]);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) onFechar();
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    // Captura: a rolagem da tabela é de um contêiner, não da janela.
    window.addEventListener("scroll", onFechar, true);
    window.addEventListener("resize", onFechar);
    // O primeiro item recebe o foco, para o teclado seguir de onde o menu abriu.
    caixa.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", onFechar, true);
      window.removeEventListener("resize", onFechar);
    };
  }, [onFechar]);

  return (
    <div
      ref={caixa}
      role="menu"
      aria-label={`Ações de ${titulo}`}
      style={{ left: posicao.left, top: posicao.top }}
      className="nao-imprime fixed z-50 w-max max-w-[min(22rem,90vw)] min-w-[14rem] rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface-2)] p-1.5 shadow-[var(--shadow-float)]"
    >
      <p className="truncate px-2.5 pt-0.5 pb-1.5 text-[length:var(--fs-apoio)] font-semibold text-[var(--text-primary)]" title={titulo}>
        {titulo}
      </p>
      {grupos.map((g) => (
        <div key={g.titulo} role="group" aria-label={g.titulo} className="border-t border-[var(--border)] pt-1.5">
          <p className="px-2.5 pb-1 text-[length:var(--fs-rotulo)] font-semibold tracking-[0.14em] text-[var(--text-muted)] uppercase">
            {g.titulo}
          </p>
          {g.acoes.map((a) => {
            const desabilitada = !!a.motivo;
            return (
              <button
                key={a.id}
                type="button"
                role="menuitem"
                disabled={desabilitada}
                title={a.motivo ?? a.apoio}
                onClick={() => {
                  onFechar();
                  a.onEscolher();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1 text-left text-[length:var(--fs-apoio)] whitespace-nowrap",
                  "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--primary)]",
                  desabilitada
                    ? "cursor-not-allowed text-[var(--text-muted)]"
                    : "cursor-pointer text-[var(--text-primary)] hover:bg-[var(--surface-3)]",
                )}
              >
                <IconePlanilha />
                {a.rotulo}
                {(a.motivo ?? a.apoio) && <span className="sr-only">. {a.motivo ?? a.apoio}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Uma folha de planilha em traço, herdando a cor do item. */
function IconePlanilha() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M4 9h16M4 15h16M10 3v18" />
    </svg>
  );
}

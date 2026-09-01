"use client";

import type { ReactNode } from "react";
import { useLeitura } from "@/context/LeituraProvider";

/**
 * Casca da aplicação: sidebar estreita + header com trilha de navegação e o
 * interruptor de leitura ampliada.
 */
export function AppShell({
  trilha,
  children,
}: {
  trilha: string[];
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <aside
        className="hidden shrink-0 flex-col items-center gap-2 border-r border-[var(--border)] bg-[var(--surface-1)] py-4 md:flex"
        style={{ width: "var(--sidebar-w-sm)" }}
      >
        <div className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-[var(--primary)] text-sm font-semibold text-white">
          E
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 sm:px-6"
          style={{ minHeight: "var(--header-h)" }}
        >
          {/* A trilha encolhe e some em tela estreita; o interruptor nunca some,
              porque é o controle que torna a tela utilizável. */}
          <nav
            aria-label="Trilha de navegação"
            className="hidden min-w-0 items-center gap-2 text-[length:var(--fs-base)] sm:flex"
          >
            {trilha.map((item, indice) => (
              <span key={item} className="flex min-w-0 items-center gap-2">
                {indice > 0 && (
                  <span aria-hidden className="text-[var(--text-muted)]">
                    /
                  </span>
                )}
                <span
                  className={
                    indice === trilha.length - 1
                      ? "truncate text-[var(--text-secondary)]"
                      : "truncate font-semibold text-[var(--text-primary)]"
                  }
                >
                  {item}
                </span>
              </span>
            ))}
          </nav>

          <div className="ml-auto py-2">
            <InterruptorLeitura />
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

/**
 * Liga e desliga a leitura ampliada. Fica no cabeçalho, visível de qualquer
 * rotina — não é preferência de tela, é preferência de quem está lendo.
 */
function InterruptorLeitura() {
  const { ampliada, alternar } = useLeitura();

  return (
    <label
      className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[length:var(--fs-apoio)] text-[var(--text-secondary)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--text-primary)]"
      title="Aumenta a fonte, o espaçamento e o contraste da tabela"
    >
      <input
        type="checkbox"
        checked={ampliada}
        onChange={(e) => alternar(e.target.checked)}
        className="size-4 shrink-0 accent-[var(--primary)]"
      />
      {/* O "A" grande ao lado do pequeno diz o que o controle faz sem depender
          de ler o rótulo — e o rótulo some em tela estreita. */}
      <span aria-hidden className="flex items-baseline gap-0.5 text-[var(--text-primary)]">
        <span className="text-[0.7em] leading-none">A</span>
        <span className="text-[1.15em] leading-none font-semibold">A</span>
      </span>
      <span className="hidden whitespace-nowrap md:inline">Leitura ampliada</span>
    </label>
  );
}

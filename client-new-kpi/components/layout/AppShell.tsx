"use client";

import type { ReactNode } from "react";
import { useLeitura } from "@/context/LeituraProvider";
import { useTema } from "@/context/TemaProvider";

/**
 * Casca da aplicação: sidebar estreita + header com trilha de navegação e os
 * interruptores de tema e de leitura ampliada.
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
            {trilha.map((item, indice) => {
              // O último item da trilha É o título da página, então ele carrega o `h1`.
              // A tela não tem outro: um cabeçalho repetindo o nome da rotina logo abaixo
              // custava duas linhas de altura, e altura é o recurso escasso aqui. Sem este
              // `h1` o documento ficaria sem cabeçalho de nível 1, e quem navega por
              // cabeçalhos perderia o ponto de entrada da página.
              const ultimo = indice === trilha.length - 1;
              const Rotulo = ultimo ? "h1" : "span";

              return (
                <span key={item} className="flex min-w-0 items-center gap-2">
                  {indice > 0 && (
                    <span aria-hidden className="text-[var(--text-muted)]">
                      /
                    </span>
                  )}
                  <Rotulo
                    className={
                      ultimo
                        ? "truncate text-[length:inherit] font-normal text-[var(--text-secondary)]"
                        : "truncate font-semibold text-[var(--text-primary)]"
                    }
                  >
                    {item}
                  </Rotulo>
                </span>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 py-2">
            <InterruptorTema />
            <InterruptorLeitura />
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

/**
 * Alterna entre o tema escuro e o claro.
 *
 * Interruptor de verdade (`role="switch"`), não caixa de marcar: o que ele controla
 * é um estado ligado/desligado da tela inteira, e o leitor de tela anuncia "ativado"
 * em vez de "marcado". O sol e a lua dizem para onde o controle leva sem depender do
 * rótulo, que some em tela estreita.
 */
function InterruptorTema() {
  const { claro, alternar } = useTema();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={claro}
      aria-label="Tema claro"
      onClick={() => alternar(!claro)}
      title={claro ? "Voltar ao tema escuro" : "Mudar para o tema claro"}
      className="flex shrink-0 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[length:var(--fs-apoio)] text-[var(--text-secondary)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--text-primary)]"
    >
      <span aria-hidden className="text-[var(--text-primary)]">
        {claro ? <Sol /> : <Lua />}
      </span>

      {/* O trilho é o que faz o controle ser lido como interruptor de longe. A
          bolinha anda com transição; quem pediu menos movimento salta direto. */}
      <span
        aria-hidden
        className="relative h-5 w-9 shrink-0 rounded-full transition-colors duration-[var(--dur-fast)]"
        style={{ background: claro ? "var(--primary)" : "var(--surface-4)" }}
      >
        <span
          className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.35)] transition-transform duration-[var(--dur-fast)] motion-reduce:transition-none"
          style={{ transform: claro ? "translateX(1rem)" : "translateX(0)" }}
        />
      </span>

      <span className="hidden whitespace-nowrap md:inline">
        {claro ? "Tema claro" : "Tema escuro"}
      </span>
    </button>
  );
}

function Sol() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[1.15em]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function Lua() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[1.15em]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
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

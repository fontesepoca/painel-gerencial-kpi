"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { MenuDoUsuario } from "./MenuDoUsuario";
import { ControlesDeExibicao } from "./ControlesDeExibicao";

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
    // `h-dvh` e nao `min-h-screen`: a casca ocupa EXATAMENTE a altura da janela, e a
    // area de conteudo vira a unica que rola. Com `min-h` a pagina cresce com o conteudo
    // e aparece uma segunda barra de rolagem ao lado da barra da tabela.
    <div className="flex h-dvh overflow-hidden bg-[var(--bg)]">
      <aside
        className="nao-imprime hidden shrink-0 flex-col items-center gap-2 border-r border-[var(--border)] bg-[var(--surface-1)] py-4 md:flex"
        style={{ width: "var(--sidebar-w-sm)" }}
      >
        {/* O logo virou o caminho de volta para a tela inicial. Era o único elemento fixo da
            casca, e é onde a mão procura primeiro — antes disto, sair de uma rotina exigia
            editar a barra de endereço. */}
        <Link
          href="/"
          title="Ir para a tela inicial"
          className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-[var(--primary)] text-sm font-semibold text-white transition-opacity hover:opacity-85"
        >
          <span aria-hidden>E</span>
          <span className="sr-only">Época Analytics — tela inicial</span>
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="nao-imprime flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 sm:px-6"
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
            <ControlesDeExibicao />

            {/* Separador: o menu do usuário é de outra natureza que os interruptores — um
                controla a sessão, os outros a aparência. Sem a divisão, os três viram uma
                fileira de botões sem hierarquia. */}
            <span aria-hidden className="mx-1 h-6 w-px bg-[var(--border-strong)]" />
            <MenuDoUsuario />
          </div>
        </header>

        {/* `min-h-0` e obrigatorio: sem ele um filho flex nunca encolhe abaixo do
            proprio conteudo, e a coluna inteira transborda em vez de a tabela rolar. */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-3 sm:p-4">
          {children}
        </main>
      </div>
    </div>
  );
}

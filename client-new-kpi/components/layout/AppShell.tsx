import type { ReactNode } from "react";

/**
 * Casca da aplicação: sidebar estreita + header com trilha de navegação.
 * Estrutura visual apenas — o conteúdo de cada rotina entra em children.
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
          className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-1)] px-6 text-sm"
          style={{ height: "var(--header-h)" }}
        >
          {trilha.map((item, indice) => (
            <span key={item} className="flex items-center gap-2">
              {indice > 0 && <span className="text-[var(--text-muted)]">/</span>}
              <span
                className={
                  indice === trilha.length - 1
                    ? "text-[var(--text-secondary)]"
                    : "font-semibold text-[var(--text-primary)]"
                }
              >
                {item}
              </span>
            </span>
          ))}
        </header>

        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

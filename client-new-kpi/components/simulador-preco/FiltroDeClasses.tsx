"use client";

import { cn } from "@/lib/cn";
import { CLASSES } from "@/lib/filtroSimulador";
import type { Classe } from "@/types/simulador-preco";

/**
 * O filtro por classe de venda (Gabriel, 24/11/2026): quadradinhos A, B e C, que podem ser
 * marcados juntos. Vai ao Oracle no mesmo pedido da página. As três marcadas = sem filtro.
 *
 * <b>Ao menos uma fica marcada</b>: desmarcar a última não deixaria nada para mostrar, e a API
 * recusaria. Por isso a última marcada fica desabilitada.
 */
export function FiltroDeClasses({
  marcadas,
  onMudar,
}: {
  marcadas: readonly Classe[];
  onMudar: (novas: Classe[]) => void;
}) {
  return (
    <fieldset className="flex items-center gap-1">
      <legend className="sr-only">Classes de venda</legend>
      <span aria-hidden className="mr-1 text-[var(--text-muted)]">Classe</span>
      {CLASSES.map((classe) => {
        const marcada = marcadas.includes(classe);
        const ultima = marcada && marcadas.length === 1;
        return (
          <label
            key={classe}
            title={ultima ? "Ao menos uma classe fica marcada" : `Classe ${classe}`}
            className={cn(
              "flex h-8 items-center gap-1 rounded-[var(--radius-md)] border px-2 font-medium select-none",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--primary-ring)]",
              marcada
                ? "border-[var(--primary)] bg-[var(--primary-dim)] text-[var(--primary)]"
                : "border-[var(--border-strong)] text-[var(--text-secondary)]",
              ultima ? "cursor-not-allowed" : "cursor-pointer",
            )}
          >
            <input
              type="checkbox"
              checked={marcada}
              disabled={ultima}
              onChange={(e) =>
                onMudar(
                  e.target.checked
                    ? CLASSES.filter((c) => c === classe || marcadas.includes(c))
                    : marcadas.filter((c) => c !== classe),
                )
              }
              className="size-3.5 accent-[var(--primary)]"
            />
            {classe}
          </label>
        );
      })}
    </fieldset>
  );
}

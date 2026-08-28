import { cn } from "@/lib/cn";

type Tom = "positivo" | "negativo" | "neutro" | "alerta";

const TONS: Record<Tom, { ponto: string; texto: string }> = {
  positivo: { ponto: "bg-[var(--positive)]", texto: "text-[var(--positive)]" },
  negativo: { ponto: "bg-[var(--negative)]", texto: "text-[var(--negative)]" },
  alerta: { ponto: "bg-[var(--warning)]", texto: "text-[var(--warning)]" },
  neutro: { ponto: "bg-[var(--text-muted)]", texto: "text-[var(--text-muted)]" },
};

/** Indicador de estado: bolinha colorida + rótulo. */
export function StatusPill({
  tom,
  children,
  className,
}: {
  tom: Tom;
  children: React.ReactNode;
  className?: string;
}) {
  const cores = TONS[tom];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-xs font-medium tracking-wide uppercase",
        cores.texto,
        className,
      )}
    >
      <span className={cn("size-2 rounded-full", cores.ponto)} />
      {children}
    </span>
  );
}

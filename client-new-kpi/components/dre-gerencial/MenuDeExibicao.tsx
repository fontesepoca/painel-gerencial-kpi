"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** Uma opção do menu. `motivo` desabilita e diz por quê; `oculta` tira da lista. */
export type OpcaoDeExibicao = {
  id: string;
  rotulo: string;
  apoio?: string;
  marcada: boolean;
  onMudar: (marcada: boolean) => void;
  /** Texto do porquê, quando a opção não se aplica a esta apuração. */
  motivo?: string | null;
  oculta?: boolean;
};

/**
 * O que a tabela mostra, atrás de um botão só — pedido do Gabriel em 15/10/2026.
 *
 * Eram quatro checkboxes soltos na barra (zeradas, AV %, AH %, Provisionado), e com os dois
 * novos (sem o Total, só o Total) a barra virava uma fileira de caixinhas. O padrão é o dos
 * atalhos de período e do Exportar: `mousedown` fora fecha, `Esc` fecha. Diferente deles, o
 * menu **não fecha ao marcar**: quem abre para trocar uma coluna costuma trocar duas, e a
 * tabela atrás já mostra o efeito de cada clique.
 *
 * Opção que não se aplica fica **desabilitada, com o motivo escrito**, em vez de sumir — um
 * controle que aparece e desaparece conforme o período faz procurar o que não sumiu.
 */
export function MenuDeExibicao({
  grupos,
}: {
  /** Cada grupo é separado por uma linha: colunas de análise, e o recorte das colunas. */
  grupos: { titulo: string; opcoes: OpcaoDeExibicao[] }[];
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fechar);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fechar);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  // Quantas opções saíram do padrão de abertura: o botão avisa que a tabela está recortada,
  // sem precisar abrir o menu para descobrir por que falta uma coluna.
  const fora = grupos
    .flatMap((g) => g.opcoes)
    .filter((o) => !o.oculta && !o.motivo && o.marcada !== padrao(o.id)).length;

  return (
    <div ref={caixa} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-haspopup="true"
        title="Escolher o que a tabela mostra"
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5",
          "text-[length:var(--fs-apoio)] font-medium",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
          aberto
            ? "border-[var(--primary)] text-[var(--text-primary)]"
            : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]",
        )}
      >
        <IconeAjustes />
        Exibição
        {fora > 0 && (
          <span
            aria-label={`${fora} ${fora === 1 ? "opção alterada" : "opções alteradas"}`}
            className="tabular grid min-w-[1.4em] place-items-center rounded-full bg-[var(--primary)] px-1 text-[length:var(--fs-rotulo)] font-semibold text-[var(--surface-1)]"
          >
            {fora}
          </span>
        )}
        <Seta className={cn(aberto && "rotate-180")} />
      </button>

      {aberto && (
        <div
          role="group"
          aria-label="Exibição da tabela"
          className="absolute top-full right-0 z-30 mt-1 w-[min(21rem,90vw)] rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface-2)] p-2 shadow-[var(--shadow-float)]"
        >
          {grupos.map((g, i) => (
            <fieldset
              key={g.titulo}
              className={cn(i > 0 && "mt-2 border-t border-[var(--border)] pt-2")}
            >
              <legend className="px-3 pt-1 pb-1.5 text-[length:var(--fs-rotulo)] font-semibold tracking-[0.14em] text-[var(--text-muted)] uppercase">
                {g.titulo}
              </legend>
              {g.opcoes
                .filter((o) => !o.oculta)
                .map((o) => (
                  <ItemDeExibicao key={o.id} opcao={o} />
                ))}
            </fieldset>
          ))}
        </div>
      )}
    </div>
  );
}

/** O estado com que cada opção abre a tela — é contra ele que o selo do botão conta. */
function padrao(id: string): boolean {
  return id === "av" || id === "ah" || id === "provisionado";
}

function ItemDeExibicao({ opcao }: { opcao: OpcaoDeExibicao }) {
  const desabilitada = !!opcao.motivo;
  return (
    <label
      title={opcao.motivo ?? undefined}
      className={cn(
        "flex items-start gap-3 rounded-[var(--radius-sm)] px-3 py-[var(--celula-y)]",
        desabilitada ? "cursor-not-allowed" : "cursor-pointer hover:bg-[var(--surface-3)]",
      )}
    >
      <input
        type="checkbox"
        checked={opcao.marcada && !desabilitada}
        disabled={desabilitada}
        onChange={(e) => opcao.onMudar(e.target.checked)}
        className="mt-[0.2em] size-4 shrink-0 accent-[var(--primary)] disabled:opacity-50"
      />
      <span className="flex flex-col gap-0.5">
        <span
          className={cn(
            "text-[length:var(--fs-base)]",
            desabilitada ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]",
          )}
        >
          {opcao.rotulo}
        </span>
        {(opcao.motivo ?? opcao.apoio) && (
          <span className="text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
            {opcao.motivo ?? opcao.apoio}
          </span>
        )}
      </span>
    </label>
  );
}

/** Três controles deslizantes em traço, herdando a cor do botão. */
function IconeAjustes() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
    >
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}

function Seta({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-3.5 shrink-0 transition-transform", className)}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

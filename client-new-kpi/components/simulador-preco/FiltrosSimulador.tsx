"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { SelecaoDeFornecedores } from "@/components/dre-gerencial/SelecaoDeFornecedores";
import type { FilialDoSimulador } from "@/hooks/useSimuladorPreco";
import type { Fornecedor } from "@/types/dre-gerencial";

/**
 * Os filtros do simulador: uma filial e fornecedores opcionais. O desenho é o dos filtros do
 * DRE (`FiltrosDre.tsx`): mesmo rótulo, mesmo campo, mesmo botão de executar.
 *
 * <b>Sem campo de região desde 25/11/2026</b> (spec 2026-11-25-simulador-regiao-pelo-vinculo-
 * do-comprador): como na rotina em operação, ela sai do vínculo do comprador com a filial na
 * TAB_REG_PR_FILIAL. A lista só tem as filiais com vínculo, e cada uma mostra a sua região.
 */

const ROTULO =
  "text-[length:var(--fs-rotulo)] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]";

const CAMPO =
  "h-[var(--altura-controle)] w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border-strong)] " +
  "bg-[var(--surface-2)] px-3 text-[length:var(--fs-base)] text-[var(--text-primary)] " +
  "focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-ring)]";

export interface EstadoDosFiltros {
  codFilial: string;
  /** Vários desde 24/11/2026; vazio = todos. */
  fornecedores: Fornecedor[];
}

/** Por que o Consultar está desligado — ou `null` se pode consultar. */
export function motivoParaNaoConsultar(f: EstadoDosFiltros): string | null {
  if (f.codFilial === "") return "Escolha uma filial.";
  return null;
}

export function FiltrosSimulador({
  filtros,
  onMudar,
  filiais,
  carregandoFiliais,
  consultando,
  onConsultar,
}: {
  filtros: EstadoDosFiltros;
  onMudar: (f: EstadoDosFiltros) => void;
  filiais: FilialDoSimulador[];
  carregandoFiliais: boolean;
  consultando: boolean;
  onConsultar: () => void;
}) {
  const motivo = motivoParaNaoConsultar(filtros);
  const pode = motivo === null && !consultando;

  return (
    <form
      className="grid items-end gap-3 sm:grid-cols-[minmax(12rem,1fr)_minmax(16rem,1.6fr)] lg:grid-cols-[minmax(12rem,1fr)_minmax(16rem,1.6fr)_auto]"
      onSubmit={(e) => {
        // Enter num campo consulta, como o botão — sem recarregar a página.
        e.preventDefault();
        if (pode) onConsultar();
      }}
    >
      <Campo rotulo="Filial">
        {(id) => (
          <select
            id={id}
            value={filtros.codFilial}
            onChange={(e) => onMudar({ ...filtros, codFilial: e.target.value })}
            disabled={carregandoFiliais}
            className={CAMPO}
          >
            <option value="">
              {carregandoFiliais
                ? "Carregando…"
                : filiais.length === 0
                  ? "Nenhuma filial com região vinculada"
                  : "Escolha a filial"}
            </option>
            {filiais.map((f) => (
              <option key={f.codFilial} value={f.codFilial}>
                {f.codFilial} — {f.label} · região {f.numRegiao}
              </option>
            ))}
          </select>
        )}
      </Campo>

      {/* A busca do DRE, com VÁRIOS fornecedores (24/11/2026): código + Enter vira ficha, e o
          próximo código entra junto. Vazio é "todos". */}
      <Campo rotulo="Fornecedor">
        {() => (
          <SelecaoDeFornecedores
            tela="simulador"
            selecionados={filtros.fornecedores}
            onMudar={(lista) => onMudar({ ...filtros, fornecedores: lista })}
          />
        )}
      </Campo>

      <button
        type="submit"
        disabled={!pode}
        title={motivo ?? undefined}
        className={cn(
          "flex h-[var(--altura-controle)] items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-6 text-[length:var(--fs-base)] font-medium whitespace-nowrap",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring)]",
          "transition-colors duration-[var(--dur-fast)] sm:col-span-2 lg:col-span-1",
          pode
            ? "bg-[var(--primary)] text-white hover:brightness-110"
            : "cursor-not-allowed bg-[var(--surface-3)] text-[var(--text-muted)]",
        )}
      >
        {!consultando && (
          <svg aria-hidden viewBox="0 0 12 12" className="size-3.5 shrink-0" fill="currentColor">
            <path d="M3 1.8v8.4a.6.6 0 0 0 .9.5l6.8-4.2a.6.6 0 0 0 0-1L3.9 1.3a.6.6 0 0 0-.9.5Z" />
          </svg>
        )}
        {consultando ? "Consultando" : "Consultar"}
      </button>
    </form>
  );
}

/** Rótulo + controle. O `id` liga o `<label>` ao campo, para o leitor de tela e o clique. */
function Campo({
  rotulo,
  children,
}: {
  rotulo: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className={ROTULO}>
        {rotulo}
      </label>
      {children(id)}
    </div>
  );
}

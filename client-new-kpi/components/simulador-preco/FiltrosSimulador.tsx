"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { SelecaoDeFornecedores } from "@/components/dre-gerencial/SelecaoDeFornecedores";
import type { Filial, Fornecedor } from "@/types/dre-gerencial";

/**
 * Os filtros do simulador — iguais aos binds do SQL (decisão D5): uma filial, uma região e um
 * fornecedor opcional. O desenho é o dos filtros do DRE (`FiltrosDre.tsx`): mesmo rótulo,
 * mesmo campo, mesmo botão de executar.
 */

const ROTULO =
  "text-[length:var(--fs-rotulo)] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]";

const CAMPO =
  "h-[var(--altura-controle)] w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border-strong)] " +
  "bg-[var(--surface-2)] px-3 text-[length:var(--fs-base)] text-[var(--text-primary)] " +
  "focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-ring)]";

export interface EstadoDosFiltros {
  codFilial: string;
  /** Texto, como foi digitado: o número só é exigido no Consultar. */
  regiao: string;
  fornecedor: Fornecedor | null;
}

/** Por que o Consultar está desligado — ou `null` se pode consultar. */
export function motivoParaNaoConsultar(f: EstadoDosFiltros): string | null {
  if (f.codFilial === "") return "Escolha uma filial.";
  if (!/^\d+$/.test(f.regiao.trim()) || Number(f.regiao) <= 0) return "Informe o número da região.";
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
  filiais: Filial[];
  carregandoFiliais: boolean;
  consultando: boolean;
  onConsultar: () => void;
}) {
  const motivo = motivoParaNaoConsultar(filtros);
  const pode = motivo === null && !consultando;

  return (
    <form
      className="grid items-end gap-3 sm:grid-cols-[minmax(12rem,1fr)_9rem] lg:grid-cols-[minmax(12rem,1fr)_9rem_minmax(16rem,1.6fr)_auto]"
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
            <option value="">{carregandoFiliais ? "Carregando…" : "Escolha a filial"}</option>
            {filiais.map((f) => (
              <option key={f.codFilial} value={f.codFilial}>
                {f.codFilial} — {f.label}
              </option>
            ))}
          </select>
        )}
      </Campo>

      {/* Campo numérico POR ENQUANTO (decisão de 18/11/2026): a lista das regiões da filial
          depende da PCREGIAO, que o usuário da aplicação ainda não lê, e da sp3. */}
      <Campo rotulo="Região">
        {(id) => (
          <input
            id={id}
            inputMode="numeric"
            placeholder="Nº"
            value={filtros.regiao}
            onChange={(e) => onMudar({ ...filtros, regiao: e.target.value.replace(/\D/g, "") })}
            className={cn(CAMPO, "tabular")}
          />
        )}
      </Campo>

      {/* A busca do DRE, mas UM por vez: o SQL tem um :CODFORNEC só. Escolher outro substitui
          o anterior; vazio é "todos". */}
      <Campo rotulo="Fornecedor">
        {() => (
          <SelecaoDeFornecedores
            selecionados={filtros.fornecedor ? [filtros.fornecedor] : []}
            onMudar={(lista) => onMudar({ ...filtros, fornecedor: lista.at(-1) ?? null })}
          />
        )}
      </Campo>

      <button
        type="submit"
        disabled={!pode}
        title={motivo ?? undefined}
        className={cn(
          "flex h-[var(--altura-controle)] items-center justify-center gap-1.5 rounded-[var(--radius-md)] px-6 text-[length:var(--fs-base)] font-medium whitespace-nowrap",
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

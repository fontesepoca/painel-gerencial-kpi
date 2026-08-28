"use client";

import { AppShell } from "@/components/layout/AppShell";
import { StatusPill } from "@/components/ui/StatusPill";
import { useHealth } from "@/hooks/useHealth";

/**
 * Rotina DRE Gerencial (9815 do Winthor).
 *
 * FASE 1 — apenas a casca e a verificação de conectividade com a API.
 * Filtros, tabela e regras de negócio são a Fase 4.
 */
export default function DreGerencialPage() {
  const { data, isPending, isError, error } = useHealth();

  return (
    <AppShell trilha={["Época Analytics", "Inteligência Financeira"]}>
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            DRE Gerencial
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Rateios · Provisões · Margem de Contribuição
          </p>
        </header>

        <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-6 shadow-[var(--shadow-card)]">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-widest text-[var(--text-secondary)] uppercase">
              Estado do ambiente
            </h2>
            {isPending && <StatusPill tom="neutro">verificando</StatusPill>}
            {isError && <StatusPill tom="negativo">API offline</StatusPill>}
            {data && <StatusPill tom="positivo">API online</StatusPill>}
          </div>

          {isError && (
            <p className="text-sm text-[var(--negative)]">
              {error instanceof Error ? error.message : "Falha ao consultar a API."}
            </p>
          )}

          {data && (
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-[var(--text-muted)] uppercase">Ambiente</dt>
                <dd className="mt-1 text-sm text-[var(--text-primary)]">{data.ambiente}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)] uppercase">Oracle</dt>
                <dd className="mt-1 text-sm">
                  {data.oracleConfigurado ? (
                    <span className="text-[var(--positive)]">configurado</span>
                  ) : (
                    <span className="text-[var(--warning)]">sem string de conexão</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)] uppercase">Módulos</dt>
                <dd className="mt-1 text-sm text-[var(--text-primary)]">
                  {data.modulos.join(", ")}
                </dd>
              </div>
            </dl>
          )}
        </section>

        <p className="mt-6 text-sm text-[var(--text-muted)]">
          Estrutura da Fase 1. Filtros, tabela e apuração entram na Fase 4.
        </p>
      </div>
    </AppShell>
  );
}

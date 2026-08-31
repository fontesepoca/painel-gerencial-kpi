"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FiltrosDre } from "@/components/dre-gerencial/FiltrosDre";
import { TabelaDre } from "@/components/dre-gerencial/TabelaDre";
import { useApuracao, useFiliais } from "@/hooks/useDreGerencial";
import { cn } from "@/lib/cn";
import { formatarDataIso, formatarDuracao } from "@/lib/formato";
import type { FiltroApuracao } from "@/types/dre-gerencial";

/** Mês corrente do primeiro dia até hoje — o recorte que o dono abre primeiro. */
function periodoPadrao(): { dataInicio: string; dataFim: string } {
  const hoje = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    dataInicio: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
    dataFim: iso(hoje),
  };
}

export default function DreGerencialPage() {
  const filiais = useFiliais();
  const apuracao = useApuracao();
  const [mostrarZeradas, setMostrarZeradas] = useState(false);

  const [filtro, setFiltro] = useState<FiltroApuracao>(() => ({
    filiais: [],
    ...periodoPadrao(),
    regime: "competencia",
    analise: "grupo-contas",
  }));

  const dados = apuracao.data;

  return (
    <AppShell trilha={["Época Analytics", "Inteligência Financeira"]}>
      <div className="mx-auto flex max-w-[80rem] flex-col gap-6">
        <header>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            DRE Gerencial
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Rateios · Provisões · Margem de Contribuição
          </p>
        </header>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-5 shadow-[var(--shadow-card)]">
          <FiltrosDre
            filtro={filtro}
            filiais={filiais.data ?? []}
            carregandoFiliais={filiais.isPending}
            apurando={apuracao.isPending}
            onMudar={setFiltro}
            onApurar={() => apuracao.mutate(filtro)}
          />

          {filiais.isError && (
            <p className="mt-3 text-sm text-[var(--negative)]">
              Não foi possível carregar as filiais. Verifique se a API está no ar.
            </p>
          )}
        </div>

        {apuracao.isPending && <Apurando />}

        {apuracao.isError && (
          <Aviso tom="erro">
            {apuracao.error instanceof Error
              ? apuracao.error.message
              : "Falha ao apurar o DRE."}
          </Aviso>
        )}

        {dados && !apuracao.isPending && (
          <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div>
                <h2 className="text-xs font-semibold tracking-[0.14em] text-[var(--text-secondary)] uppercase">
                  Visão gerencial
                </h2>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {formatarDataIso(dados.dataInicio)} a {formatarDataIso(dados.dataFim)} ·{" "}
                  {dados.regime === "caixa" ? "Caixa" : "Competência"} ·{" "}
                  {dados.filiais.length} {dados.filiais.length === 1 ? "filial" : "filiais"} ·
                  apurado em {formatarDuracao(dados.duracaoMs)}
                </p>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={mostrarZeradas}
                  onChange={(e) => setMostrarZeradas(e.target.checked)}
                  className="size-4 accent-[var(--primary)]"
                />
                Mostrar contas zeradas
              </label>
            </div>

            {dados.avisos.length > 0 && (
              <div className="border-b border-[var(--border)] px-5 py-3">
                {dados.avisos.map((aviso) => (
                  <Aviso key={aviso} tom="atencao">
                    {aviso}
                  </Aviso>
                ))}
              </div>
            )}

            <TabelaDre linhas={dados.linhas} mostrarZeradas={mostrarZeradas} />
          </section>
        )}

        {!dados && !apuracao.isPending && !apuracao.isError && <Inicial />}
      </div>
    </AppShell>
  );
}

function Inicial() {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] px-6 py-16 text-center">
      <p className="text-sm text-[var(--text-secondary)]">
        Escolha as filiais e o período, e clique em Apurar.
      </p>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        A apuração percorre todo o período no banco e leva de alguns segundos a alguns minutos.
      </p>
    </div>
  );
}

function Apurando() {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] px-6 py-16 text-center">
      <div className="mx-auto mb-4 h-[2px] w-40 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div className="h-full w-1/3 animate-[deslizar_1.4s_ease-in-out_infinite] rounded-full bg-[var(--primary)]" />
      </div>
      <p className="text-sm text-[var(--text-primary)]">Apurando o DRE…</p>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Pode levar alguns minutos. Não recarregue a página — isso dispararia uma segunda
        apuração.
      </p>
    </div>
  );
}

function Aviso({ tom, children }: { tom: "erro" | "atencao"; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "text-sm",
        tom === "erro" ? "text-[var(--negative)]" : "text-[var(--warning)]",
      )}
    >
      {children}
    </p>
  );
}

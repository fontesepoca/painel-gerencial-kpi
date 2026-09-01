"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FiltrosDre } from "@/components/dre-gerencial/FiltrosDre";
import { TabelaDre } from "@/components/dre-gerencial/TabelaDre";
import { useApuracao, useFiliais } from "@/hooks/useDreGerencial";
import { cn } from "@/lib/cn";
import { formatarDataIso, formatarDuracao } from "@/lib/formato";
import { periodoPadrao } from "@/lib/periodos";
import type { FiltroApuracao } from "@/types/dre-gerencial";

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
      {/* Com a leitura ampliada a tabela precisa de mais largura útil antes de
          começar a rolar na horizontal. */}
      <div className="mx-auto flex max-w-[110rem] flex-col gap-6">
        <header>
          <h1 className="font-[family-name:var(--font-display)] text-[length:var(--fs-titulo)] font-semibold tracking-tight">
            DRE Gerencial
          </h1>
          <p className="mt-1 text-[length:var(--fs-base)] text-[var(--text-secondary)]">
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
            <p className="mt-3 text-[length:var(--fs-base)] text-[var(--negative)]">
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
                <h2 className="text-[length:var(--fs-rotulo)] font-semibold tracking-[0.14em] text-[var(--text-secondary)] uppercase">
                  Visão gerencial
                </h2>
                <p className="mt-1 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
                  {formatarDataIso(dados.dataInicio)} a {formatarDataIso(dados.dataFim)} ·{" "}
                  {dados.regime === "caixa" ? "Caixa" : "Competência"} ·{" "}
                  {dados.filiais.length} {dados.filiais.length === 1 ? "filial" : "filiais"} ·{" "}
                  {dados.periodos.length} {dados.periodos.length === 1 ? "mês" : "meses"} ·
                  apurado em {formatarDuracao(dados.duracaoMs)}
                </p>
              </div>

              <label className="flex cursor-pointer items-center gap-2.5 text-[length:var(--fs-apoio)] text-[var(--text-secondary)]">
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

            <TabelaDre
              periodos={dados.periodos}
              linhas={dados.linhas}
              mostrarZeradas={mostrarZeradas}
              // Deliberadamente `dados`, e não `filtro`: o detalhamento tem que usar os
              // parâmetros que produziram os números na tela. Mexer no formulário depois
              // de apurar e só então clicar duplo devolveria outro recorte, e o total não
              // fecharia com a célula clicada.
              filtro={{
                filiais: dados.filiais,
                dataInicio: dados.dataInicio,
                dataFim: dados.dataFim,
                regime: dados.regime,
                analise: dados.analise,
              }}
            />
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
      <p className="text-[length:var(--fs-base)] text-[var(--text-secondary)]">
        Escolha as filiais e o período, e clique em Apurar.
      </p>
      <p className="mt-2 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
        A apuração percorre todo o período no banco e leva de alguns segundos a alguns minutos.
      </p>
    </div>
  );
}

/**
 * Estado de apuração em andamento.
 *
 * A apuração leva de segundos a vários minutos, e nesse intervalo a única pergunta
 * de quem espera é "travou?". Uma barra indeterminada sozinha não responde: depois
 * de dois minutos, movimento repetitivo lê como tela congelada.
 *
 * Por isso o cronômetro. Ele é a única informação **verdadeira** que temos para
 * mostrar — a consulta não reporta avanço, então qualquer porcentagem seria
 * inventada. Um número que muda a cada segundo prova que a página está viva, e de
 * quebra dá ao usuário a noção de quanto costuma demorar.
 */
function Apurando() {
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const mm = Math.floor(segundos / 60);
  const ss = `${segundos % 60}`.padStart(2, "0");

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] px-6 py-14 text-center"
    >
      {/* Três pontos em cascata: o movimento continua legível de longe e com pouca
          visão, ao contrário de uma barra de 2px. */}
      <div className="mb-6 flex justify-center gap-2.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="pulsa size-3 rounded-full bg-[var(--primary)]"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </div>

      <p className="text-[length:var(--fs-base)] text-[var(--text-primary)]">Apurando o DRE…</p>

      <p className="tabular mt-3 text-[length:var(--fs-titulo)] font-semibold text-[var(--text-primary)]">
        {mm}:{ss}
      </p>

      <div className="mx-auto mt-5 h-[3px] w-56 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div className="cometa h-full w-1/3 rounded-full bg-[var(--primary)]" />
      </div>

      <p className="mx-auto mt-5 max-w-md text-[length:var(--fs-apoio)] leading-relaxed text-[var(--text-muted)]">
        A consulta percorre o período inteiro no banco e não reporta progresso — por isso
        o relógio, e não uma porcentagem. Não recarregue a página: isso dispararia uma
        segunda apuração.
      </p>
    </div>
  );
}

function Aviso({ tom, children }: { tom: "erro" | "atencao"; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "text-[length:var(--fs-base)]",
        tom === "erro" ? "text-[var(--negative)]" : "text-[var(--warning)]",
      )}
    >
      {children}
    </p>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  ANALISES,
  REGIMES,
  type Analise,
  type Filial,
  type FiltroApuracao,
  type Regime,
} from "@/types/dre-gerencial";

const ROTULO =
  "text-[length:var(--fs-rotulo)] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]";

const CAMPO =
  "h-[var(--altura-controle)] w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border-strong)] " +
  "bg-[var(--surface-2)] px-3 text-[length:var(--fs-base)] text-[var(--text-primary)] " +
  "focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-ring)]";

export function FiltrosDre({
  filtro,
  filiais,
  carregandoFiliais,
  apurando,
  onMudar,
  onApurar,
}: {
  filtro: FiltroApuracao;
  filiais: Filial[];
  carregandoFiliais: boolean;
  apurando: boolean;
  onMudar: (filtro: FiltroApuracao) => void;
  onApurar: () => void;
}) {
  const podeApurar = filtro.filiais.length > 0 && !apurando;

  // Dois avisos com gatilhos diferentes. O da filial única só faz sentido com mais de uma
  // marcada: com uma só, a lista completa e a última filial são a mesma coisa, e os
  // números batem com a 9815.
  const analise = ANALISES.find((a) => a.valor === filtro.analise);
  const avisos = [
    analise?.aviso,
    filtro.filiais.length > 1 ? analise?.avisoMultiFilial : undefined,
  ].filter((a): a is string => Boolean(a));

  return (
    // O gabarito da grade mora em `globals.css`, na classe `.grade-filtros` —
    // os mínimos foram medidos e dependem do modo de leitura. Ver o comentário lá.
    <section className="grade-filtros">
      <Campo rotulo="Filial">
        <SeletorFiliais
          filiais={filiais}
          carregando={carregandoFiliais}
          selecionadas={filtro.filiais}
          onMudar={(f) => onMudar({ ...filtro, filiais: f })}
        />
      </Campo>

      <Campo rotulo="Regime">
        <Segmentado
          opcoes={REGIMES.map((r) => ({ valor: r.valor, rotulo: r.rotulo, ativa: true }))}
          valor={filtro.regime}
          onMudar={(v) => onMudar({ ...filtro, regime: v as Regime })}
        />
      </Campo>

      <Campo rotulo="Tipo de análise">
        <select
          value={filtro.analise}
          onChange={(e) => onMudar({ ...filtro, analise: e.target.value as Analise })}
          className={CAMPO}
        >
          {ANALISES.map((a) => (
            <option key={a.valor} value={a.valor} disabled={!a.pronta}>
              {a.rotulo}
              {a.pronta ? "" : " — em breve"}
            </option>
          ))}
        </select>

        {/* Quem confere contra a 9815 precisa saber disso ANTES de estranhar o número,
            não depois. A nota some quando a dimensão escolhida não diverge. */}
        {avisos.map((aviso) => (
          <p
            key={aviso}
            className="mt-1.5 text-[length:var(--fs-apoio)] leading-snug text-[var(--warning)]"
          >
            {aviso}
          </p>
        ))}
      </Campo>

      <Campo rotulo="Período">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={filtro.dataInicio}
            max={filtro.dataFim}
            onChange={(e) => onMudar({ ...filtro, dataInicio: e.target.value })}
            className={cn(CAMPO, "tabular")}
          />
          <span className="text-[var(--text-muted)]">→</span>
          <input
            type="date"
            value={filtro.dataFim}
            min={filtro.dataInicio}
            onChange={(e) => onMudar({ ...filtro, dataFim: e.target.value })}
            className={cn(CAMPO, "tabular")}
          />
        </div>
      </Campo>

      <Campo>
        <button
          type="button"
          onClick={onApurar}
          disabled={!podeApurar}
          className={cn(
            "h-[var(--altura-controle)] w-full rounded-[var(--radius-md)] px-6 text-[length:var(--fs-base)] font-medium whitespace-nowrap xl:w-auto",
            "transition-colors duration-[var(--dur-fast)]",
            podeApurar
              ? "bg-[var(--primary)] text-white hover:brightness-110"
              : "cursor-not-allowed bg-[var(--surface-3)] text-[var(--text-muted)]",
          )}
        >
          {apurando ? "Apurando…" : "Apurar"}
        </button>
      </Campo>
    </section>
  );
}

function Campo({ rotulo, children }: { rotulo?: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      {/* Sem rótulo o espaço é preservado, para o botão alinhar com os campos. */}
      <span className={ROTULO} aria-hidden={rotulo === undefined}>
        {rotulo ?? " "}
      </span>
      {children}
    </label>
  );
}

function Segmentado({
  opcoes,
  valor,
  onMudar,
}: {
  opcoes: { valor: string; rotulo: string; ativa: boolean }[];
  valor: string;
  onMudar: (valor: string) => void;
}) {
  return (
    <div className="flex h-[var(--altura-controle)] rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-2)] p-1">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onMudar(o.valor)}
          className={cn(
            "flex-1 rounded-[var(--radius-sm)] px-2 text-[length:var(--fs-base)] whitespace-nowrap transition-colors duration-[var(--dur-fast)]",
            o.valor === valor
              ? "bg-[var(--surface-hover)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

/**
 * Multisseleção de filiais, agrupada por empresa. Vêm do cadastro, menos as que têm
 * dados em outra base — ver `docs/DIVERGENCIAS.md`. No Winthor essa escolha acontecia
 * numa tela separada, antes de abrir a rotina.
 */
function SeletorFiliais({
  filiais,
  carregando,
  selecionadas,
  onMudar,
}: {
  filiais: Filial[];
  carregando: boolean;
  selecionadas: string[];
  onMudar: (codigos: string[]) => void;
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

  const alternar = (codigo: string) =>
    onMudar(
      selecionadas.includes(codigo)
        ? selecionadas.filter((c) => c !== codigo)
        : [...selecionadas, codigo],
    );

  const resumo = carregando
    ? "Carregando…"
    : selecionadas.length === 0
      ? "Nenhuma filial"
      : selecionadas.length === filiais.length
        ? `Todas as ${filiais.length}`
        : selecionadas.length === 1
          ? (filiais.find((f) => f.codFilial === selecionadas[0])?.label ?? "1 filial")
          : `${selecionadas.length} filiais`;

  const empresas = [...new Set(filiais.map((f) => f.empresa))];

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        disabled={carregando}
        aria-expanded={aberto}
        className={cn(CAMPO, "flex items-center justify-between text-left")}
      >
        <span className={cn("truncate", selecionadas.length === 0 && "text-[var(--text-muted)]")}>
          {resumo}
        </span>
        <span className="ml-2 shrink-0 text-[var(--text-muted)]">{aberto ? "▴" : "▾"}</span>
      </button>

      {aberto && (
        <div className="absolute top-full left-0 z-20 mt-1 max-h-80 w-[min(22rem,90vw)] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface-2)] p-2 shadow-[var(--shadow-float)]">
          <div className="mb-2 flex gap-2 border-b border-[var(--border)] pb-2">
            <AcaoRapida onClick={() => onMudar(filiais.map((f) => f.codFilial))}>
              Todas
            </AcaoRapida>
            <AcaoRapida onClick={() => onMudar([])}>Nenhuma</AcaoRapida>
          </div>

          {empresas.map((empresa) => (
            <div key={empresa} className="mb-1">
              <p className="px-2 py-1 text-[length:var(--fs-rotulo)] font-semibold tracking-[0.14em] text-[var(--text-muted)] uppercase">
                {empresa}
              </p>
              {filiais
                .filter((f) => f.empresa === empresa)
                .map((f) => (
                  <label
                    key={f.codFilial}
                    className="flex cursor-pointer items-center gap-3 rounded-[var(--radius-sm)] px-2 py-[var(--celula-y)] text-[length:var(--fs-base)] hover:bg-[var(--surface-3)]"
                  >
                    <input
                      type="checkbox"
                      checked={selecionadas.includes(f.codFilial)}
                      onChange={() => alternar(f.codFilial)}
                      className="size-4 accent-[var(--primary)]"
                    />
                    <span className="flex-1 truncate">{f.label}</span>
                    <span className="tabular text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
                      {f.codFilial}
                    </span>
                  </label>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AcaoRapida({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[var(--radius-sm)] px-2 py-1.5 text-[length:var(--fs-apoio)] text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
    >
      {children}
    </button>
  );
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { atalhosPeriodo, paraBr } from "@/lib/periodos";
import {
  MAXIMO_DE_ANOS,
  MODOS,
  ancorarNoPrimeiroAno,
  anosOferecidos,
  estimativaDeTempo,
  impedimento,
  usaAnos,
  usaDatas,
} from "@/lib/modosDePeriodo";
import {
  ANALISES,
  REGIMES,
  type Analise,
  type Filial,
  type FiltroApuracao,
  type ModoPeriodo,
  type Regime,
} from "@/types/dre-gerencial";

const ROTULO =
  "text-[length:var(--fs-rotulo)] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]";

const CAMPO =
  "h-[var(--altura-controle)] w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border-strong)] " +
  "bg-[var(--surface-2)] px-3 text-[length:var(--fs-base)] text-[var(--text-primary)] " +
  "focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-ring)]";

/**
 * Seta dos campos que abrem lista.
 *
 * Uma só, usada nos dois: no `<select>` de análise — que perde a seta do navegador via
 * `campo-lista` em `globals.css` — e no botão de filial. Cada navegador desenha a seta
 * nativa de um jeito, e o `▾` que o filial usava antes vinha da fonte de texto: os dois
 * campos faziam a mesma coisa e não pareciam a mesma família.
 */
function Seta({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className={cn(
        "size-3 shrink-0 text-[var(--text-muted)] transition-transform duration-[var(--dur-fast)] motion-reduce:transition-none",
        className,
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 4.5 6 8l3.5-3.5" />
    </svg>
  );
}

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
  // O que impede a apuração, em texto. Aparece sob a grade em vez de ficar só como botão
  // apagado: "escolha ao menos um ano" é a diferença entre corrigir em dois segundos e
  // ficar clicando num botão que não responde.
  const motivo = impedimento(filtro);
  const podeApurar = motivo === null && !apurando;
  const estimativa = estimativaDeTempo(filtro);

  return (
    <>
    {/* O gabarito da grade mora em `globals.css`, na classe `.grade-filtros` —
        os mínimos foram medidos e dependem do modo de leitura. Ver o comentário lá. */}
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
          opcoes={REGIMES.map((r) => ({
            valor: r.valor,
            rotulo: r.rotulo,
            ativa: true,
          }))}
          valor={filtro.regime}
          onMudar={(v) => onMudar({ ...filtro, regime: v as Regime })}
        />
      </Campo>

      <Campo rotulo="Tipo de análise">
        {/* `appearance-none` apaga a seta que o navegador desenha, e a nossa entra por
            cima — é o que faz este campo e o de filial terminarem iguais. O `pr-9` abre
            o espaço dela, e `pointer-events-none` deixa o clique atravessar para o
            `<select>`, senão clicar na seta não abriria a lista. */}
        <div className="relative">
          <select
            value={filtro.analise}
            onChange={(e) =>
              onMudar({ ...filtro, analise: e.target.value as Analise })
            }
            className={cn(CAMPO, "appearance-none pr-9")}
          >
            {ANALISES.map((a) => (
              <option key={a.valor} value={a.valor} disabled={!a.pronta}>
                {a.rotulo}
                {a.pronta ? "" : " — em breve"}
              </option>
            ))}
          </select>
          {/* 13px, não 12: a seta do filial fica dentro do botão, depois do `px-3` E da
              borda de 1px, enquanto esta se posiciona pela caixa externa. Sem o pixel
              extra as duas terminam desalinhadas na vertical de quem compara os campos
              lado a lado. */}
          <Seta className="pointer-events-none absolute top-1/2 right-[13px] -translate-y-1/2" />
        </div>
      </Campo>

      <CampoPeriodo filtro={filtro} onMudar={onMudar} />

      <Campo>
        <button
          type="button"
          onClick={onApurar}
          disabled={!podeApurar}
          className={cn(
            "h-[var(--altura-controle)] w-full rounded-[var(--radius-md)] px-6 text-[length:var(--fs-base)] font-medium whitespace-nowrap xl:w-auto",
            // Sem `h-full`: com os chips de ano, a linha da grade fica com duas alturas de
            // controle e o botão esticava para 90px, virando um retângulo azul que não
            // parece mais um botão.
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

    {/* Uma linha só, e só quando há o que dizer. O impedimento tem precedência sobre a
        estimativa: não faz sentido anunciar quanto vai demorar algo que ainda não pode
        rodar. */}
    {(motivo || estimativa) && (
      <p
        role="status"
        className={cn(
          "mt-3 text-[length:var(--fs-apoio)]",
          motivo ? "text-[var(--warning)]" : "text-[var(--text-muted)]",
        )}
      >
        {motivo ?? estimativa}
      </p>
    )}
    </>
  );
}

/**
 * O campo Período — e, no lugar do resto do rótulo, as abas que escolhem o modo.
 *
 * **As abas ficam onde o efeito delas acontece.** Um sexto campo na grade quebraria a
 * calibragem de cinco colunas, medida contra telas de 1366px, e custaria uma linha de
 * altura — que nesta tela sai da tabela. A linha do rótulo já existia, com uma palavra só,
 * e o modo é exatamente uma qualificação do período: as abas dizem o que este campo
 * significa agora.
 *
 * Cada modo mostra apenas os controles que usa. O modo `anos` não exibe datas porque não
 * as usa — dois campos de data visíveis e inertes ensinariam que o filtro mente.
 */
function CampoPeriodo({
  filtro,
  onMudar,
}: {
  filtro: FiltroApuracao;
  onMudar: (filtro: FiltroApuracao) => void;
}) {
  const rotuloId = useId();

  // Toda mudança passa pela ancoragem: no comparativo as datas seguem o primeiro ano
  // escolhido, para o campo nunca exibir um recorte que não é nenhuma das colunas.
  const mudar = (parcial: Partial<FiltroApuracao>) =>
    onMudar(ancorarNoPrimeiroAno({ ...filtro, ...parcial }));

  return (
    <div role="group" aria-labelledby={rotuloId} className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span id={rotuloId} className={ROTULO}>
          Período
        </span>
        <AbasDeModo valor={filtro.modo} onMudar={(modo) => mudar({ modo })} />
      </div>

      <div className="flex flex-col gap-2">
        {usaDatas(filtro.modo) && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label="Data inicial"
              value={filtro.dataInicio}
              max={filtro.dataFim}
              onChange={(e) => mudar({ dataInicio: e.target.value })}
              className={cn(CAMPO, "tabular")}
            />
            <span aria-hidden className="text-[var(--text-muted)]">
              →
            </span>
            <input
              type="date"
              aria-label="Data final"
              value={filtro.dataFim}
              min={filtro.dataInicio}
              onChange={(e) => mudar({ dataFim: e.target.value })}
              className={cn(CAMPO, "tabular")}
            />
            {/* Atalhos só no modo mensal: "Ano passado" e "Últimos 3 meses" mexem no ano
                das datas, e no comparativo quem manda no ano são os chips. */}
            {filtro.modo === "meses" && (
              <AtalhosDePeriodo
                onEscolher={(dataInicio, dataFim) => mudar({ dataInicio, dataFim })}
              />
            )}
          </div>
        )}

        {usaAnos(filtro.modo) && (
          <ChipsDeAno escolhidos={filtro.anos} onMudar={(anos) => mudar({ anos })} />
        )}
      </div>
    </div>
  );
}

/**
 * As três abas de modo, ocupando a linha do rótulo.
 *
 * `radiogroup`, não `tablist`: não há painéis irmãos entre os quais alternar, há uma
 * escolha entre três valores — e é a semântica de rádio que faz o leitor de tela anunciar
 * "1 de 3".
 */
function AbasDeModo({
  valor,
  onMudar,
}: {
  valor: ModoPeriodo;
  onMudar: (modo: ModoPeriodo) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Modo do período" className="flex items-center gap-1">
      {MODOS.map((m) => {
        const ativo = m.valor === valor;
        return (
          <button
            key={m.valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            // O nome acessível é o rótulo, não a explicação. Sem o `aria-label`, a árvore
            // de acessibilidade anunciava "Uma coluna por mês do intervalo" no lugar de
            // "Meses" — o `title` acaba servindo de nome quando existe, e um botão cujo
            // nome é uma frase inteira não se diferencia dos irmãos numa leitura por voz.
            aria-label={m.rotulo}
            title={m.explicacao}
            onClick={() => onMudar(m.valor)}
            className={cn(
              "rounded-[var(--radius-sm)] px-2 py-0.5 text-[length:var(--fs-rotulo)] font-medium tracking-[0.08em] uppercase",
              "transition-colors duration-[var(--dur-fast)]",
              ativo
                ? "bg-[var(--surface-hover)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
            )}
          >
            {m.rotulo}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Os anos das colunas.
 *
 * Chips e não lista suspensa: são poucos, a escolha é múltipla, e ver os anos disponíveis
 * de uma vez é mais rápido do que abrir uma lista para marcar dois deles.
 *
 * Ao bater o teto, os não escolhidos ficam **desabilitados e explicados** em vez de apenas
 * recusarem o clique. O limite não é capricho — cada ano é uma varredura da base inteira —,
 * e é essa frase que o faz parecer razoável.
 */
function ChipsDeAno({
  escolhidos,
  onMudar,
}: {
  escolhidos: number[];
  onMudar: (anos: number[]) => void;
}) {
  const cheio = escolhidos.length >= MAXIMO_DE_ANOS;

  const alternar = (ano: number) =>
    onMudar(
      escolhidos.includes(ano)
        ? escolhidos.filter((a) => a !== ano)
        : [...escolhidos, ano].sort((a, b) => a - b),
    );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {anosOferecidos().map((ano) => {
        const marcado = escolhidos.includes(ano);
        const bloqueado = cheio && !marcado;
        return (
          <button
            key={ano}
            type="button"
            role="checkbox"
            aria-checked={marcado}
            disabled={bloqueado}
            title={
              bloqueado
                ? `No máximo ${MAXIMO_DE_ANOS} anos — cada ano é uma varredura da base.`
                : undefined
            }
            onClick={() => alternar(ano)}
            className={cn(
              "tabular rounded-[var(--radius-md)] border px-2.5 py-1.5 text-[length:var(--fs-base)]",
              "transition-colors duration-[var(--dur-fast)]",
              marcado
                ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                : bloqueado
                  ? "cursor-not-allowed border-[var(--border)] text-[var(--text-muted)] opacity-50"
                  : "border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            {ano}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Um campo do filtro: rótulo em cima, controle embaixo.
 *
 * É um grupo, não um `<label>`. Um rótulo só pode nomear **um** controle, e o campo
 * Período tem dois inputs de data mais o botão de atalhos — envolvê-los num `<label>`
 * deixaria os dois sem nome para o leitor de tela e, pior, devolveria o foco ao
 * primeiro input a cada clique no botão do relógio.
 */
function Campo({
  rotulo,
  children,
}: {
  rotulo?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div
      role={rotulo ? "group" : undefined}
      aria-labelledby={rotulo ? id : undefined}
      className="flex min-w-0 flex-col gap-2"
    >
      {/* Sem rótulo o espaço é preservado, para o botão alinhar com os campos. */}
      <span id={id} className={ROTULO} aria-hidden={rotulo === undefined}>
        {rotulo ?? " "}
      </span>
      {children}
    </div>
  );
}

/**
 * Atalhos de período, atrás de um relógio ao lado das datas.
 *
 * Cada opção **mostra o intervalo que vai aplicar**. "Últimos 3 meses" pode significar
 * três meses completos ou os noventa dias anteriores, e nenhuma das duas leituras é
 * óbvia — exibir `01/05/2026 a 31/07/2026` encerra a dúvida sem precisar de legenda.
 *
 * A lista é calculada a cada abertura, não uma vez na montagem: uma tela deixada
 * aberta durante a virada da meia-noite ofereceria o "ontem" de ontem.
 */
function AtalhosDePeriodo({
  onEscolher,
}: {
  onEscolher: (dataInicio: string, dataFim: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node))
        setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fechar);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fechar);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  return (
    <div ref={caixa} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        aria-label="Atalhos de período"
        title="Atalhos de período"
        className={cn(
          "grid aspect-square h-[var(--altura-controle)] place-items-center rounded-[var(--radius-md)]",
          "border border-[var(--border-strong)] bg-[var(--surface-2)]",
          "transition-colors duration-[var(--dur-fast)]",
          aberto
            ? "border-[var(--primary)] text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
        )}
      >
        <Relogio />
      </button>

      {aberto && (
        <div
          role="menu"
          className="absolute top-full right-0 z-20 mt-1 w-[min(20rem,90vw)] rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface-2)] p-2 shadow-[var(--shadow-float)]"
        >
          {atalhosPeriodo().map((a) => (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onEscolher(a.dataInicio, a.dataFim);
                setAberto(false);
              }}
              className="flex w-full flex-col gap-0.5 rounded-[var(--radius-sm)] px-3 py-[var(--celula-y)] text-left hover:bg-[var(--surface-3)]"
            >
              <span className="text-[length:var(--fs-base)] text-[var(--text-primary)]">
                {a.rotulo}
              </span>
              <span className="tabular text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
                {paraBr(a.dataInicio)}
                {a.dataInicio !== a.dataFim && ` a ${paraBr(a.dataFim)}`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Relógio em traço, herdando a cor e a espessura do botão. */
function Relogio() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[1.25em]"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
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
      if (caixa.current && !caixa.current.contains(e.target as Node))
        setAberto(false);
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
          ? (filiais.find((f) => f.codFilial === selecionadas[0])?.label ??
            "1 filial")
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
        <span
          className={cn(
            "truncate",
            selecionadas.length === 0 && "text-[var(--text-muted)]",
          )}
        >
          {resumo}
        </span>
        {/* A mesma seta do `<select>` de análise. Antes era o caractere `▾`, que o
            navegador desenha com a fonte de texto e sai com peso, tamanho e alinhamento
            diferentes da seta nativa ao lado — dois campos que fazem a mesma coisa
            pareciam de famílias diferentes. Aqui ela gira, porque este campo abre e fecha
            e a nativa não tem esse estado para comunicar. */}
        <Seta className={cn("ml-2", aberto && "rotate-180")} />
      </button>

      {aberto && (
        <div className="absolute top-full left-0 z-20 mt-1 max-h-80 w-[min(22rem,90vw)] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface-2)] p-2 shadow-[var(--shadow-float)]">
          <div className="mb-2 flex gap-2 border-b border-[var(--border)] pb-2">
            <AcaoRapida
              onClick={() => onMudar(filiais.map((f) => f.codFilial))}
            >
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

function AcaoRapida({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
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

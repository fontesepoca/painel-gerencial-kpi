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
  const [expandida, setExpandida] = useState(false);

  /**
   * `Esc` sai da tela cheia, como em qualquer coisa que ocupa a tela inteira.
   *
   * **Só quando não há modal aberto.** O detalhamento é um `<dialog>` e fecha no `Esc`
   * por conta própria; sem esta guarda, um `Esc` fecharia os dois de uma vez e quem
   * queria só fechar o detalhe perderia também a tela cheia.
   */
  useEffect(() => {
    if (!expandida) return;

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector("dialog[open]")) return;
      setExpandida(false);
    };

    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [expandida]);

  const [filtro, setFiltro] = useState<FiltroApuracao>(() => ({
    filiais: [],
    ...periodoPadrao(),
    regime: "competencia",
    analise: "grupo-contas",
  }));

  const dados = apuracao.data;

  return (
    // O nome da rotina vive só na trilha do cabeçalho. Um `h1` repetindo "DRE
    // Gerencial" logo abaixo dela custava duas linhas de altura para dizer o que já
    // estava dito — e altura é o recurso escasso desta tela.
    <AppShell trilha={["Época Analytics", "DRE Gerencial"]}>
      {/* Com a leitura ampliada a tabela precisa de mais largura útil antes de
          começar a rolar na horizontal. */}
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[110rem] flex-col gap-3">
        <div className="nao-imprime rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[var(--shadow-card)]">
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
          // A altura da tabela deixa de ser chutada: esta secao pega o que sobra da
          // coluna, e a rolagem interna dela se ajusta sozinha a qualquer janela.
          <section
            className={cn(
              "flex min-h-0 flex-1 flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow-card)]",
              expandida && "tabela-expandida",
              // A partir de três meses a impressão vai para A3 — ver o bloco IMPRESSÃO
              // em globals.css. Só o componente sabe quantos meses foram apurados.
              dados.periodos.length > 2 && "folha-larga",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2.5">
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

              <div className="nao-imprime flex items-center gap-4">
                <label className="flex cursor-pointer items-center gap-2.5 text-[length:var(--fs-apoio)] text-[var(--text-secondary)]">
                  <input
                    type="checkbox"
                    checked={mostrarZeradas}
                    onChange={(e) => setMostrarZeradas(e.target.checked)}
                    className="size-4 accent-[var(--primary)]"
                  />
                  Mostrar contas zeradas
                </label>

                <BotaoExpandir
                  expandida={expandida}
                  onAlternar={() => setExpandida((e) => !e)}
                />

                <BotaoImprimir />
              </div>
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

/**
 * Alterna a tabela entre a página e a tela cheia.
 *
 * O mesmo botão faz os dois caminhos, como no player do YouTube: quem já entendeu que
 * aquele canto expande procura o mesmo canto para voltar. Um segundo botão só para sair
 * ocuparia espaço permanente para uma ação que só existe metade do tempo.
 *
 * Ícone **e** texto. Só o ícone caberia melhor, mas esta tela é usada em leitura
 * ampliada por quem enxerga pouco, e um par de colchetes de 16px não é rótulo para
 * essa pessoa.
 */
function BotaoExpandir({
  expandida,
  onAlternar,
}: {
  expandida: boolean;
  onAlternar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-pressed={expandida}
      title={expandida ? "Voltar ao normal (Esc)" : "Expandir a tabela para a tela inteira"}
      className="flex shrink-0 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-2.5 py-1.5 text-[length:var(--fs-apoio)] font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
    >
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
        {expandida ? (
          // Cantos apontando para dentro — recolher.
          <>
            <path d="M3 8h3a2 2 0 0 0 2-2V3" />
            <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
            <path d="M3 16h3a2 2 0 0 1 2 2v3" />
            <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
          </>
        ) : (
          // Cantos apontando para fora — expandir.
          <>
            <path d="M8 3H5a2 2 0 0 0-2 2v3" />
            <path d="M16 3h3a2 2 0 0 1 2 2v3" />
            <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
            <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
          </>
        )}
      </svg>
      {expandida ? "Voltar ao normal" : "Tela cheia"}
    </button>
  );
}

/**
 * Manda imprimir. O que muda a página é o bloco `@media print` do `globals.css` —
 * este botão só dispara, e `Ctrl+P` passa exatamente pelo mesmo caminho.
 *
 * Existe porque nem todo mundo lembra do atalho, e porque a tela não parece um
 * documento imprimível: ver o botão é o que diz que a tabela sai inteira no papel.
 */
function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      title="Imprimir a tabela inteira (Ctrl+P faz o mesmo)"
      className="flex shrink-0 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] px-2.5 py-1.5 text-[length:var(--fs-apoio)] font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
    >
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
        <path d="M6 9V3h12v6" />
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
        <path d="M6 14h12v7H6z" />
      </svg>
      Imprimir
    </button>
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

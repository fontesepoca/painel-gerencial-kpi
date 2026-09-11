"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FiltrosDre } from "@/components/dre-gerencial/FiltrosDre";
import { TabelaDre } from "@/components/dre-gerencial/TabelaDre";
import { FolhaDaImpressao } from "@/components/dre-gerencial/impressao";
import { MenuExportar } from "@/components/dre-gerencial/MenuExportar";
import { exportarApuracao } from "@/lib/exportarExcel";
import { useApuracao, useFiliais } from "@/hooks/useDreGerencial";
import { cn } from "@/lib/cn";
import { formatarDataIso, formatarDuracao } from "@/lib/formato";
import { descreverFiliais } from "@/lib/filiaisApuradas";
import { estimativaDeTempo, impedimento } from "@/lib/modosDePeriodo";
import { periodoPadrao } from "@/lib/periodos";
import type { Apuracao, FiltroApuracao } from "@/types/dre-gerencial";

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

  /**
   * Exporta a apuração para `.xlsx`, **na ordem e na seleção que estão na tela**.
   *
   * A ordem vem do DOM (`tr[data-chave]`), não da resposta da API: quem arrastou linhas e
   * escondeu as zeradas quer o arquivo do que está vendo, e é o mesmo critério da
   * impressão, que imprime o que está renderizado.
   *
   * O erro **aparece**, em vez de o clique não fazer nada: o `import()` do xlsx passa pela
   * rede na primeira vez, e um clique silencioso faria a pessoa clicar de novo.
   */
  const [exportando, setExportando] = useState(false);
  const [erroExportar, setErroExportar] = useState<string | null>(null);

  const exportar = useCallback(async (apuracao: Apuracao) => {
    setExportando(true);
    setErroExportar(null);
    try {
      const chaves = [...document.querySelectorAll<HTMLElement>("tr[data-chave]")]
        .map((tr) => tr.dataset.chave)
        .filter((c): c is string => !!c);

      const porChave = new Map(apuracao.linhas.map((l) => [l.chaveOrdem, l]));
      const naTela = chaves
        .map((c) => porChave.get(c))
        .filter((l): l is (typeof apuracao.linhas)[number] => l !== undefined);

      // Sem nenhuma linha reconhecida no DOM, exporta a apuração como veio — melhor um
      // arquivo na ordem do cadastro que nenhum arquivo.
      await exportarApuracao(apuracao, naTela.length > 0 ? naTela : apuracao.linhas);
    } catch (e) {
      setErroExportar(
        e instanceof Error
          ? `Não foi possível gerar o Excel: ${e.message}`
          : "Não foi possível gerar o Excel.",
      );
    } finally {
      setExportando(false);
    }
  }, []);

  // O mês corrente, em colunas mensais: o recorte que a tela sempre abriu, e que os modos
  // de ano não deslocaram. `anos` começa vazio de propósito — um ano pré-escolhido seria
  // uma consulta de minutos esperando um clique distraído no Apurar.
  const [filtro, setFiltro] = useState<FiltroApuracao>(() => ({
    filiais: [],
    ...periodoPadrao(),
    regime: "competencia",
    analise: "ccusto-principal",
    modo: "meses",
    anos: [],
  }));

  const dados = apuracao.data;

  // As filiais da APURAÇÃO, não as do formulário: mexer no filtro depois de apurar não
  // pode reescrever o cabeçalho do que já está na tela — é o mesmo cuidado que o
  // detalhamento toma ao usar `dados` em vez de `filtro`.
  const filiaisApuradas = descreverFiliais(dados?.filiais ?? [], filiais.data ?? []);

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
          <>
          <FolhaDaImpressao
            folha={dados.periodos.length === 1 ? "a4-em-pe" : "a3-deitada"}
          />

          <section
            className={cn(
              "flex min-h-0 flex-1 flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow-card)]",
              expandida && "tabela-expandida",
              // A folha cresce com o número de colunas: um mês em A4 em pé, dois em A3
              // deitada, três ou mais em A2 deitada. Ver o bloco IMPRESSÃO em
              // globals.css — só o componente sabe quantos meses foram apurados.
              dados.periodos.length === 2 && "folha-media",
              dados.periodos.length === 3 && "folha-larga",
              dados.periodos.length >= 4 && "folha-cheia",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-2.5">
              <div>
                <h2 className="text-[length:var(--fs-rotulo)] font-semibold tracking-[0.14em] text-[var(--text-secondary)] uppercase">
                  Visão gerencial
                </h2>
                <p className="mt-1 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
                  {/* O intervalo do filtro só descreve o que foi apurado no modo mensal. Por
                      ano inteiro quem manda são as colunas; no comparativo são DOIS
                      intervalos, e citar só o primeiro esconderia metade da apuração. */}
                  {descreverPeriodo(dados)}{" "}
                  ·{" "}
                  {dados.regime === "caixa" ? "Caixa" : "Competência"} ·{" "}
                  {/* O separador vai DENTRO do span: escondido, ele leva o ` · ` junto e a
                      linha não fica com dois pontos seguidos. */}
                  <span className="filiais-resumo">{filiaisApuradas.resumo} · </span>
                  {descreverColunas(dados)} · apurado em {formatarDuracao(dados.duracaoMs)}
                </p>

                {/* Os nomes das filiais em linha própria, na tela cheia e no papel — ver o
                    bloco FILIAIS APURADAS em globals.css.

                    **Linha própria, e não mais um item da sequência acima.** Com dez
                    filiais a lista empurrava os controles da direita para baixo e crescia
                    o cabeçalho em 62px, que na tela cheia saem da tabela. Numa linha só
                    dela, a lista cresce sem deslocar nada.

                    Fica no DOM sempre, escondida por CSS, porque `Ctrl+P` não espera
                    re-render — a mesma razão do par de `%AH` em `Variacao`. */}
                <p className="filiais-descritas mt-0.5 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
                  {filiaisApuradas.detalhe}
                </p>
              </div>

              {/* `flex-wrap` e `whitespace-nowrap` juntos: em tela de celular o rótulo
                  quebrava em três linhas para caber ao lado dos botões, com 85px de largura
                  e 68px de altura. Inteiro, ele desce para a própria linha quando não cabe,
                  que é a quebra que o olho espera. */}
              <div className="nao-imprime flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex cursor-pointer items-center gap-2.5 text-[length:var(--fs-apoio)] whitespace-nowrap text-[var(--text-secondary)]">
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

                <MenuExportar
                  onImprimir={() => window.print()}
                  onExcel={() => exportar(dados)}
                  excelOcupado={exportando}
                />
              </div>
            </div>

            {/* Largura cheia, abaixo dos controles: uma falha silenciosa faria a pessoa
                clicar em exportar de novo achando que o clique não pegou. */}
            {erroExportar && (
              <p
                role="status"
                className="nao-imprime border-b border-[var(--border)] px-4 py-2 text-[length:var(--fs-apoio)] text-[var(--negative)]"
              >
                {erroExportar}
              </p>
            )}

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
                // O detalhamento é sempre de UMA coluna, e a coluna já traz o próprio
                // recorte em datas. Mandar o modo junto faria o servidor reabrir a
                // consulta em várias colunas de novo, dentro de um detalhe.
                modo: "meses",
                anos: [],
              }}
              modo={dados.modo}
              filiaisApuradas={filiaisApuradas.detalhe}
            />
          </section>
          </>
        )}

        {!dados && !apuracao.isPending && !apuracao.isError && (
          <Inicial motivo={impedimento(filtro)} estimativa={estimativaDeTempo(filtro)} />
        )}
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
 * Quantas colunas, e do quê. "3 meses" só está certo no modo mensal — nos outros a
 * contagem é de anos, e chamar de mês uma coluna que cobre doze deles é o tipo de rótulo
 * que faz alguém desconfiar do número ao lado.
 */
function descreverColunas(dados: Apuracao): string {
  const n = dados.periodos.length;
  if (dados.modo === "anos") return `${n} ${n === 1 ? "coluna" : "colunas"} por ano`;

  // No comparativo "3 meses" engana: são três COLUNAS mensais repartidas entre dois
  // intervalos, e o leitor entenderia um período contínuo de três meses.
  if (dados.modo === "comparar-anos") return `${n} ${n === 1 ? "coluna" : "colunas"} em 2 intervalos`;

  return `${n} ${n === 1 ? "mês" : "meses"}`;
}

/**
 * O período apurado, em texto — e ele muda de forma conforme o modo.
 *
 * No comparativo são **dois** intervalos: citar só o primeiro descreveria metade da
 * apuração, e quem lesse o cabeçalho não saberia contra o que a tabela está comparando.
 * As datas saem das próprias colunas, que é o que o servidor de fato apurou.
 */
function descreverPeriodo(dados: Apuracao): string {
  if (dados.modo === "anos") {
    const rotulos = dados.periodos.map((p) => p.rotulo).join(", ");
    return `${dados.periodos.length === 1 ? "Ano" : "Anos"} ${rotulos}`;
  }

  const intervalo = (bloco: number) => {
    const colunas = dados.periodos.filter((p) => p.bloco === bloco);
    const inicio = colunas[0]?.dataInicio;
    const fim = colunas.at(-1)?.dataFim;
    return inicio && fim ? `${formatarDataIso(inicio)} a ${formatarDataIso(fim)}` : null;
  };

  if (dados.modo === "comparar-anos") {
    const a = intervalo(0);
    const b = intervalo(1);
    if (a && b) return `${a}  vs  ${b}`;
  }

  return `${formatarDataIso(dados.dataInicio)} a ${formatarDataIso(dados.dataFim)}`;
}

/**
 * A tela antes da primeira apuração — e o lugar onde o que falta preencher é dito.
 *
 * **Aqui, e não no filtro.** Uma linha de aviso sob a grade empurra o botão Apurar e cresce
 * o header, que é altura tirada da tabela; e "escolha ao menos uma filial" é o estado normal
 * de quem acabou de abrir a tela, não um erro que mereça alarme junto dos controles. Aqui há
 * espaço de sobra, e é para cá que o olho vai quando a tabela ainda não existe.
 *
 * O botão desabilitado continua carregando o mesmo texto no `title`, para quem estiver com
 * o ponteiro lá.
 */
function Inicial({
  motivo,
  estimativa,
}: {
  motivo: string | null;
  estimativa: string | null;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] px-6 py-16 text-center">
      <p className="text-[length:var(--fs-base)] text-[var(--text-secondary)]">
        {motivo ?? "Escolha as filiais e o período, e clique em Apurar."}
      </p>
      <p className="mt-2 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
        {/* O impedimento tem precedência sobre a estimativa: não faz sentido anunciar
            quanto vai demorar algo que ainda não pode rodar. */}
        {(motivo === null && estimativa) ||
          "A apuração percorre todo o período no banco e leva de alguns segundos a alguns minutos."}
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

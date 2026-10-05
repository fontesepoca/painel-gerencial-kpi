"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { FiltrosDre } from "@/components/dre-gerencial/FiltrosDre";
import { TabelaDre } from "@/components/dre-gerencial/TabelaDre";
import { FiltroDeLinhas } from "@/components/dre-gerencial/FiltroDeLinhas";
import { FolhaDaImpressao } from "@/components/dre-gerencial/impressao";
import { MenuExportar } from "@/components/dre-gerencial/MenuExportar";
import { exportarApuracao } from "@/lib/exportarExcel";
import { aplicarOrdem } from "@/lib/ordemLinhas";
import { recalcular } from "@/lib/recalculoDoDre";
import { useApuracao, useFiliais } from "@/hooks/useDreGerencial";
import { cn } from "@/lib/cn";
import { formatarDataIso, formatarDuracao } from "@/lib/formato";
import { descreverFiliais } from "@/lib/filiaisApuradas";
import { descreverFornecedores } from "@/lib/fornecedoresApurados";
import { estimativaDeTempo, impedimento } from "@/lib/modosDePeriodo";
import { dataHoraBr, periodoPadrao } from "@/lib/periodos";
import type { Apuracao, FiltroApuracao } from "@/types/dre-gerencial";

export default function DreGerencialPage() {
  const filiais = useFiliais();
  const apuracao = useApuracao();
  const [mostrarZeradas, setMostrarZeradas] = useState(false);

  /**
   * As colunas de análise, ligadas por padrão.
   *
   * <b>Quem lê o DRE nem sempre lê as três colunas.</b> Numa conversa sobre valores, o
   * `%AV` e o `%AH` são ruído entre os números que importam; numa análise de composição,
   * o `%AV` é o assunto. Separados, cada um decide o que está olhando.
   *
   * <b>Marcados ao abrir</b>, a pedido do Gabriel em 05/10/2026: a tela continua sendo o
   * que sempre foi, e esconder coluna é escolha de quem está lendo, não o estado inicial.
   */
  const [mostrarAv, setMostrarAv] = useState(true);
  const [mostrarAh, setMostrarAh] = useState(true);
  const [expandida, setExpandida] = useState(false);

  /**
   * O texto que filtra as linhas da tabela.
   *
   * **Limpa a cada nova apuração** — decisão do Gabriel em 28/09/2026. Um filtro escrito
   * para o mês passado, ainda aplicado sobre números recém-chegados, esconde linhas sem
   * dizer por quê: quem apura de novo espera ver a apuração, e uma tabela com três linhas
   * parece defeito, não filtro.
   */
  const [filtroDeLinhas, setFiltroDeLinhas] = useState("");

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
      const chaves = [
        ...document.querySelectorAll<HTMLElement>("tr[data-chave]"),
      ]
        .map((tr) => tr.dataset.chave)
        .filter((c): c is string => !!c);

      // Os VALORES da tela, não os da apuração. Desde 15/09/2026 a ordem muda os totais, e
      // remapear as chaves do DOM para `apuracao.linhas` traria de volta os números do
      // cadastro — o arquivo contaria uma história e a tela outra.
      //
      // O recálculo precisa da lista COMPLETA, e o DOM só tem as visíveis: `aplicarOrdem`
      // recoloca as escondidas na vizinhança canônica delas, e uma conta zerada escondida
      // continua somando no bloco onde está.
      const completa = recalcular(
        aplicarOrdem(apuracao.linhas, chaves),
        apuracao.linhas,
      );
      const porChave = new Map(completa.map((l) => [l.chaveOrdem, l]));
      const naTela = chaves
        .map((c) => porChave.get(c))
        .filter((l): l is (typeof apuracao.linhas)[number] => l !== undefined);

      // Sem nenhuma linha reconhecida no DOM, exporta a apuração como veio — melhor um
      // arquivo na ordem do cadastro que nenhum arquivo.
      await exportarApuracao(
        apuracao,
        naTela.length > 0 ? naTela : apuracao.linhas,
      );
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
    // Vazio é o DRE inteiro — o comportamento de sempre, para quem nunca tocar no campo.
    fornecedores: [],
    regime: "competencia",
    analise: "ccusto-principal",
    modo: "meses",
    anos: [],
  }));

  const dados = apuracao.data;

  // As filiais da APURAÇÃO, não as do formulário: mexer no filtro depois de apurar não
  // pode reescrever o cabeçalho do que já está na tela — é o mesmo cuidado que o
  // detalhamento toma ao usar `dados` em vez de `filtro`.
  const filiaisApuradas = descreverFiliais(
    dados?.filiais ?? [],
    filiais.data ?? [],
  );

  // Os códigos saem da apuração; os nomes, do que está selecionado agora. Ver
  // `descreverFornecedores` — e é `null` quando o DRE é o inteiro, que é o caso comum.
  const fornecedoresApurados = descreverFornecedores(
    dados?.fornecedores ?? [],
    filtro.fornecedores,
  );

  // O `%AH` só existe com duas colunas ou mais: ele é a variação sobre a coluna anterior.
  // Sai de `dados`, e não do formulário, porque quem manda na tabela é o que foi apurado.
  const temAh = (dados?.periodos.length ?? 0) > 1;

  // Pela mesma razão: a hora é a da apuração que está na tela, não a de agora. Ela congela
  // junto com os números e não anda enquanto a folha espera para ser impressa.
  const apuradoEm = dataHoraBr(dados?.apuradoEm);

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
            onApurar={() => {
              setFiltroDeLinhas("");
              apuracao.mutate(filtro);
            }}
          />

          {filiais.isError && (
            <p className="mt-3 text-[length:var(--fs-base)] text-[var(--negative)]">
              Não foi possível carregar as filiais. Verifique se a API está no
              ar.
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
                    {descreverPeriodo(dados)} ·{" "}
                    {dados.regime === "caixa" ? "Caixa" : "Competência"} ·{" "}
                    {/* O separador vai DENTRO do span: escondido, ele leva o ` · ` junto e a
                      linha não fica com dois pontos seguidos. */}
                    <span className="filiais-resumo">
                      {filiaisApuradas.resumo} ·{" "}
                    </span>
                    {descreverColunas(dados)} ·{" "}
                    {/* NA TELA O TEMPO QUE A CONSULTA LEVOU, NO PAPEL A HORA EM QUE ELA FOI
                      FEITA — duas grafias do mesmo trecho, como o `%AH` em `Variacao`, e
                      quem escolhe é o CSS: `Ctrl+P` não espera re-render.

                      O tempo de consulta responde "a tela travou?", pergunta de quem está
                      sentado na frente dela. No papel ele não diz nada, e o que falta é
                      justamente o contrário: a base é viva, e dois papéis do mesmo recorte
                      impressos em horas diferentes trazem números diferentes. Sem a hora,
                      não há como saber qual folha é a mais nova — e é por isso que ela vai
                      aqui, na mesma linha do período e das filiais.

                      A hora é a do SERVIDOR, que apurou, e não a do navegador que imprimiu.
                      Ver `dataHoraBr`. */}
                    <span className="so-na-tela">
                      apurado em {formatarDuracao(dados.duracaoMs)}
                    </span>
                    {apuradoEm !== null && (
                      <span className="so-no-papel">
                        apurado em {apuradoEm}
                      </span>
                    )}
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

                  {/* DE QUEM É ESTE DRE.

                    Em linha própria e sempre visível — na tela e no papel —, porque é a
                    informação que mais muda o sentido de todos os números acima dela. Uma
                    folha impressa de um DRE filtrado circula sem contexto nenhum, e sem
                    esta linha ela se parece com o DRE da empresa inteira.

                    Só aparece quando há filtro: sem ele não há nada a dizer, e a altura
                    fica com a tabela. */}
                  {fornecedoresApurados !== null && (
                    <p className="mt-0.5 text-[length:var(--fs-apoio)] font-medium text-[var(--primary)]">
                      {fornecedoresApurados}
                    </p>
                  )}
                </div>

                {/* `flex-wrap` e `whitespace-nowrap` juntos: em tela de celular o rótulo
                  quebrava em três linhas para caber ao lado dos botões, com 85px de largura
                  e 68px de altura. Inteiro, ele desce para a própria linha quando não cabe,
                  que é a quebra que o olho espera. */}
                <div className="nao-imprime flex flex-wrap items-center gap-x-4 gap-y-2">
                  {/* Ao lado do `Mostrar zeradas`, e não junto de exportar e imprimir:
                    os dois primeiros decidem QUAIS LINHAS aparecem, os outros decidem o que
                    fazer com elas. */}
                  <FiltroDeLinhas
                    valor={filtroDeLinhas}
                    onMudar={setFiltroDeLinhas}
                  />

                  <label className="flex cursor-pointer items-center gap-2.5 text-[length:var(--fs-apoio)] whitespace-nowrap text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={mostrarZeradas}
                      onChange={(e) => setMostrarZeradas(e.target.checked)}
                      className="size-4 accent-[var(--primary)]"
                    />
                    Mostrar zeradas
                  </label>

                  {/* AS DUAS COLUNAS DE ANÁLISE.

                    Ao lado do `Mostrar zeradas` pelo mesmo critério que pôs o
                    filtro de linhas ali: estes controles decidem O QUE A TELA MOSTRA, e
                    os da direita decidem o que fazer com o que ela mostra.

                    O `%AH` fica DESABILITADO quando a apuração tem uma coluna só — ele
                    compara um mês com o anterior, e sem anterior não há o que comparar.
                    Desabilitado e não escondido: um controle que some da barra conforme
                    o período faz procurar o que não sumiu, e o `title` diz o motivo. */}
                  <label className="flex cursor-pointer items-center gap-2.5 text-[length:var(--fs-apoio)] whitespace-nowrap text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={mostrarAv}
                      onChange={(e) => setMostrarAv(e.target.checked)}
                      className="size-4 accent-[var(--primary)]"
                    />
                    AV %
                  </label>

                  <label
                    title={
                      temAh
                        ? undefined
                        : "A análise horizontal compara uma coluna com a anterior — ela aparece a partir de dois meses."
                    }
                    className={cn(
                      "flex items-center gap-2.5 text-[length:var(--fs-apoio)] whitespace-nowrap",
                      temAh
                        ? "cursor-pointer text-[var(--text-secondary)]"
                        : "cursor-not-allowed text-[var(--text-muted)]",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={mostrarAh && temAh}
                      disabled={!temAh}
                      onChange={(e) => setMostrarAh(e.target.checked)}
                      className="size-4 accent-[var(--primary)] disabled:opacity-50"
                    />
                    AH %
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
                // De `dados`, e não de `filtro`: a leitura da tela acompanha o que foi
                // apurado, não o que o formulário mostra agora.
                comFornecedor={dados.fornecedores.length > 0}
                periodos={dados.periodos}
                linhas={dados.linhas}
                mostrarZeradas={mostrarZeradas}
                mostrarAv={mostrarAv}
                mostrarAh={mostrarAh}
                filtroDeLinhas={filtroDeLinhas}
                onLimparFiltro={() => setFiltroDeLinhas("")}
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
                  // OS FORNECEDORES DA APURAÇÃO, desde 02/10/2026 — antes isto ia vazio, e o
                  // duplo clique abria os lançamentos de todo mundo numa tela cujo propósito é
                  // explicar a célula clicada.
                  //
                  // Os códigos saem de `dados`, que é a apuração que está na tela; o OBJETO
                  // vem do formulário quando ainda está lá, só para a tela ter o nome à mão. O
                  // que viaja para a API é o código, e só ele — ver `paraApi`.
                  fornecedores: dados.fornecedores.map(
                    (cod) =>
                      filtro.fornecedores.find((f) => f.codFornec === cod) ?? {
                        codFornec: cod,
                        fornecedor: "",
                        cgc: null,
                        codFornecPrinc: null,
                      },
                  ),
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
          <Inicial
            motivo={impedimento(filtro)}
            estimativa={estimativaDeTempo(filtro)}
          />
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
      title={
        expandida
          ? "Voltar ao normal (Esc)"
          : "Expandir a tabela para a tela inteira"
      }
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
  if (dados.modo === "anos")
    return `${n} ${n === 1 ? "coluna" : "colunas"} por ano`;

  // No comparativo "3 meses" engana: são três COLUNAS mensais repartidas entre dois
  // intervalos, e o leitor entenderia um período contínuo de três meses.
  if (dados.modo === "comparar-anos")
    return `${n} ${n === 1 ? "coluna" : "colunas"} em 2 intervalos`;

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
    return inicio && fim
      ? `${formatarDataIso(inicio)} a ${formatarDataIso(fim)}`
      : null;
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

      <p className="text-[length:var(--fs-base)] text-[var(--text-primary)]">
        Apurando o DRE…
      </p>

      <p className="tabular mt-3 text-[length:var(--fs-titulo)] font-semibold text-[var(--text-primary)]">
        {mm}:{ss}
      </p>

      <div className="mx-auto mt-5 h-[3px] w-56 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div className="cometa h-full w-1/3 rounded-full bg-[var(--primary)]" />
      </div>

      <p className="mx-auto mt-5 max-w-md text-[length:var(--fs-apoio)] leading-relaxed text-[var(--text-muted)]">
        A consulta percorre o período inteiro no banco e não reporta progresso —
        por isso o relógio, e não uma porcentagem. Não recarregue a página: isso
        dispararia uma segunda apuração.
      </p>
    </div>
  );
}

function Aviso({
  tom,
  children,
}: {
  tom: "erro" | "atencao";
  children: React.ReactNode;
}) {
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

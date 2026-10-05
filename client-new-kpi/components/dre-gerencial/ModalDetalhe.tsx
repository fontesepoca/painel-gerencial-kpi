"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatarPercentual, formatarValor } from "@/lib/formato";
import { paraBr } from "@/lib/periodos";
import { cn } from "@/lib/cn";
import { somaNoDre, temRateio, valorNoDre } from "@/lib/rateioDoDetalhe";
import {
  colunaDoTotal,
  igual,
  nomeDaLinha,
  rotuloDaColuna,
} from "@/lib/colunaDoTotal";
import { semEstornosQueSeAnulam } from "@/lib/estornosQueSeAnulam";
import {
  Cabecalho,
  Identidade,
  NUM,
  ParteDoTotal,
  TD,
  TH,
  TH_BASE,
  ThDetalhe,
  ThNum,
  Total,
  Vazio,
  soma,
  totalDe,
} from "@/components/dre-gerencial/primitivosDoDetalhe";
import { TabelaNotasDaDevolucao } from "@/components/dre-gerencial/TabelaNotasDaDevolucao";
import { useOrdenacaoDoDetalhe } from "@/hooks/useOrdenacaoDoDetalhe";
import {
  ordenarLinhas,
  proximaOrdem,
  type ColunaOrdenavel,
  type Ordem,
  type TipoDaColuna,
} from "@/lib/ordenacaoDoDetalhe";
import { MenuExportar } from "@/components/dre-gerencial/MenuExportar";
import type {
  DetalheCliente,
  DetalheImposto,
  DetalheLancamento,
  DetalheMotivo,
  DetalheNota,
  Detalhamento,
} from "@/types/dre-gerencial";

/** Composição de um totalizador — montada no front, sem passar pela API. */
export interface Composicao {
  titulo: string;
  total: number;
  parcelas: { rotulo: string; valor: number; semMovimento: boolean }[];
}

/**
 * Detalhamento de uma célula — o que a 9815 abre com duplo clique no valor.
 *
 * <b>O total desta tela soma o valor da linha clicada.</b> Não é assim na 9815: duas das
 * três telas dela usam critérios diferentes dos da apuração e fecham em outro número.
 * Corrigido de propósito, medido e revertível — `docs/DIVERGENCIAS.md` §4.
 *
 * <b>Quatro telas, não três.</b> As de cliente, motivo e lançamento vêm do banco; a de
 * composição é montada aqui, das linhas que já estão na tabela — ver `TabelaComposicao`.
 *
 * Usa `<dialog>` nativo pelos mesmos motivos do aviso de mover linha: foco preso, `Esc` e
 * semântica de diálogo vêm do navegador.
 */
export function ModalDetalhe({
  aberto,
  titulo,
  periodo,
  dados,
  linha,
  composicao,
  carregando,
  erro,
  onFechar,
  onAbrirEmNovaAba,
  onImprimir,
  onExcel,
  excelOcupado,
  avisoDaAba,
  onAbrirNotas,
  voltarPara,
  onVoltar,
}: {
  aberto: boolean;
  titulo: string;
  periodo: { dataInicio: string; dataFim: string } | null;
  dados: Detalhamento | undefined;
  /** A célula clicada. O resumo do cálculo se confere contra ela. */
  linha: { descricao: string; valor: number } | null;
  /** Quando presente, o modal mostra a composição em vez do resultado da API. */
  composicao: Composicao | null;
  carregando: boolean;
  erro: string | null;
  onFechar: () => void;
  /** `null` na composição dos totalizadores: não há consulta para levar para outra aba. */
  onAbrirEmNovaAba: (() => void) | null;
  /**
   * Imprimir daqui **abre a página dedicada e manda imprimir lá**, em vez de chamar
   * `window.print()` no diálogo.
   *
   * O motivo é do navegador: um `<dialog>` aberto vive na *top layer*, e conteúdo da top
   * layer **não se fragmenta entre páginas** — sairia a primeira folha e o resto cortado,
   * que numa lista de 15 mil clientes é o pior defeito possível. A página dedicada é HTML
   * em fluxo normal: pagina, e o cabeçalho se repete.
   *
   * `null` na composição, pelo mesmo motivo de `onAbrirEmNovaAba` — ela não é um
   * detalhamento guardado, é aritmética sobre a tabela que está atrás do diálogo.
   */
  onImprimir: (() => void) | null;
  /**
   * Exporta o detalhamento para Excel — **daqui mesmo**, sem passar pela outra aba.
   *
   * Diferente da impressão: planilha não tem folha nem paginação, então o `<dialog>` não
   * atrapalha. Os dados já estão carregados; é só montar o arquivo.
   */
  onExcel: (() => void) | null;
  excelOcupado?: boolean;
  /** Falha ao preparar a outra aba, ou ao gerar o Excel. Fica até o modal fechar. */
  avisoDaAba: string | null;
  /**
   * Abre as notas de um motivo, dentro deste mesmo diálogo.
   *
   * **Navegar por dentro, e não empilhar outro `<dialog>`.** Dois modais abertos disputam o
   * `Esc` e o foco do teclado — a pessoa aperta a tecla esperando voltar um nível e fecha
   * os dois —, e deixariam `Exportar` e `Abrir em nova aba` ambíguos entre os níveis.
   */
  onAbrirNotas?: (motivo: DetalheMotivo) => void;
  /** O rótulo do nível anterior, quando há um. Vira o caminho no topo. */
  voltarPara?: string | null;
  onVoltar?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="titulo-detalhe"
      // `Esc` fecha, clique no fundo NÃO.
      //
      // Um clique fora é fácil de dar sem querer enquanto se percorre uma tabela de 15 mil
      // linhas — e aqui isso custa a consulta inteira de volta, que na receita por cliente
      // leva dois minutos. `Esc` não tem esse risco: ninguém aperta uma tecla por engano
      // arrastando a barra de rolagem. Restam duas saídas deliberadas, o botão Fechar e a
      // tecla, e nenhuma acidental.
      onCancel={(e) => {
        e.preventDefault();
        onFechar();
      }}
      className="dialogo-detalhe"
    >
      {/* `min-h-0 flex-1` e não `h-full`: com a altura do diálogo vindo do conteúdo,
          `h-full` resolveria para "100% de automático" e a área de rolagem perderia a
          referência de altura. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            {/* O botão fica ACIMA do título, e não dentro dele: o título é o que o
                `aria-labelledby` do diálogo anuncia, e enfiar "voltar para X" ali faria o
                leitor de tela ler a navegação como se fosse o nome da tela.

                <b>Ele tem a mesma moldura de `Fechar` e `Abrir em nova aba`, e não a
                aparência de um caminho de migalhas.</b> Pedido do Gabriel em 28/09/2026,
                pelo público: parte de quem usa o sistema é idosa, e a primeira versão era
                texto pequeno em cinza claro, sem borda — que se lê como rótulo, não como
                algo em que se clica. Quem não reconhece o alvo fica preso no segundo nível
                e fecha o modal inteiro para recomeçar.

                A palavra <b>Voltar</b> vem primeiro e sozinha no peso do texto; o destino
                vem depois, truncado quando não couber. Assim o que a pessoa precisa ler
                para agir cabe numa olhada, e o resto é confirmação. */}
            {voltarPara && onVoltar && (
              <button
                type="button"
                onClick={onVoltar}
                title={`Voltar para ${voltarPara}`}
                className="mb-2 flex max-w-full items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-4 py-2 text-[length:var(--fs-base)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
              >
                {/* Seta cheia e do tamanho do texto. A versão anterior usava um chevron a
                    1,1em num texto de apoio — riscado fino, quase invisível em tela clara. */}
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-[1.25em] shrink-0"
                >
                  <path d="M19 12H5" />
                  <path d="m12 19-7-7 7-7" />
                </svg>
                <span className="shrink-0">Voltar</span>
                <span className="truncate text-[var(--text-muted)]">
                  para {voltarPara}
                </span>
              </button>
            )}
            <h2
              id="titulo-detalhe"
              className="truncate text-[length:var(--fs-titulo)] font-semibold text-[var(--text-primary)]"
            >
              {titulo}
            </h2>
            {periodo && (
              <p className="mt-1 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
                {paraBr(periodo.dataInicio)} a {paraBr(periodo.dataFim)}
                {dados &&
                  ` · apurado em ${(dados.duracaoMs / 1000).toFixed(1)} s`}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Mesma condição do botão de nova aba: sem detalhamento carregado não há o
                que exportar. */}
            {onImprimir && dados && !carregando && !erro && (
              <MenuExportar
                onImprimir={onImprimir}
                onExcel={onExcel}
                excelOcupado={excelOcupado}
                avisoDaImpressao="Abre em nova aba e imprime de lá — o diálogo não pagina no papel"
              />
            )}

            {/* Só aparece quando há o que levar. Com a consulta em andamento ou em erro,
                não existe detalhamento para abrir em lugar nenhum. */}
            {onAbrirEmNovaAba && dados && !carregando && !erro && (
              <button
                type="button"
                onClick={onAbrirEmNovaAba}
                title="Abre este mesmo detalhamento numa aba nova, sem consultar o banco de novo. Esta aba continua como está."
                className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-4 py-2 text-[length:var(--fs-base)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
              >
                {/* Seta saindo de uma moldura: o ícone que a web inteira usa para "isto
                    abre em outro lugar". Sem o traço para fora vira "maximizar", que é
                    outra ação e já existe nesta tela. */}
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-[1.15em] shrink-0"
                >
                  <path d="M14 4h6v6" />
                  <path d="M20 4 12 12" />
                  <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
                </svg>
                Abrir em nova aba
              </button>
            )}

            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar detalhamento"
              className="rounded-[var(--radius-md)] border border-[var(--border-strong)] px-4 py-2 text-[length:var(--fs-base)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
            >
              Fechar
            </button>
          </div>

          {/* Largura cheia, embaixo dos botões: uma falha silenciosa faria a pessoa clicar
              de novo achando que o clique não pegou. */}
          {avisoDaAba && (
            <p
              role="status"
              className="w-full text-[length:var(--fs-apoio)] text-[var(--warning)]"
            >
              {avisoDaAba}
            </p>
          )}
        </header>

        <div className="tabela-detalhe min-h-0 flex-1 overflow-auto">
          {carregando && <Esperando />}

          {erro && !carregando && (
            <p className="px-5 py-10 text-center text-[length:var(--fs-base)] text-[var(--negative)]">
              {erro}
            </p>
          )}

          {composicao && (
            <>
              {/* A composição não passa pela API, então não passa por `CorpoDoDetalhe`
                  tampouco — a origem do total tem que ser dita aqui. */}
              <OrigemDoTotal linha={linha} coluna="Valor" />
              <TabelaComposicao {...composicao} nome={nomeDaLinha(linha)} />
            </>
          )}

          {!composicao && dados && !carregando && !erro && (
            <CorpoDoDetalhe
              dados={dados}
              linha={linha}
              onAbrirNotas={onAbrirNotas}
            />
          )}
        </div>
      </div>
    </dialog>
  );
}

/**
 * A espera pode passar de dois minutos na receita por cliente. Mesmo tratamento da
 * apuração: cronômetro em vez de porcentagem inventada, porque a consulta não reporta
 * avanço e um número que muda prova que a tela não travou.
 */
function Esperando() {
  return (
    <div role="status" aria-live="polite" className="px-5 py-16 text-center">
      <div className="mb-5 flex justify-center gap-2.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="pulsa size-3 rounded-full bg-[var(--primary)]"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </div>
      <p className="text-[length:var(--fs-base)] text-[var(--text-primary)]">
        Buscando o detalhamento…
      </p>
      <p className="mx-auto mt-2 max-w-md text-[length:var(--fs-apoio)] leading-relaxed text-[var(--text-muted)]">
        A receita por cliente percorre as mesmas notas da apuração e pode levar
        alguns minutos.
      </p>
    </div>
  );
}

/**
 * O corpo do detalhamento: o resumo do cálculo e a tabela.
 *
 * Exportado porque a página dedicada mostra exatamente isto. **Uma implementação só para as
 * duas telas** — se cada uma tivesse a sua, a página e o modal começariam iguais e
 * divergiriam na primeira correção feita em um dos dois.
 */
export function CorpoDoDetalhe({
  dados,
  linha,
  onAbrirNotas,
}: {
  dados: Detalhamento;
  linha: { descricao: string; valor: number } | null;
  /**
   * Abre as notas de um motivo. Ausente na página de impressão e na outra aba, onde não há
   * para onde navegar — e nesses casos a tabela de motivos não se anuncia como clicável,
   * em vez de oferecer um clique que não faz nada.
   */
  onAbrirNotas?: (motivo: DetalheMotivo) => void;
}) {
  const nome = nomeDaLinha(linha);
  const coluna = colunaDoTotal(dados.tipo, nome);

  return (
    <>
      <ResumoDoCalculo dados={dados} linha={linha} />
      <OrigemDoTotal linha={linha} coluna={coluna} />
      <Conteudo
        dados={dados}
        coluna={coluna}
        nome={nome}
        onAbrirNotas={onAbrirNotas}
      />
    </>
  );
}

function Conteudo({
  dados,
  coluna,
  nome,
  onAbrirNotas,
}: {
  dados: Detalhamento;
  /** O rótulo da coluna que soma no valor da célula clicada — ver `colunaDoTotal`. */
  coluna: string | null;
  /** O nome da linha do DRE, sem o sinal, para anunciar a coluna. */
  nome: string | null;
  onAbrirNotas?: (motivo: DetalheMotivo) => void;
}) {
  if (dados.tipo === "receita-por-cliente") {
    return (
      <TabelaClientes
        linhas={dados.clientes ?? []}
        coluna={coluna}
        nome={nome}
      />
    );
  }
  if (dados.tipo === "devolucao-por-motivo") {
    return (
      <TabelaMotivos
        linhas={dados.motivos ?? []}
        coluna={coluna}
        nome={nome}
        onAbrirNotas={onAbrirNotas}
      />
    );
  }
  if (dados.tipo === "notas-por-motivo") {
    return (
      <TabelaNotasDaDevolucao
        linhas={dados.notas ?? []}
        coluna={coluna}
        nome={nome}
      />
    );
  }
  if (dados.tipo === "imposto-por-produto") {
    return (
      <TabelaImpostos
        linhas={dados.impostos ?? []}
        coluna={coluna}
        nome={nome}
      />
    );
  }
  return (
    <TabelaLancamentos
      linhas={dados.lancamentos ?? []}
      coluna={coluna}
      nome={nome}
      // Com fornecedor filtrado a tela ganha a coluna do valor rateado, e é ELA que
      // fecha com a célula. Ver `lib/rateioDoDetalhe.ts`.
      participacao={temRateio(dados) ? dados.participacao : null}
    />
  );
}

/**
 * Como se chega no total — a conta que a linha do DRE faz, com os valores dela.
 *
 * Pedido do dono da empresa em 03/09/2026. A tabela abaixo responde "de onde vem"; isto
 * responde "como se calcula", que é outra pergunta e vinha sem resposta na tela.
 *
 * **Os números saem das mesmas linhas que a tabela lista**, somando as colunas dela. Não
 * há segunda consulta, e por construção o resumo não pode discordar do que está logo
 * abaixo — os dois leem as mesmas linhas.
 *
 * Só aparece onde existe conta de verdade. Numa lista de lançamentos o total é a soma da
 * coluna e ponto; escrever "soma dos lançamentos = total" seria ocupar espaço para não
 * dizer nada, e treinar o olho a pular o bloco justamente onde ele importa.
 */
function ResumoDoCalculo({
  dados,
  linha,
}: {
  dados: Detalhamento;
  linha: { descricao: string; valor: number } | null;
}) {
  const partes = operandos(dados, linha);
  if (partes.length === 0) return null;

  const resultado = partes.reduce((s, p) => s + p.sinal * p.valor, 0);

  // A linha do DRE mostra as deduções negativas e a tela soma positivo; comparar em
  // módulo é o que faz o selo dizer a verdade nos dois casos.
  const confere =
    linha === null ||
    Math.abs(Math.abs(resultado) - Math.abs(linha.valor)) < 0.005;

  return (
    <section className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-4">
      {/* Mesmo peso e mesma cor dos cabeçalhos de coluna: é o título de um bloco. */}
      <h3 className="text-[length:var(--fs-rotulo)] font-bold tracking-[0.14em] text-[var(--text-primary)] uppercase">
        Como se chega no total
      </h3>

      <dl className="tabular mt-3 flex flex-col gap-1.5">
        {partes.map((p, i) => (
          <div key={p.rotulo} className="flex items-baseline gap-3">
            <dt className="flex-1 text-[length:var(--fs-base)] text-[var(--text-secondary)]">
              <span aria-hidden className="mr-2 text-[var(--text-muted)]">
                {i === 0 ? " " : p.sinal < 0 ? "−" : "+"}
              </span>
              {p.rotulo}
            </dt>
            <dd className="text-[length:var(--fs-base)] text-[var(--text-primary)]">
              {formatarValor(p.valor)}
            </dd>
          </div>
        ))}

        <div className="mt-1 flex items-baseline gap-3 border-t border-[var(--border-strong)] pt-2">
          <dt className="flex-1 text-[length:var(--fs-base)] font-semibold text-[var(--text-primary)]">
            <span aria-hidden className="mr-2 text-[var(--text-muted)]">
              =
            </span>
            {linha?.descricao ?? "Total"}
          </dt>
          <dd className="text-[length:var(--fs-base)] font-semibold text-[var(--text-primary)]">
            {formatarValor(resultado)}
          </dd>
        </div>
      </dl>

      {/* Só fala quando NÃO confere. Um "✓ confere" em toda abertura vira enfeite, e
          enfeite é o que o olho aprende a não ler. */}
      {!confere && linha && (
        <p className="mt-3 text-[length:var(--fs-apoio)] text-[var(--warning)]">
          Esta conta dá {formatarValor(resultado)}, e a célula clicada mostra{" "}
          {formatarValor(linha.valor)}. Os dois deveriam bater em módulo — vale
          conferir antes de usar o número.
        </p>
      )}
    </section>
  );
}

/**
 * As parcelas da conta de cada tela, somando as colunas das linhas já carregadas.
 *
 * Lista vazia significa "esta tela não tem conta a mostrar", e o resumo some.
 */
function operandos(
  dados: Detalhamento,
  linha: { descricao: string; valor: number } | null,
): { rotulo: string; valor: number; sinal: 1 | -1 }[] {
  const nome = (linha?.descricao ?? "").toUpperCase();

  if (dados.tipo === "imposto-por-produto") {
    const l = dados.impostos ?? [];
    if (l.length === 0) return [];

    // O rótulo diz "imposto + FECP" com todas as letras porque a coluna soma os dois na
    // mesma expressão — e confundir os dois números chamados ST custou dois dias.
    //
    // Comparação exata, e "Imposto" quando não reconhece. Com `includes` a linha
    // `Acerto De Estoque` viraria "ST", e um encadeamento com COFINS no fim rotula de
    // COFINS tudo que não for ST nem PIS — dizer o nome errado é pior que não dizer.
    const imposto =
      { "(-) ST": "ST", "(-) PIS": "PIS", "(-) COFINS": "COFINS" }[nome] ??
      "Imposto";

    return [
      {
        rotulo: `${imposto} + FECP das vendas`,
        valor: soma(l, (i) => i.vendas),
        sinal: 1,
      },
      {
        rotulo: `${imposto} + FECP das devoluções`,
        valor: soma(l, (i) => i.devolucoes),
        sinal: -1,
      },
    ];
  }

  // A tela de receita abre a partir de QUATRO linhas, e só uma delas é resultado de uma
  // conta. `RECEITA BRUTA`, `ABAT./DESC.` e `CMV LIQ.` são cada uma a soma de UMA coluna:
  // para elas não há conta a mostrar, e inventar a identidade da líquida faria o resumo
  // exibir um total que não é o da célula clicada.
  if (dados.tipo === "receita-por-cliente" && nome.includes("LIQUIDA")) {
    const l = dados.clientes ?? [];
    if (l.length === 0) return [];
    return [
      {
        rotulo: "Receita bruta",
        valor: soma(l, (c) => c.receitaBruta),
        sinal: 1,
      },
      {
        rotulo: "Abatimentos e descontos",
        valor: soma(l, (c) => c.desconto),
        sinal: -1,
      },
      { rotulo: "Devoluções", valor: soma(l, (c) => c.devolucao), sinal: -1 },
    ];
  }

  return [];
}

/**
 * De que linhas um totalizador é feito.
 *
 * Diferente das outras três telas, esta não lista dado do banco: lista as linhas da própria
 * tabela que somam naquele número. É a resposta para "como se chegou aqui", que nas linhas
 * de despesa é "destes lançamentos" e nos totalizadores é "destas linhas".
 *
 * O total no rodapé é lido da linha clicada, e não da soma das parcelas — se um dia os dois
 * discordarem, é defeito de apuração, e esconder isso somando o que está na tela seria
 * apagar justamente o sinal.
 */
function TabelaComposicao({
  total,
  parcelas,
  nome,
}: Composicao & { nome: string | null }) {
  const diferenca = total - soma(parcelas, (p) => p.valor);

  /**
   * Meio centavo de tolerância. Somar 126 parcelas em ponto flutuante deixa resto — a
   * primeira versão disto comparava com zero e acendia o aviso mostrando `0,00`, que é o
   * pior tipo de alarme: o que diz que há um problema e exibe o número certo ao lado.
   *
   * Os valores são moeda arredondada a duas casas, então qualquer divergência real é de
   * pelo menos um centavo e passa por aqui.
   */
  const naoFecha = Math.abs(diferenca) >= 0.005;

  return (
    <table className="w-full border-collapse text-[length:var(--fs-base)]">
      <Cabecalho>
        <th className={cn(TH, "col-identidade text-left")}>Linha</th>
        <ThNum rotulo="Valor" coluna="Valor" nome={nome} />
      </Cabecalho>

      <tbody>
        {parcelas.map((p, i) => (
          <tr
            key={p.rotulo + i}
            className="border-b border-[var(--border)] odd:bg-[var(--zebra)] hover:bg-[var(--surface-2)]"
          >
            <td className={cn(TD, "col-identidade")}>
              {p.rotulo}
              {p.semMovimento && (
                <span className="ml-2 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
                  sem lançamento no período
                </span>
              )}
            </td>
            <td
              className={cn(
                NUM,
                p.valor < 0
                  ? "text-[var(--negative)]"
                  : "text-[var(--text-primary)]",
              )}
            >
              {formatarValor(p.valor)}
            </td>
          </tr>
        ))}

        {/* Só aparece se houver o que explicar. Uma linha de "diferença: 0,00" em toda
            composição treina o olho a ignorá-la, e aí ela não avisa no dia em que valer. */}
        {naoFecha && (
          <tr className="border-b border-[var(--border)]">
            <td className={cn(TD, "col-identidade text-[var(--warning)]")}>
              Diferença não explicada pelas parcelas
            </td>
            <td className={cn(NUM, "text-[var(--warning)]")}>
              {formatarValor(diferenca)}
            </td>
          </tr>
        )}
      </tbody>

      <Total>
        <td className={cn(TD, "col-identidade")}>
          {parcelas.length} {parcelas.length === 1 ? "parcela" : "parcelas"}
        </td>
        {/* Aqui a coluna do total é sempre esta — a composição só tem uma de valor. */}
        <td className={cn(NUM, "text-[var(--primary)]")}>
          {formatarValor(total)}
        </td>
      </Total>
    </table>
  );
}

/**
 * Diz, em uma linha, de onde vem o número que estava na tabela do DRE.
 *
 * Fica **acima** da tabela porque a pergunta aparece antes da rolagem: quem abriu o
 * detalhamento do ST quer saber, na primeira olhada, qual das colunas de dinheiro é a que
 * dá os 344 mil da tela anterior.
 */
function OrigemDoTotal({
  linha,
  coluna,
}: {
  linha: { descricao: string } | null;
  coluna: string | null;
}) {
  const nome = nomeDaLinha(linha);
  if (!linha || !coluna || nome === null) return null;

  return (
    <p className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-2.5 text-[length:var(--fs-apoio)] text-[var(--text-secondary)]">
      O valor de{" "}
      <strong className="font-semibold text-[var(--text-primary)]">
        {linha.descricao}
      </strong>{" "}
      na tabela do DRE é a soma da coluna{" "}
      <strong className="font-semibold text-[var(--primary)]">
        {rotuloDaColuna(coluna, nome)}
      </strong>
      .
    </p>
  );
}

/**
 * As cinco colunas de dinheiro da tela de clientes, na ordem em que aparecem.
 *
 * <b>Uma delas é a que fecha o total da linha do DRE</b>, e qual depende de por onde a tela
 * foi aberta: pela `RECEITA BRUTA` é a bruta, pelas `RECEITAS LIQUIDAS` é a líquida. Quem
 * resolve isso é `colunaDoTotal`, e é essa mesma coluna que serve de base para o `% part.`.
 */
const VALOR_DO_CLIENTE: Readonly<Record<string, (c: DetalheCliente) => number>> = {
  "Receita bruta": (c) => c.receitaBruta,
  Desconto: (c) => c.desconto,
  Devolução: (c) => c.devolucao,
  "Custo líq.": (c) => c.custoLiq,
  "Receita líq.": (c) => c.receitaLiquida,
};

const COLUNAS_CLIENTE: readonly ColunaOrdenavel<DetalheCliente>[] = [
  { rotulo: "Cliente", tipo: "texto", ler: (c) => c.cliente },
  { rotulo: "Cidade", tipo: "texto", ler: (c) => c.cidade },
  { rotulo: "Notas", tipo: "numero", ler: (c) => c.qdeNf },
  ...Object.entries(VALOR_DO_CLIENTE).map(([rotulo, ler]) => ({
    rotulo,
    tipo: "numero" as const,
    ler,
  })),
];

function TabelaClientes({
  linhas,
  coluna,
  nome,
}: {
  linhas: readonly DetalheCliente[];
  coluna: string | null;
  nome: string | null;
}) {
  /**
   * A base do `% part.`: a coluna que fecha o total da linha do DRE.
   *
   * <b>Sem ela não há percentual honesto.</b> Cinco colunas de dinheiro dariam cinco
   * percentuais diferentes para a mesma linha, e escolher uma no chute faria a tela
   * responder a uma pergunta que ninguém fez. Quando `colunaDoTotal` devolve nulo — a
   * tela aberta sem saber de que linha veio —, a coluna simplesmente não aparece.
   */
  const base = coluna != null ? VALOR_DO_CLIENTE[coluna] : undefined;
  const totalDaBase = base ? soma(linhas, base) : 0;

  const colunas = useMemo(
    () =>
      base
        ? [
            ...COLUNAS_CLIENTE,
            {
              rotulo: "% part.",
              tipo: "numero" as const,
              ler: (c: DetalheCliente) => base(c),
            },
          ]
        : COLUNAS_CLIENTE,
    [base],
  );

  const { ordem, ordenar, ordenadas } = useOrdenacaoDoDetalhe(linhas, colunas);

  if (linhas.length === 0) return <Vazio />;

  const th = { ordem, onOrdenar: ordenar, coluna, nome };
  // Percentual de zero não é zero: é indefinido. Com a base somando zero, a coluna mostra
  // traço em vez de encher a tela de 0,000 que ninguém pode interpretar.
  const parte = (c: DetalheCliente) =>
    base && totalDaBase !== 0 ? (base(c) / totalDaBase) * 100 : null;

  return (
    <table className="w-full border-collapse text-[length:var(--fs-base)]">
      <Cabecalho>
        <ThDetalhe {...th} rotulo="Cliente" tipo="texto" className="col-identidade" />
        <ThDetalhe {...th} rotulo="Cidade" tipo="texto" />
        <ThDetalhe {...th} rotulo="Notas" tipo="numero" numerica />
        <ThDetalhe {...th} rotulo="Receita bruta" tipo="numero" numerica />
        <ThDetalhe {...th} rotulo="Desconto" tipo="numero" numerica />
        <ThDetalhe {...th} rotulo="Devolução" tipo="numero" numerica />
        <ThDetalhe {...th} rotulo="Custo líq." tipo="numero" numerica />
        <ThDetalhe {...th} rotulo="Receita líq." tipo="numero" numerica />
        {base && <ThDetalhe {...th} rotulo="% part." tipo="numero" numerica />}
      </Cabecalho>
      <tbody>
        {ordenadas.map((c) => (
          <tr
            key={c.codCli}
            className="border-b border-[var(--border)] odd:bg-[var(--zebra)] hover:bg-[var(--surface-2)]"
          >
            <Identidade codigo={c.codCli} nome={c.cliente} />
            <td
              className={cn(TD, "descricao-conta max-w-[12rem] truncate")}
              title={c.cidade}
            >
              {c.cidade}
            </td>
            <td className={NUM}>{c.qdeNf}</td>
            <td className={NUM}>{formatarValor(c.receitaBruta)}</td>
            <td className={NUM}>{formatarValor(c.desconto)}</td>
            <td className={NUM}>{formatarValor(c.devolucao)}</td>
            <td className={NUM}>{formatarValor(c.custoLiq)}</td>
            <td className={NUM}>{formatarValor(c.receitaLiquida)}</td>
            {base && (
              <td className={NUM}>
                <ParteDoTotal valor={parte(c)} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
      <Total>
        <td className={cn(TD, "col-identidade")}>{linhas.length} clientes</td>
        <td className={TD} />
        <td className={NUM}>{soma(linhas, (c) => c.qdeNf)}</td>
        <td className={totalDe(coluna, "Receita bruta")}>
          {formatarValor(soma(linhas, (c) => c.receitaBruta))}
        </td>
        <td className={totalDe(coluna, "Desconto")}>
          {formatarValor(soma(linhas, (c) => c.desconto))}
        </td>
        <td className={totalDe(coluna, "Devolução")}>
          {formatarValor(soma(linhas, (c) => c.devolucao))}
        </td>
        <td className={totalDe(coluna, "Custo líq.")}>
          {formatarValor(soma(linhas, (c) => c.custoLiq))}
        </td>
        <td className={totalDe(coluna, "Receita líq.")}>
          {formatarValor(soma(linhas, (c) => c.receitaLiquida))}
        </td>
        {base && (
          <td className={NUM}>
            <ParteDoTotal valor={totalDaBase !== 0 ? 100 : null} />
          </td>
        )}
      </Total>
    </table>
  );
}

/**
 * `Culpa RCA` — se a devolução é atribuída ao representante.
 *
 * <b>Verde para Sim, vermelho para Não, como na 9815.</b> A leitura é a de um marcador de
 * sim/não, não de bom/ruim: "culpa do RCA" sendo verde só faz sentido porque é a convenção
 * que quem vem da rotina antiga já tem na cabeça. Trocar o significado das cores aqui
 * criaria um erro de leitura silencioso justamente em quem confere as duas telas.
 *
 * <b>O texto continua.</b> A cor entra como segundo canal, num ponto ao lado — quem não
 * distingue verde de vermelho lê "Sim" e "Não" do mesmo jeito, e ninguém precisa de legenda.
 */
function CulpaRca({ valor }: { valor: string | null }) {
  if (valor !== "S" && valor !== "N") {
    return <span className="text-[var(--text-muted)]">—</span>;
  }

  const sim = valor === "S";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5",
        sim ? "text-[var(--positive)]" : "text-[var(--negative)]",
      )}
    >
      {/* `bg-current` faz o ponto seguir a cor do texto: uma decisão de cor só, no
          `className` acima, em vez de duas que podem sair de sincronia. */}
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-current" />
      {sim ? "Sim" : "Não"}
    </span>
  );
}

/**
 * `(-) ST`, `(-) PIS` e `(-) COFINS`, quebrados por produto.
 *
 * Mesmo desenho da devolução por motivo — eixo, contagem de notas, valor e participação —,
 * com duas colunas a mais que a devolução não precisa: o imposto das vendas e o das
 * devoluções, separados. É a conta que a linha do DRE faz, e vê-la por produto responde
 * "quem puxou o ST para cima" sem sair da tela.
 *
 * **`Vendas` e `Devoluções` somam imposto + FECP no mesmo número**, como a apuração faz.
 * Separar os dois aqui daria uma tela que não fecha com a linha que ela detalha.
 */
const COLUNAS_IMPOSTO: readonly ColunaOrdenavel<DetalheImposto>[] = [
  { rotulo: "Produto", tipo: "texto", ler: (i) => i.produto },
  { rotulo: "Notas", tipo: "numero", ler: (i) => i.qdeNf },
  { rotulo: "Vendas", tipo: "numero", ler: (i) => i.vendas },
  { rotulo: "Devoluções", tipo: "numero", ler: (i) => i.devolucoes },
  { rotulo: "Líquido", tipo: "numero", ler: (i) => i.liquido },
  { rotulo: "% part.", tipo: "numero", ler: (i) => i.pPart },
];

function TabelaImpostos({
  linhas,
  coluna,
  nome,
}: {
  linhas: readonly DetalheImposto[];
  coluna: string | null;
  nome: string | null;
}) {
  const { ordem, ordenar, ordenadas } = useOrdenacaoDoDetalhe(linhas, COLUNAS_IMPOSTO);

  if (linhas.length === 0) return <Vazio />;

  const th = { ordem, onOrdenar: ordenar, coluna, nome };

  return (
    <table className="w-full border-collapse text-[length:var(--fs-base)]">
      <Cabecalho>
        <ThDetalhe {...th} rotulo="Produto" tipo="texto" className="col-identidade" />
        <ThDetalhe {...th} rotulo="Notas" tipo="numero" numerica />
        <ThDetalhe {...th} rotulo="Vendas" tipo="numero" numerica />
        <ThDetalhe {...th} rotulo="Devoluções" tipo="numero" numerica />
        <ThDetalhe {...th} rotulo="Líquido" tipo="numero" numerica />
        <ThDetalhe {...th} rotulo="% part." tipo="numero" numerica />
      </Cabecalho>
      <tbody>
        {ordenadas.map((i) => (
          <tr
            key={i.codProd}
            className="border-b border-[var(--border)] odd:bg-[var(--zebra)] hover:bg-[var(--surface-2)]"
          >
            <Identidade
              codigo={i.codProd}
              nome={i.produto ?? "Sem descrição"}
            />
            <td className={NUM}>{i.qdeNf}</td>
            <td className={NUM}>{formatarValor(i.vendas)}</td>
            <td className={NUM}>{formatarValor(i.devolucoes)}</td>
            <td className={cn(NUM, "font-semibold")}>
              {formatarValor(i.liquido)}
            </td>
            <td className={NUM}>
              <ParteDoTotal valor={i.pPart} />
            </td>
          </tr>
        ))}
      </tbody>
      <Total>
        <td className={cn(TD, "col-identidade")}>{linhas.length} produtos</td>
        <td className={NUM}>{soma(linhas, (i) => i.qdeNf)}</td>
        <td className={NUM}>{formatarValor(soma(linhas, (i) => i.vendas))}</td>
        <td className={NUM}>
          {formatarValor(soma(linhas, (i) => i.devolucoes))}
        </td>
        <td className={totalDe(coluna, "Líquido")}>
          {formatarValor(soma(linhas, (i) => i.liquido))}
        </td>
        <td className={NUM}>
          <ParteDoTotal valor={soma(linhas, (i) => i.pPart)} />
        </td>
      </Total>
    </table>
  );
}

const COLUNAS_MOTIVO: readonly ColunaOrdenavel<DetalheMotivo>[] = [
  // Ordena pelo NOME, não pelo código: quem clica em "Motivo" procura um motivo, e a
  // ordem por código devolveria uma lista que só faz sentido para quem decorou o cadastro.
  { rotulo: "Motivo", tipo: "texto", ler: (m) => m.motivo },
  { rotulo: "Culpa RCA", tipo: "texto", ler: (m) => m.culpaRca },
  { rotulo: "Notas", tipo: "numero", ler: (m) => m.qdeNf },
  { rotulo: "Devolução", tipo: "numero", ler: (m) => m.vlDevolucao },
  { rotulo: "% part.", tipo: "numero", ler: (m) => m.pPart },
];

function TabelaMotivos({
  linhas,
  coluna,
  nome,
  onAbrirNotas,
}: {
  linhas: readonly DetalheMotivo[];
  coluna: string | null;
  nome: string | null;
  onAbrirNotas?: (motivo: DetalheMotivo) => void;
}) {
  const { ordem, ordenar, ordenadas } = useOrdenacaoDoDetalhe(linhas, COLUNAS_MOTIVO);

  if (linhas.length === 0) return <Vazio />;

  const th = { ordem, onOrdenar: ordenar, coluna, nome };

  return (
    <table className="w-full border-collapse text-[length:var(--fs-base)]">
      <Cabecalho>
        <ThDetalhe {...th} rotulo="Motivo" tipo="texto" className="col-identidade" />
        <ThDetalhe {...th} rotulo="Culpa RCA" tipo="texto" />
        <ThDetalhe {...th} rotulo="Notas" tipo="numero" numerica />
        <ThDetalhe {...th} rotulo="Devolução" tipo="numero" numerica />
        <ThDetalhe {...th} rotulo="% part." tipo="numero" numerica />
      </Cabecalho>
      <tbody>
        {ordenadas.map((m) => (
          // A LINHA INTEIRA é o alvo, e não só o número: um alvo de 3 caracteres é o
          // tamanho que faz a pessoa mirar. O `tabIndex` põe a linha na ordem do teclado —
          // uma tabela em que só o mouse chega ao segundo nível deixa quem navega por
          // teclado sem caminho nenhum.
          <tr
            key={m.codMotivo ?? "sem-motivo"}
            className={cn(
              "border-b border-[var(--border)] odd:bg-[var(--zebra)] hover:bg-[var(--surface-2)]",
              onAbrirNotas &&
                "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)]",
            )}
            {...(onAbrirNotas
              ? {
                  tabIndex: 0,
                  role: "button" as const,
                  "aria-label": `Ver as ${m.qdeNf} notas de ${m.motivo ?? "sem motivo cadastrado"}`,
                  onClick: () => onAbrirNotas(m),
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onAbrirNotas(m);
                    }
                  },
                }
              : {})}
          >
            {/* Devolução sem motivo cadastrado entra no total mesmo assim: a junção com
                PCTABDEV é externa de propósito, aqui e na 9815. */}
            <Identidade
              codigo={m.codMotivo ?? "—"}
              nome={m.motivo ?? "Sem motivo cadastrado"}
            />
            <td className={TD}>
              <CulpaRca valor={m.culpaRca} />
            </td>
            {/* O número ganha aparência de link para dizer que ali há mais — mas quem
                recebe o clique é a linha toda, logo acima. */}
            <td className={NUM}>
              {onAbrirNotas ? (
                <span className="underline decoration-dotted underline-offset-4 text-[var(--primary)]">
                  {m.qdeNf}
                </span>
              ) : (
                m.qdeNf
              )}
            </td>
            <td className={NUM}>{formatarValor(m.vlDevolucao)}</td>
            {/* Duas casas: o valor vem arredondado assim da consulta, e é o que a
                9815 mostra nesta coluna. */}
            <td className={NUM}>
              <ParteDoTotal valor={m.pPart} />
            </td>
          </tr>
        ))}
      </tbody>
      <Total>
        <td className={cn(TD, "col-identidade")}>{linhas.length} motivos</td>
        <td className={TD} />
        <td className={NUM}>{soma(linhas, (m) => m.qdeNf)}</td>
        <td className={totalDe(coluna, "Devolução")}>
          {formatarValor(soma(linhas, (m) => m.vlDevolucao))}
        </td>
        <td className={NUM}>
          <ParteDoTotal valor={soma(linhas, (m) => m.pPart)} />
        </td>
      </Total>
    </table>
  );
}

const data = (iso: string | null) => (iso ? paraBr(iso.slice(0, 10)) : "—");
const texto = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : String(v);

/**
 * As colunas da lista de lançamentos, **na ordem exata da 9815** — conferida na exportação
 * de RECEITAS FINANCEIRAS em 02/09/2026.
 *
 * A rotina mostra 26 colunas, mas a primeira, `Rank`, é a coluna de recuo da árvore e não
 * carrega dado nenhum: aqui o recuo vem das linhas de grupo, então sobram 25.
 *
 * A ordem é a da rotina, e não a que faria mais sentido do zero. Quem confere as duas
 * telas lado a lado percorre coluna por coluna, e reordenar "para melhorar" transformaria
 * cada conferência num exercício de procurar onde foi parar o campo.
 */
const COLUNAS: ReadonlyArray<{
  rotulo: string;
  numerica?: boolean;
  ler: (l: DetalheLancamento) => React.ReactNode;
  /**
   * O valor para ORDENAR, quando o renderizado ordenaria errado.
   *
   * Só as seis colunas abaixo precisam dele, e por dois motivos distintos. `V. Pago` sai
   * formatado — `9,50` viria depois de `1.226.270,82` porque `9` &gt; `1` quando se
   * compara texto. As cinco de data saem em `dd/mm/aaaa`, e nesse formato 02/09 e 14/08
   * comparam pelo dia antes do mês; o ISO que vem da API ordena certo sozinho.
   *
   * As outras dezenove já são texto, e o texto renderizado é o que a pessoa vê e é por ele
   * que ela espera ordenar.
   */
  bruto?: (l: DetalheLancamento) => string | number | null;
}> = [
  { rotulo: "Rec.Num.", numerica: true, ler: (l) => l.recNum },
  { rotulo: "Histórico", ler: (l) => texto(l.historico) },
  {
    rotulo: "V. Pago",
    numerica: true,
    ler: (l) => formatarValor(l.vPago),
    bruto: (l) => l.vPago,
  },
  {
    rotulo: "Dt.Lançamento",
    numerica: true,
    ler: (l) => data(l.dtLanc),
    bruto: (l) => l.dtLanc,
  },
  {
    rotulo: "Dt. Pagto.",
    numerica: true,
    ler: (l) => data(l.dtPagto),
    bruto: (l) => l.dtPagto,
  },
  {
    rotulo: "Dt.Competência",
    numerica: true,
    ler: (l) => data(l.dtCompetencia),
    bruto: (l) => l.dtCompetencia,
  },
  {
    rotulo: "Dt.Compensação",
    numerica: true,
    ler: (l) => data(l.dtCompensacao),
    bruto: (l) => l.dtCompensacao,
  },
  { rotulo: "Filial", numerica: true, ler: (l) => texto(l.codFilial) },
  { rotulo: "Nota", numerica: true, ler: (l) => texto(l.numNota) },
  { rotulo: "Prest.", numerica: true, ler: (l) => texto(l.duplic) },
  { rotulo: "Cód.Fornec", numerica: true, ler: (l) => texto(l.codFornec) },
  { rotulo: "Fornecedor", ler: (l) => texto(l.fornecedor) },
  { rotulo: "Func.Lanc", ler: (l) => texto(l.nomeFunc) },
  { rotulo: "Func. Baixa", ler: (l) => texto(l.nomeFuncBaixa) },
  { rotulo: "Índice", ler: (l) => texto(l.indice) },
  { rotulo: "Carreg.", numerica: true, ler: (l) => texto(l.numCar) },
  { rotulo: "Num. Borderô", numerica: true, ler: (l) => texto(l.numBordero) },
  { rotulo: "Nro.Projeto", numerica: true, ler: (l) => texto(l.codProjeto) },
  { rotulo: "Num. Trans", numerica: true, ler: (l) => texto(l.numTrans) },
  { rotulo: "Num. Banco", numerica: true, ler: (l) => texto(l.numBanco) },
  { rotulo: "Num. Cheque", numerica: true, ler: (l) => texto(l.numCheque) },
  {
    rotulo: "Num. Seq. Borderô",
    numerica: true,
    ler: (l) => texto(l.numSeqBordero),
  },
  { rotulo: "Localização", ler: (l) => texto(l.localizacao) },
  {
    rotulo: "Dt. Reclass.",
    numerica: true,
    ler: (l) => data(l.dtReclassific),
    bruto: (l) => l.dtReclassific,
  },
  {
    rotulo: "Cod. Func. Reclass.",
    numerica: true,
    ler: (l) => texto(l.codFuncReclassific),
  },
];

/**
 * As colunas da tela, com a do RATEIO quando há fornecedor filtrado.
 *
 * <b>Ela entra logo depois do V. Pago</b>, e não no fim: as duas são o mesmo dinheiro
 * visto de dois jeitos — o que o lançamento é, e o que ele vale dentro deste DRE —, e lado
 * a lado a conta se lê sem procurar. As 25 colunas da 9815 seguem na ordem dela.
 *
 * Sem filtro a lista é, item por item, a de sempre: uma coluna a mais mostrando o mesmo
 * número duas vezes seria ruído puro.
 */
function colunasDeLancamento(participacao: number | null) {
  if (participacao === null) return COLUNAS;

  const i = COLUNAS.findIndex((c) => c.rotulo === "V. Pago");
  return [
    ...COLUNAS.slice(0, i + 1),
    {
      rotulo: "No DRE",
      numerica: true,
      // O comparador ordena por ESTE número, e não pelo que a célula desenha — ela
      // devolve JSX, com o selo do exclusivo dentro. Sem o `bruto`, ordenar por esta
      // coluna compararia "[object Object]" com "[object Object]".
      bruto: (l: DetalheLancamento) => valorNoDre(l, participacao),
      ler: (l: DetalheLancamento) => (
        <>
          {formatarValor(valorNoDre(l, participacao))}
          {/* O selo explica por que ESTA linha não encolheu: a despesa é do próprio
              fornecedor, e ratear cobraria dele uma fração do que é todo dele. */}
          {l.exclusivo && (
            <span className="ml-2 rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-1.5 py-0.5 text-[length:var(--fs-apoio)] font-medium text-[var(--text-muted)]">
              exclusivo
            </span>
          )}
        </>
      ),
    },
    ...COLUNAS.slice(i + 1),
  ];
}

interface ContaAgrupada {
  chave: string;
  rotulo: string;
  total: number;
  /** O mesmo grupo, rateado — igual ao `total` quando não há filtro. */
  totalNoDre: number;
  linhas: DetalheLancamento[];
}

interface CentroAgrupado {
  chave: string;
  rotulo: string;
  total: number;
  totalNoDre: number;
  contas: ContaAgrupada[];
}

/**
 * Agrupa como a 9815: centro de custo principal, e dentro dele a conta.
 *
 * **Não reordena nada.** A ordem vem pronta do banco — contas em ordem alfabética e
 * lançamentos por valor decrescente, que é a regra observada na exportação da rotina.
 * Aqui a lista só é quebrada onde a chave muda. Ordenar de novo no front criaria uma
 * segunda fonte de verdade sobre a ordem, e as duas sairiam de sincronia na primeira vez
 * que o SQL mudasse.
 */
function agrupar(
  linhas: readonly DetalheLancamento[],
  participacao: number | null,
): CentroAgrupado[] {
  const centros: CentroAgrupado[] = [];

  for (const l of linhas) {
    const chaveCentro = l.codCcPrinc ?? "—";
    let centro = centros.at(-1);
    if (!centro || centro.chave !== chaveCentro) {
      centro = {
        chave: chaveCentro,
        rotulo: l.descCcPrinc ?? "—",
        total: 0,
        totalNoDre: 0,
        contas: [],
      };
      centros.push(centro);
    }

    const chaveConta = String(l.codConta ?? "—");
    let conta = centro.contas.at(-1);
    if (!conta || conta.chave !== chaveConta) {
      conta = {
        chave: chaveConta,
        rotulo: l.conta ?? "—",
        total: 0,
        totalNoDre: 0,
        linhas: [],
      };
      centro.contas.push(conta);
    }

    const noDre = participacao === null ? l.vPago : valorNoDre(l, participacao);

    conta.linhas.push(l);
    conta.total += l.vPago;
    conta.totalNoDre += noDre;
    centro.total += l.vPago;
    centro.totalNoDre += noDre;
  }

  return centros;
}

/**
 * <b>Quantas colunas a tabela tem de verdade:</b> as declaradas mais o `% part.`.
 *
 * Existe porque as linhas de grupo e de subtotal atravessam a tabela com `colSpan`, e elas
 * contavam `COLUNAS.length`. Com a coluna nova fora daquele array, os `colSpan` ficariam
 * uma célula curtos — e o sintoma não é erro nenhum: é a tabela desalinhando a partir do
 * primeiro cabeçalho de centro de custo.
 *
 * O `% part.` fica fora de `COLUNAS` porque o `ler` de lá recebe só a linha, e a
 * porcentagem precisa do total da tabela.
 */
const TOTAL_DE_COLUNAS = COLUNAS.length + 1;

/**
 * As mesmas colunas acima, na forma que o comparador entende.
 *
 * Derivada de `COLUNAS` em vez de escrita de novo: duas listas com os mesmos rótulos
 * divergem no primeiro dia em que alguém acrescentar uma coluna a só uma delas, e o sintoma
 * seria um cabeçalho que responde ao clique sem reordenar nada.
 */
/**
 * As mesmas colunas, na forma que o comparador entende.
 *
 * <b>É função, e não constante, desde o merge do filtro por fornecedor</b>: a lista de
 * colunas deixou de ser fixa — com fornecedor filtrado entra o `No DRE` —, e uma
 * constante derivada de `COLUNAS` deixaria a coluna nova sem comparador. O sintoma seria
 * um cabeçalho que responde ao clique e não reordena nada, que é exatamente o que o
 * comentário original desta lista alertava.
 */
function ordenaveisDeLancamento(
  participacao: number | null,
): readonly ColunaOrdenavel<DetalheLancamento>[] {
  return [
    ...colunasDeLancamento(participacao).map((c) => ({
      rotulo: c.rotulo,
      tipo: c.numerica && !c.rotulo.startsWith("Dt") ? ("numero" as const) : ("texto" as const),
      ler: c.bruto ?? ((l: DetalheLancamento) => String(c.ler(l) ?? "")),
    })),
    // Ordenar pelo percentual é ordenar pelo valor: um é o outro dividido por uma constante.
    // Comparar o número já dividido só acrescentaria erro de arredondamento.
    { rotulo: "% part.", tipo: "numero" as const, ler: (l: DetalheLancamento) => l.vPago },
  ];
}

function TabelaLancamentos({
  linhas,
  coluna,
  nome,
  participacao,
}: {
  linhas: readonly DetalheLancamento[];
  coluna: string | null;
  nome: string | null;
  /** A fatia do fornecedor, ou `null` quando a apuração não foi filtrada. */
  participacao: number | null;
}) {
  const [ordem, setOrdem] = useState<Ordem>(null);
  const ordenar = useCallback((rotulo: string, tipo: TipoDaColuna) => {
    setOrdem((atual) => proximaOrdem(atual, rotulo, tipo));
  }, []);

  if (linhas.length === 0) return <Vazio />;

  /**
   * Os pares de estorno que se anulam saem da lista — e **só eles**.
   *
   * Filtro de apresentação: a consulta continua trazendo tudo, e a soma do que sobra é
   * idêntica à de antes, porque par oposto no mesmo grupo soma zero. Ver
   * `lib/estornosQueSeAnulam.ts` para o motivo de não copiarmos o filtro da 9815.
   */
  const { visiveis, omitidos } = semEstornosQueSeAnulam(linhas);
  const COLS = colunasDeLancamento(participacao);
  const ORDENAVEIS = ordenaveisDeLancamento(participacao);

  // Com rateio, quem fecha com a célula clicada é a coluna nova — e é ela que o
  // cabeçalho tem de anunciar. Apontar o V. Pago mandaria a pessoa somar a coluna errada.
  const colunaQueFecha = participacao === null ? coluna : "No DRE";

  /**
   * A base do `% part.`: o total da tela, que é o valor da linha do DRE que foi clicada.
   *
   * <b>Soma as linhas VISÍVEIS</b>, e não as que a consulta trouxe — os pares de estorno que
   * se anulam já saíram, e a soma deles é zero de qualquer forma. Usar a lista crua faria a
   * coluna somar 100% sobre um total que a tela não mostra em lugar nenhum.
   *
   * Percentual de zero é indefinido, não zero: com o total em zero a coluna mostra traço.
   * Uma conta que fecha em 0,00 com dezesseis lançamentos existe de verdade neste projeto —
   * é o `DESCONTO FUNCIONÁRIOS`.
   *
   * <b>Continua somando o V. Pago mesmo com fornecedor filtrado</b>: o `% part.` responde
   * "quanto este lançamento é da conta", e a conta na tela é a da filial inteira. Usar o
   * valor rateado mudaria numerador e denominador pelo mesmo fator, e daria o mesmo
   * percentual com duas contas a mais.
   */
  const totalDaTela = soma(visiveis, (l) => l.vPago);
  const parte = (valor: number) =>
    totalDaTela !== 0 ? (valor / totalDaTela) * 100 : null;

  /**
   * <b>A ordenação acontece DENTRO de cada conta, e a árvore não se desmancha.</b>
   *
   * Os cabeçalhos de centro de custo e de conta e os subtotais ficam onde estão; só as
   * linhas de lançamento se reordenam, conta a conta. Decidido assim em 28/09/2026 porque
   * <b>são os subtotais que fecham os 162/162 contra a 9815</b> — desmanchá-los ao ordenar
   * tiraria da tela justamente o número que prova que ela está certa.
   *
   * Tem de ser depois do `agrupar`, e não antes: aquele algoritmo fecha um grupo assim que
   * a chave muda (`centros.at(-1)`), então uma lista reordenada produziria o mesmo centro
   * de custo várias vezes, cada aparição com o seu próprio subtotal parcial.
   */
  const centros = useMemo(() => {
    const agrupados = agrupar(visiveis, participacao);
    if (ordem === null) return agrupados;

    return agrupados.map((centro) => ({
      ...centro,
      contas: centro.contas.map((conta) => ({
        ...conta,
        linhas: ordenarLinhas(conta.linhas, ORDENAVEIS, ordem),
      })),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiveis, ordem, participacao]);

  return (
    <>
      <table className="w-full border-collapse text-[length:var(--fs-base)]">
        <Cabecalho>
          {COLS.map((c, i) => (
            <ThDetalhe
              key={c.rotulo}
              rotulo={c.rotulo}
              tipo={c.bruto && c.rotulo === "V. Pago" ? "numero" : c.numerica ? "numero" : "texto"}
              numerica={c.numerica}
              coluna={colunaQueFecha}
              nome={nome}
              ordem={ordem}
              onOrdenar={ordenar}
              className={i === 0 ? "col-identidade" : undefined}
            />
          ))}
          <ThDetalhe
            rotulo="% part."
            tipo="numero"
            numerica
            ordem={ordem}
            onOrdenar={ordenar}
          />
        </Cabecalho>

        <tbody>
          {centros.map((centro) => (
            <Fragment key={centro.chave}>
              <LinhaDeGrupo
                nivel={1}
                rotulo={"Centro Custo Princ : " + centro.rotulo}
              />

              {centro.contas.map((conta) => (
                <Fragment key={conta.chave}>
                  <LinhaDeGrupo nivel={2} rotulo={"Conta : " + conta.rotulo} />

                  {conta.linhas.map((l, i) => (
                    // O RECNUM se repete quando o lançamento é rateado entre centros de
                    // custo — duas linhas legítimas com o mesmo número. O índice completa.
                    <tr
                      key={l.recNum + "-" + (l.codCentroCusto ?? "") + "-" + i}
                      className="border-b border-[var(--border)] odd:bg-[var(--zebra)] hover:bg-[var(--surface-2)]"
                    >
                      {COLS.map((c, j) => {
                        const conteudo = c.ler(l);
                        return (
                          <td
                            key={c.rotulo}
                            className={cn(
                              c.numerica
                                ? NUM
                                : cn(
                                    TD,
                                    "descricao-conta max-w-[22rem] truncate",
                                  ),
                              j === 0 && "col-identidade",
                              c.rotulo === "V. Pago" &&
                                (l.vPago < 0
                                  ? "text-[var(--negative)]"
                                  : "text-[var(--text-primary)]"),
                            )}
                            title={c.numerica ? undefined : String(conteudo)}
                          >
                            {conteudo}
                          </td>
                        );
                      })}
                      <td className={NUM}>
                        <ParteDoTotal valor={parte(l.vPago)} />
                      </td>
                    </tr>
                  ))}

                  <LinhaDeSubtotal
                    nivel={2}
                    valor={conta.total}
                    valorNoDre={participacao === null ? null : conta.totalNoDre}
                    colunas={COLS.length}
                  />
                </Fragment>
              ))}

              {/* O total do centro de custo só aparece quando há mais de um. Com um só ele
                repetiria o rodapé duas linhas abaixo. */}
              {centros.length > 1 && (
                <LinhaDeSubtotal
                  nivel={1}
                  valor={centro.total}
                  valorNoDre={participacao === null ? null : centro.totalNoDre}
                  colunas={COLS.length}
                />
              )}
            </Fragment>
          ))}
        </tbody>

        <Total>
          <td className={cn(TD, "col-identidade")}>
            {visiveis.length} lançamentos
          </td>
          <td className={TD} />
          {/* Soma o que está na tela. Dá o mesmo número de antes — par de estorno oposto no
            mesmo grupo soma zero —, e é o que mantém este rodapé fechando com a linha do
            DRE. Se um dia divergir, o filtro escondeu algo que não se anulava. */}
          <td className={totalDe(colunaQueFecha, "V. Pago")}>
            {formatarValor(soma(visiveis, (l) => l.vPago))}
          </td>
          {participacao !== null && (
            <td className={totalDe(colunaQueFecha, "No DRE")}>
              {formatarValor(somaNoDre(visiveis, participacao))}
            </td>
          )}
          {/* As colunas que sobram, mais a do `% part.` no fim. Com rateio a tabela tem
            uma coluna a mais, e o vão do rodapé encolhe junto. */}
          <td
            className={TD}
            colSpan={COLS.length + 1 - (participacao === null ? 3 : 4)}
          />
        </Total>
      </table>

      {/* DE ONDE VEM A COLUNA "No DRE".

          Sem esta frase a tela mostra dois totais diferentes para a mesma lista e deixa a
          pessoa descobrir sozinha qual é o da linha que ela clicou. O número da
          participação aparece com três casas, como no DRE. */}
      {participacao !== null && (
        <p className="px-3 py-2 text-[length:var(--fs-apoio)] leading-relaxed text-[var(--text-muted)]">
          A despesa acima é da filial inteira. No DRE deste fornecedor entra a fatia dele
          — <strong>{(participacao * 100).toFixed(3).replace(".", ",")}%</strong> da
          receita líquida da filial —, e é a coluna <strong>No DRE</strong> que soma o
          valor da célula. Lançamento marcado como <strong>exclusivo</strong> é despesa do
          próprio fornecedor e entra inteiro, sem rateio.
        </p>
      )}

      {/* Dizer o que foi escondido não é formalidade: quem confere esta tela contra a 9815
          compara a contagem de linhas, e uma lista mais curta sem explicação parece dado
          faltando. A frase também deixa claro que o total não mudou. */}
      {omitidos > 0 && (
        <p className="px-3 py-2 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
          {omitidos === 2
            ? "1 par de estorno que se anula foi omitido"
            : `${omitidos / 2} pares de estorno que se anulam foram omitidos`}{" "}
          — o total acima não muda por causa disso. Estorno sem contrapartida no
          período continua na lista.
        </p>
      )}
    </>
  );
}

/**
 * Cabeçalho de grupo, como as linhas de árvore da 9815.
 *
 * O rótulo fica **parado na rolagem lateral**. Sem isso o nome da conta sairia da tela
 * junto com as colunas, e no meio de seis mil lançamentos ninguém saberia mais o que está
 * lendo.
 *
 * Quem gruda é o `span`, não a célula: a célula tem a largura da tabela inteira, então
 * `sticky` nela nunca sai do lugar — ela já começa e termina fora da janela de rolagem, e
 * o texto lá dentro escorre embora do mesmo jeito.
 */
function LinhaDeGrupo({ nivel, rotulo }: { nivel: 1 | 2; rotulo: string }) {
  return (
    <tr className="linha-grupo">
      <td colSpan={TOTAL_DE_COLUNAS} className="p-0">
        <span
          className={cn(
            "grupo-fixo inline-block px-3 py-[var(--celula-y)] whitespace-nowrap",
            // Os dois níveis em negrito: são cabeçalhos, como os de coluna. O que os separa
            // entre si passa a ser o recuo e a cor, não o peso — dois pesos diferentes
            // competiriam com a distinção que importa, a de cabeçalho contra dado.
            nivel === 1
              ? "font-bold text-[var(--text-primary)]"
              : "pl-8 font-bold text-[var(--text-secondary)]",
          )}
        >
          {rotulo}
        </span>
      </td>
    </tr>
  );
}

/** Subtotal de conta ou de centro de custo, alinhado com a coluna V. Pago. */
function LinhaDeSubtotal({
  nivel,
  valor,
  valorNoDre,
  colunas,
}: {
  nivel: 1 | 2;
  valor: number;
  /** O subtotal rateado, quando há filtro. `null` deixa a coluna fora da linha. */
  valorNoDre: number | null;
  colunas: number;
}) {
  return (
    <tr className="linha-subtotal border-b border-[var(--border)]">
      <td className={cn(TD, "col-identidade")} />
      <td
        className={cn(
          TD,
          nivel === 2 && "pl-8",
          "text-right text-[length:var(--fs-apoio)] text-[var(--text-muted)]",
        )}
      >
        {nivel === 1 ? "Total do centro de custo" : "Total da conta"}
      </td>
      <td
        className={cn(
          NUM,
          "font-semibold",
          valor < 0 ? "text-[var(--negative)]" : "text-[var(--text-primary)]",
        )}
      >
        {formatarValor(valor)}
      </td>
      {valorNoDre !== null && (
        <td
          className={cn(
            NUM,
            "font-semibold",
            valorNoDre < 0
              ? "text-[var(--negative)]"
              : "text-[var(--text-primary)]",
          )}
        >
          {formatarValor(valorNoDre)}
        </td>
      )}
      <td colSpan={colunas + 1 - (valorNoDre === null ? 3 : 4)} />
    </tr>
  );
}

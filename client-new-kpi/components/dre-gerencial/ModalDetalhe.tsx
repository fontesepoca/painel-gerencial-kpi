"use client";

import { Fragment, useEffect, useRef } from "react";
import { formatarPercentual, formatarValor } from "@/lib/formato";
import { paraBr } from "@/lib/periodos";
import { cn } from "@/lib/cn";
import type {
  DetalheCliente,
  DetalheImposto,
  DetalheLancamento,
  DetalheMotivo,
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
  avisoDaAba,
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
  /** Falha ao preparar a outra aba. Fica ao lado do botão até o modal fechar. */
  avisoDaAba: string | null;
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
            <h2
              id="titulo-detalhe"
              className="truncate text-[length:var(--fs-titulo)] font-semibold text-[var(--text-primary)]"
            >
              {titulo}
            </h2>
            {periodo && (
              <p className="mt-1 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
                {paraBr(periodo.dataInicio)} a {paraBr(periodo.dataFim)}
                {dados && ` · apurado em ${(dados.duracaoMs / 1000).toFixed(1)} s`}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
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

          {composicao && <TabelaComposicao {...composicao} />}

          {!composicao && dados && !carregando && !erro && (
            <CorpoDoDetalhe dados={dados} linha={linha} />
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
        A receita por cliente percorre as mesmas notas da apuração e pode levar alguns
        minutos.
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
}: {
  dados: Detalhamento;
  linha: { descricao: string; valor: number } | null;
}) {
  return (
    <>
      <ResumoDoCalculo dados={dados} linha={linha} />
      <Conteudo dados={dados} />
    </>
  );
}

function Conteudo({ dados }: { dados: Detalhamento }) {
  if (dados.tipo === "receita-por-cliente") {
    return <TabelaClientes linhas={dados.clientes ?? []} />;
  }
  if (dados.tipo === "devolucao-por-motivo") {
    return <TabelaMotivos linhas={dados.motivos ?? []} />;
  }
  if (dados.tipo === "imposto-por-produto") {
    return <TabelaImpostos linhas={dados.impostos ?? []} />;
  }
  return <TabelaLancamentos linhas={dados.lancamentos ?? []} />;
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
    linha === null || Math.abs(Math.abs(resultado) - Math.abs(linha.valor)) < 0.005;

  return (
    <section className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-4">
      <h3 className="text-[length:var(--fs-rotulo)] font-semibold tracking-[0.14em] text-[var(--text-secondary)] uppercase">
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
          {formatarValor(linha.valor)}. Os dois deveriam bater em módulo — vale conferir
          antes de usar o número.
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
      { "(-) ST": "ST", "(-) PIS": "PIS", "(-) COFINS": "COFINS" }[nome] ?? "Imposto";

    return [
      { rotulo: `${imposto} + FECP das vendas`, valor: soma(l, (i) => i.vendas), sinal: 1 },
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
      { rotulo: "Receita bruta", valor: soma(l, (c) => c.receitaBruta), sinal: 1 },
      { rotulo: "Abatimentos e descontos", valor: soma(l, (c) => c.desconto), sinal: -1 },
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
function TabelaComposicao({ total, parcelas }: Composicao) {
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
        <th className={cn(TH, "text-right")}>Valor</th>
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
                p.valor < 0 ? "text-[var(--negative)]" : "text-[var(--text-primary)]",
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
            <td className={cn(NUM, "text-[var(--warning)]")}>{formatarValor(diferenca)}</td>
          </tr>
        )}
      </tbody>

      <Total>
        <td className={cn(TD, "col-identidade")}>
          {parcelas.length} {parcelas.length === 1 ? "parcela" : "parcelas"}
        </td>
        <td className={NUM}>{formatarValor(total)}</td>
      </Total>
    </table>
  );
}

function Vazio() {
  return (
    <p className="px-5 py-16 text-center text-[length:var(--fs-base)] text-[var(--text-muted)]">
      Nenhum lançamento no período.
    </p>
  );
}

const TH =
  "px-3 py-[var(--celula-y)] text-[length:var(--fs-rotulo)] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase whitespace-nowrap";
const TD = "px-3 py-[var(--celula-y)] whitespace-nowrap";
const NUM = `${TD} tabular text-right`;

/** Cabeçalho da tabela do modal, colado no topo da própria área de rolagem. */
function Cabecalho({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-[var(--border-strong)]">{children}</tr>
    </thead>
  );
}

/**
 * Linha de totais. Existe para o usuário poder conferir com a célula que clicou sem
 * somar 15 mil linhas na mão — é a razão de a §4 ter sido corrigida.
 */
function Total({ children }: { children: React.ReactNode }) {
  return (
    <tfoot>
      <tr className="border-t border-[var(--border-strong)] font-semibold">{children}</tr>
    </tfoot>
  );
}

const soma = <T,>(linhas: readonly T[], campo: (l: T) => number) =>
  linhas.reduce((s, l) => s + campo(l), 0);

/**
 * Célula que identifica a linha, e a única que fica parada na rolagem lateral.
 *
 * Código e nome moram **na mesma célula**, não em duas colunas fixas lado a lado. Duas
 * teriam que concordar até o pixel sobre onde a primeira termina, e o algoritmo de tabela
 * não garante isso — foi assim que a tabela principal abriu uma fresta por onde os valores
 * passavam por baixo. Uma coluna não tem com o que discordar.
 */
function Identidade({ codigo, nome }: { codigo: React.ReactNode; nome: string }) {
  return (
    <td className={cn(TD, "col-identidade max-w-[24rem]")}>
      <div className="flex items-baseline gap-2">
        <span className="tabular shrink-0 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
          {codigo}
        </span>
        <span className="truncate" title={nome}>
          {nome}
        </span>
      </div>
    </td>
  );
}

function TabelaClientes({ linhas }: { linhas: readonly DetalheCliente[] }) {
  if (linhas.length === 0) return <Vazio />;

  return (
    <table className="w-full border-collapse text-[length:var(--fs-base)]">
      <Cabecalho>
        <th className={cn(TH, "col-identidade text-left")}>Cliente</th>
        <th className={cn(TH, "text-left")}>Cidade</th>
        <th className={cn(TH, "text-right")}>Notas</th>
        <th className={cn(TH, "text-right")}>Receita bruta</th>
        <th className={cn(TH, "text-right")}>Desconto</th>
        <th className={cn(TH, "text-right")}>Devolução</th>
        <th className={cn(TH, "text-right")}>Custo líq.</th>
        <th className={cn(TH, "text-right")}>Receita líq.</th>
      </Cabecalho>
      <tbody>
        {linhas.map((c) => (
          <tr key={c.codCli} className="border-b border-[var(--border)] odd:bg-[var(--zebra)] hover:bg-[var(--surface-2)]">
            <Identidade codigo={c.codCli} nome={c.cliente} />
            <td className={cn(TD, "max-w-[12rem] truncate")} title={c.cidade}>{c.cidade}</td>
            <td className={NUM}>{c.qdeNf}</td>
            <td className={NUM}>{formatarValor(c.receitaBruta)}</td>
            <td className={NUM}>{formatarValor(c.desconto)}</td>
            <td className={NUM}>{formatarValor(c.devolucao)}</td>
            <td className={NUM}>{formatarValor(c.custoLiq)}</td>
            <td className={NUM}>{formatarValor(c.receitaLiquida)}</td>
          </tr>
        ))}
      </tbody>
      <Total>
        <td className={cn(TD, "col-identidade")}>{linhas.length} clientes</td>
        <td className={TD} />
        <td className={NUM}>{soma(linhas, (c) => c.qdeNf)}</td>
        <td className={NUM}>{formatarValor(soma(linhas, (c) => c.receitaBruta))}</td>
        <td className={NUM}>{formatarValor(soma(linhas, (c) => c.desconto))}</td>
        <td className={NUM}>{formatarValor(soma(linhas, (c) => c.devolucao))}</td>
        <td className={NUM}>{formatarValor(soma(linhas, (c) => c.custoLiq))}</td>
        <td className={NUM}>{formatarValor(soma(linhas, (c) => c.receitaLiquida))}</td>
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
function TabelaImpostos({ linhas }: { linhas: readonly DetalheImposto[] }) {
  if (linhas.length === 0) return <Vazio />;

  return (
    <table className="w-full border-collapse text-[length:var(--fs-base)]">
      <Cabecalho>
        <th className={cn(TH, "col-identidade text-left")}>Produto</th>
        <th className={cn(TH, "text-right")}>Notas</th>
        <th className={cn(TH, "text-right")}>Vendas</th>
        <th className={cn(TH, "text-right")}>Devoluções</th>
        <th className={cn(TH, "text-right")}>Líquido</th>
        <th className={cn(TH, "text-right")}>% part.</th>
      </Cabecalho>
      <tbody>
        {linhas.map((i) => (
          <tr
            key={i.codProd}
            className="border-b border-[var(--border)] odd:bg-[var(--zebra)] hover:bg-[var(--surface-2)]"
          >
            <Identidade codigo={i.codProd} nome={i.produto ?? "Sem descrição"} />
            <td className={NUM}>{i.qdeNf}</td>
            <td className={NUM}>{formatarValor(i.vendas)}</td>
            <td className={NUM}>{formatarValor(i.devolucoes)}</td>
            <td className={cn(NUM, "font-semibold")}>{formatarValor(i.liquido)}</td>
            <td className={NUM}>{formatarPercentual(i.pPart, 2)}</td>
          </tr>
        ))}
      </tbody>
      <Total>
        <td className={cn(TD, "col-identidade")}>{linhas.length} produtos</td>
        <td className={NUM}>{soma(linhas, (i) => i.qdeNf)}</td>
        <td className={NUM}>{formatarValor(soma(linhas, (i) => i.vendas))}</td>
        <td className={NUM}>{formatarValor(soma(linhas, (i) => i.devolucoes))}</td>
        <td className={NUM}>{formatarValor(soma(linhas, (i) => i.liquido))}</td>
        <td className={NUM}>{formatarPercentual(soma(linhas, (i) => i.pPart), 2)}</td>
      </Total>
    </table>
  );
}

function TabelaMotivos({ linhas }: { linhas: readonly DetalheMotivo[] }) {
  if (linhas.length === 0) return <Vazio />;

  return (
    <table className="w-full border-collapse text-[length:var(--fs-base)]">
      <Cabecalho>
        <th className={cn(TH, "col-identidade text-left")}>Motivo</th>
        <th className={cn(TH, "text-left")}>Culpa RCA</th>
        <th className={cn(TH, "text-right")}>Notas</th>
        <th className={cn(TH, "text-right")}>Devolução</th>
        <th className={cn(TH, "text-right")}>% part.</th>
      </Cabecalho>
      <tbody>
        {linhas.map((m) => (
          <tr
            key={m.codMotivo ?? "sem-motivo"}
            className="border-b border-[var(--border)] odd:bg-[var(--zebra)] hover:bg-[var(--surface-2)]"
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
            <td className={NUM}>{m.qdeNf}</td>
            <td className={NUM}>{formatarValor(m.vlDevolucao)}</td>
            {/* Duas casas: o valor vem arredondado assim da consulta, e é o que a
                9815 mostra nesta coluna. */}
            <td className={NUM}>{formatarPercentual(m.pPart, 2)}</td>
          </tr>
        ))}
      </tbody>
      <Total>
        <td className={cn(TD, "col-identidade")}>{linhas.length} motivos</td>
        <td className={TD} />
        <td className={NUM}>{soma(linhas, (m) => m.qdeNf)}</td>
        <td className={NUM}>{formatarValor(soma(linhas, (m) => m.vlDevolucao))}</td>
        <td className={NUM}>{formatarPercentual(soma(linhas, (m) => m.pPart), 2)}</td>
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
}> = [
  { rotulo: "Rec.Num.", numerica: true, ler: (l) => l.recNum },
  { rotulo: "Histórico", ler: (l) => texto(l.historico) },
  { rotulo: "V. Pago", numerica: true, ler: (l) => formatarValor(l.vPago) },
  { rotulo: "Dt.Lançamento", numerica: true, ler: (l) => data(l.dtLanc) },
  { rotulo: "Dt. Pagto.", numerica: true, ler: (l) => data(l.dtPagto) },
  { rotulo: "Dt.Competência", numerica: true, ler: (l) => data(l.dtCompetencia) },
  { rotulo: "Dt.Compensação", numerica: true, ler: (l) => data(l.dtCompensacao) },
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
  { rotulo: "Num. Seq. Borderô", numerica: true, ler: (l) => texto(l.numSeqBordero) },
  { rotulo: "Localização", ler: (l) => texto(l.localizacao) },
  { rotulo: "Dt. Reclass.", numerica: true, ler: (l) => data(l.dtReclassific) },
  { rotulo: "Cod. Func. Reclass.", numerica: true, ler: (l) => texto(l.codFuncReclassific) },
];

interface ContaAgrupada {
  chave: string;
  rotulo: string;
  total: number;
  linhas: DetalheLancamento[];
}

interface CentroAgrupado {
  chave: string;
  rotulo: string;
  total: number;
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
function agrupar(linhas: readonly DetalheLancamento[]): CentroAgrupado[] {
  const centros: CentroAgrupado[] = [];

  for (const l of linhas) {
    const chaveCentro = l.codCcPrinc ?? "—";
    let centro = centros.at(-1);
    if (!centro || centro.chave !== chaveCentro) {
      centro = { chave: chaveCentro, rotulo: l.descCcPrinc ?? "—", total: 0, contas: [] };
      centros.push(centro);
    }

    const chaveConta = String(l.codConta ?? "—");
    let conta = centro.contas.at(-1);
    if (!conta || conta.chave !== chaveConta) {
      conta = { chave: chaveConta, rotulo: l.conta ?? "—", total: 0, linhas: [] };
      centro.contas.push(conta);
    }

    conta.linhas.push(l);
    conta.total += l.vPago;
    centro.total += l.vPago;
  }

  return centros;
}

function TabelaLancamentos({ linhas }: { linhas: readonly DetalheLancamento[] }) {
  if (linhas.length === 0) return <Vazio />;

  const centros = agrupar(linhas);

  return (
    <table className="w-full border-collapse text-[length:var(--fs-base)]">
      <Cabecalho>
        {COLUNAS.map((c, i) => (
          <th
            key={c.rotulo}
            className={cn(
              TH,
              c.numerica ? "text-right" : "text-left",
              i === 0 && "col-identidade",
            )}
          >
            {c.rotulo}
          </th>
        ))}
      </Cabecalho>

      <tbody>
        {centros.map((centro) => (
          <Fragment key={centro.chave}>
            <LinhaDeGrupo nivel={1} rotulo={"Centro Custo Princ : " + centro.rotulo} />

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
                    {COLUNAS.map((c, j) => {
                      const conteudo = c.ler(l);
                      return (
                        <td
                          key={c.rotulo}
                          className={cn(
                            c.numerica ? NUM : cn(TD, "max-w-[22rem] truncate"),
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
                  </tr>
                ))}

                <LinhaDeSubtotal nivel={2} valor={conta.total} />
              </Fragment>
            ))}

            {/* O total do centro de custo só aparece quando há mais de um. Com um só ele
                repetiria o rodapé duas linhas abaixo. */}
            {centros.length > 1 && <LinhaDeSubtotal nivel={1} valor={centro.total} />}
          </Fragment>
        ))}
      </tbody>

      <Total>
        <td className={cn(TD, "col-identidade")}>{linhas.length} lançamentos</td>
        <td className={TD} />
        <td className={NUM}>{formatarValor(soma(linhas, (l) => l.vPago))}</td>
        <td className={TD} colSpan={COLUNAS.length - 3} />
      </Total>
    </table>
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
      <td colSpan={COLUNAS.length} className="p-0">
        <span
          className={cn(
            "grupo-fixo inline-block px-3 py-[var(--celula-y)] whitespace-nowrap",
            nivel === 1
              ? "font-semibold text-[var(--text-primary)]"
              : "pl-8 text-[var(--text-secondary)]",
          )}
        >
          {rotulo}
        </span>
      </td>
    </tr>
  );
}

/** Subtotal de conta ou de centro de custo, alinhado com a coluna V. Pago. */
function LinhaDeSubtotal({ nivel, valor }: { nivel: 1 | 2; valor: number }) {
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
      <td colSpan={COLUNAS.length - 3} />
    </tr>
  );
}

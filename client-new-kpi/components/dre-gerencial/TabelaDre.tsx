"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModalMoverLinha, type MovimentoPendente } from "./ModalMoverLinha";
import { ModalDetalhe } from "./ModalDetalhe";
import { useDetalhe } from "@/hooks/useDreGerencial";
import { recorteDoMes } from "@/lib/periodos";
import { useOrdemSalva } from "@/hooks/useOrdemSalva";
import { passoDeRolagem } from "@/lib/rolagemAutomatica";
import { cn } from "@/lib/cn";
import { formatarPercentual, formatarValor } from "@/lib/formato";
import {
  aplicarOrdem,
  blocoDe,
  descreverPosicao,
  linhasAfetadas,
  moverIntervalo,
  ordemPersonalizada,
  saiuDoBloco,
} from "@/lib/ordemLinhas";
import type { FiltroApuracao, LinhaDre, PeriodoDre } from "@/types/dre-gerencial";

/**
 * Tamanhos, espaçamento e contraste vêm de tokens definidos em `globals.css`.
 * O modo de leitura ampliada troca os tokens; nenhum componente sabe em que
 * modo está. Ver o bloco MODO DE LEITURA AMPLIADA lá.
 */
const CELULA = "px-[var(--celula-x)] py-[var(--celula-y)]";

/** Fatia da tabela sendo arrastada, em índices da lista completa. */
interface Arrasto {
  inicio: number;
  fim: number;
}

export function TabelaDre({
  periodos,
  linhas,
  mostrarZeradas,
  filtro,
}: {
  periodos: PeriodoDre[];
  linhas: LinhaDre[];
  mostrarZeradas: boolean;
  /** Filiais, período, regime e dimensão da apuração — o detalhamento repete todos. */
  filtro: FiltroApuracao;
}) {
  const { ordem, salvar, limpar } = useOrdemSalva(filtro.analise);

  // `linhas` é sempre a ordem do cadastro, como veio da API — é a referência contra a
  // qual tudo aqui é medido. `ordenadas` é o que a pessoa vê.
  const ordenadas = useMemo(() => aplicarOrdem(linhas, ordem), [linhas, ordem]);

  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null);

  const rolagem = useRef<HTMLDivElement>(null);
  /** Última posição vertical do ponteiro durante o arraste, em coordenadas da janela. */
  const ponteiroY = useRef<number | null>(null);
  const [pendente, setPendente] = useState<
    (MovimentoPendente & { nova: LinhaDre[] }) | null
  >(null);
  const [arrastarBloco, setArrastarBloco] = useState(true);
  const [anuncio, setAnuncio] = useState("");

  const consultaDetalhe = useDetalhe();
  const [detalhe, setDetalhe] = useState<{
    titulo: string;
    periodo: { dataInicio: string; dataFim: string };
  } | null>(null);

  /** Composição de um totalizador. Vive fora do `detalhe` porque não passa pela API. */
  const [composicao, setComposicao] = useState<{
    titulo: string;
    total: number;
    parcelas: { rotulo: string; valor: number; semMovimento: boolean }[];
  } | null>(null);

  const deslocadas = useMemo(
    () =>
      new Set(
        ordenadas
          .filter((l) => saiuDoBloco(linhas, ordenadas, l.chaveOrdem))
          .map((l) => l.chaveOrdem),
      ),
    [linhas, ordenadas],
  );

  // Esconde por AUSÊNCIA DE MOVIMENTO, não por valor zero — é o critério da 9815.
  // `DESCONTO FUNCIONÁRIOS` fecha em 0,00 com 16 lançamentos e continua na tela.
  const visiveis = useMemo(
    () => (mostrarZeradas ? ordenadas : ordenadas.filter((l) => !l.semMovimento)),
    [ordenadas, mostrarZeradas],
  );

  /**
   * Quantas linhas da fatia a pessoa realmente vê. Com as zeradas escondidas, uma fatia
   * de 5 pode mostrar 4 — anunciar 5 mandaria conferir uma linha que não está na tela.
   * A escondida viaja junto de qualquer forma; isso é comportamento, não aviso.
   */
  const tamanhoVisivel = useCallback(
    (fatia: Arrasto) =>
      visiveis.filter((v) => {
        const i = ordenadas.findIndex((l) => l.chaveOrdem === v.chaveOrdem);
        return i >= fatia.inicio && i < fatia.fim;
      }).length,
    [visiveis, ordenadas],
  );

  const indiceCompleto = useCallback(
    (chaveOrdem: string) => ordenadas.findIndex((l) => l.chaveOrdem === chaveOrdem),
    [ordenadas],
  );

  /**
   * Aplica um movimento — ou segura no modal, se ele mudar a leitura de alguma linha.
   * Movimento que não desloca ninguém não pergunta nada: avisar sobre o que não mudou
   * é o caminho mais curto para a pessoa aprender a confirmar sem ler.
   */
  const aplicar = useCallback(
    (fatia: Arrasto, destino: number) => {
      const nova = moverIntervalo(ordenadas, fatia.inicio, fatia.fim, destino);
      if (!ordemPersonalizada(ordenadas, nova)) return;

      const cabeca = ordenadas[fatia.inicio];
      if (!cabeca) return;

      const tamanho = tamanhoVisivel(fatia);
      const nomeCurto = cabeca.descricao.trim();
      const oQue =
        tamanho > 1
          ? `o bloco de ${nomeCurto}, com ${tamanho} linhas`
          : `a linha ${nomeCurto}`;

      // Só o que a pessoa consegue ver. Citar uma linha escondida manda conferir algo
      // que não está na tela; quando ela reaparecer, o selo dela já estará aceso.
      const afetadas = linhasAfetadas(linhas, ordenadas, nova).filter((l) =>
        visiveis.some((v) => v.chaveOrdem === l.chaveOrdem),
      );

      // Mexer num totalizador sempre pergunta, mesmo quando nenhuma despesa muda de
      // leitura — é a linha que ancora o bloco, e foi o caso que o Gabriel pediu para
      // nunca passar direto.
      const mexeuEmCalculada = ordenadas
        .slice(fatia.inicio, fatia.fim)
        .some((l) => l.calculada);

      if (afetadas.length === 0 && !mexeuEmCalculada) {
        salvar(nova.map((l) => l.chaveOrdem));
        setAnuncio(
          `${nomeCurto} movida para a posição ${nova.findIndex((l) => l.chaveOrdem === cabeca.chaveOrdem) + 1}.`,
        );
        return;
      }

      setPendente({
        nova,
        oQue,
        deOnde: descreverPosicao(ordenadas, fatia.inicio),
        paraOnde: descreverPosicao(
          nova,
          nova.findIndex((l) => l.chaveOrdem === cabeca.chaveOrdem),
        ),
        afetadas: afetadas.map((l) => l.descricao.trim()),
      });
    },
    [linhas, ordenadas, salvar, tamanhoVisivel, visiveis],
  );

  /** A fatia que sai junto quando o puxador da linha `indice` é usado. */
  const fatiaDe = useCallback(
    (indice: number): Arrasto => {
      const linha = ordenadas[indice];
      if (arrastarBloco && linha?.calculada) return blocoDe(ordenadas, indice);
      return { inicio: indice, fim: indice + 1 };
    },
    [ordenadas, arrastarBloco],
  );

  /**
   * `Alt+↑` e `Alt+↓`: o mesmo movimento sem arrastar.
   *
   * Não é enfeite de acessibilidade. Arrastar é justamente o gesto que quem tem tremor
   * ou pouca mobilidade não consegue executar — e esta tela abre em leitura ampliada
   * porque é usada por quem costuma ter essa dificuldade.
   *
   * Anda uma linha **visível** por vez: com as zeradas escondidas, pular para um índice
   * da lista completa pareceria que a linha não se mexeu.
   */
  const moverPorTeclado = useCallback(
    (indice: number, direcao: -1 | 1) => {
      const fatia = fatiaDe(indice);

      const fora = visiveis
        .map((v) => indiceCompleto(v.chaveOrdem))
        .filter((i) => i < fatia.inicio || i >= fatia.fim);

      if (direcao === -1) {
        const acima = fora.filter((i) => i < fatia.inicio).at(-1);
        if (acima === undefined) return;
        aplicar(fatia, acima);
      } else {
        const abaixo = fora.find((i) => i >= fatia.fim);
        if (abaixo === undefined) return;
        aplicar(fatia, abaixo + 1);
      }
    },
    [fatiaDe, visiveis, indiceCompleto, aplicar],
  );

  /**
   * Rola sozinho quando o arraste chega perto da borda da tabela.
   *
   * Sem isto, levar a primeira linha para o fim de uma tabela de 140 linhas é
   * impossível sem soltar no meio do caminho, rolar, e pegar de novo.
   *
   * **Por que um laço de animação e não o próprio `dragover`.** O `dragover` só
   * dispara quando o ponteiro se move. Segurar a linha parada na beirada — que é
   * exatamente o gesto que a pessoa faz para esperar a tabela rolar — não gera
   * evento nenhum, e a rolagem morreria depois de um solavanco. O laço lê a última
   * posição conhecida e continua rolando enquanto o botão estiver pressionado.
   *
   * A velocidade é por SEGUNDO, multiplicada pelo tempo real do quadro, e não por
   * quadro: num monitor de 144 Hz a rolagem por quadro andaria ao dobro da
   * velocidade de um de 72 Hz.
   */
  useEffect(() => {
    const cx = rolagem.current;
    if (!arrasto || !cx) return;

    let quadro = 0;
    let anterior = performance.now();

    const passo = (agora: number) => {
      // Teto no delta: se a aba ficou em segundo plano, o primeiro quadro de volta
      // traria segundos de uma vez e a tabela saltaria para o fim.
      const dt = Math.min(agora - anterior, 50) / 1000;
      anterior = agora;

      const r = cx.getBoundingClientRect();
      cx.scrollTop += passoDeRolagem(ponteiroY.current, { topo: r.top, base: r.bottom }, dt);

      quadro = requestAnimationFrame(passo);
    };

    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [arrasto]);

  const confirmar = useCallback(() => {
    if (!pendente) return;
    salvar(pendente.nova.map((l) => l.chaveOrdem));
    setAnuncio(`Movimento aplicado. ${pendente.afetadas.length} linha(s) fora do bloco.`);
    setPendente(null);
  }, [pendente, salvar]);

  /**
   * Duplo clique numa célula de valor.
   *
   * O período NÃO é o da apuração inteira: é o mês da coluna clicada, recortado pelo
   * período. Com 01/08 a 27/08, agosto detalha 01/08 a 27/08 — detalhar o mês calendário
   * mostraria lançamentos que não entraram na célula, e o total deixaria de bater com ela.
   * No bloco TOTAL, `mesAno` vem nulo e o recorte é o período todo.
   */
  const abrirDetalhe = useCallback(
    (linha: LinhaDre, mesAno: string | null) => {
      if (!linha.detalhe) return;

      const periodo = mesAno
        ? recorteDoMes(mesAno, filtro.dataInicio, filtro.dataFim)
        : { dataInicio: filtro.dataInicio, dataFim: filtro.dataFim };

      if (!periodo) return;

      const coluna = mesAno
        ? (periodos.find((pp) => pp.mesAno === mesAno)?.rotulo ?? mesAno)
        : "Total do período";

      setDetalhe({ titulo: `${linha.descricao.trim()} · ${coluna}`, periodo });
      consultaDetalhe.mutate({
        ...filtro,
        ...periodo,
        tipo: linha.detalhe.tipo,
        bloco: linha.detalhe.bloco,
        chave: linha.detalhe.chave,
      });
    },
    [filtro, periodos, consultaDetalhe],
  );

  /**
   * Detalhamento de um totalizador: de que linhas ele é feito.
   *
   * **Não vai ao banco.** O valor de um totalizador é aritmética sobre linhas que já estão
   * na tela; perguntar ao Oracle de onde ele vem seria refazer lá uma conta já feita aqui,
   * e abrir a porta para os dois números discordarem. As parcelas chegam por referência e
   * o valor de cada uma é lido da própria linha citada — os dois lados leem o mesmo número.
   */
  const abrirComposicao = useCallback(
    (linha: LinhaDre, mesAno: string | null) => {
      const valorDe = (l: LinhaDre) =>
        mesAno ? (l.valores.find((v) => v.mesAno === mesAno)?.valor ?? 0) : l.total.valor;

      const parcelas = (linha.composicao ?? []).flatMap((p) => {
        const alvo = ordenadas.find((l) => l.chaveOrdem === p.chaveOrdem);
        // Parcela sem linha correspondente não vira zero: some. Um zero inventado no meio
        // de uma composição parece uma conta que fechou.
        return alvo
          ? [{ rotulo: p.rotulo, valor: p.sinal * valorDe(alvo), semMovimento: alvo.semMovimento }]
          : [];
      });

      const coluna = mesAno
        ? (periodos.find((pp) => pp.mesAno === mesAno)?.rotulo ?? mesAno)
        : "Total do período";

      setComposicao({
        titulo: `${linha.descricao.trim()} · ${coluna}`,
        total: valorDe(linha),
        parcelas,
      });
    },
    [ordenadas, periodos],
  );

  const fecharDetalhe = useCallback(() => {
    setDetalhe(null);
    setComposicao(null);
    consultaDetalhe.reset();
  }, [consultaDetalhe]);

  const restaurar = useCallback(() => {
    limpar();
    setAnuncio("Ordem do cadastro restaurada.");
  }, [limpar]);

  // Onde desenhar a linha de destino. `alvo` é índice da lista completa, mas o traço
  // aparece na tabela visível — se o destino cair numa linha escondida, ele sobe para
  // a próxima visível, e `null` significa "depois da última".
  const indicador = useMemo(() => {
    if (alvo === null) return undefined;
    const proxima = visiveis.find((v) => indiceCompleto(v.chaveOrdem) >= alvo);
    return proxima ? proxima.chaveOrdem : null;
  }, [alvo, visiveis, indiceCompleto]);

  const personalizada = ordemPersonalizada(linhas, ordenadas);

  if (visiveis.length === 0) {
    return (
      <p className="px-[var(--celula-x)] py-16 text-center text-[length:var(--fs-base)] text-[var(--text-muted)]">
        Nenhum lançamento no período selecionado.
      </p>
    );
  }

  // Com um mês só, a coluna de total repetiria a do mês — e o %AH seria sempre vazio.
  const multiMes = periodos.length > 1;

  // Escala das barras de %AV: a maior proporção abaixo de 100 define a largura cheia.
  // Sem isso, 26% e 73% ficariam quase indistinguíveis perto das Receitas Líquidas.
  const maiorAv = Math.max(
    ...visiveis.flatMap((l) =>
      l.valores.map((v) => Math.abs(v.percentualAv ?? 0)).filter((n) => n < 100),
    ),
    1,
  );

  return (
    <>
      <div className="nao-imprime flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-[var(--border)] px-4 py-2">
        <p className="text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
          Arraste pelo punho{" "}
          <span aria-hidden className="text-[var(--text-secondary)]">
            ⠿
          </span>{" "}
          para reordenar, ou use <kbd className="tecla">Alt</kbd> +{" "}
          <kbd className="tecla">↑</kbd> <kbd className="tecla">↓</kbd>.
        </p>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="flex cursor-pointer items-center gap-2.5 text-[length:var(--fs-apoio)] text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={arrastarBloco}
              onChange={(e) => setArrastarBloco(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            Totalizador arrasta o bloco inteiro
          </label>

          {personalizada && (
            <button
              type="button"
              onClick={restaurar}
              className="text-[length:var(--fs-apoio)] font-medium text-[var(--primary)] underline underline-offset-4 hover:opacity-80"
            >
              Restaurar ordem do cadastro
            </button>
          )}
        </div>
      </div>

      <div
        ref={rolagem}
        // No contêiner, e não nas linhas: o ponteiro passa por cabeçalho, rodapé e
        // pelos vãos entre células, e em nenhum desses lugares há linha para ouvir.
        // Aqui a posição continua chegando enquanto o arraste estiver sobre a tabela.
        onDragOver={(e) => {
          ponteiroY.current = e.clientY;
        }}
        className="tabela-rolagem"
      >
        <table className="w-full border-collapse text-[length:var(--fs-base)]">
          <thead>
            {multiMes && (
              <tr className="border-b border-[var(--border)]">
                <th className="celula-descricao" />
                {periodos.map((p) => (
                  <th
                    key={p.mesAno}
                    colSpan={3}
                    className="border-l border-[var(--border)] px-[var(--celula-x)] pt-3 pb-1 text-center text-[length:var(--fs-rotulo)] font-semibold tracking-[0.14em] text-[var(--text-secondary)] uppercase"
                  >
                    {p.rotulo}
                  </th>
                ))}
                <th
                  colSpan={3}
                  className="border-l border-[var(--border-strong)] bg-[var(--surface-2)] px-[var(--celula-x)] pt-3 pb-1 text-center text-[length:var(--fs-rotulo)] font-semibold tracking-[0.14em] text-[var(--text-primary)] uppercase"
                >
                  Total
                </th>
              </tr>
            )}
            <tr className="border-b border-[var(--border-strong)]">
              {/* Largura suficiente para o maior nome do cadastro MAIS um selo ao lado.
                  Sem isto, só as linhas com selo truncam — e truncar justamente a linha
                  que a tela está sinalizando esconde o que ela quer mostrar. A tabela já
                  rola na horizontal, então a folga aqui não custa nada. */}
              <Th className="celula-descricao min-w-[32rem] text-left">Descrição</Th>
              {periodos.map((p) => (
                <ColunasCabecalho key={p.mesAno} mostrarAh={multiMes} />
              ))}
              {multiMes && <ColunasCabecalho total />}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((linha) => {
              const indice = indiceCompleto(linha.chaveOrdem);
              return (
                <Linha
                  key={linha.chaveOrdem}
                  linha={linha}
                  indice={indice}
                  maiorAv={maiorAv}
                  multiMes={multiMes}
                  deslocada={deslocadas.has(linha.chaveOrdem)}
                  arrastando={
                    arrasto !== null && indice >= arrasto.inicio && indice < arrasto.fim
                  }
                  indicadorAcima={indicador === linha.chaveOrdem}
                  indicadorAbaixo={indicador === null && linha === visiveis.at(-1)}
                  tamanhoDaFatia={tamanhoVisivel(fatiaDe(indice))}
                  onArrastarInicio={() => setArrasto(fatiaDe(indice))}
                  onArrastarSobre={(destino) => setAlvo(destino)}
                  onSoltar={(destino) => {
                    if (arrasto) aplicar(arrasto, destino);
                    setArrasto(null);
                    setAlvo(null);
                    ponteiroY.current = null;
                  }}
                  onArrastarFim={() => {
                    setArrasto(null);
                    setAlvo(null);
                    ponteiroY.current = null;
                  }}
                  onTeclado={(direcao) => moverPorTeclado(indice, direcao)}
                  onDetalhe={
                    linha.detalhe
                      ? (mesAno) => abrirDetalhe(linha, mesAno)
                      : // `?? []` de propósito: uma API mais velha que este front não
                        // manda `composicao`, e o que se perde então é o duplo clique no
                        // totalizador — não a tela inteira em branco.
                        (linha.composicao ?? []).length > 0
                        ? (mesAno) => abrirComposicao(linha, mesAno)
                        : null
                  }
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {anuncio}
      </p>

      <ModalMoverLinha
        pendente={pendente}
        onConfirmar={confirmar}
        onCancelar={() => setPendente(null)}
      />

      <ModalDetalhe
        aberto={detalhe !== null || composicao !== null}
        titulo={detalhe?.titulo ?? composicao?.titulo ?? ""}
        periodo={detalhe?.periodo ?? null}
        dados={consultaDetalhe.data}
        composicao={composicao}
        carregando={detalhe !== null && consultaDetalhe.isPending}
        erro={
          consultaDetalhe.error instanceof Error ? consultaDetalhe.error.message : null
        }
        onFechar={fecharDetalhe}
      />
    </>
  );
}

function ColunasCabecalho({ mostrarAh, total }: { mostrarAh?: boolean; total?: boolean }) {
  return (
    <>
      <Th className={cn("text-right", total && "border-l border-[var(--border-strong)]")}>
        Valor
      </Th>
      <Th className="w-[9rem] text-right">AV %</Th>
      {total ? (
        <Th className="text-right">Média</Th>
      ) : mostrarAh ? (
        <Th className="text-right">AH %</Th>
      ) : (
        <th />
      )}
    </>
  );
}

function Th({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <th
      className={cn(
        "px-[var(--celula-x)] py-[var(--celula-y)] text-[length:var(--fs-rotulo)] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Linha({
  linha,
  indice,
  maiorAv,
  multiMes,
  deslocada,
  arrastando,
  indicadorAcima,
  indicadorAbaixo,
  tamanhoDaFatia,
  onArrastarInicio,
  onArrastarSobre,
  onSoltar,
  onArrastarFim,
  onTeclado,
  onDetalhe,
}: {
  linha: LinhaDre;
  indice: number;
  maiorAv: number;
  multiMes: boolean;
  deslocada: boolean;
  arrastando: boolean;
  indicadorAcima: boolean;
  indicadorAbaixo: boolean;
  tamanhoDaFatia: number;
  onArrastarInicio: () => void;
  onArrastarSobre: (destino: number) => void;
  onSoltar: (destino: number) => void;
  onArrastarFim: () => void;
  onTeclado: (direcao: -1 | 1) => void;
  /** `null` no bloco TOTAL: detalha o periodo inteiro. */
  onDetalhe: ((mesAno: string | null) => void) | null;
}) {
  // Metade de cima da linha solta antes dela; metade de baixo, depois.
  const destinoDoPonteiro = (e: React.DragEvent<HTMLTableRowElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientY - r.top > r.height / 2 ? indice + 1 : indice;
  };

  const nome = linha.descricao.trim();

  return (
    <tr
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onArrastarSobre(destinoDoPonteiro(e));
      }}
      onDrop={(e) => {
        e.preventDefault();
        onSoltar(destinoDoPonteiro(e));
      }}
      className={cn(
        "border-b border-[var(--border)] transition-colors duration-[var(--dur-instant)]",
        // Faixa zebrada: transparente no modo padrão, sutil no ampliado. Serve para
        // o olho não pular de linha ao atravessar uma tabela larga.
        "odd:bg-[var(--zebra)]",
        "hover:bg-[var(--surface-2)]",
        linha.totalizadora && "linha-totalizadora bg-[var(--surface-2)]",
        arrastando && "linha-arrastando",
        indicadorAcima && "alvo-acima",
        indicadorAbaixo && "alvo-abaixo",
      )}
    >
      {/* Punho, marcador, nome e selos na MESMA célula: ela é a única coluna fixa.
          Duas colunas fixas teriam que concordar até o pixel sobre onde uma termina
          e a outra começa, e não concordavam. Ver o bloco TABELA COM CABEÇALHO E
          DESCRIÇÃO FIXOS em globals.css. */}
      <td className={cn(CELULA, "celula-descricao pl-2")}>
        <div className="flex items-center gap-2">
            <button
            type="button"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              // Firefox só inicia o arraste se houver dado no `dataTransfer`.
              e.dataTransfer.setData("text/plain", linha.chaveOrdem);
              const tr = e.currentTarget.closest("tr");
              if (tr) e.dataTransfer.setDragImage(tr, 24, 12);
              onArrastarInicio();
            }}
            onDragEnd={onArrastarFim}
            onKeyDown={(e) => {
              if (!e.altKey) return;
              if (e.key === "ArrowUp") {
                e.preventDefault();
                onTeclado(-1);
              }
              if (e.key === "ArrowDown") {
                e.preventDefault();
                onTeclado(1);
              }
            }}
            aria-label={
              tamanhoDaFatia > 1
                ? `Mover o bloco de ${nome}, com ${tamanhoDaFatia} linhas. Alt com seta para cima ou para baixo.`
                : `Mover ${nome}. Alt com seta para cima ou para baixo.`
            }
            className="puxador shrink-0"
          >
            <span aria-hidden>⠿</span>
          </button>

          {/* A cor do EPCPARDRE é informação que o contador já reconhece: vira marcador
              fino, não fundo colorido que brigaria com o tema escuro. */}
          <span
            aria-hidden
            className="h-4 w-[3px] shrink-0 rounded-full"
            style={{ background: linha.cor ?? "transparent" }}
          />
          <span
            className={cn(
              "truncate",
              linha.totalizadora
                ? "font-semibold text-[var(--text-primary)]"
                : "text-[var(--text-secondary)]",
              // Linha informativa recua em vez de desbotar. Reduzir opacidade seria
              // reduzir contraste — o oposto do que a leitura ampliada existe para
              // resolver. O recuo e o selo já distinguem.
              !linha.calculada && linha.naoSoma && "pl-3",
            )}
            title={linha.descricao}
          >
            {nome}
          </span>
          {linha.naoSoma && <SeloInformativo />}
          {deslocada && <SeloForaDoBloco />}
        </div>
      </td>

      {linha.valores.map((v) => (
        <BlocoMes
          key={v.mesAno}
          valor={v.valor}
          av={v.percentualAv}
          ah={v.percentualAh}
          mostrarAh={multiMes}
          maiorAv={maiorAv}
          destaque={linha.totalizadora}
          onDetalhe={onDetalhe ? () => onDetalhe(v.mesAno) : null}
        />
      ))}

      {multiMes && (
        <BlocoMes
          valor={linha.total.valor}
          av={linha.total.percentualAv}
          media={linha.total.media}
          maiorAv={maiorAv}
          destaque={linha.totalizadora}
          onDetalhe={onDetalhe ? () => onDetalhe(null) : null}
          total
        />
      )}
    </tr>
  );
}

function BlocoMes({
  valor,
  av,
  ah,
  media,
  mostrarAh,
  maiorAv,
  destaque,
  total,
  onDetalhe,
}: {
  valor: number;
  av: number | null;
  ah?: number | null;
  media?: number;
  mostrarAh?: boolean;
  maiorAv: number;
  destaque: boolean;
  total?: boolean;
  onDetalhe: (() => void) | null;
}) {
  const celula = cn(CELULA, "whitespace-nowrap tabular", destaque && "font-semibold");
  const corValor = (v: number) =>
    v < 0
      ? "text-[var(--negative)]"
      : v === 0
        ? "text-[var(--text-muted)]"
        : "text-[var(--text-primary)]";

  return (
    <>
      {/* Duplo clique, como na 9815. Só nas linhas que abrem detalhamento — o servidor
          é quem diz quais, no campo `detalhe` da linha. */}
      <td
        onDoubleClick={onDetalhe ?? undefined}
        className={cn(
          celula,
          "text-right",
          corValor(valor),
          total && "border-l border-[var(--border-strong)] bg-[var(--surface-2)]",
          onDetalhe && "tem-detalhe",
        )}
      >
        {onDetalhe ? (
          // O botão existe para o teclado: duplo clique não tem equivalente sem mouse, e
          // sem ele a tela inteira ficaria fora de alcance de quem navega por tabulação.
          <button
            type="button"
            onClick={onDetalhe}
            title="Ver de onde vem este valor"
            className="valor-clicavel"
          >
            {formatarValor(valor)}
          </button>
        ) : (
          formatarValor(valor)
        )}
      </td>

      <td className={cn(CELULA, total && "bg-[var(--surface-2)]")}>
        <BarraAv percentual={av} maior={maiorAv} />
      </td>

      {total ? (
        <td className={cn(celula, "bg-[var(--surface-2)] text-right", corValor(media ?? 0))}>
          {formatarValor(media ?? 0)}
        </td>
      ) : mostrarAh ? (
        <td className={cn(celula, "text-right")}>
          <Variacao percentual={ah ?? null} />
        </td>
      ) : (
        <td />
      )}
    </>
  );
}

/**
 * `%AV` como número e como proporção.
 *
 * Análise vertical é proporção por definição, e uma coluna de percentuais esconde
 * justamente o que deveria mostrar. A barra devolve a leitura de relevância que a grade
 * do Winthor não dava, sem tirar o número de quem confere.
 */
function BarraAv({ percentual, maior }: { percentual: number | null; maior: number }) {
  if (percentual === null) {
    return <div className="text-right text-[var(--text-muted)]">—</div>;
  }

  const magnitude = Math.abs(percentual);
  const base = magnitude >= 100 ? 100 : maior;
  const largura = Math.min(100, (magnitude / base) * 100);

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="tabular text-[length:var(--fs-apoio)] text-[var(--text-secondary)]">
        {formatarPercentual(percentual)}
      </span>
      <span
        aria-hidden
        className="w-full overflow-hidden rounded-full bg-[var(--surface-3)]"
        style={{ height: "var(--barra-av-h)" }}
      >
        <span
          className="block h-full rounded-full transition-[width] duration-[var(--dur-normal)]"
          style={{
            width: `${largura}%`,
            background: percentual < 0 ? "var(--negative)" : "var(--primary)",
            opacity: magnitude >= 100 ? 1 : 0.7,
          }}
        />
      </span>
    </div>
  );
}

/**
 * `%AH` — variação sobre o mês anterior. Verde sobe, vermelho desce, sem seta:
 * o sinal já diz a direção e a seta só competiria com ele.
 */
function Variacao({ percentual }: { percentual: number | null }) {
  if (percentual === null) {
    return <span className="text-[var(--text-muted)]">—</span>;
  }

  return (
    <span className={percentual < 0 ? "text-[var(--negative)]" : "text-[var(--positive)]"}>
      {percentual > 0 ? "+" : ""}
      {formatarPercentual(percentual)}
    </span>
  );
}

/**
 * A 9815 escreve `NÃO SOMA` nestas linhas. Aqui elas são marcadas como **informativo**:
 * diz a mesma coisa pelo lado do que a linha é, e não pelo que ela deixa de fazer.
 * O cadastro e a regra continuam idênticos — muda só a palavra na tela.
 */
function SeloInformativo() {
  return (
    <span className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--warning-glow)] px-1.5 py-0.5 text-[length:var(--fs-rotulo)] font-semibold tracking-[0.1em] text-[var(--warning)] uppercase">
      Informativo
    </span>
  );
}

/**
 * A linha foi arrastada para fora do trecho onde o cadastro a colocou, e por isso passa
 * a parecer compor totais que não compõe. O selo é o que mantém isso visível depois que
 * o aviso do movimento já foi fechado e esquecido.
 *
 * **Deliberadamente discreto**, em cinza e sem borda. O alerta já foi dado no momento em
 * que importava — o modal, antes de aplicar. Aqui ele é só uma nota de estado, e disputar
 * atenção com `INFORMATIVO`, que é informação do cadastro, seria dar peso a mais para uma
 * escolha que o próprio usuário fez.
 */
function SeloForaDoBloco() {
  return (
    <span
      title="Movida: aparece fora do total que compõe. Os valores continuam corretos."
      className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--surface-3)] px-1.5 py-0.5 text-[length:var(--fs-rotulo)] font-medium tracking-[0.1em] text-[var(--text-muted)] uppercase"
    >
      Fora do bloco
    </span>
  );
}

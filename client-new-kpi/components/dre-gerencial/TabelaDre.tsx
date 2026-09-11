"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ModalMoverLinha, type MovimentoPendente } from "./ModalMoverLinha";
import { ModalDetalhe } from "./ModalDetalhe";
import { ModalConfirmarDetalhe, type DetalhePendente } from "./ModalConfirmarDetalhe";
import { useDetalhe } from "@/hooks/useDreGerencial";
import { useExportarDetalhe } from "@/hooks/useExportarDetalhe";
import { paraBr } from "@/lib/periodos";
import {
  abreBloco,
  mostraVariacao,
  recorteLongo,
  rotuloDaVariacao,
  rotulosDistintos,
  variacao,
} from "@/lib/modosDePeriodo";
import { useOrdemSalva } from "@/hooks/useOrdemSalva";
import { passoDeRolagem } from "@/lib/rolagemAutomatica";
import { guardar } from "@/lib/detalheAberto";
import { cn } from "@/lib/cn";
import { descreverVariacao, lerVariacao } from "@/lib/leituraDaVariacao";
import { formatarPercentual, formatarValor } from "@/lib/formato";
import {
  aplicarOrdem,
  descreverPosicao,
  linhasAfetadas,
  mover,
  ordemPersonalizada,
  saiuDoBloco,
} from "@/lib/ordemLinhas";
import type {
  FiltroApuracao,
  LinhaDre,
  ModoPeriodo,
  PeriodoDre,
} from "@/types/dre-gerencial";

/**
 * Tamanhos, espaçamento e contraste vêm de tokens definidos em `globals.css`.
 * O modo de leitura ampliada troca os tokens; nenhum componente sabe em que
 * modo está. Ver o bloco MODO DE LEITURA AMPLIADA lá.
 */
const CELULA = "px-[var(--celula-x)] py-[var(--celula-y)]";

/**
 * Um detalhamento pronto para ser disparado.
 *
 * Existe porque o pedido pode ficar esperando: quando o recorte é longo, ele é montado no
 * duplo clique e só sai depois da confirmação. Guardar o pedido inteiro, e não os
 * ingredientes, garante que o que foi confirmado é exatamente o que roda.
 */
interface PedidoDetalhe {
  tipo: NonNullable<LinhaDre["detalhe"]>;
  titulo: string;
  periodo: { dataInicio: string; dataFim: string };
  linha: { descricao: string; valor: number };
}

/** Dias de um recorte, inclusive as duas pontas. */
function diasDoRecorte(periodo: { dataInicio: string; dataFim: string }): number {
  const a = Date.parse(`${periodo.dataInicio}T00:00:00`);
  const b = Date.parse(`${periodo.dataFim}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * **Arrastar move uma linha, sempre.**
 *
 * Até 09/09/2026 um totalizador levava consigo o bloco que ele encabeça, com um
 * interruptor na barra para desligar isso. Removido por decisão do Gabriel: mover o bloco
 * inteiro num gesto muda a leitura de várias linhas de uma vez, e num relatório onde a
 * posição sugere o que compõe o quê, é efeito grande demais para um arraste.
 */

export function TabelaDre({
  periodos,
  linhas,
  mostrarZeradas,
  filtro,
  modo,
  filiaisApuradas,
}: {
  periodos: PeriodoDre[];
  linhas: LinhaDre[];
  mostrarZeradas: boolean;
  /** Filiais, período, regime e dimensão da apuração — o detalhamento repete todos. */
  filtro: FiltroApuracao;
  /** O modo que formou as colunas. Decide o bloco final: total ou variação. */
  modo: ModoPeriodo;
  /**
   * As filiais apuradas por extenso, para a página dedicada imprimir. Chega pronta de
   * quem apurou — ver `descreverFiliais`.
   */
  filiaisApuradas: string;
}) {
  const { ordem, salvar, limpar } = useOrdemSalva(filtro.analise);

  // `linhas` é sempre a ordem do cadastro, como veio da API — é a referência contra a
  // qual tudo aqui é medido. `ordenadas` é o que a pessoa vê.
  const ordenadas = useMemo(() => aplicarOrdem(linhas, ordem), [linhas, ordem]);

  /** Índice, na lista completa, da linha sendo arrastada. */
  const [arrasto, setArrasto] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null);

  const rolagem = useRef<HTMLDivElement>(null);
  /** Última posição vertical do ponteiro durante o arraste, em coordenadas da janela. */
  const ponteiroY = useRef<number | null>(null);
  const [pendente, setPendente] = useState<
    (MovimentoPendente & { nova: LinhaDre[] }) | null
  >(null);
  /**
   * Falha ao guardar o detalhamento para a outra aba. Raro, mas silêncio seria pior: a
   * pessoa clicaria de novo achando que não pegou o clique.
   */
  const [avisoDaAba, setAvisoDaAba] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");

  const { exportar, exportando, erro: erroExcel } = useExportarDetalhe();

  const consultaDetalhe = useDetalhe();
  const [detalhe, setDetalhe] = useState<{
    titulo: string;
    periodo: { dataInicio: string; dataFim: string };
    /** A célula clicada, para o resumo do cálculo conferir contra ela. */
    linha: { descricao: string; valor: number };
  } | null>(null);

  /**
   * Um detalhamento à espera de confirmação, quando o recorte é longo. Guarda o pedido
   * pronto: o que a confirmação faz é deixá-lo seguir, sem recalcular nada.
   */
  const [detalhePendente, setDetalhePendente] = useState<{
    pedido: PedidoDetalhe;
    aviso: DetalhePendente;
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
    (indice: number, destino: number) => {
      const nova = mover(ordenadas, indice, destino);
      if (!ordemPersonalizada(ordenadas, nova)) return;

      const linha = ordenadas[indice];
      if (!linha) return;

      const nomeCurto = linha.descricao.trim();

      // Só o que a pessoa consegue ver. Citar uma linha escondida manda conferir algo
      // que não está na tela; quando ela reaparecer, o selo dela já estará aceso.
      const afetadas = linhasAfetadas(linhas, ordenadas, nova).filter((l) =>
        visiveis.some((v) => v.chaveOrdem === l.chaveOrdem),
      );

      // Mexer num totalizador sempre pergunta, mesmo quando nenhuma despesa muda de
      // leitura — é a linha que ancora o bloco, e foi o caso que o Gabriel pediu para
      // nunca passar direto.
      if (afetadas.length === 0 && !linha.calculada) {
        salvar(nova.map((l) => l.chaveOrdem));
        setAnuncio(
          `${nomeCurto} movida para a posição ${nova.findIndex((l) => l.chaveOrdem === linha.chaveOrdem) + 1}.`,
        );
        return;
      }

      setPendente({
        nova,
        oQue: `a linha ${nomeCurto}`,
        deOnde: descreverPosicao(ordenadas, indice),
        paraOnde: descreverPosicao(
          nova,
          nova.findIndex((l) => l.chaveOrdem === linha.chaveOrdem),
        ),
        afetadas: afetadas.map((l) => l.descricao.trim()),
      });
    },
    [linhas, ordenadas, salvar, visiveis],
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
      const fora = visiveis
        .map((v) => indiceCompleto(v.chaveOrdem))
        .filter((i) => i !== indice);

      if (direcao === -1) {
        const acima = fora.filter((i) => i < indice).at(-1);
        if (acima === undefined) return;
        aplicar(indice, acima);
      } else {
        const abaixo = fora.find((i) => i > indice);
        if (abaixo === undefined) return;
        aplicar(indice, abaixo + 1);
      }
    },
    [visiveis, indiceCompleto, aplicar],
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
   * Dispara o detalhamento de uma célula já resolvida.
   *
   * Separado de `abrirDetalhe` porque existem dois caminhos até aqui: o duplo clique
   * direto e o mesmo clique depois de confirmado, quando o recorte é longo.
   */
  const consultarDetalhe = useCallback(
    (pedido: PedidoDetalhe) => {
      setDetalhe({
        titulo: pedido.titulo,
        periodo: pedido.periodo,
        linha: pedido.linha,
      });

      // Descarta o resultado anterior ANTES de pedir o novo. Sem isto existe uma janela
      // em que o título já é o da linha nova e os números ainda são os da linha velha —
      // e essa tela existe justamente para alguém acreditar nos números dela.
      consultaDetalhe.reset();
      consultaDetalhe.mutate({
        ...filtro,
        ...pedido.periodo,
        tipo: pedido.tipo.tipo,
        bloco: pedido.tipo.bloco,
        chave: pedido.tipo.chave,
      });
    },
    [filtro, consultaDetalhe],
  );

  /**
   * Duplo clique numa célula de valor.
   *
   * **O recorte vem da coluna, não de uma conta feita aqui.** Cada período traz o próprio
   * `dataInicio`/`dataFim` do servidor — que é o único que sabe recortar uma coluna que
   * não é um mês. Antes o front derivava isso do `mm/yyyy` com `recorteDoMes`, e essa
   * conta só funciona enquanto coluna for sinônimo de mês: numa coluna `2026` ela
   * devolveria janeiro.
   *
   * O recorte continua sendo o da célula, não o da apuração inteira: com 01/08 a 27/08,
   * agosto detalha 01/08 a 27/08 — detalhar o mês calendário mostraria lançamentos que não
   * entraram na célula, e o total deixaria de bater com ela. No bloco final, `mesAno` vem
   * nulo e o recorte é o período todo.
   */
  const abrirDetalhe = useCallback(
    (linha: LinhaDre, mesAno: string | null) => {
      if (!linha.detalhe) return;

      const coluna = mesAno ? periodos.find((pp) => pp.mesAno === mesAno) : null;

      // Coluna que não existe mais na resposta: não inventa recorte. Um intervalo chutado
      // devolveria números que não são os da célula clicada.
      if (mesAno && !coluna) return;

      const periodo = coluna
        ? { dataInicio: coluna.dataInicio, dataFim: coluna.dataFim }
        : { dataInicio: filtro.dataInicio, dataFim: filtro.dataFim };

      // O valor da célula vai junto: é contra ele que o resumo do cálculo se confere.
      const valorDaLinha = mesAno
        ? (linha.valores.find((v) => v.mesAno === mesAno)?.valor ?? 0)
        : linha.total.valor;

      const pedido = {
        tipo: linha.detalhe,
        titulo: `${linha.descricao.trim()} · ${coluna?.rotulo ?? "Total do período"}`,
        periodo,
        linha: { descricao: linha.descricao.trim(), valor: valorDaLinha },
      };

      // Recorte longo pergunta antes. Ver `ModalConfirmarDetalhe`: com colunas de ano, um
      // clique a mais passa a iniciar minutos de consulta sem cancelamento.
      if (recorteLongo(periodo)) {
        setDetalhePendente({
          pedido,
          aviso: {
            oQue: pedido.titulo,
            de: paraBr(periodo.dataInicio),
            ate: paraBr(periodo.dataFim),
            dias: diasDoRecorte(periodo),
          },
        });
        return;
      }

      consultarDetalhe(pedido);
    },
    [filtro, periodos, consultarDetalhe],
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

  /**
   * Leva o detalhamento já apurado para uma **nova aba**, deixando esta como está.
   *
   * **Não consulta de novo**, nem aqui nem lá: o objeto vai pelo armazenamento do
   * navegador e a página o recupera pelo id da URL — ver `lib/detalheAberto.ts`. Refazer
   * a consulta custaria de 8 s a 2 minutos para mostrar exatamente os mesmos números.
   *
   * **A aba de origem fica intacta**, com a apuração e o modal — que é o ponto de abrir
   * em aba nova em vez de navegar: reapurar o DRE custa minutos.
   *
   * `noopener` porque a página nova não tem nada a fazer com esta. É o padrão de segurança
   * para abrir aba, e nada aqui depende de `window.opener`.
   */
  const levarParaPagina = useCallback(
    (imprimir: boolean) => {
      if (!detalhe || !consultaDetalhe.data) return;

      const id = guardar({
        titulo: detalhe.titulo,
        periodo: detalhe.periodo,
        linha: detalhe.linha,
        dados: consultaDetalhe.data,
        filiais: filiaisApuradas,
      });

      // Sem armazenamento não há como o dado atravessar, e a aba nova abriria vazia.
      // Melhor dizer aqui, com o detalhamento ainda na tela, do que lá com a tela branca.
      if (id === null) {
        setAvisoDaAba(
          "O navegador recusou guardar o detalhamento, provavelmente por falta de espaço. " +
            "Ele continua aberto aqui.",
        );
        return;
      }

      setAvisoDaAba(null);
      const destino = `/dre-gerencial/detalhe/${id}${imprimir ? "?imprimir=1" : ""}`;
      window.open(destino, "_blank", "noopener");
    },
    [detalhe, consultaDetalhe.data, filiaisApuradas],
  );

  const abrirEmNovaAba = useCallback(() => levarParaPagina(false), [levarParaPagina]);

  /**
   * Imprimir **pela página dedicada**, não pelo diálogo.
   *
   * Um `<dialog>` aberto vive na *top layer* do navegador, e conteúdo da top layer **não
   * se fragmenta entre páginas**: `window.print()` daqui sairia com a primeira folha e o
   * resto cortado — numa lista de 15 mil clientes, o pior defeito possível. A página é
   * HTML em fluxo normal, então pagina e repete o cabeçalho.
   */
  const imprimirEmNovaAba = useCallback(() => levarParaPagina(true), [levarParaPagina]);

  /**
   * O Excel sai **daqui**, sem passar pela outra aba.
   *
   * Planilha não tem folha nem paginação, então o `<dialog>` não atrapalha — o que impede
   * a impressão de sair do modal não vale para um arquivo. E os dados já estão carregados.
   */
  const exportarExcel = useCallback(() => {
    if (!detalhe || !consultaDetalhe.data) return;
    exportar({
      titulo: detalhe.titulo,
      periodo: detalhe.periodo,
      linha: detalhe.linha,
      dados: consultaDetalhe.data,
    });
  }, [detalhe, consultaDetalhe.data, exportar]);

  const fecharDetalhe = useCallback(() => {
    setDetalhe(null);
    setComposicao(null);
    setAvisoDaAba(null);
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

  // Com uma coluna só, o bloco final repetiria a própria coluna — e o %AH seria sempre
  // vazio. O nome fala em mês porque no modo mensal é isso que uma coluna é.
  const multiMes = periodos.length > 1;

  // Nos modos de comparação o bloco final mostra VARIAÇÃO, não total: somar 2025 com 2026,
  // ou janeiro de 2025 com junho de 2026, dá um número que ninguém usa. Ver
  // `mostraVariacao`.
  const variacaoNoFim = mostraVariacao(modo, periodos);
  const colunasDoFim = variacaoNoFim ? 2 : 3;

  // Dois lados do comparativo podem cair no mesmo mês — 28/08–03/09 contra 05/09–11/09 põe
  // `Setembro/2026` duas vezes no cabeçalho. Aí, e só aí, o rótulo passa a levar os dias.
  const rotulos = rotulosDistintos(periodos);

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
      {/* `barra-reordenar` sai em dispositivo de toque: ela explica um gesto de mouse e
          um atalho de teclado, e o celular não tem nenhum dos dois. */}
      <div className="barra-reordenar nao-imprime flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-[var(--border)] px-4 py-2">
        <p className="text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
          Arraste pelo punho{" "}
          <span aria-hidden className="text-[var(--text-secondary)]">
            ⠿
          </span>{" "}
          para reordenar, ou use <kbd className="tecla">Alt</kbd> +{" "}
          <kbd className="tecla">↑</kbd> <kbd className="tecla">↓</kbd>.
        </p>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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
                {periodos.map((p, i) => (
                  <th
                    key={p.mesAno}
                    colSpan={3}
                    className={cn(
                      "px-[var(--celula-x)] pt-3 pb-1 text-center text-[length:var(--fs-rotulo)] font-semibold tracking-[0.14em] text-[var(--text-secondary)] uppercase",
                      // Uma cor por mês, para o olho não perder de vista a que coluna
                      // pertence o número que está lendo — ver o bloco FAIXA DE COR POR
                      // COLUNA em globals.css. O ciclo de quatro recomeça longe o bastante
                      // para duas faixas iguais nunca se compararem na mesma tela.
                      faixaDoMes(i),
                      // A virada de intervalo ganha a MESMA borda do bloco de total: é uma
                      // divisão da mesma natureza, e sem ela os dois lados da comparação se
                      // misturam num campo contínuo de colunas.
                      abreBloco(periodos, i)
                        ? "border-l-2 border-[var(--border-strong)]"
                        : "border-l border-[var(--border)]",
                    )}
                  >
                    {rotulos[i]}
                  </th>
                ))}
                <th
                  colSpan={colunasDoFim}
                  className="border-l border-[var(--border-strong)] bg-[var(--surface-2)] px-[var(--celula-x)] pt-3 pb-1 text-center text-[length:var(--fs-rotulo)] font-semibold tracking-[0.14em] text-[var(--text-primary)] uppercase"
                >
                  {/* `Jan–Mar/2025 → Jun–Set/2026` em vez de "Variação": no comparativo os
                      dois lados são intervalos INTEIROS, e sem o rótulo quem olha a coluna Δ
                      supõe que ela compara os dois últimos meses — que é outra conta, a da
                      coluna `AH %`. */}
                  {variacaoNoFim ? rotuloDaVariacao(modo, periodos) : "Total"}
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
              {multiMes &&
                (variacaoNoFim ? <ColunasCabecalhoVariacao /> : <ColunasCabecalho total />)}
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
                  variacaoNoFim={variacaoNoFim}
                  periodos={periodos}
                  modo={modo}
                  deslocada={deslocadas.has(linha.chaveOrdem)}
                  arrastando={arrasto === indice}
                  indicadorAcima={indicador === linha.chaveOrdem}
                  indicadorAbaixo={indicador === null && linha === visiveis.at(-1)}
                  onArrastarInicio={() => setArrasto(indice)}
                  onArrastarSobre={(destino) => setAlvo(destino)}
                  onSoltar={(destino) => {
                    if (arrasto !== null) aplicar(arrasto, destino);
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

      <ModalConfirmarDetalhe
        pendente={detalhePendente?.aviso ?? null}
        onConfirmar={() => {
          if (detalhePendente) consultarDetalhe(detalhePendente.pedido);
          setDetalhePendente(null);
        }}
        onCancelar={() => setDetalhePendente(null)}
      />

      <ModalDetalhe
        aberto={detalhe !== null || composicao !== null}
        titulo={detalhe?.titulo ?? composicao?.titulo ?? ""}
        periodo={detalhe?.periodo ?? null}
        dados={consultaDetalhe.data}
        linha={detalhe?.linha ?? null}
        composicao={composicao}
        carregando={detalhe !== null && consultaDetalhe.isPending}
        erro={
          consultaDetalhe.error instanceof Error ? consultaDetalhe.error.message : null
        }
        onFechar={fecharDetalhe}
        // A composição dos totalizadores não vai para página: ela é aritmética sobre
        // linhas que estão na tabela atrás do modal, e fora daqui perde a referência.
        onAbrirEmNovaAba={composicao ? null : abrirEmNovaAba}
        onImprimir={composicao ? null : imprimirEmNovaAba}
        // A composição não tem Excel pelo mesmo motivo de não ter página: ela é aritmética
        // sobre as linhas da tabela atrás do modal, e a tabela inteira já exporta.
        onExcel={composicao || !detalhe || !consultaDetalhe.data ? null : exportarExcel}
        excelOcupado={exportando}
        avisoDaAba={avisoDaAba ?? erroExcel}
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

/** O cabeçalho do bloco de variação: duas colunas, contra as três do total. */
function ColunasCabecalhoVariacao() {
  return (
    <>
      <Th className="border-l border-[var(--border-strong)] text-right">Δ Valor</Th>
      <Th className="text-right">Δ %</Th>
    </>
  );
}

/**
 * A diferença entre a primeira e a última coluna: em reais e em proporção.
 *
 * **Não abre detalhamento**, ao contrário do bloco de total. Uma variação é a subtração de
 * dois números que já estão na tela — não existe lançamento nenhum "dentro" dela, e abrir
 * uma consulta a partir daqui prometeria uma origem que não há.
 *
 * No comparativo, os dois números são a **soma de cada intervalo**, e não a primeira contra
 * a última coluna: é o que permite os lados terem tamanhos diferentes, três meses de 2025
 * contra quatro de 2026.
 *
 * **A cor julga o efeito no resultado**, como no `%AH` — ver `lerVariacao`. Uma despesa
 * que cresce tem Δ negativo e é má notícia; uma receita que cresce tem Δ positivo e é boa.
 * Colorir pelo sinal faria este bloco contradizer a coluna `AH %` ao lado dele, dizendo o
 * oposto sobre a mesma linha.
 */
function BlocoVariacao({
  valores,
  periodos,
  modo,
  totalDaLinha,
  destaque,
}: {
  valores: { valor: number }[];
  /** Para saber a que bloco cada valor pertence — é o que separa os dois lados. */
  periodos: PeriodoDre[];
  modo: ModoPeriodo;
  /** O total da linha no período: é dele que sai o sentido, receita ou despesa. */
  totalDaLinha: number;
  destaque: boolean;
}) {
  const celula = cn(
    CELULA,
    "whitespace-nowrap tabular bg-[var(--surface-2)] text-right",
    destaque && "font-semibold",
  );

  const v = variacao(valores, periodos, modo);

  if (!v) {
    return (
      <>
        <td className={cn(celula, "border-l border-[var(--border-strong)] text-[var(--text-muted)]")}>
          —
        </td>
        <td className={cn(celula, "text-[var(--text-muted)]")}>—</td>
      </>
    );
  }

  // O Δ em reais é julgado pela mesma regra do %AH: favorável quando tem o mesmo sinal do
  // valor da linha. Receita subindo é boa; despesa subindo, que aqui aparece como Δ
  // negativo porque despesa é negativa, é má.
  const leitura = lerVariacao(v.absoluta, totalDaLinha);
  const cor =
    leitura === "favoravel"
      ? "text-[var(--positive)]"
      : leitura === "desfavoravel"
        ? "text-[var(--negative)]"
        : "text-[var(--text-muted)]";

  return (
    <>
      <td
        title={descreverVariacao(leitura)}
        className={cn(celula, "border-l border-[var(--border-strong)]", cor)}
      >
        {formatarValor(v.absoluta)}
      </td>
      <td className={celula}>
        {/* Sem percentual quando a base é zero: uma conta que saiu de nada para alguma
            coisa não tem proporção que a descreva, e o valor ao lado já diz o quanto. */}
        <Variacao percentual={v.percentual} valorDaLinha={totalDaLinha} />
      </td>
    </>
  );
}

/**
 * A classe de cor do cabeçalho de um mês, pela posição na tabela.
 *
 * O ciclo é de quatro, e não uma cor por mês do calendário: o que precisa ser distinto são
 * colunas VIZINHAS na tela, não janeiro em relação a janeiro. Amarrar a cor ao mês faria
 * um recorte de junho a julho sair com duas faixas quase iguais, se os dois meses caíssem
 * perto no ciclo — e não resolveria nada no modo por ano, onde coluna não é mês.
 */
function faixaDoMes(indice: number): string {
  return `faixa-mes-${(indice % 4) + 1}`;
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
  variacaoNoFim,
  periodos,
  modo,
  deslocada,
  arrastando,
  indicadorAcima,
  indicadorAbaixo,
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
  /** O bloco final desta linha é variação em vez de total. */
  variacaoNoFim: boolean;
  /** As colunas e o modo, para a variação saber separar os dois lados da comparação. */
  periodos: PeriodoDre[];
  modo: ModoPeriodo;
  deslocada: boolean;
  arrastando: boolean;
  indicadorAcima: boolean;
  indicadorAbaixo: boolean;
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
      /**
       * A identidade da linha no DOM, para a exportação saber **a ordem e a seleção que
       * estão na tela** — a pessoa pode ter arrastado linhas e escondido as zeradas.
       *
       * Ler isto do DOM em vez de levantar o estado da ordem para a página é a troca
       * deliberada: a alternativa era mover o `useOrdemSalva` e o cálculo de visíveis para
       * fora deste componente, refatorando o dono de três estados para servir a um botão.
       * O DOM já é a fonte que a impressão usa — ela imprime o que está renderizado —, e
       * assim o Excel e o papel não têm como discordar.
       */
      data-chave={linha.chaveOrdem}
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
            aria-label={`Mover ${nome}. Alt com seta para cima ou para baixo.`}
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
              // `truncate` corta com reticências, o que na tela é certo — a coluna é fixa
              // e o `title` mostra o resto. No papel não há hover, e uma conta cortada
              // vira relatório que não se lê: a classe existe para o `@media print`
              // desligar o corte e deixar o nome quebrar em duas linhas.
              "descricao-conta truncate",
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
          totalDaLinha={linha.total.valor}
          maiorAv={maiorAv}
          destaque={linha.totalizadora}
          onDetalhe={onDetalhe ? () => onDetalhe(v.mesAno) : null}
        />
      ))}

      {multiMes &&
        (variacaoNoFim ? (
          <BlocoVariacao
            valores={linha.valores}
            periodos={periodos}
            modo={modo}
            totalDaLinha={linha.total.valor}
            destaque={linha.totalizadora}
          />
        ) : (
          <BlocoMes
            valor={linha.total.valor}
            av={linha.total.percentualAv}
            media={linha.total.media}
            maiorAv={maiorAv}
            totalDaLinha={linha.total.valor}
            destaque={linha.totalizadora}
            onDetalhe={onDetalhe ? () => onDetalhe(null) : null}
            total
          />
        ))}
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
  totalDaLinha,
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
  /**
   * O total da linha no período, de onde sai o sentido do `%AH`.
   *
   * Vem o total, e não o valor desta coluna: uma conta que oscila de sinal entre dois meses
   * trocaria de cor no meio da tabela se cada coluna se julgasse sozinha.
   */
  totalDaLinha: number;
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
          <Variacao percentual={ah ?? null} valorDaLinha={totalDaLinha} />
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
      {/* Mesmo par do `%AH`: três casas na tela, uma no papel. Ver `Variacao`. */}
      <span className="tabular text-[length:var(--fs-apoio)] text-[var(--text-secondary)]">
        <span className="so-na-tela">{formatarPercentual(percentual)}</span>
        <span className="so-no-papel">{formatarPercentual(percentual, 1)}</span>
      </span>
      {/* A classe existe para a impressão poder apagar a barra: no papel ela é
          decoração que custa uma linha de altura por célula, e o número está do lado. */}
      <span
        aria-hidden
        className="barra-av w-full overflow-hidden rounded-full bg-[var(--surface-3)]"
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
 *
 * **Duas grafias do mesmo número, e o CSS escolhe qual sai.** Na tela, três casas como a
 * 9815; no papel, inteiro — `19,474` viram `19`, quatro caracteres a menos numa coluna que
 * se repete a cada mês.
 *
 * Os dois textos vão no DOM em vez de um estado trocado no `beforeprint`. Aquele evento é
 * onde a impressão já nos enganou uma vez, e um `Ctrl+P` direto não espera por re-render:
 * com os dois presentes, o que sai no papel não depende de nada acontecer na hora certa.
 */
/**
 * A variação sobre a coluna anterior.
 *
 * **A cor julga o efeito no resultado, não o sinal do número** — ver `lerVariacao`. Até
 * 11/09/2026 esta célula pintava de vermelho tudo que fosse negativo, e com isso dizia que
 * devolução caindo era má notícia. A 9815 sempre fez o contrário, e é o comportamento dela
 * que vale aqui.
 *
 * O sinal continua no número: a cor diz se é bom, o sinal diz para onde foi. São duas
 * informações diferentes e a célula mostra as duas.
 */
function Variacao({
  percentual,
  valorDaLinha,
}: {
  percentual: number | null;
  /** O total da linha no período — é dele que sai o sentido. */
  valorDaLinha: number;
}) {
  if (percentual === null) {
    return <span className="text-[var(--text-muted)]">—</span>;
  }

  const leitura = lerVariacao(percentual, valorDaLinha);

  return (
    <span
      // A frase existe para quem não distingue as cores: o sinal do número mostra a
      // direção, nunca o juízo, e sem ela `(9,778)` lido em cinza diz o oposto do que a
      // célula quer dizer.
      title={descreverVariacao(leitura)}
      className={
        leitura === "favoravel"
          ? "text-[var(--positive)]"
          : leitura === "desfavoravel"
            ? "text-[var(--negative)]"
            : "text-[var(--text-muted)]"
      }
    >
      {percentual > 0 ? "+" : ""}
      <span className="so-na-tela">{formatarPercentual(percentual)}</span>
      <span className="so-no-papel">{formatarPercentual(percentual, 1)}</span>
    </span>
  );
}

/**
 * A 9815 escreve `NÃO SOMA` nestas linhas. Aqui elas são marcadas como **informativo**:
 * diz a mesma coisa pelo lado do que a linha é, e não pelo que ela deixa de fazer.
 * O cadastro e a regra continuam idênticos — muda só a palavra na tela.
 */
/**
 * O selo das linhas que não somam.
 *
 * **Duas grafias, e a tela escolhe.** Em celular a palavra inteira ocupava mais que o nome
 * que ela qualifica: numa coluna de 188px, `(-) ST` era empurrado para duas linhas com o
 * selo no meio. `INFO` diz o mesmo em quatro letras, e o `title` guarda a frase completa
 * para quem passar o ponteiro ou usar leitor de tela.
 *
 * O texto acessível é sempre o longo — quem ouve a tela não deve receber a abreviação.
 */
function SeloInformativo() {
  return (
    <span
      title="Informativo — esta linha não entra nos totalizadores"
      className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--warning-glow)] px-1.5 py-0.5 text-[length:var(--fs-rotulo)] font-semibold tracking-[0.1em] text-[var(--warning)] uppercase"
    >
      <span className="sr-only">Informativo</span>
      <span aria-hidden className="selo-longo">
        Informativo
      </span>
      <span aria-hidden className="selo-curto">
        Info
      </span>
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

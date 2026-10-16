import {
  INTEIRO,
  MOEDA,
  PERCENTUAL_2,
  baixar,
  data,
  gerarPlanilha,
  nomeSeguro,
  num,
  txt,
  type Celula,
  type Estilo,
  type Planilha,
} from "@/lib/excel";
import { colunaDoTotal, nomeDaLinha, rotuloDaColuna, rotuloNaTela } from "@/lib/colunaDoTotal";
import { temRateio, valorNoDre } from "@/lib/rateioDoDetalhe";
import { semEstornosQueSeAnulam } from "@/lib/estornosQueSeAnulam";
import { semBaixasEstornadas } from "@/lib/baixasEstornadas";
import type { DetalheCliente, Detalhamento } from "@/types/dre-gerencial";

/**
 * O detalhamento em `.xlsx` — uma matriz por tela.
 *
 * ## Duas diferenças em relação à tela, e as duas de propósito
 *
 * **Código e nome em colunas separadas.** Na tela os dois moram na mesma célula, porque
 * duas colunas fixas teriam que concordar até o pixel sobre onde uma termina. Em planilha
 * isso se inverte: quem vai cruzar com outra planilha precisa do código sozinho, e
 * `100 ARROZ 5KG` numa célula só obriga a fórmula de texto para separar.
 *
 * **Centro de custo e conta viram colunas, nos lançamentos.** Na tela eles são linhas de
 * grupo — hierarquia visual, como a 9815 faz. Planilha quer dado tabular: com as duas
 * repetidas em cada linha, uma tabela dinâmica reagrupa sozinha, e o subtotal que a tela
 * desenha o Excel calcula.
 *
 * **A coluna que fecha o total leva o nome da linha do DRE**, como na tela: `(ST) Líquido`.
 * Ver `lib/colunaDoTotal.ts` e a §16.4 — quem abre a planilha depois não tem o cabeçalho
 * da tela do lado para lembrar qual das colunas de dinheiro é a que bate com o DRE.
 */

export interface DetalheParaExportar {
  titulo: string;
  periodo: { dataInicio: string; dataFim: string };
  linha: { descricao: string; valor: number };
  dados: Detalhamento;
  /**
   * O checkbox "Ocultar baixas estornadas e da rotina 737" no momento da exportação — o
   * arquivo conta o que a tela conta. Ausente vale `true`, o padrão da tela.
   */
  ocultarBaixas?: boolean;
}

/** Cabeçalho onde a coluna do total se anuncia — igual ao `ThNum` da tela. */
function cabecalho(rotulos: string[], coluna: string | null, nome: string | null): Celula[] {
  return rotulos.map((r) => txt(r === coluna ? rotuloDaColuna(r, nome) : r));
}

interface Corpo {
  rotulos: string[];
  larguras: number[];
  linhas: Celula[][];
}

/**
 * O `% part.` de uma linha, dado o total da tela.
 *
 * Nulo quando o total é zero — percentual de zero é indefinido, e escrever 0 numa planilha
 * que alguém vai somar é pior do que deixar a célula vazia.
 */
const parteDe = (valor: number, total: number) =>
  total !== 0 ? (valor / total) * 100 : null;

function corpoDoDetalhe(
  dados: Detalhamento,
  nomeDaLinhaDoDre: string | null,
  ocultarBaixas = true,
): Corpo {
  if (dados.tipo === "receita-por-cliente") {
    // A MESMA base da tela: a coluna que fecha o total da linha do DRE. Cinco colunas de
    // dinheiro dariam cinco percentuais, e a planilha tem de responder à mesma pergunta
    // que a tela respondeu — senão os dois números discordam sem que nada esteja errado.
    const base = colunaDoTotal("receita-por-cliente", nomeDaLinhaDoDre);
    const valorBase: Record<string, (c: DetalheCliente) => number> = {
      "Receita bruta": (c) => c.receitaBruta,
      Desconto: (c) => c.desconto,
      Devolução: (c) => c.devolucao,
      "Custo líq.": (c) => c.custoLiq,
      "Receita líq.": (c) => c.receitaLiquida,
    };
    const ler = base ? valorBase[base] : undefined;
    const clientes = dados.clientes ?? [];
    const total = ler ? clientes.reduce((t, c) => t + ler(c), 0) : 0;

    return {
      rotulos: [
        "Código",
        "Cliente",
        "Cidade",
        "Notas",
        "Receita bruta",
        "Desconto",
        "Devolução",
        "Custo líq.",
        "Receita líq.",
        ...(ler ? ["% part."] : []),
      ],
      larguras: [10, 42, 22, 8, 16, 16, 16, 16, 16, ...(ler ? [10] : [])],
      linhas: (dados.clientes ?? []).map((c) => [
        num(c.codCli, INTEIRO),
        txt(c.cliente),
        txt(c.cidade),
        num(c.qdeNf, INTEIRO),
        num(c.receitaBruta),
        num(c.desconto),
        num(c.devolucao),
        num(c.custoLiq),
        num(c.receitaLiquida),
        ...(ler ? [num(parteDe(ler(c), total), PERCENTUAL_2)] : []),
      ]),
    };
  }

  if (dados.tipo === "devolucao-por-motivo") {
    return {
      rotulos: ["Código", "Motivo", "Culpa RCA", "Notas", "Devolução", "% part."],
      larguras: [10, 42, 12, 8, 16, 10],
      linhas: (dados.motivos ?? []).map((m) => [
        txt(m.codMotivo),
        txt(m.motivo ?? "Sem motivo cadastrado"),
        // `S`/`N` viram palavra: numa planilha sem legenda ao lado, a letra não se explica.
        txt(m.culpaRca === "S" ? "Sim" : m.culpaRca === "N" ? "Não" : null),
        num(m.qdeNf, INTEIRO),
        num(m.vlDevolucao),
        num(m.pPart, PERCENTUAL_2),
      ]),
    };
  }

  if (dados.tipo === "notas-por-motivo") {
    return {
      rotulos: ["Nota", "Série", "Entrada", "Transação", "Cód. parceiro", "Parceiro", "Itens", "Devolução", "% part."],
      larguras: [12, 8, 12, 14, 14, 42, 8, 16, 10],
      linhas: (dados.notas ?? []).map((n) => [
        num(n.numNota, INTEIRO),
        txt(n.serie),
        txt(n.dtEnt ? n.dtEnt.slice(0, 10).split("-").reverse().join("/") : null),
        // A transação vira COLUNA na planilha, ao contrário da tela — quem exporta está
        // levando o dado para cruzar com outro sistema, e ali a chave real importa mais
        // do que a largura da coluna.
        num(n.numTransEnt, INTEIRO),
        // O código pode ser de CLIENTE (o do pedido) ou de FORNECEDOR (o da nota, quando
        // não há pedido vinculado) — a mesma ordem de preferência do nome ao lado. Vai só
        // na planilha, e não na tela, porque quem exporta está cruzando com outro sistema
        // e ali a ambiguidade se resolve olhando o nome.
        num(n.codParceiro, INTEIRO),
        txt(n.parceiro ?? "Sem parceiro identificado"),
        num(n.itens, INTEIRO),
        num(n.vlDevolucao),
        num(n.pPart, PERCENTUAL_2),
      ]),
    };
  }

  if (dados.tipo === "imposto-por-produto") {
    return {
      rotulos: ["Código", "Produto", "Notas", "Vendas", "Devoluções", "Líquido", "% part."],
      larguras: [10, 46, 8, 16, 16, 16, 10],
      linhas: (dados.impostos ?? []).map((i) => [
        num(i.codProd, INTEIRO),
        txt(i.produto ?? "Sem descrição"),
        num(i.qdeNf, INTEIRO),
        num(i.vendas),
        num(i.devolucoes),
        num(i.liquido),
        num(i.pPart, PERCENTUAL_2),
      ]),
    };
  }

  const rateando = temRateio(dados);
  // Os títulos EM ABERTO (célula de Provisionado): o vencimento entra logo depois do
  // dinheiro, como na tela. Os dias de atraso não — mudam todo dia, e numa planilha
  // guardada viram um número velho; o Excel calcula a partir do vencimento se precisar.
  const aberto = dados.provisionado === true;

  return {
    // As 25 da 9815, na ordem dela, mais as duas do agrupamento que a tela desenha como
    // linhas de grupo.
    rotulos: [
      "Centro Custo Princ.",
      "Conta",
      "Rec.Num.",
      "Histórico",
      // "V. a Pagar" na lista dos títulos em aberto — ver `rotuloNaTela`.
      rotuloNaTela("V. Pago", aberto),
      // A coluna do rateio só existe quando a apuração foi filtrada — o arquivo conta a
      // mesma história da tela, inclusive em quantas colunas tem. Ver
      // `lib/rateioDoDetalhe.ts`.
      ...(rateando ? ["No DRE", "Exclusivo"] : []),
      ...(aberto ? ["Dt. Vencto."] : []),
      "Dt.Lançamento",
      "Dt. Pagto.",
      "Dt.Competência",
      "Dt.Compensação",
      "Filial",
      "Nota",
      "Prest.",
      "Cód.Fornec",
      "Fornecedor",
      "Func.Lanc",
      "Func. Baixa",
      "Índice",
      "Carreg.",
      "Num. Borderô",
      "Nro.Projeto",
      "Num. Trans",
      "Num. Banco",
      "Num. Cheque",
      "Num. Seq. Borderô",
      "Localização",
      "Dt. Reclass.",
      "Cod. Func. Reclass.",
    ],
    larguras: [
      28, 32, 10, 44, 16,
      ...(rateando ? [16, 11] : []),
      ...(aberto ? [14] : []),
      14, 14, 14, 14, 8, 12, 8, 12, 36, 20, 20, 10, 10, 14, 12, 12, 12,
      14, 16, 16, 14, 18,
    ],
    // O que a tela esconde, na mesma ordem — o arquivo e a tela têm de contar a mesma coisa
    // sobre a mesma consulta: as baixas estornadas e da 737 (se o checkbox estava marcado)
    // e os pares de estorno que se anulam.
    linhas: semEstornosQueSeAnulam(
      // Na lista em aberto o filtro não vale: título com baixa estornada é título REABERTO,
      // e é exatamente quem a lista existe para cobrar.
      semBaixasEstornadas(dados.lancamentos ?? [], ocultarBaixas && dados.provisionado !== true).visiveis,
    ).visiveis.map((l) => [
      txt(l.descCcPrinc),
      txt(l.conta),
      num(l.recNum, INTEIRO),
      txt(l.historico),
      num(l.vPago),
      ...(rateando
        ? [num(valorNoDre(l, dados.participacao)), txt(l.exclusivo ? "sim" : "")]
        : []),
      ...(aberto ? [data(l.dtVenc ?? null)] : []),
      data(l.dtLanc),
      data(l.dtPagto),
      data(l.dtCompetencia),
      data(l.dtCompensacao),
      txt(l.codFilial),
      txt(l.numNota),
      txt(l.duplic),
      txt(l.codFornec),
      txt(l.fornecedor),
      txt(l.nomeFunc),
      txt(l.nomeFuncBaixa),
      txt(l.indice),
      txt(l.numCar),
      txt(l.numBordero),
      txt(l.codProjeto),
      txt(l.numTrans),
      txt(l.numBanco),
      txt(l.numCheque),
      txt(l.numSeqBordero),
      txt(l.localizacao),
      data(l.dtReclassific),
      txt(l.codFuncReclassific),
    ]),
  };
}

export function planilhaDoDetalhe(detalhe: DetalheParaExportar): Planilha {
  const { rotulos, larguras, linhas } = corpoDoDetalhe(
    detalhe.dados,
    nomeDaLinha(detalhe.linha),
    detalhe.ocultarBaixas ?? true,
  );
  const nome = nomeDaLinha(detalhe.linha);
  // Traduzida como o rótulo, senão a coluna do total não se reconheceria no cabeçalho.
  const bruta = colunaDoTotal(detalhe.dados.tipo, nome);
  const coluna = bruta === null ? null : rotuloNaTela(bruta, detalhe.dados.provisionado === true);

  const titulos = cabecalho(rotulos, coluna, nome);
  return {
    aba: "Detalhamento",
    matriz: estilizarDetalhe(titulos, linhas, rotulos.indexOf(coluna ?? "")),
    larguras,
    // Uma linha de cabeçalho, e as duas primeiras colunas (código e nome) presas.
    congelar: { colunas: 2, linhas: 1 },
  };
}

/**
 * A paleta do papel — o tema CLARO de `globals.css`, opaca. A mesma do DRE (`exportarExcel.ts`).
 */
const COR = {
  texto: "#0F172A",
  apagado: "#64748B",
  positivo: "#047857",
  negativo: "#BE123C",
  /** `--primary`: a coluna que fecha o total da linha do DRE. */
  destaque: "#2563EB",
  cabecalho: "#F1F5F9",
  /** `--zebra` do tema claro (3% de tinta sobre o branco). */
  zebra: "#F8F9FA",
  divisor: "#E7E8EA",
  divisorForte: "#B6B9C0",
} as const;

/**
 * Pinta o detalhamento com as regras da TELA DO DETALHAMENTO (16/10/2026) — não as do DRE:
 * cabeçalho em negrito sobre cinza, a coluna que fecha o total em azul (como `ThNum`), linhas
 * zebradas, negativo vermelho e positivo na cor do texto, Culpa RCA "Sim" verde e "Não"
 * vermelho, o código apagado ao lado do nome (`Identidade`).
 *
 * Coluna numérica é a que traz formato numérico em alguma linha: a mesma informação que já
 * decide o formato decide o alinhamento, sem uma lista de nomes para manter.
 */
function estilizarDetalhe(titulos: Celula[], linhas: Celula[][], colunaDoTotal: number): Celula[][] {
  const numerica = titulos.map((_, col) => linhas.some((l) => l[col]?.z !== undefined));
  const rotulo = (col: number) => titulos[col]?.v;
  const codigo = (col: number) => rotulo(col) === "Código";
  const culpa = (col: number) => rotulo(col) === "Culpa RCA";
  const fina = (cor: string) => ({ peso: "fina" as const, cor });

  const cabecalho = titulos.map((c, col): Celula => ({
    ...c,
    s: {
      negrito: true,
      cor: col === colunaDoTotal ? COR.destaque : COR.texto,
      fundo: COR.cabecalho,
      tamanho: 9,
      alinhar: numerica[col] ? "direita" : "esquerda",
      quebrar: true,
      borda: { baixo: fina(COR.divisorForte) },
    } satisfies Estilo,
  }));

  const corpo = linhas.map((celulas, i) =>
    celulas.map((c, col): Celula => {
      const valor = typeof c.v === "number" ? c.v : null;
      let cor: string = COR.texto;
      if (codigo(col)) cor = COR.apagado;
      else if (culpa(col)) cor = c.v === "Sim" ? COR.positivo : c.v === "Não" ? COR.negativo : COR.apagado;
      else if (numerica[col] && valor !== null && valor < 0) cor = COR.negativo;
      return {
        ...c,
        s: {
          cor,
          // Zebra nas linhas ímpares do corpo, como `odd:bg-[var(--zebra)]` na tela.
          fundo: i % 2 === 0 ? COR.zebra : undefined,
          alinhar: numerica[col] ? "direita" : "esquerda",
          borda: { baixo: fina(COR.divisor) },
        },
      };
    }),
  );

  return [cabecalho, ...corpo];
}

/**
 * `Detalhe (-) ST — Agosto-2026 2026-08-01 a 2026-08-27`
 *
 * O título já carrega a linha e o mês; as datas do recorte entram porque agosto pode ser
 * `01/08 a 27/08`, e dois arquivos do "mesmo agosto" com períodos diferentes se
 * sobrescreveriam na pasta de downloads.
 */
export function nomeDoArquivoDetalhe(detalhe: DetalheParaExportar): string {
  // A barra vira hífen ANTES da limpeza, senão `Setembro/2026` sai `Setembro2026`: o
  // `nomeSeguro` remove a barra, que é proibida em nome de arquivo, e o mês perde o
  // separador. Medido na exportação real de 09/09/2026.
  const titulo = nomeSeguro(detalhe.titulo.replace(/\//g, "-"));
  return `Detalhe ${titulo} ${detalhe.periodo.dataInicio} a ${detalhe.periodo.dataFim}`;
}

export async function exportarDetalhe(detalhe: DetalheParaExportar): Promise<void> {
  const blob = await gerarPlanilha([planilhaDoDetalhe(detalhe)]);
  baixar(blob, `${nomeDoArquivoDetalhe(detalhe)}.xlsx`);
}

/** Só a geração, para conferir sem baixar. */
export const gerarDetalhe = (detalhe: DetalheParaExportar) =>
  gerarPlanilha([planilhaDoDetalhe(detalhe)]);

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
  type Planilha,
} from "@/lib/excel";
import { colunaDoTotal, nomeDaLinha, rotuloDaColuna } from "@/lib/colunaDoTotal";
import { semEstornosQueSeAnulam } from "@/lib/estornosQueSeAnulam";
import type { Detalhamento } from "@/types/dre-gerencial";

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

function corpoDoDetalhe(dados: Detalhamento): Corpo {
  if (dados.tipo === "receita-por-cliente") {
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
      ],
      larguras: [10, 42, 22, 8, 16, 16, 16, 16, 16],
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

  return {
    // As 25 da 9815, na ordem dela, mais as duas do agrupamento que a tela desenha como
    // linhas de grupo.
    rotulos: [
      "Centro Custo Princ.",
      "Conta",
      "Rec.Num.",
      "Histórico",
      "V. Pago",
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
      28, 32, 10, 44, 16, 14, 14, 14, 14, 8, 12, 8, 12, 36, 20, 20, 10, 10, 14, 12, 12, 12,
      14, 16, 16, 14, 18,
    ],
    // Os mesmos pares de estorno que a tela esconde — o arquivo e a tela têm de contar a
    // mesma coisa sobre a mesma consulta. A soma não muda: par oposto no mesmo grupo é zero.
    linhas: semEstornosQueSeAnulam(dados.lancamentos ?? []).visiveis.map((l) => [
      txt(l.descCcPrinc),
      txt(l.conta),
      num(l.recNum, INTEIRO),
      txt(l.historico),
      num(l.vPago),
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
  const { rotulos, larguras, linhas } = corpoDoDetalhe(detalhe.dados);
  const nome = nomeDaLinha(detalhe.linha);
  const coluna = colunaDoTotal(detalhe.dados.tipo, nome);

  return {
    aba: "Detalhamento",
    matriz: [cabecalho(rotulos, coluna, nome), ...linhas],
    larguras,
    // Uma linha de cabeçalho, e as duas primeiras colunas (código e nome) presas.
    congelar: { colunas: 2, linhas: 1 },
  };
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

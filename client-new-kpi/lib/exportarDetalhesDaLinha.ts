import { baixar, gerarPlanilha, nomeSeguro, type Planilha } from "@/lib/excel";
import { nomeDoArquivoDetalhe, planilhaDoDetalhe } from "@/lib/exportarExcelDetalhe";
import { criarZip, type ArquivoDoZip } from "@/lib/zip";
import { planilhaDaComposicao, type Parcela } from "@/lib/composicaoDoTotal";
import { exigirMesmaBase } from "@/lib/baseDaResposta";
import {
  lerNdjson,
  NOME_DO_LEIA,
  pedirLote,
  textoDoLeia,
  type PedidoDoLote,
} from "@/lib/loteDeDetalhe";
import { ApiError } from "@/services/apiClient";
import type { TipoDetalhe } from "@/types/dre-gerencial";

/**
 * "Exportar todo o detalhamento" — o botão direito numa linha (16/10/2026) e as linhas
 * selecionadas (06/11/2026). Um Excel por linha × coluna, o MESMO que o duplo clique na célula
 * exportaria (`planilhaDoDetalhe`), todos num `.zip`.
 *
 * **Em lote, desde 06/11/2026** (pedido do Gabriel): as contas saem de UM pedido à API, em
 * fluxo NDJSON (`lib/loteDeDetalhe.ts`), que consulta o banco uma vez por bloco × coluna — e
 * não uma vez por linha × coluna. Cada Excel é gerado assim que a parte dele chega.
 *
 * **Zip parcial:** o que falhou no servidor, ou não chegou porque a conexão caiu, entra no
 * `LEIA - arquivos que faltaram.txt`, e o resto é baixado.
 */

export interface ColunaParaExportar {
  rotulo: string;
  dataInicio: string;
  dataFim: string;
  /** O valor da célula: é contra ele que o detalhamento se confere. */
  valor?: number;
  /** A chave da coluna no DRE — a composição de um totalizador é lida por ela. */
  mesAno?: string;
}

const tituloDe = (descricao: string, coluna: ColunaParaExportar) =>
  `${descricao} · ${coluna.rotulo}`;

const periodoDe = (c: ColunaParaExportar) => ({ dataInicio: c.dataInicio, dataFim: c.dataFim });

/**
 * Os nomes dos arquivos dentro do zip, os mesmos do Excel do detalhamento. As datas entram no
 * nome: no comparativo dois "Agosto" de anos diferentes se sobrescreveriam.
 */
export function nomesDosArquivos(descricao: string, colunas: readonly ColunaParaExportar[]): string[] {
  return colunas.map(
    (c) =>
      `${nomeDoArquivoDetalhe({
        titulo: tituloDe(descricao, c),
        periodo: periodoDe(c),
      })}.xlsx`,
  );
}

/**
 * A composição de um TOTALIZADOR numa coluna — o que entra no lugar da consulta quando a
 * linha não tem lançamentos próprios (06/11/2026). Ver `composicaoDaLinha`.
 */
export type ComposicaoDaColuna = (coluna: ColunaParaExportar) => {
  total: number;
  parcelas: readonly Parcela[];
};

/** O zip do botão direito: uma linha, todas as colunas. */
export function nomeDoZipDaLinha(descricao: string, colunas: readonly ColunaParaExportar[]): string {
  const inicio = colunas[0]?.dataInicio ?? "";
  const fim = colunas.at(-1)?.dataFim ?? "";
  return `${nomeSeguro(`Detalhe ${descricao} ${inicio} a ${fim}`)}.zip`;
}

/** `2026-09-01` → `01-09-2026`: o dia primeiro, como a pessoa lê, e sem barra. */
const dataNoNome = (iso: string) => iso.split("-").reverse().join("-");

/**
 * O nome do zip das LINHAS SELECIONADAS (06/11/2026, pedido do Gabriel): a empresa, a filial
 * e o período — `Época Distribuição - Filial 25 - 01-09-2026 a 30-09-2026.zip`. É o que
 * distingue um arquivo do outro na pasta de downloads, onde as contas não aparecem.
 */
export function nomeDoZipDaSelecao({
  empresa,
  filiais,
  dataInicio,
  dataFim,
}: {
  empresa: string;
  filiais: readonly string[];
  dataInicio: string;
  dataFim: string;
}): string {
  const quem = filiais.length === 1 ? `Filial ${filiais[0]}` : `Filiais ${filiais.join(", ")}`;
  return `${nomeSeguro(`${empresa} - ${quem} - ${dataNoNome(dataInicio)} a ${dataNoNome(dataFim)}`)}.zip`;
}

/** Uma linha a exportar: o nome e as colunas. */
export interface LinhaParaExportar {
  descricao: string;
  colunas: readonly ColunaParaExportar[];
}

/**
 * Os caminhos dentro do zip das linhas selecionadas: UMA PASTA POR LINHA, com a posição na
 * tela na frente — `01 FINANCEIRO/Detalhe FINANCEIRO · Setembro-2026 ….xlsx`. A posição não
 * é enfeite: o DRE repete nomes (`Despesas Adm e Vendas` aparece três vezes), e sem ela duas
 * linhas cairiam na mesma pasta com os mesmos arquivos, uma sobrescrevendo a outra. Dentro
 * da pasta, os mesmos arquivos do botão direito (`nomesDosArquivos`).
 */
export function caminhosNoZip(linhas: readonly LinhaParaExportar[]): string[][] {
  const digitos = String(linhas.length).length < 2 ? 2 : String(linhas.length).length;
  return linhas.map((linha, i) => {
    const pasta = `${String(i + 1).padStart(digitos, "0")} ${nomeSeguro(linha.descricao.replace(/\//g, "-"))}`;
    return nomesDosArquivos(linha.descricao, linha.colunas).map((arquivo) => `${pasta}/${arquivo}`);
  });
}

/** Uma linha a exportar: a CONTA leva o destino do detalhamento; o TOTALIZADOR, a composição. */
export interface LinhaParaExportarNoLote extends LinhaParaExportar {
  destino?: { tipo: TipoDetalhe; bloco: string | null; chave: string | null; sobra?: string[] | null };
  composicao?: ComposicaoDaColuna;
}

/**
 * EXPORTA linhas num zip (06/11/2026): os totalizadores pela composição, no navegador; as
 * contas por UM pedido em lote, em fluxo — cada Excel é gerado assim que a parte dele chega,
 * e os dados são descartados (10 meses de uma filial são ~104 mil lançamentos).
 *
 * **Zip parcial.** Parte que falhou no servidor, ou que não chegou porque a conexão caiu,
 * vira uma linha do `LEIA - arquivos que faltaram.txt`; o resto é baixado. Só não há zip
 * quando nada foi gerado, quando o servidor recusou o pedido antes de começar, ou quando a
 * pessoa CANCELOU (aí lança o `AbortError`).
 */
export async function exportarLinhas({
  linhas,
  caminhos,
  nomeDoZip,
  filtro,
  ocultarBaixas,
  baseDaSessao,
  signal,
  onProgresso,
}: {
  linhas: readonly LinhaParaExportarNoLote[];
  /** O caminho de cada arquivo no zip: `caminhos[linha][coluna]`. */
  caminhos: readonly (readonly string[])[];
  nomeDoZip: string;
  filtro: Omit<PedidoDoLote, "colunas" | "linhas">;
  /** O checkbox de baixas estornadas, como a tela está: o arquivo conta o que a tela conta. */
  ocultarBaixas: boolean;
  baseDaSessao: string | undefined;
  signal: AbortSignal;
  onProgresso?: (p: { feitos: number; total: number; agora: string }) => void;
}): Promise<{ arquivos: number; faltando: number }> {
  const arquivos: ArquivoDoZip[] = [];
  const faltas: { caminho: string; motivo: string }[] = [];
  const total = linhas.reduce((soma, l) => soma + l.colunas.length, 0);
  let feitos = 0;
  const avisar = (agora: string) => onProgresso?.({ feitos, total, agora });

  async function adicionar(nome: string, planilha: Planilha) {
    const blob = await gerarPlanilha([planilha]);
    arquivos.push({ nome, dados: new Uint8Array(await blob.arrayBuffer()) });
  }

  // 1. TOTALIZADORES — aritmética do que já está na tela, sem consulta.
  for (const [i, linha] of linhas.entries()) {
    if (!linha.composicao) continue;
    for (const [c, coluna] of linha.colunas.entries()) {
      await adicionar(
        caminhos[i]![c]!,
        planilhaDaComposicao({
          titulo: tituloDe(linha.descricao, coluna),
          periodo: periodoDe(coluna),
          ...linha.composicao(coluna),
        }),
      );
      feitos++;
      avisar(`${linha.descricao} · ${coluna.rotulo}`);
    }
  }

  // 2. CONTAS — um pedido em lote.
  const comConsulta = linhas.flatMap((l, i) => (l.destino ? [i] : []));
  if (comConsulta.length > 0) {
    const colunas = linhas[comConsulta[0]!]!.colunas;
    const recebidas = new Set<string>();
    let terminou = false;
    let interrompido: string | null = null;
    avisar("Consultando o banco…");

    try {
      const corpo = await pedirLote(
        {
          ...filtro,
          colunas: colunas.map(periodoDe),
          linhas: comConsulta.map((i) => ({ id: i, ...linhas[i]!.destino! })),
        },
        signal,
      );

      for await (const pacote of lerNdjson(corpo)) {
        if (pacote.t === "inicio") {
          exigirMesmaBase({ base: pacote.base }, baseDaSessao);
        } else if (pacote.t === "parte") {
          const linha = linhas[pacote.linha]!;
          const coluna = linha.colunas[pacote.coluna]!;
          await adicionar(
            caminhos[pacote.linha]![pacote.coluna]!,
            planilhaDoDetalhe({
              titulo: tituloDe(linha.descricao, coluna),
              periodo: periodoDe(coluna),
              linha: { descricao: linha.descricao, valor: coluna.valor ?? 0 },
              dados: pacote.dados,
              ocultarBaixas,
            }),
          );
          recebidas.add(`${pacote.linha}:${pacote.coluna}`);
          feitos++;
          avisar(`${linha.descricao} · ${coluna.rotulo}`);
        } else if (pacote.t === "falha") {
          for (const id of pacote.linhas) {
            faltas.push({ caminho: caminhos[id]![pacote.coluna]!, motivo: pacote.mensagem });
            recebidas.add(`${id}:${pacote.coluna}`);
            feitos++;
          }
          avisar(`${faltas.length} ${faltas.length === 1 ? "arquivo falhou" : "arquivos falharam"} até agora`);
        } else if (pacote.t === "erro") {
          interrompido = pacote.mensagem;
          break;
        } else if (pacote.t === "fim") {
          terminou = true;
          break;
        }
      }
    } catch (e) {
      if (signal.aborted) throw e;
      // Recusa ANTES de começar (pedido inválido, sessão, base trocada): não há zip a montar.
      if (e instanceof ApiError && e.status !== 0 && recebidas.size === 0) throw e;
      interrompido = e instanceof Error ? e.message : "A exportação foi interrompida.";
    }

    if (signal.aborted) throw new DOMException("Exportação cancelada.", "AbortError");
    if (!terminou && !interrompido) interrompido = "A conexão com o servidor caiu antes do fim.";

    if (interrompido) {
      for (const i of comConsulta) {
        for (const c of colunas.keys()) {
          if (!recebidas.has(`${i}:${c}`)) faltas.push({ caminho: caminhos[i]![c]!, motivo: interrompido });
        }
      }
      if (arquivos.length === 0) throw new Error(interrompido);
    }
  }

  if (faltas.length > 0) {
    arquivos.push({ nome: NOME_DO_LEIA, dados: new TextEncoder().encode(textoDoLeia(faltas)) });
  }
  baixar(criarZip(arquivos), nomeDoZip);
  return { arquivos: arquivos.length - (faltas.length > 0 ? 1 : 0), faltando: faltas.length };
}

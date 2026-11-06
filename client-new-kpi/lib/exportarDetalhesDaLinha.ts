import { baixar, gerarPlanilha, nomeSeguro } from "@/lib/excel";
import { nomeDoArquivoDetalhe, planilhaDoDetalhe } from "@/lib/exportarExcelDetalhe";
import { criarZip, type ArquivoDoZip } from "@/lib/zip";
import type { Detalhamento } from "@/types/dre-gerencial";

/**
 * "Exportar todo o detalhamento" de uma linha — o botão direito na descrição (16/10/2026).
 *
 * Um Excel por coluna apurada, cada um o MESMO arquivo que o duplo clique na célula daquele
 * mês exportaria (`planilhaDoDetalhe`), e todos num `.zip`. Quem apurou três meses de
 * COMPRAS - RAT recebe três planilhas com o nome de cada mês, sem abrir três detalhamentos.
 *
 * **Um mês por vez**, e não em paralelo: cada detalhe é uma varredura de PCLANC, e doze de uma
 * vez num modo anual disputariam o banco com a apuração de todo mundo. Mais lento, e o
 * progresso aparece mês a mês.
 */

export interface ColunaParaExportar {
  rotulo: string;
  dataInicio: string;
  dataFim: string;
  /** O valor da célula: é contra ele que o detalhamento se confere. */
  valor?: number;
}

const tituloDe = (descricao: string, coluna: ColunaParaExportar) =>
  `${descricao} · ${coluna.rotulo}`;

/**
 * Os nomes dos arquivos dentro do zip, os mesmos do Excel do detalhamento. As datas entram no
 * nome: no comparativo dois "Agosto" de anos diferentes se sobrescreveriam.
 */
export function nomesDosArquivos(descricao: string, colunas: readonly ColunaParaExportar[]): string[] {
  return colunas.map(
    (c) =>
      `${nomeDoArquivoDetalhe({
        titulo: tituloDe(descricao, c),
        periodo: { dataInicio: c.dataInicio, dataFim: c.dataFim },
      })}.xlsx`,
  );
}

/**
 * Os Excels de UMA linha — um por coluna apurada —, prontos para entrar num zip. É o miolo
 * das duas exportações: a de uma linha (botão direito) e a das linhas selecionadas.
 */
async function arquivosDaLinha({
  descricao,
  colunas,
  buscar,
  ocultarBaixas,
  nomes,
  aoTerminarColuna,
}: {
  descricao: string;
  colunas: readonly ColunaParaExportar[];
  buscar: (periodo: { dataInicio: string; dataFim: string }) => Promise<Detalhamento>;
  ocultarBaixas: boolean;
  /** O caminho de cada arquivo dentro do zip, na ordem das colunas. */
  nomes: readonly string[];
  aoTerminarColuna?: () => void;
}): Promise<ArquivoDoZip[]> {
  const arquivos: ArquivoDoZip[] = [];

  for (const [i, coluna] of colunas.entries()) {
    const periodo = { dataInicio: coluna.dataInicio, dataFim: coluna.dataFim };
    let dados: Detalhamento;
    try {
      dados = await buscar(periodo);
    } catch (e) {
      // Diz QUAL mês falhou: "falhou" sozinho faria a pessoa repetir os três.
      throw new Error(
        `${coluna.rotulo}: ${e instanceof Error ? e.message : "o detalhamento não respondeu"}`,
        { cause: e },
      );
    }

    const blob = await gerarPlanilha([
      planilhaDoDetalhe({
        titulo: tituloDe(descricao, coluna),
        periodo,
        linha: { descricao, valor: coluna.valor ?? 0 },
        dados,
        ocultarBaixas,
      }),
    ]);
    arquivos.push({ nome: nomes[i]!, dados: new Uint8Array(await blob.arrayBuffer()) });
    aoTerminarColuna?.();
  }

  return arquivos;
}

export async function exportarDetalhesDaLinha({
  descricao,
  colunas,
  buscar,
  ocultarBaixas,
  onProgresso,
}: {
  descricao: string;
  colunas: readonly ColunaParaExportar[];
  /** O detalhamento de um recorte — a mesma consulta do duplo clique. */
  buscar: (periodo: { dataInicio: string; dataFim: string }) => Promise<Detalhamento>;
  /** O checkbox de baixas estornadas, como a tela está: o arquivo conta o que a tela conta. */
  ocultarBaixas: boolean;
  onProgresso?: (feitos: number, total: number) => void;
}): Promise<void> {
  let feitos = 0;
  onProgresso?.(0, colunas.length);
  const arquivos = await arquivosDaLinha({
    descricao,
    colunas,
    buscar,
    ocultarBaixas,
    nomes: nomesDosArquivos(descricao, colunas),
    aoTerminarColuna: () => onProgresso?.(++feitos, colunas.length),
  });

  const inicio = colunas[0]?.dataInicio ?? "";
  const fim = colunas.at(-1)?.dataFim ?? "";
  baixar(criarZip(arquivos), `${nomeSeguro(`Detalhe ${descricao} ${inicio} a ${fim}`)}.zip`);
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

/** Uma linha a exportar: o nome e as colunas — o mesmo que o botão direito recebe. */
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

/**
 * "Exportar detalhamento" das LINHAS SELECIONADAS (06/11/2026, pedido do Gabriel): a mesma
 * lógica do botão direito — um Excel por coluna, o mesmo do duplo clique —, para todas as
 * linhas marcadas, num zip só (`caminhosNoZip`, `nomeDoZipDaSelecao`).
 *
 * **Uma consulta por vez**, como na de uma linha: dez contas em doze meses são 120
 * varreduras de PCLANC, e em paralelo disputariam o banco com a apuração de todo mundo.
 */
export async function exportarDetalhesDasLinhas({
  linhas,
  buscar,
  ocultarBaixas,
  nomeDoZip,
  onProgresso,
}: {
  linhas: readonly (LinhaParaExportar & {
    /** O detalhamento desta linha num recorte — a consulta do duplo clique. */
    buscar?: (periodo: { dataInicio: string; dataFim: string }) => Promise<Detalhamento>;
  })[];
  /** Usado quando a linha não traz o seu. */
  buscar?: (descricao: string, periodo: { dataInicio: string; dataFim: string }) => Promise<Detalhamento>;
  ocultarBaixas: boolean;
  nomeDoZip: string;
  /** `linha` é a conta em andamento — para a tela dizer qual está sendo exportada. */
  onProgresso?: (feitos: number, total: number, linha: string) => void;
}): Promise<void> {
  const caminhos = caminhosNoZip(linhas);
  const total = linhas.reduce((soma, l) => soma + l.colunas.length, 0);
  const arquivos: ArquivoDoZip[] = [];
  let feitos = 0;

  for (const [i, linha] of linhas.entries()) {
    onProgresso?.(feitos, total, linha.descricao);
    const daLinha = linha.buscar ?? ((periodo) => buscar!(linha.descricao, periodo));
    try {
      arquivos.push(
        ...(await arquivosDaLinha({
          descricao: linha.descricao,
          colunas: linha.colunas,
          buscar: daLinha,
          ocultarBaixas,
          nomes: caminhos[i]!,
          aoTerminarColuna: () => onProgresso?.(++feitos, total, linha.descricao),
        })),
      );
    } catch (e) {
      // Diz a CONTA, além do mês que a função de dentro já pôs na mensagem.
      throw new Error(`${linha.descricao} — ${e instanceof Error ? e.message : "falhou"}`, { cause: e });
    }
  }

  baixar(criarZip(arquivos), nomeDoZip);
}

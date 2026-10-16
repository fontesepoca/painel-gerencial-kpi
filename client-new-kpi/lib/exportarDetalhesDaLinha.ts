import { baixar, gerarPlanilha, nomeSeguro } from "@/lib/excel";
import { nomeDoArquivoDetalhe, planilhaDoDetalhe } from "@/lib/exportarExcelDetalhe";
import { criarZip } from "@/lib/zip";
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
  const nomes = nomesDosArquivos(descricao, colunas);
  const arquivos = [];

  for (const [i, coluna] of colunas.entries()) {
    onProgresso?.(i, colunas.length);
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
  }
  onProgresso?.(colunas.length, colunas.length);

  const inicio = colunas[0]?.dataInicio ?? "";
  const fim = colunas.at(-1)?.dataFim ?? "";
  baixar(criarZip(arquivos), `${nomeSeguro(`Detalhe ${descricao} ${inicio} a ${fim}`)}.zip`);
}

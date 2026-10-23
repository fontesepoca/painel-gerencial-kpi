/**
 * As FAIXAS da impressão do DRE (23/10/2026, pedido do Gabriel).
 *
 * Com doze meses a tabela inteira numa folha saía com os números a 7pt e não se lia nada.
 * Com mais de três meses o papel passa a sair em faixas de três — como se a apuração fosse
 * impressa de três em três meses, num arquivo só —, cada faixa com todas as linhas do DRE e
 * começando numa página nova. O bloco Total vai numa faixa PRÓPRIA, no fim (decisão do
 * Gabriel: "os totalizadores que ficam na última coluna devem aparecer nas últimas páginas").
 *
 * Três meses é o que já sai legível numa folha: medido em 15/10/2026, três meses com
 * Provisionado e sem o Total saem a ~11,5pt.
 */

/** Meses por faixa. */
export const MESES_POR_FAIXA = 3;

export interface FaixaDeMeses {
  /** Índice do primeiro mês da faixa, na lista de períodos da apuração. */
  inicio: number;
  /** Índice depois do último — o intervalo é `[inicio, fim)`. */
  fim: number;
}

/**
 * As faixas de meses de uma apuração com `meses` colunas, ou `null` quando a impressão não
 * se divide — até três meses ela continua sendo uma tabela só, como sempre foi.
 *
 * A última faixa pode ter menos de três meses (dez meses = 3 + 3 + 3 + 1): ela não "rouba"
 * meses da anterior para ficar cheia, porque cada faixa é lida como um trecho contínuo do
 * calendário, e trechos de tamanhos iguais até o fim são o que o olho espera.
 */
export function faixasDaImpressao(meses: number, porFaixa = MESES_POR_FAIXA): FaixaDeMeses[] | null {
  if (!Number.isInteger(meses) || meses <= porFaixa || porFaixa < 1) return null;

  const faixas: FaixaDeMeses[] = [];
  for (let inicio = 0; inicio < meses; inicio += porFaixa) {
    faixas.push({ inicio, fim: Math.min(inicio + porFaixa, meses) });
  }
  return faixas;
}

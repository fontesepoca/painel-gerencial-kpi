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

/**
 * O TRIMESTRE DO CALENDÁRIO de uma faixa (29/10/2026, pedido do Gabriel): vai no alto de cada
 * folha, ao lado de "Coluna · Folha", para quem monta a mesa saber de que trimestre é a folha
 * sem procurar o título da parte.
 *
 * Do CALENDÁRIO, e não "1º, 2º, 3º" da ordem das faixas: a apuração que começa em fevereiro
 * tem faixas fev–abr, mai–jul…, e chamar fev–abr de "1º trimestre" diria um trimestre que
 * não é o de ninguém. Faixa que atravessa dois trimestres diz os dois.
 *
 * Recebe as chaves das colunas (`PeriodoDre.mesAno`). Só o modo mensal tem chave `MM/AAAA`;
 * por ano e no comparativo a coluna não é um mês, e não há trimestre — `null`.
 */
export function trimestreDaFaixa(chaves: readonly string[]): string | null {
  const trimestres: { ano: string; numero: number }[] = [];

  for (const chave of chaves) {
    const mes = /^(\d{2})\/(\d{4})$/.exec(chave);
    if (!mes) return null;
    const numero = Math.ceil(Number(mes[1]) / 3);
    const ano = mes[2]!;
    if (!trimestres.some((t) => t.ano === ano && t.numero === numero)) trimestres.push({ ano, numero });
  }
  if (trimestres.length === 0) return null;

  const porAno = new Map<string, number[]>();
  for (const { ano, numero } of trimestres) porAno.set(ano, [...(porAno.get(ano) ?? []), numero]);

  return [...porAno]
    .map(([ano, numeros]) =>
      numeros.length === 1
        ? `${numeros[0]}º trimestre de ${ano}`
        : `${numeros.map((n) => `${n}º`).join(" e ")} trimestres de ${ano}`,
    )
    .join(" e ");
}

/**
 * As faixas que o PAPEL usa — `faixasDaImpressao`, mais o caso de 2 e 3 meses com Total.
 *
 * O TOTAL NAS ÚLTIMAS PÁGINAS SEMPRE QUE EXISTE (29/10/2026, pedido do Gabriel). Até 3 meses
 * a impressão era uma tabela só, com o Total ao lado; com Provisionado, ago–out e o Total
 * numa folha saíam com os números ilegíveis. Agora, havendo coluna Total, os meses formam
 * uma parte (uma faixa só, que cabe) e o Total outra, no fim — "semelhante a quando apuramos
 * o ano inteiro". Sem a coluna Total, até 3 meses continua uma tabela só: não há o que
 * separar.
 */
export function faixasDoPapel(meses: number, comTotal: boolean): FaixaDeMeses[] | null {
  const faixas = faixasDaImpressao(meses);
  if (faixas !== null) return faixas;
  return comTotal && Number.isInteger(meses) && meses > 1 ? [{ inicio: 0, fim: meses }] : null;
}

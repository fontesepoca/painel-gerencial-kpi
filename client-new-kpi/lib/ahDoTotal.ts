import type { ValorMes } from "@/types/dre-gerencial";

/**
 * A soma dos `%AH` de uma linha — a coluna `AH %` do bloco de total.
 *
 * <b>Soma aritmética, decidida pelo Gabriel em 06/10/2026</b>, e a escolha foi informada:
 * com uma conta que vai de 100 para 150 e depois para 120, os `%AH` das colunas são `0%`,
 * `+50%` e `−20%`, e esta coluna mostra **+30%**. A conta, de fato, variou **+20%** no
 * período — `120 ÷ 100 − 1` —, que é o que o produto dos fatores daria.
 *
 * <b>Então a coluna responde "quanto somam os percentuais que estão na tela", e não "quanto
 * a conta variou no período".</b> São perguntas diferentes, e esta é a que foi pedida: o
 * número é conferível de olho, somando a linha. Quem precisar da variação do período tem a
 * coluna `Δ %` dos modos de comparação, que faz exatamente a outra conta.
 *
 * <b>Nulo é ausência, não zero.</b> `CalcularAh` devolve `null` quando a coluna anterior é
 * zero — ali não existe proporção que descreva a mudança, e somar zero no lugar afirmaria
 * uma estabilidade que ninguém mediu. Com todas as colunas nulas o resultado é `null`, e a
 * célula fica vazia.
 *
 * <b>A primeira coluna entra como `0`</b>, que é o que a API manda: ela não tem anterior, e
 * é assim que a tela já a mostra desde sempre.
 */
export function somaDosAh(valores: readonly ValorMes[]): number | null {
  let soma = 0;
  let algum = false;

  for (const v of valores) {
    if (v.percentualAh === null) continue;
    soma += v.percentualAh;
    algum = true;
  }

  return algum ? soma : null;
}

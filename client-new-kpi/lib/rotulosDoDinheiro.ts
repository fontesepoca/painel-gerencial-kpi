/**
 * Os nomes das colunas de dinheiro da tabela do DRE — um lugar só, para a tela e o Excel
 * nunca chamarem a mesma coluna de dois jeitos.
 *
 * <b>Em competência</b> (pedido do Gabriel em 14/10/2026) o valor de sempre é o
 * <b>Vl. Realizado</b> — o que já foi pago —, ao lado do <b>Vl. Provisionado</b> (os títulos
 * em aberto) e do <b>Total (R + P)</b>, que é a soma dos dois. "Valor" ao lado de
 * "Provisionado" deixava ambíguo de qual dos dois se tratava, e "Total" se confundia com o
 * bloco Total do período.
 *
 * <b>Em caixa</b> não existe provisionado, e a coluna continua "Valor", como sempre foi.
 */
export interface RotulosDoDinheiro {
  valor: string;
  provisionado: string;
  total: string;
}

export function rotulosDoDinheiro(regime: string | null | undefined): RotulosDoDinheiro {
  return regime === "competencia"
    ? { valor: "Vl. Realizado", provisionado: "Vl. Provisionado", total: "Total (R + P)" }
    : { valor: "Valor", provisionado: "Vl. Provisionado", total: "Total (R + P)" };
}

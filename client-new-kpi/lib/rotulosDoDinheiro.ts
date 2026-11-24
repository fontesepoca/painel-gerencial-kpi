/**
 * Os nomes das colunas de dinheiro da tabela do DRE — um lugar só, para a tela e o Excel
 * nunca chamarem a mesma coluna de dois jeitos.
 *
 * <b>Em competência</b> (pedido do Gabriel em 14/10/2026; "Vl. Provisionado" voltou a ser só
 * "Provisionado" no mesmo dia, por ocupar demais o cabeçalho) o valor de sempre é o
 * <b>Vl. Realizado</b> — o que já foi pago —, ao lado do <b>Provisionado</b> (os títulos
 * em aberto) e do <b>Total (R + P)</b>, que é a soma dos dois. "Valor" ao lado de
 * "Provisionado" deixava ambíguo de qual dos dois se tratava, e "Total" se confundia com o
 * bloco Total do período.
 *
 * <b>Em caixa</b> não existe provisionado, e a coluna continua "Valor", como sempre foi.
 */
export interface RotulosDoDinheiro {
  valor: string;
  /** A parte do realizado ainda não paga, com TIPOLANC = 'C' (checkbox "Confirmados", 24/11/2026). */
  confirmado: string;
  provisionado: string;
  /**
   * O Total de quando só o Provisionado está ligado. Com o Vl. Confirmado na tela o nome muda
   * para dizer o que soma — ver `rotuloDoTotal` em `lib/confirmados.ts`.
   */
  total: string;
}

export function rotulosDoDinheiro(regime: string | null | undefined): RotulosDoDinheiro {
  return regime === "competencia"
    ? { valor: "Vl. Realizado", confirmado: "Vl. Confirmado", provisionado: "Provisionado", total: "Total (R + P)" }
    : { valor: "Valor", confirmado: "Vl. Confirmado", provisionado: "Provisionado", total: "Total (R + P)" };
}

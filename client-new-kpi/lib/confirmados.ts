/**
 * As colunas de dinheiro de uma célula do DRE com o checkbox "Confirmados" — pedido do Gabriel
 * em 24/11/2026, divergência 23.
 *
 * <b>O que a API manda.</b> Em competência, o `valor` de sempre é o pago MAIS o título não pago
 * com `TIPOLANC = 'C'` (confirmado) — a divergência 20, de 22/10/2026. Ao lado, o `confirmado`
 * diz quanto desse valor é confirmado. Não é um valor a mais: é uma parte do `valor`.
 *
 * <b>O que a tela faz com isso.</b> Desmarcado, nada muda. Marcado, o Vl. Realizado passa a ser
 * só o pago (`valor − confirmado`, o número da 9815) e o Vl. Confirmado ganha coluna própria. O
 * Total soma o que estiver na tela: R + C, ou R + C + P com o Provisionado ligado — e é sempre o
 * mesmo número que o Vl. Realizado (ou o Total R + P) mostrava antes de marcar.
 *
 * Um lugar só, para a tabela e o Excel não terem como desenhar a mesma célula de dois jeitos.
 * Sem importações de propósito: a dc111 testa este arquivo direto no Node.
 */

/** As colunas de dinheiro de um mês, na ordem da tela: o dinheiro junto, a análise depois. */
export type ColunaDoDinheiro = "valor" | "confirmado" | "provisionado" | "total";

export function colunasDoDinheiro(comConfirmado: boolean, comProvisionado: boolean): ColunaDoDinheiro[] {
  const colunas: ColunaDoDinheiro[] = ["valor"];
  if (comConfirmado) colunas.push("confirmado");
  if (comProvisionado) colunas.push("provisionado");
  if (comConfirmado || comProvisionado) colunas.push("total");
  return colunas;
}

/** O nome do Total: diz quais parcelas ele soma, porque ele muda com os checkboxes. */
export function rotuloDoTotal(comConfirmado: boolean, comProvisionado: boolean): string {
  if (comConfirmado && comProvisionado) return "Total (R + C + P)";
  if (comConfirmado) return "Total (R + C)";
  return "Total (R + P)";
}

export interface PartesDaCelula {
  /** O que vai na coluna Vl. Realizado: só o pago com Confirmados ligado; o valor inteiro sem. */
  realizado: number;
  /** Nulo quando a coluna não aparece ou a linha não tem confirmado (receita, CMV): traço. */
  confirmado: number | null;
  /** Nulo quando a coluna não aparece ou a linha não tem provisionado: traço. */
  provisionado: number | null;
  /** Nulo quando nenhuma das parcelas se aplica à linha (receita, CMV, LUCRO BRUTO): traço. */
  total: number | null;
}

/** Dinheiro com duas casas: a subtração de dois valores em reais não pode deixar resíduo. */
const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * As parcelas de uma célula. `valor`, `confirmado` e `provisionado` são os da API, sem mexer.
 *
 * O Total é sempre `valor + provisionado`: o `valor` já tem o confirmado dentro. É por isso que,
 * com os dois ligados, ele bate com o Total (R + P) de antes de marcar o checkbox.
 */
export function partesDaCelula(
  valor: number,
  confirmado: number | null | undefined,
  provisionado: number | null | undefined,
  comConfirmado: boolean,
  comProvisionado: boolean,
): PartesDaCelula {
  const c = comConfirmado ? (confirmado ?? null) : null;
  const p = comProvisionado ? (provisionado ?? null) : null;

  return {
    realizado: c === null ? valor : centavos(valor - c),
    confirmado: c,
    provisionado: p,
    total: c === null && p === null ? null : centavos(valor + (p ?? 0)),
  };
}

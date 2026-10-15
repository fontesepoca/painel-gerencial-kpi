import type { LinhaDre } from "@/types/dre-gerencial";

/**
 * Os %AV e %AH de uma linha sobre **R + P** (Vl. Realizado + Provisionado) — pedido do
 * Gabriel em 14/10/2026, opção 1: valem só com o Provisionado LIGADO. Desligado, a linha
 * volta aos percentuais de sempre, sobre o Realizado, fiéis à 9815.
 *
 * Quem calcula é o servidor (`MontadorDre`), com as mesmas regras de base, arredondamento e
 * base zero dos percentuais de sempre; aqui só se escolhe qual mostrar. Um lugar só, para a
 * tela e o Excel nunca discordarem sobre de qual campo saiu cada célula.
 *
 * Vale também para as linhas calculadas: os totalizadores que somam despesa têm P (SUBTOTAL
 * POSITIVO, Sub-Total, RESULTADO OPERACIONAL, LUCRO LIQUIDO), e é por isso que o %AV R + P do
 * Sub-Total bate com o das contas. Receita, CMV e LUCRO BRUTO não têm P, e a versão R + P
 * deles sai da API igual à de sempre. Campo ausente — API anterior a esta mudança — fica com
 * o percentual de sempre.
 */
export function comPercentuaisRp(linha: LinhaDre, usar: boolean): LinhaDre {
  if (!usar) return linha;

  return {
    ...linha,
    valores: linha.valores.map((v) => ({
      ...v,
      percentualAv:
        v.percentualAvComProvisionado !== undefined ? v.percentualAvComProvisionado : v.percentualAv,
      percentualAh:
        v.percentualAhComProvisionado !== undefined ? v.percentualAhComProvisionado : v.percentualAh,
    })),
    total: {
      ...linha.total,
      percentualAv:
        linha.total.percentualAvComProvisionado !== undefined
          ? linha.total.percentualAvComProvisionado
          : linha.total.percentualAv,
    },
  };
}

/**
 * O valor que decide a COR do %AH (favorável ou desfavorável — ESPECIFICACAO §3.2).
 *
 * Com os percentuais sobre R + P, o sentido também tem de vir do Total (R + P): julgado pelo
 * Realizado, uma linha que só tem aberto teria 0 de sentido, e uma que trocou de sinal com o
 * provisionado pintaria o %AH com a cor errada.
 */
export function sentidoDaLinha(linha: LinhaDre, usar: boolean): number {
  return usar
    ? linha.total.valor + (linha.total.provisionado ?? 0)
    : linha.total.valor;
}

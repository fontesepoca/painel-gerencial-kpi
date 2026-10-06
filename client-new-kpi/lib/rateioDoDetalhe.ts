import type { DetalheLancamento, Detalhamento } from "@/types/dre-gerencial";

/**
 * O rateio do fornecedor, na tela de lançamentos.
 *
 * <b>Com fornecedor filtrado, a célula de despesa não é a soma dos lançamentos.</b> Ela é
 * `(total − exclusivo) × participação + exclusivo`: a despesa comum entra pela fatia que o
 * fornecedor representa na receita da filial, e a que é só dele entra inteira. Sem isso a
 * lista mostraria a despesa da filial toda e não explicaria a linha que a pessoa clicou.
 *
 * <b>A 9815 não faz isso</b> — lá o duplo clique abre a filial inteira, porque
 * `TFLanc.Create` nem recebe o fornecedor e o valor da célula que ela passa adiante
 * (`VlConta`) é atribuído e nunca usado. É divergência deliberada, aprovada em 02/10/2026 e
 * registrada em `docs/rotinas/9815-dre-gerencial/DIVERGENCIAS.md`.
 */

/** Há rateio a mostrar? Só quando a apuração foi filtrada e a tela é a de lançamentos. */
export function temRateio(dados: Detalhamento): boolean {
  return dados.tipo === "lancamentos" && (dados.fornecedores?.length ?? 0) > 0;
}

/**
 * Quanto o lançamento vale <b>dentro do DRE</b>.
 *
 * O exclusivo entra inteiro — é despesa do próprio fornecedor, e ratear seria cobrar dele
 * uma fração do que é todo dele. O resto entra pela participação.
 */
export function valorNoDre(l: DetalheLancamento, participacao: number): number {
  return l.exclusivo ? l.vPago : l.vPago * participacao;
}

/**
 * A soma de um conjunto de lançamentos, como o DRE a conta.
 *
 * <b>Em precisão cheia, arredondando só na exibição.</b> `Σ(vᵢ × p) = (Σvᵢ) × p` é exato
 * enquanto ninguém arredonda no meio — é o que faz este total fechar com a célula, que o
 * servidor calcula sobre o agregado. Arredondar linha a linha e somar depois erraria
 * centavos, e numa tela que existe para conferir número isso é o bastante para gerar
 * desconfiança.
 */
export function somaNoDre(
  linhas: readonly DetalheLancamento[],
  participacao: number,
): number {
  let total = 0;
  for (const l of linhas) total += valorNoDre(l, participacao);
  return total;
}

import type { TipoDetalhe } from "@/types/dre-gerencial";

/**
 * Qual coluna do detalhamento soma no valor que estava na tabela do DRE.
 *
 * Toda tela de detalhamento tem **uma** coluna cujo somatório é o número da célula clicada,
 * e as demais são contexto. Saber qual é era conhecimento de quem construiu a tela: a de
 * imposto tem três colunas de dinheiro e só `Líquido` fecha com a linha, e nada dizia isso.
 *
 * Aqui e não no componente porque é decisão pura, e decisão pura se testa sem navegador —
 * mesmo motivo de `rolagemAutomatica.ts`.
 */

/**
 * Compara rótulos ignorando acento, caixa e pontuação — `Devolução` e `DEVOLUCAO` são o
 * mesmo nome escrito por duas convenções, a da tela nova e a da 9815.
 */
export function igual(a: string, b: string): boolean {
  const limpar = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]/gi, "")
      .toUpperCase();
  return limpar(a) === limpar(b);
}

/** `(-) ST` vira `ST`. O sinal pertence à linha do DRE, não ao nome dela. */
export function nomeDaLinha(linha: { descricao: string } | null): string | null {
  const nome = (linha?.descricao ?? "").replace(/^\s*\([+\-=]\)\s*/, "").trim();
  return nome === "" ? null : nome;
}

/**
 * O rótulo da coluna que fecha o total, ou `null` quando não dá para saber qual é.
 *
 * `null` quando não se conhece a linha de origem: sem ela, a receita por cliente não tem
 * como decidir entre quatro colunas, e apontar a errada é pior do que não apontar nenhuma.
 */
export function colunaDoTotal(tipo: TipoDetalhe, nome: string | null): string | null {
  if (nome === null) return null;

  if (tipo === "imposto-por-produto") return "Líquido";
  if (tipo === "devolucao-por-motivo") return "Devolução";
  // As notas de um motivo somam na mesma coluna que os motivos: a tela de baixo fecha com
  // a linha da tela de cima, que por sua vez fecha com a do DRE.
  if (tipo === "notas-por-motivo") return "Devolução";
  if (tipo === "lancamentos") return "V. Pago";

  // A tela de receita abre a partir de quatro linhas do DRE, cada uma fechando numa coluna
  // diferente da mesma tabela. `CMV` é testado antes de `LIQUID` porque `CMV LIQ.` casaria
  // com os dois, e a coluna dele é o custo, não a receita líquida.
  const n = nome.toUpperCase();
  if (n.includes("ABAT")) return "Desconto";
  if (n.includes("CMV")) return "Custo líq.";
  if (n.includes("LIQUID")) return "Receita líq.";
  return "Receita bruta";
}

/**
 * `(ST) Líquido` — a coluna anunciando de que linha do DRE ela fecha o total.
 *
 * Sem repetir o nome quando a coluna já se chama como a linha: `(DEVOLUCAO) Devolução` diria
 * duas vezes a mesma coisa e ainda sugeriria que são dois números diferentes.
 */
export function rotuloDaColuna(coluna: string, nome: string | null): string {
  return nome === null || igual(nome, coluna) ? coluna : `(${nome}) ${coluna}`;
}

/**
 * O nome que a coluna MOSTRA, quando difere da chave interna.
 *
 * Na lista dos títulos EM ABERTO (célula de Provisionado, 14/10/2026) nada foi pago, e
 * "V. Pago" diria o contrário: lá a coluna se chama **V. a Pagar**. A chave continua
 * `V. Pago` — é por ela que a tela pinta o valor, acha a coluna que fecha o total e ordena;
 * trocar a chave quebraria essas regras em silêncio. Só o texto muda.
 */
export function rotuloNaTela(rotulo: string, situacao: boolean | SituacaoDoDetalhe): string {
  if (rotulo !== "V. Pago") return rotulo;
  // Na lista do Total (R + P) a coluna tem pagos e a pagar: nenhum dos dois nomes serve.
  if (situacao === "ambos") return "Valor (R + P)";
  return situacao === true || situacao === "provisionado" ? "V. a Pagar" : rotulo;
}

/**
 * De que lado da célula veio a lista de lançamentos: o Valor (pagos), o Provisionado (em
 * aberto) ou o Total (R + P), que junta os dois (16/10/2026).
 */
export type SituacaoDoDetalhe = "realizado" | "provisionado" | "ambos";

export function situacaoDoDetalhe(dados: {
  provisionado?: boolean;
  realizadoEProvisionado?: boolean;
}): SituacaoDoDetalhe {
  if (dados.realizadoEProvisionado === true) return "ambos";
  return dados.provisionado === true ? "provisionado" : "realizado";
}

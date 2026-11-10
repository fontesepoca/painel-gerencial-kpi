/**
 * O CÓDIGO de uma linha do DRE — a coluna "Código" do menu Exibição (10/11/2026, pedido do
 * Gabriel).
 *
 * É o `CODGRUCONTA` do cadastro (`LinhaDre.chave`): o grupo em Grupo de Contas, a conta em
 * Conta Gerencial, o centro em C. Custo Principal. **As linhas calculadas** — totalizadores,
 * receita, deduções, CMV — **mostram um traço**: no cadastro elas têm código negativo, que é
 * um marcador de linha calculada e não um número de conta. O traço é o MESMO `—` das
 * células sem valor.
 */
export function codigoDaLinha(linha: { chave: string; calculada: boolean }): string {
  const chave = linha.chave.trim();
  return linha.calculada || chave === "" ? "—" : chave;
}

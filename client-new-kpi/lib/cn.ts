/**
 * Concatena classes CSS ignorando falsy.
 *
 * Implementação local de propósito: clsx e tailwind-merge resolveriam o mesmo,
 * mas são duas dependências para 6 linhas. Se algum dia precisarmos de resolução
 * de conflito entre classes Tailwind (px-2 vs px-4), aí sim vale discutir
 * tailwind-merge.
 *
 * **Enquanto isso, conflito aqui não resolve — silencia.** `cn("text-a", "text-b")` deixa as
 * duas no atributo, e quem ganha é a ordem da folha de estilo, não a do argumento. Uma cor
 * condicional somada a uma constante que já traz cor simplesmente não aparece, sem erro
 * nenhum: aconteceu no destaque da coluna de total do detalhamento. Para variar uma
 * propriedade, tire-a da constante e passe os dois casos pelo condicional.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

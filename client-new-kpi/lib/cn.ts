/**
 * Concatena classes CSS ignorando falsy.
 *
 * Implementação local de propósito: clsx e tailwind-merge resolveriam o mesmo,
 * mas são duas dependências para 6 linhas. Se algum dia precisarmos de resolução
 * de conflito entre classes Tailwind (px-2 vs px-4), aí sim vale discutir
 * tailwind-merge.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

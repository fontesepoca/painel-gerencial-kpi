/**
 * Como as filiais apuradas são escritas no cabeçalho da tabela.
 *
 * A tela sempre disse **quantas** filiais entraram — `3 filiais` —, o que basta para quem
 * acabou de preencher o filtro e ainda lembra o que marcou. No papel e na tela cheia isso
 * não basta: um DRE impresso circula, é arquivado e é conferido semanas depois, e a
 * pergunta que ele precisa responder sozinho é **quais** filiais, não quantas.
 *
 * Sem React, para o texto poder ser conferido sem montar tela.
 */

import type { Filial } from "@/types/dre-gerencial";

/**
 * O nome de uma filial com o código ao lado: `EPC-MAT (7)`.
 *
 * O código vai junto de propósito. É por ele que se confere a apuração contra o Winthor —
 * a 9815 pede filial por código —, e é ele que distingue duas unidades com nome parecido.
 */
function nomear(codigo: string, cadastro: readonly Filial[]): string {
  const filial = cadastro.find((f) => f.codFilial === codigo);
  // Código sem cadastro correspondente vira o próprio código, nunca desaparece: a lista
  // precisa continuar somando o mesmo número de filiais que o resumo anuncia.
  return filial ? `${filial.label} (${codigo})` : codigo;
}

/**
 * As duas formas de dizer quais filiais foram apuradas.
 *
 * Devolve as duas de uma vez porque **quem escolhe é o CSS**, não um estado de React: a
 * impressão precisa da forma longa e `Ctrl+P` não espera re-render — a lição que o
 * `%AH` de três casas já tinha ensinado, e que `beforeprint` já nos custou uma vez.
 *
 * @param codigos Os códigos que a apuração devolveu, na ordem em que vieram.
 * @param cadastro A lista de filiais do filtro. Pode estar vazia: a tela é utilizável
 *   antes de o cadastro chegar, e nesse caso a forma longa cai nos códigos crus.
 */
export function descreverFiliais(
  codigos: readonly string[],
  cadastro: readonly Filial[],
): { resumo: string; detalhe: string } {
  const resumo = `${codigos.length} ${codigos.length === 1 ? "filial" : "filiais"}`;

  if (codigos.length === 0) {
    return { resumo, detalhe: "Nenhuma filial" };
  }

  // A ordem é a do cadastro, não a da seleção: quem confere um relatório impresso contra
  // outro espera os nomes na mesma sequência das duas vezes, e a ordem em que alguém
  // clicou nas caixas não é sequência nenhuma.
  const ordenados = cadastro.length > 0
    ? cadastro.filter((f) => codigos.includes(f.codFilial)).map((f) => f.codFilial)
    : [...codigos];

  // Um código que a apuração devolveu e o cadastro não conhece entraria em lugar nenhum
  // pelo filtro acima. Ele volta para o fim da lista — some do papel seria pior.
  const faltantes = codigos.filter((c) => !ordenados.includes(c));
  const lista = [...ordenados, ...faltantes].map((c) => nomear(c, cadastro)).join(", ");

  // "Todas" é a informação que a lista sozinha não dá: com dez nomes em sequência, ninguém
  // sabe se falta alguma sem ir contar o cadastro.
  const todas = cadastro.length > 0 && codigos.length === cadastro.length;

  // O rótulo vem no texto, e não no JSX, para o teste conferir a frase que sai de verdade.
  return {
    resumo: todas ? `Todas as ${codigos.length} filiais` : resumo,
    detalhe: todas ? `Filiais (todas as ${codigos.length}): ${lista}` : `Filiais: ${lista}`,
  };
}

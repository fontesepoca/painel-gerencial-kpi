/**
 * A ordenação das tabelas do detalhamento — o estado, o ciclo de cliques e o comparador.
 *
 * Puro e sem React de propósito: é aqui que mora a regra de "o terceiro clique devolve a
 * ordem do cadastro", e uma regra de três estados escondida dentro de um componente é a
 * que ninguém encontra quando ela erra.
 */

/** Como a coluna se compara. Decide também a direção do primeiro clique. */
export type TipoDaColuna = "texto" | "numero";

/**
 * Uma coluna de uma tabela do detalhamento, descrita como dado.
 *
 * <b>O `ler` existe para a ordenação não depender do que está renderizado.</b> Ordenar pelo
 * texto da célula ordenaria `1.226.270,82` como string — e `9,50` viria depois de
 * `1.226.270,82` porque `9` &gt; `1`. O valor bruto é o único que compara certo.
 */
export interface ColunaOrdenavel<T> {
  rotulo: string;
  tipo: TipoDaColuna;
  ler: (linha: T) => string | number | null;
}

/** Nenhuma coluna ordenada é `null` — a ordem em que a consulta devolveu. */
export type Ordem = { rotulo: string; direcao: "asc" | "desc" } | null;

/**
 * O próximo estado ao clicar num cabeçalho.
 *
 * <b>Três estados, e o terceiro é o que importa:</b> clicar de novo na mesma coluna depois
 * de inverter devolve a ordem original. Sem isso, quem ordenou perde a sequência do
 * cadastro — que na lista de lançamentos é a ordem em que a 9815 mostra, e é por ela que se
 * confere uma tela contra a outra.
 *
 * <b>Número começa decrescente, texto começa crescente.</b> Quem clica em `V. Pago` está
 * procurando o maior lançamento, não o menor; quem clica em `Cliente` está procurando um
 * nome, e nomes se procuram de A a Z.
 */
export function proximaOrdem(
  atual: Ordem,
  rotulo: string,
  tipo: TipoDaColuna,
): Ordem {
  const inicial = tipo === "numero" ? "desc" : "asc";

  if (atual === null || atual.rotulo !== rotulo) {
    return { rotulo, direcao: inicial };
  }

  return atual.direcao === inicial
    ? { rotulo, direcao: inicial === "asc" ? "desc" : "asc" }
    : null;
}

/**
 * Compara dois valores da mesma coluna.
 *
 * <b>Nulo vai sempre para o fim</b>, nas duas direções. Ele não é "menor" nem "maior": é
 * ausência, e deixá-lo participar da comparação encheria o topo da tabela de traços quando
 * alguém ordena de forma crescente uma coluna com muitos vazios.
 *
 * Texto compara com `localeCompare` em pt-BR, que põe `Á` junto de `A` — sem isso, os
 * acentuados iam todos para o fim do alfabeto.
 */
function comparar(a: string | number | null, b: string | number | null): number {
  const aVazio = a === null || a === "";
  const bVazio = b === null || b === "";
  if (aVazio && bVazio) return 0;
  if (aVazio) return 1;
  if (bVazio) return -1;

  if (typeof a === "number" && typeof b === "number") return a - b;

  return String(a).localeCompare(String(b), "pt-BR", { numeric: true });
}

/**
 * As linhas na ordem pedida. Sem ordem, devolve a lista **como veio** — e não uma cópia
 * ordenada por algum padrão, porque a ordem da consulta já é uma escolha (a de motivos vem
 * por valor decrescente, a de lançamentos por centro de custo).
 *
 * Nunca ordena no lugar: `sort` mutaria o array que o React Query guarda em cache, e a
 * próxima leitura viria ordenada sem ninguém ter pedido.
 */
export function ordenarLinhas<T>(
  linhas: readonly T[],
  colunas: readonly ColunaOrdenavel<T>[],
  ordem: Ordem,
): readonly T[] {
  if (ordem === null) return linhas;

  const coluna = colunas.find((c) => c.rotulo === ordem.rotulo);
  if (!coluna) return linhas;

  const sinal = ordem.direcao === "asc" ? 1 : -1;

  return [...linhas].sort(
    (a, b) => sinal * comparar(coluna.ler(a), coluna.ler(b)),
  );
}

/** O que o `aria-sort` do `<th>` deve dizer. */
export function ariaSort(
  ordem: Ordem,
  rotulo: string,
): "ascending" | "descending" | "none" {
  if (ordem === null || ordem.rotulo !== rotulo) return "none";
  return ordem.direcao === "asc" ? "ascending" : "descending";
}

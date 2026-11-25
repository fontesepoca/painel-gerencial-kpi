import type { AjusteDaLinha, Classe, ProdutoSimulado } from "@/types/simulador-preco";

/**
 * A chave da linha e os filtros da paginação no back-end (spec
 * docs/superpowers/specs/2026-11-24-simulador-paginacao-no-backend-design.md). Lógica pura,
 * conferida pela sp17.
 */

/** Linhas por página — fixo no servidor; aqui só para a tela saber o que esperar. */
export const TAMANHO_DA_PAGINA = 100;

/** Quantos códigos o "ver só os simulados" pode mandar (o servidor recusa acima disso). */
export const LIMITE_DE_CODIGOS = 500;

/** Quanto a busca espera depois da última tecla antes de ir ao Oracle. */
export const ATRASO_DA_BUSCA_MS = 500;

/** As classes de venda que existem (medidas na sp14, 24/11/2026). */
export const CLASSES: readonly Classe[] = ["A", "B", "C"];

/**
 * A chave de uma linha: código + tributação e, na repetição, `#n`. É ela que a simulação
 * guardada usa para achar a linha.
 *
 * <b>Não mudou com a paginação no back-end</b>: a 1ª ocorrência fica sem sufixo e a 2ª é `#1`,
 * exatamente como a tela numerava antes. A diferença é quem numera: o Oracle (`ocorrencia`),
 * porque uma repetição pode estar noutra página.
 */
export function chaveDaLinha(p: Pick<ProdutoSimulado, "codProd" | "codigoTributacao" | "ocorrencia">): string {
  const base = `${p.codProd}|${p.codigoTributacao ?? "-"}`;
  return p.ocorrencia > 1 ? `${base}#${p.ocorrencia - 1}` : base;
}

/** Os códigos dos produtos com ajuste — o trecho da chave antes do `|` —, únicos e em ordem. */
export function codigosSimulados(ajustes: Record<string, AjusteDaLinha>): string[] {
  const codigos = new Set(Object.keys(ajustes).map((chave) => chave.split("|")[0] ?? ""));
  codigos.delete("");
  return [...codigos].sort((a, b) => Number(a) - Number(b));
}

/**
 * A página para onde ir quando a resposta veio VAZIA numa página > 1 — ou `null`, para ficar.
 *
 * Acontece quando um "Consultar" com o mesmo filtro passa a trazer menos linhas e a página atual ficou
 * além do fim (revisão final, 24/11/2026). Um OFFSET além do fim não devolve linha nenhuma, e
 * com ela some o `COUNT(*) OVER ()`: a API responde total 0, e a tela não sabe quantas páginas
 * há. Volta à 1, que existe se houver qualquer linha; na página 1 vazia, "nenhum produto" é
 * verdade, e a tela fica.
 */
export function paginaAoEsvaziar(pagina: number, linhasNaPagina: number): number | null {
  return linhasNaPagina === 0 && pagina > 1 ? 1 : null;
}

/**
 * O que vai à API. As três marcadas = `null`, sem filtro de classe: assim uma linha sem classe
 * (ou de outra letra, numa base ainda não medida) não some do total.
 */
export function classesParaApi(marcadas: readonly Classe[]): Classe[] | null {
  const ordenadas = CLASSES.filter((c) => marcadas.includes(c));
  return ordenadas.length === CLASSES.length ? null : ordenadas;
}

/**
 * As chaves que o NAVEGADOR usa para guardar algo por pessoa — cache e armazenamento local.
 *
 * <b>A base é parte da chave.</b> A matrícula 144 da Época e a 144 do Minas Rural são pessoas
 * diferentes, e as linhas do DRE de uma não são as da outra. Uma chave sem base é um dado de
 * uma empresa sendo aplicado à outra.
 *
 * Tudo o que depende da base mora aqui, e não espalhado pelos hooks: foi o `useOrdemSalva`
 * guardando por análise e por mais nada que mostrou o que acontece quando cada arquivo
 * decide sozinho o que entra na chave.
 */

/** A base cujas chaves ANTIGAS (de antes das bases) continuam valendo: era a única que existia. */
const BASE_DAS_CHAVES_ANTIGAS = "Epoca";

/** A ordem salva das linhas, por base e por análise. `v2` para nunca colidir com a `v1`. */
export const chaveDaOrdem = (baseId: string, analise: string) =>
  `epoca:dre:ordem:v2:${baseId}:${analise}`;

/**
 * As chaves de ANTES das bases (`v1`), que a pessoa pode ainda ter no navegador. Só a Época
 * as herda: ninguém perde a ordem que já tinha, e o Minas Rural nasce limpo.
 */
export const chavesAntigasDaOrdem = (baseId: string, analise: string): string[] =>
  baseId === BASE_DAS_CHAVES_ANTIGAS ? [`epoca:dre:ordem:v1:${analise}`] : [];

/** As filiais em cache. `null` antes de a sessão chegar: o hook fica desligado, não presume. */
export const chaveDeFiliais = (baseId: string | null, matricula: number | null) =>
  ["dre-gerencial", "filiais", baseId, matricula] as const;

/**
 * O cadastro de fornecedores em cache. <b>A busca por termo e a resolução por código usam a
 * MESMA chave</b> — é o que faz `29,253,` aproveitar o `29` que já apareceu na lista —, e por
 * isso as duas a pedem daqui.
 */
export const chaveDeFornecedores = (baseId: string | null, termo: string) =>
  ["dre-gerencial", "fornecedores", baseId, termo] as const;

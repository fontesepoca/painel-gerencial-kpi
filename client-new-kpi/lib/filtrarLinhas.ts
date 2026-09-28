import type { LinhaDre } from "@/types/dre-gerencial";

/**
 * Normaliza um texto para a comparação do filtro: sem acento, sem diferença de caixa e com
 * os espaços colapsados.
 *
 * **Os três tratamentos vêm de defeitos reais deste projeto**, não de precaução genérica.
 * O `VERBAS MARGEM` do cadastro tem um espaço NÃO SEPARÁVEL (` `) no meio, e a busca
 * por ele devolvia zero linhas — um texto que parece certo em todo log e não casa. O acento
 * separa `DEPÓSITOS` de quem digita `depositos`, que é como a maioria procura.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toUpperCase();
}

/**
 * A linha casa com o termo? Compara **descrição e código da conta**, nessa ordem.
 *
 * <b>O código entra porque quem conhece o plano de contas procura por ele.</b> Ele não
 * aparece na tabela — só no detalhamento —, mas quem digita `3000080` sabe o que quer, e
 * fazer a busca ignorar isso obrigaria a lembrar o nome exato da conta.
 *
 * A comparação é por trecho, e não por começo: `pneus` acha `PNEUS E CAMARAS`, e `margem`
 * acha `VERBAS MARGEM`. Exigir o começo faria a segunda falhar, e quem procura por uma
 * palavra do meio é o caso comum num plano de contas com nomes compostos.
 */
export function linhaCasa(linha: LinhaDre, termoNormalizado: string): boolean {
  if (termoNormalizado === "") return true;

  return (
    normalizar(linha.descricao).includes(termoNormalizado) ||
    normalizar(linha.chave).includes(termoNormalizado)
  );
}

/**
 * As linhas que sobrevivem ao filtro de texto.
 *
 * <b>As calculadas somem junto com as que não casam</b>, e isso é a decisão central deste
 * recurso — tomada com o Gabriel em 28/09/2026. Um `LUCRO BRUTO` de 8,2 milhões parado ao
 * lado de três contas filtradas convida a ler aquele número como o total delas, e nenhum
 * aviso desfaz uma leitura que o olho já fez. Some o total, some a leitura errada.
 *
 * <b>Nenhum valor muda.</b> O filtro é exibição: os totais continuam sendo os da apuração
 * inteira, e é justamente por isso que eles não podem ficar numa tabela recortada.
 *
 * Termo vazio devolve a lista como veio — inclusive as calculadas.
 */
export function filtrarLinhas(
  linhas: readonly LinhaDre[],
  termo: string,
): readonly LinhaDre[] {
  const alvo = normalizar(termo);
  if (alvo === "") return linhas;

  return linhas.filter((l) => !l.calculada && linhaCasa(l, alvo));
}

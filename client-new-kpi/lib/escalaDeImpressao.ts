import type { Folha } from "@/lib/folhaDoDetalhe";

/**
 * A fonte de impressão, calculada no momento de imprimir.
 *
 * ## Por que não dá para deixar no CSS
 *
 * Três tentativas de escala fixa falharam, cada uma de um jeito, e todas pelo mesmo motivo:
 * **a largura da tabela depende do conteúdo daquela consulta**, não do número de colunas.
 *
 * | Tentativa | O que produziu |
 * |---|---|
 * | Contar colunas, supondo ≈16mm cada | receita em A3 com 69% de papel branco |
 * | Medir o PDF impresso (e ler o bloco errado) | receita em A4 em pé, **valores cortados** |
 * | Medir no navegador com conteúdo pessimista | folha 2x maior que o necessário — metade em branco |
 *
 * Os PDFs de 09/09/2026 fecharam o argumento: o imposto por produto terminava em ≈145mm de
 * uma folha de 420mm, e a lista de lançamentos — 25 colunas, a tela que eu tinha como o caso
 * apertado — em ≈200mm. Produto de nome curto e valor de seis dígitos não ocupam o que nome
 * de 50 caracteres e valor de nove ocupam, e nada no CSS sabe qual dos dois vem na consulta.
 *
 * ## O que este módulo faz
 *
 * Mede a tabela **na tela**, com a fonte base da impressão aplicada, e resolve uma regra de
 * três: se a 13pt ela mede 300px e a folha oferece 1.512px, cabe fonte 5x maior — limitada
 * por um teto de bom senso tipográfico.
 *
 * **Isto não é o `beforeprint` que já nos enganou.** O erro daquela vez foi medir esperando
 * as métricas do papel; aqui a medição é de tela por construção, e a folha entra só como um
 * número conhecido — 400mm úteis da A3 deitada são 1.512px, e isso não depende de quando o
 * navegador aplica a página.
 */

/** Milímetros para px CSS, na referência de 96dpi que o navegador usa para o papel. */
const px = (mm: number) => (mm * 96) / 25.4;

/**
 * Largura útil de cada folha, descontadas as margens que o Chrome aplica por padrão
 * (≈10mm de cada lado). Os 1.512px da A3 deitada são o número que a calibragem da tabela
 * do DRE já usava.
 */
export const LARGURA_UTIL: Record<Folha, number> = {
  "a4-em-pe": px(190),
  "a4-deitada": px(277),
  "a3-deitada": px(400),
};

/**
 * Largura por altura, em milímetros, para a regra `@page`. Deitado é escrever a maior
 * primeiro, sem depender de `landscape` — e as três são folhas que a empresa imprime.
 *
 * Nomes de tamanho (`A4`, `A3`) não entram aqui de propósito: `A2` não existe em CSS e um
 * nome desconhecido invalida a declaração inteira, o que já custou uma tarde a este
 * projeto. Dois comprimentos é a forma que a especificação garante.
 */
export const MEDIDA_DA_FOLHA: Record<Folha, string> = {
  "a4-em-pe": "210mm 297mm",
  "a4-deitada": "297mm 210mm",
  "a3-deitada": "420mm 297mm",
};

/** A fonte com que a medição é feita. Serve de referência para a regra de três. */
export const FONTE_BASE_PT = 13;

/**
 * Teto e piso.
 *
 * O teto existe porque uma tabela de 5 colunas com dado curto aceitaria 40pt, e relatório
 * financeiro em corpo 40 não parece relatório. O piso é o ponto em que reduzir mais deixa
 * de resolver: abaixo dele, o caminho é omitir colunas.
 */
const MAX_PT = 20;
const MIN_PT = 7;

/**
 * Sobra proposital de 2%.
 *
 * A relação largura×fonte é quase linear, mas não exatamente: os respiros das células estão
 * em px e não acompanham a fonte, então a tabela cresce um pouco menos que proporcional —
 * e o erro é a favor. Os 2% cobrem o resto, e errar para o lado da folga custa papel branco,
 * enquanto errar para o outro corta valor.
 */
const FOLGA = 0.98;

/**
 * A fonte que enche a folha, em pt, arredondada em meio ponto.
 *
 * `larguraMedida` é a largura da tabela, em px, com `FONTE_BASE_PT` aplicada.
 */
export function fonteQueEnche(larguraMedida: number, folha: Folha): number {
  if (!Number.isFinite(larguraMedida) || larguraMedida <= 0) return FONTE_BASE_PT;

  const desejada = FONTE_BASE_PT * ((LARGURA_UTIL[folha] * FOLGA) / larguraMedida);
  const presa = Math.min(MAX_PT, Math.max(MIN_PT, desejada));

  // Meio ponto: passo fino o suficiente para não desperdiçar folha, grosso o suficiente
  // para a impressão de hoje ser igual à de ontem com o mesmo dado.
  return Math.round(presa * 2) / 2;
}

/**
 * A fonte alvo: abaixo dela, vale trocar de folha em vez de encolher o texto.
 *
 * 13pt é a escala de leitura da tela, e o piso do que se lê à distância de um braço num
 * relatório financeiro.
 */
const ALVO_PT = 13;

/** Da menor para a maior — a ordem em que as folhas são tentadas. */
const ORDEM: Folha[] = ["a4-em-pe", "a4-deitada", "a3-deitada"];

/**
 * A folha **e** a fonte, escolhidas juntas pela largura medida.
 *
 * Fonte e folha são o mesmo problema visto de dois lados, e decidir uma sem a outra foi o
 * que produziu três impressões erradas: papel A3 com metade em branco quando bastava A4, e
 * A4 em pé cortando o que precisava de A3.
 *
 * A regra é **a menor folha em que a tabela caiba com pelo menos `ALVO_PT`**. Menor folha é
 * mais barata de imprimir e mais fácil de manusear; se nenhuma alcança o alvo, vale a maior
 * com a fonte que couber — é o caso das 25 colunas dos lançamentos com dado longo.
 */
export function folhaEFonte(larguraMedida: number): { folha: Folha; pt: number } {
  for (const folha of ORDEM) {
    const pt = fonteQueEnche(larguraMedida, folha);
    if (pt >= ALVO_PT) return { folha, pt };
  }

  const ultima = ORDEM[ORDEM.length - 1] as Folha;
  return { folha: ultima, pt: fonteQueEnche(larguraMedida, ultima) };
}

/**
 * As quatro variáveis de tipografia, derivadas da fonte base nas mesmas proporções que as
 * escalas fixas do `@media print` usavam.
 */
export function tokensDaFonte(basePt: number): Record<string, string> {
  return {
    "--fs-base": `${basePt}pt`,
    "--fs-apoio": `${(Math.round(basePt * 0.82 * 2) / 2).toFixed(1)}pt`,
    "--fs-rotulo": `${(Math.round(basePt * 0.75 * 2) / 2).toFixed(1)}pt`,
    // Respiro proporcional, com piso: a 7pt um respiro de 6px é metade da altura da linha.
    "--celula-x": `${Math.max(3, Math.round(basePt * 0.35))}px`,
    "--celula-y": `${Math.max(2, Math.round(basePt * 0.25))}px`,
  };
}

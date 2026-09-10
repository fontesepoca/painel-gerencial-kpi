import type { TipoDetalhe } from "@/types/dre-gerencial";

/**
 * A folha e a escala de fonte do detalhamento, por tela.
 *
 * **Medido no navegador em 09/09/2026**, com a tabela em `width: max-content` e os tokens
 * de `@media print` aplicados — é a largura que a tabela pede quando nada a comprime:
 *
 * | Tela | Colunas | 13pt | 16pt | 18pt |
 * |---|---:|---:|---:|---:|
 * | Devolução por motivo | 5 | 215mm | 238mm | 246mm |
 * | Imposto por produto | 6 | 264mm | 301mm | 314mm |
 * | Receita por cliente | 8 | 316mm | 357mm | — |
 * | Lançamentos | 25 | 983mm | — | 760mm a 8,5pt |
 *
 * Larguras úteis: **A4 em pé ≈190mm, A4 deitada ≈277mm, A3 deitada ≈400mm.**
 *
 * **Nenhuma tela cabe em A4 em pé, nem a 13pt.** Foi o que produziu o PDF cortado de
 * 09/09/2026: a receita por cliente pede 357mm a 16pt e a folha oferecia 190mm.
 *
 * ## Dois erros de medição antes de chegar aqui
 *
 * 1. **Contar colunas.** A primeira versão mandava A3 deitada acima de seis colunas, e
 *    supunha ≈16mm por coluna. Coluna de data, de nome de cliente e de valor de nove
 *    dígitos têm larguras que não se parecem — a média não descreve nenhuma delas.
 * 2. **Ler o X errado no PDF.** A correção seguinte mediu o PDF impresso e concluiu 130mm
 *    para a receita, quando o valor real é ≈316mm. Os operadores `Tm` que li eram do bloco
 *    "Como se chega no total", não da tabela: o primeiro fluxo de conteúdo com texto não é
 *    necessariamente o da tabela, e nada no número dizia que ele media a coisa errada.
 *
 * O que vale é a medição no navegador, com `max-content`: ela mede a tabela, não o que
 * sobrou dela depois da compressão, e se repete em segundos.
 *
 * **As medidas usam conteúdo pessimista** — nomes de 45 a 55 caracteres e valores de nove
 * dígitos —, então a folha escolhida tem folga com dado real. É de propósito: errar para
 * o lado da folga custa papel branco, errar para o outro corta valor.
 */

export type Folha = "a4-em-pe" | "a4-deitada" | "a3-deitada";

/**
 * A folha de cada tela, escolhida para a tabela caber **sem compressão** com a fonte de
 * `escalaDaFolha`.
 *
 * A lista de lançamentos é o caso sem solução boa: **25 colunas pedem 760mm mesmo a
 * 8,5pt**, e a A3 deitada oferece 400. Ela vai para a maior folha e a tabela é comprimida
 * pelo `max-width: 100%` — as colunas de texto quebram em várias linhas e a tabela para de
 * crescer em vez de sair cortada. Caber de verdade exige **omitir colunas**, e isso é
 * decisão de negócio, igual à do `AH %` na tabela do DRE.
 */
export function folhaDoDetalhe(tipo: TipoDetalhe): Folha {
  return tipo === "devolucao-por-motivo" ? "a4-deitada" : "a3-deitada";
}

/**
 * **A fonte não está mais aqui.** Escala fixa por tela foi a terceira tentativa a falhar:
 * com o conteúdo real dos PDFs de 09/09/2026, o imposto por produto terminava em ≈145mm de
 * 420, e até a lista de lançamentos — 25 colunas — em ≈200mm. Metade da folha em branco,
 * porque produto de nome curto e valor de seis dígitos não ocupam o que as minhas amostras
 * pessimistas ocupavam.
 *
 * Quem decide a fonte agora é `lib/escalaDeImpressao.ts`, medindo a tabela antes de cada
 * impressão. A folha continua aqui porque é escolha de formato, não de conteúdo: 5 colunas
 * nunca vão querer A3, e 25 nunca vão caber em A4 em pé.
 */

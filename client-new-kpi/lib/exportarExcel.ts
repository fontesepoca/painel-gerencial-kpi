import {
  MOEDA,
  PERCENTUAL_3,
  baixar,
  gerarPlanilha,
  num,
  txt,
  type Celula,
  type Planilha,
} from "@/lib/excel";
import { mostraVariacao, rotuloDaVariacao, variacao } from "@/lib/modosDePeriodo";
import type { Apuracao, LinhaDre } from "@/types/dre-gerencial";

/**
 * A apuração do DRE em `.xlsx`.
 *
 * O mecanismo — formato, largura, congelamento, download — está em `lib/excel.ts`. Aqui só
 * a matriz: duas linhas de cabeçalho e uma linha por conta.
 *
 * **A ordem é a da tela.** Quem chama passa as linhas na ordem em que estão no DOM, não a
 * da API: se a pessoa arrastou linhas e escondeu as zeradas, o arquivo sai como o que ela
 * está vendo. É o mesmo critério da impressão, que imprime o que está renderizado —
 * divergir faria o Excel e o papel discordarem sobre a mesma apuração.
 */

/**
 * Quantas colunas tem o bloco final, e o que ele diz.
 *
 * O arquivo acompanha a tela: nos modos de ano o bloco final é a **variação** entre a
 * primeira e a última coluna, com duas colunas em vez das três do total. Divergir aqui
 * faria a planilha somar 2025 com 2026 num campo chamado Total, que é justamente o número
 * que a tela deixou de mostrar por não significar nada.
 */
function blocoFinal(dados: Apuracao) {
  return mostraVariacao(dados.modo, dados.periodos.length)
    ? { variacao: true as const, largura: 2, rotulo: rotuloDaVariacao(dados.periodos) }
    : { variacao: false as const, largura: 3, rotulo: "Total" };
}

export function matrizDaApuracao(dados: Apuracao, linhas: readonly LinhaDre[]): Celula[][] {
  const multiMes = dados.periodos.length > 1;
  const fim = blocoFinal(dados);

  const faixaMeses: Celula[] = [txt("")];
  const rotulos: Celula[] = [txt("Descrição")];

  for (const p of dados.periodos) {
    faixaMeses.push(txt(p.rotulo), txt(""), txt(""));
    rotulos.push(txt("Valor"), txt("AV %"), txt(multiMes ? "AH %" : ""));
  }

  if (multiMes) {
    faixaMeses.push(...Array.from({ length: fim.largura }, (_, i) => txt(i === 0 ? fim.rotulo : "")));
    rotulos.push(
      ...(fim.variacao
        ? [txt("Δ Valor"), txt("Δ %")]
        : [txt("Valor"), txt("AV %"), txt("Média")]),
    );
  }

  const corpo = linhas.map((linha) => {
    const celulas: Celula[] = [txt(linha.descricao.trim())];

    for (const p of dados.periodos) {
      const v = linha.valores.find((x) => x.mesAno === p.mesAno);
      celulas.push(
        num(v?.valor ?? null, MOEDA),
        num(v?.percentualAv ?? null, PERCENTUAL_3),
        multiMes ? num(v?.percentualAh ?? null, PERCENTUAL_3) : txt(""),
      );
    }

    if (multiMes && fim.variacao) {
      const v = variacao(linha.valores);
      celulas.push(num(v?.absoluta ?? null, MOEDA), num(v?.percentual ?? null, PERCENTUAL_3));
    } else if (multiMes) {
      celulas.push(
        num(linha.total.valor, MOEDA),
        num(linha.total.percentualAv, PERCENTUAL_3),
        num(linha.total.media, MOEDA),
      );
    }

    return celulas;
  });

  return [faixaMeses, rotulos, ...corpo];
}

/**
 * `DRE_ccusto-principal_2026-07-01_a_2026-08-27`, ou `DRE_ccusto-principal_2025_2026` no
 * modo por ano inteiro — onde as datas do filtro não descrevem o que foi apurado, e um
 * nome de arquivo que mente é pior do que um nome curto.
 */
export function nomeDoArquivo(dados: Apuracao): string {
  if (dados.modo === "anos") {
    return `DRE_${dados.analise}_${dados.periodos.map((p) => p.rotulo).join("_")}`;
  }
  return `DRE_${dados.analise}_${dados.dataInicio}_a_${dados.dataFim}`;
}

export function planilhaDaApuracao(
  dados: Apuracao,
  linhas: readonly LinhaDre[],
): Planilha {
  const matriz = matrizDaApuracao(dados, linhas);
  const colunas = matriz[1]?.length ?? 1;

  // Junta as colunas de cada bloco sob o rótulo dele, como na tela. O último bloco pode
  // ter duas colunas em vez de três — daí a largura vir da lista, e não de um passo fixo.
  const fim = blocoFinal(dados);
  const larguras = dados.periodos.map(() => 3);
  if (dados.periodos.length > 1) larguras.push(fim.largura);

  const merges = [];
  let c = 1;
  for (const largura of larguras) {
    merges.push({ s: { r: 0, c }, e: { r: 0, c: c + largura - 1 } });
    c += largura;
  }

  return {
    aba: "DRE",
    matriz,
    // A primeira cabe o nome mais comprido do cadastro; as de valor, `(99.999.999,99)`.
    larguras: Array.from({ length: colunas }, (_, i) => (i === 0 ? 52 : 16)),
    merges,
    // Rolar 120 linhas sem saber de que conta é o número é o mesmo problema que a tela
    // resolve com `sticky`.
    congelar: { colunas: 1, linhas: 2 },
  };
}

/** Gera e baixa. `linhas` já vem na ordem e na seleção da tela. */
export async function exportarApuracao(
  dados: Apuracao,
  linhas: readonly LinhaDre[],
): Promise<void> {
  const blob = await gerarPlanilha([planilhaDaApuracao(dados, linhas)]);
  baixar(blob, `${nomeDoArquivo(dados)}.xlsx`);
}

/** Só a geração, para conferir sem baixar. */
export const gerarApuracao = (dados: Apuracao, linhas: readonly LinhaDre[]) =>
  gerarPlanilha([planilhaDaApuracao(dados, linhas)]);

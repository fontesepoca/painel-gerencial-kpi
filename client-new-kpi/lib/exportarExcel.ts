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
import { somaDosAh } from "@/lib/ahDoTotal";
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
/**
 * As colunas de análise que a tela deixou ligadas.
 *
 * <b>O arquivo sai como a tela está</b>, decidido em 05/10/2026: quem desligou o `%AH` para
 * ler os valores não quer reencontrá-lo no Excel, e quem exporta costuma estar levando
 * para outra pessoa a MESMA leitura que montou na tela.
 *
 * <b>Com default dos dois ligados</b>, que é o estado inicial da tela e o comportamento
 * de antes — as asserções da dc13 chamam sem o parâmetro e continuam valendo.
 */
export interface ColunasDeAnalise {
  av: boolean;
  ah: boolean;
}

const TUDO: ColunasDeAnalise = { av: true, ah: true };

/**
 * Quantas colunas o bloco final ocupa, já descontada a análise desligada.
 *
 * A `Média` fica em qualquer caso: ela está ao lado do `%AV` mas não é análise — é o valor
 * médio das colunas, e sai do bloco só quando o bloco inteiro vira variação.
 */
function blocoFinal(dados: Apuracao, colunas: ColunasDeAnalise = TUDO) {
  return mostraVariacao(dados.modo, dados.periodos)
    ? { variacao: true as const, largura: 2, rotulo: rotuloDaVariacao(dados.modo, dados.periodos) }
    : {
        variacao: false as const,
        largura: 2 + (colunas.av ? 1 : 0) + (colunas.ah ? 1 : 0),
        rotulo: "Total",
      };
}

export function matrizDaApuracao(
  dados: Apuracao,
  linhas: readonly LinhaDre[],
  colunas: ColunasDeAnalise = TUDO,
): Celula[][] {
  const multiMes = dados.periodos.length > 1;
  const fim = blocoFinal(dados, { ...colunas, ah: multiMes && colunas.ah });

  // O `%AH` só existe com duas colunas ou mais — ele compara com a anterior. É a mesma
  // regra da tela, e por isso a planilha de um mês nunca teve a coluna.
  const comAh = multiMes && colunas.ah;
  const porMes = 1 + (colunas.av ? 1 : 0) + (comAh ? 1 : 0);

  const faixaMeses: Celula[] = [txt("")];
  const rotulos: Celula[] = [txt("Descrição")];

  for (const p of dados.periodos) {
    // A faixa do mês é o rótulo numa célula e vazias nas demais: são elas que o `merge`
    // junta depois. Uma a menos aqui com uma a mais no merge desalinharia a planilha
    // inteira a partir do segundo mês.
    faixaMeses.push(txt(p.rotulo), ...Array.from({ length: porMes - 1 }, () => txt("")));
    rotulos.push(txt("Valor"));
    if (colunas.av) rotulos.push(txt("AV %"));
    if (comAh) rotulos.push(txt("AH %"));
  }

  if (multiMes) {
    faixaMeses.push(...Array.from({ length: fim.largura }, (_, i) => txt(i === 0 ? fim.rotulo : "")));
    rotulos.push(
      ...(fim.variacao
        ? [txt("Δ Valor"), txt("Δ %")]
        : [
            txt("Valor"),
            ...(colunas.av ? [txt("AV %")] : []),
            txt("Média"),
            // A soma dos %AH fecha a linha, como na tela.
            ...(comAh ? [txt("AH %")] : []),
          ]),
    );
  }

  const corpo = linhas.map((linha) => {
    const celulas: Celula[] = [txt(linha.descricao.trim())];

    for (const p of dados.periodos) {
      const v = linha.valores.find((x) => x.mesAno === p.mesAno);
      celulas.push(num(v?.valor ?? null, MOEDA));
      if (colunas.av) celulas.push(num(v?.percentualAv ?? null, PERCENTUAL_3));
      if (comAh) celulas.push(num(v?.percentualAh ?? null, PERCENTUAL_3));
    }

    if (multiMes && fim.variacao) {
      const v = variacao(linha.valores, dados.periodos, dados.modo);
      celulas.push(num(v?.absoluta ?? null, MOEDA), num(v?.percentual ?? null, PERCENTUAL_3));
    } else if (multiMes) {
      celulas.push(num(linha.total.valor, MOEDA));
      if (colunas.av) celulas.push(num(linha.total.percentualAv, PERCENTUAL_3));
      celulas.push(num(linha.total.media, MOEDA));
      // A MESMA função da tela, e não uma soma escrita de novo aqui: duas somas do mesmo
      // número divergem no primeiro dia em que alguém mudar o tratamento do nulo.
      if (comAh) celulas.push(num(somaDosAh(linha.valores), PERCENTUAL_3));
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
export function nomeDoArquivo(dados: Apuracao, baseId?: string): string {
  const nome = nomeSemBase(dados);

  // O ID da base, e não o rótulo: é ASCII, estável, e não precisa passar pela limpeza de nome
  // de arquivo. Entra logo depois de `DRE_` para os arquivos de uma base ficarem juntos na
  // pasta de quem arquiva.
  return baseId ? nome.replace(/^DRE_/, `DRE_${baseId}_`) : nome;
}

function nomeSemBase(dados: Apuracao): string {
  if (dados.modo === "anos") {
    return `DRE_${dados.analise}_${dados.periodos.map((p) => p.rotulo).join("_")}`;
  }

  // No comparativo o nome cita os DOIS intervalos: só o primeiro faria dois arquivos de
  // comparações diferentes saírem com o mesmo nome, e quem arquiva não teria como
  // distinguir um do outro.
  const segundo = dados.periodos.filter((p) => p.bloco === 1);
  const inicio2 = segundo[0]?.dataInicio;
  const fim2 = segundo.at(-1)?.dataFim;
  if (dados.modo === "comparar-anos" && inicio2 && fim2) {
    return (
      `DRE_${dados.analise}_${dados.dataInicio}_a_${dados.dataFim}` +
      `_vs_${inicio2}_a_${fim2}`
    );
  }

  return `DRE_${dados.analise}_${dados.dataInicio}_a_${dados.dataFim}`;
}

export function planilhaDaApuracao(
  dados: Apuracao,
  linhas: readonly LinhaDre[],
  analise: ColunasDeAnalise = TUDO,
): Planilha {
  const matriz = matrizDaApuracao(dados, linhas, analise);
  const colunas = matriz[1]?.length ?? 1;

  // Junta as colunas de cada bloco sob o rótulo dele, como na tela. O último bloco pode
  // ter duas colunas em vez de três — daí a largura vir da lista, e não de um passo fixo.
  const comAh = dados.periodos.length > 1 && analise.ah;
  const fim = blocoFinal(dados, { ...analise, ah: comAh });
  const larguras = dados.periodos.map(
    () => 1 + (analise.av ? 1 : 0) + (comAh ? 1 : 0),
  );
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
  analise: ColunasDeAnalise = TUDO,
  baseId?: string,
): Promise<void> {
  const blob = await gerarPlanilha([planilhaDaApuracao(dados, linhas, analise)]);
  baixar(blob, `${nomeDoArquivo(dados, baseId)}.xlsx`);
}

/** Só a geração, para conferir sem baixar. */
export const gerarApuracao = (
  dados: Apuracao,
  linhas: readonly LinhaDre[],
  analise: ColunasDeAnalise = TUDO,
) => gerarPlanilha([planilhaDaApuracao(dados, linhas, analise)]);

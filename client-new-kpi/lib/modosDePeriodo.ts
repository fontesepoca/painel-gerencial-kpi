/**
 * Os três modos de período: o que cada um significa, o que ele exige do filtro e quanto
 * costuma custar.
 *
 * Sem React, pelo mesmo motivo de `periodos.ts` — é matemática de data e regra de
 * validação, e as duas coisas precisam poder ser conferidas sozinhas.
 */

import type { FiltroApuracao, ModoPeriodo, PeriodoDre } from "@/types/dre-gerencial";

/**
 * Espelha `MaximoDeAnos` em `DreGerencialService`. Se divergir, o filtro deixa montar um
 * pedido que a API recusa — e o usuário descobre o limite depois de esperar.
 */
export const MAXIMO_DE_ANOS = 3;

/** Quantos anos para trás o seletor oferece. Além disso o dado fica raro e a espera, longa. */
const ANOS_OFERECIDOS = 6;

export const MODOS: ReadonlyArray<{
  valor: ModoPeriodo;
  rotulo: string;
  /** Uma frase, mostrada sob os controles: o que as colunas vão ser. */
  explicacao: string;
}> = [
  {
    valor: "meses",
    rotulo: "Meses",
    explicacao: "Uma coluna por mês do intervalo.",
  },
  {
    valor: "anos",
    rotulo: "Anos",
    explicacao: "Uma coluna por ano inteiro, de 01/01 a 31/12.",
  },
  {
    valor: "comparar-anos",
    rotulo: "Comparar anos",
    explicacao: "O mesmo intervalo de dias, repetido em cada ano escolhido.",
  },
];

/** Os anos que o seletor oferece, do mais recente para trás. */
export function anosOferecidos(hoje: Date = new Date()): number[] {
  const atual = hoje.getFullYear();
  return Array.from({ length: ANOS_OFERECIDOS }, (_, i) => atual - i);
}

/**
 * O modo usa a lista de anos? O mensal ignora.
 *
 * Escrito por inclusão, e não como `!== "meses"`, pelo mesmo motivo que `RecorteDre` trata
 * modo desconhecido como mensal: uma resposta sem `modo` — de uma API mais velha que este
 * front, ou de um teste que monta o objeto à mão — cairia no ramo dos anos e ligaria o
 * bloco de variação numa apuração mensal. Foi o que a dc13 pegou.
 */
export const usaAnos = (modo: ModoPeriodo) => modo === "anos" || modo === "comparar-anos";

/**
 * O modo usa as datas do campo Período?
 *
 * Em `anos` não: o recorte é o ano inteiro, e mostrar dois campos de data que não
 * influenciam nada seria mentir sobre o que o filtro faz.
 */
export const usaDatas = (modo: ModoPeriodo) => modo !== "anos";

/**
 * O que impede este filtro de ser apurado, ou `null` se nada impede.
 *
 * Mensagem para ler, não código de erro: ela aparece no lugar do motivo, sob o botão.
 */
export function impedimento(filtro: FiltroApuracao): string | null {
  if (filtro.filiais.length === 0) return "Escolha ao menos uma filial.";

  if (usaAnos(filtro.modo)) {
    if (filtro.anos.length === 0) return "Escolha ao menos um ano.";
    if (filtro.anos.length > MAXIMO_DE_ANOS) {
      return `Escolha no máximo ${MAXIMO_DE_ANOS} anos — foram ${filtro.anos.length}.`;
    }
  }

  return null;
}

/**
 * Quanto isto deve demorar, em texto.
 *
 * <b>Os números são medidos, não estimados de cabeça.</b> Um ano inteiro numa filial levou
 * de 4,5 a 6,8 minutos com o cache frio (dc19), e os anos rodam em paralelo — o custo de
 * dois anos é o do ano mais lento, mais cerca de um minuto (dc18). Mais filiais aumentam a
 * varredura, então o texto fala em "por filial" e não promete um número exato.
 *
 * Devolve `null` quando a espera é curta o bastante para não valer aviso: o modo mensal de
 * um mês responde em segundos, e um aviso ali só ensinaria a ignorar avisos.
 */
export function estimativaDeTempo(filtro: FiltroApuracao): string | null {
  if (filtro.modo === "anos") {
    const anos = filtro.anos.length;
    if (anos === 0) return null;
    return anos === 1
      ? "Um ano inteiro leva de 4 a 7 minutos por filial. A tela fica esperando."
      : `Os ${anos} anos são consultados ao mesmo tempo, então a espera é a de um ano só — ` +
          "de 4 a 7 minutos por filial, com algum acréscimo. A tela fica esperando.";
  }

  if (filtro.modo === "comparar-anos" && filtro.anos.length > 0) {
    const dias = diasEntre(filtro.dataInicio, filtro.dataFim);
    if (dias === null || dias < 45) return null;
    return "Recortes longos em vários anos passam de um minuto. A tela fica esperando.";
  }

  return null;
}

/** Dias do intervalo, inclusive as duas pontas. `null` se alguma data não faz sentido. */
function diasEntre(inicio: string, fim: string): number | null {
  const a = Date.parse(`${inicio}T00:00:00`);
  const b = Date.parse(`${fim}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * O bloco final da tabela mostra **variação** em vez de total?
 *
 * Sim nos modos de ano, e a razão é que o total deixa de significar alguma coisa ali:
 * somar 2025 com 2026 dá um número que ninguém usa, e a média entre dois anos, menos
 * ainda. O que se quer ao pôr dois anos lado a lado é a diferença — em reais e em
 * percentual.
 *
 * Precisa de **duas colunas no mínimo**: com um ano só não há de que variar, e aí o bloco
 * final volta a ser o total, como no modo mensal.
 */
export const mostraVariacao = (modo: ModoPeriodo, colunas: number) =>
  usaAnos(modo) && colunas >= 2;

/**
 * O rótulo do bloco de variação, dizendo entre o que e o quê: `2024 → 2026`.
 *
 * Com três anos a variação é da primeira coluna para a última, e o rótulo é a única coisa
 * que revela isso — sem ele, quem apura três anos supõe que a comparação é com o ano
 * anterior, que é o que a coluna `AH %` já mostra.
 */
export function rotuloDaVariacao(periodos: PeriodoDre[]): string {
  const primeiro = periodos[0];
  const ultimo = periodos.at(-1);
  if (!primeiro || !ultimo || primeiro === ultimo) return "Variação";
  return `${primeiro.rotulo} → ${ultimo.rotulo}`;
}

/**
 * A variação entre a primeira e a última coluna: quanto mudou, e em que proporção.
 *
 * `percentual` é `null` quando a base é zero — dividir por zero devolveria infinito, e uma
 * conta que saiu de nada para alguma coisa não tem percentual que a descreva. O valor
 * absoluto continua valendo, e é ele que a tela mostra nesse caso.
 */
export function variacao(
  valores: { valor: number }[],
): { absoluta: number; percentual: number | null } | null {
  const primeiro = valores[0];
  const ultimo = valores.at(-1);
  if (!primeiro || !ultimo || valores.length < 2) return null;

  const absoluta = ultimo.valor - primeiro.valor;
  return {
    absoluta,
    percentual: primeiro.valor === 0 ? null : (absoluta / Math.abs(primeiro.valor)) * 100,
  };
}

/**
 * Uma coluna que cobre mais de um mês? É o que decide se o duplo clique avisa antes.
 *
 * Detalhar um ano inteiro é a consulta mais cara da rotina rodando sobre doze meses, e
 * quem clica duas vezes numa célula não espera iniciar algo de minutos. A pergunta é feita
 * pelo tamanho do recorte, não pelo modo: um comparativo de dez dias não precisa avisar.
 */
export function recorteLongo(periodo: { dataInicio: string; dataFim: string }): boolean {
  const dias = diasEntre(periodo.dataInicio, periodo.dataFim);
  return dias !== null && dias > 45;
}

/**
 * Ajusta as datas ao menor ano escolhido, no modo comparativo.
 *
 * <b>Para o campo de data nunca mostrar um recorte que não existe.</b> Ali só o dia e o
 * mês contam — o servidor repete esse molde em cada ano —, e um `<input type="date">` é
 * obrigado a exibir um ano de qualquer jeito. Deixá-lo em 2026 enquanto as colunas são
 * 2024 e 2025 faz o campo dizer uma coisa e a tabela mostrar outra; ancorá-lo no primeiro
 * ano da comparação faz o campo exibir a primeira coluna de verdade.
 *
 * 29 de fevereiro é preso ao último dia do mês, a mesma regra de `RecorteDre.NoAno` — sem
 * isso, mover um recorte bissexto para um ano comum criaria uma data inexistente.
 */
export function ancorarNoPrimeiroAno(filtro: FiltroApuracao): FiltroApuracao {
  if (filtro.modo !== "comparar-anos" || filtro.anos.length === 0) return filtro;

  const ano = Math.min(...filtro.anos);
  const dataInicio = noAno(ano, filtro.dataInicio);
  const dataFim = noAno(ano, filtro.dataFim);

  if (dataInicio === filtro.dataInicio && dataFim === filtro.dataFim) return filtro;
  return { ...filtro, dataInicio, dataFim };
}

/** O mesmo dia e mês, no ano pedido. */
function noAno(ano: number, iso: string): string {
  const [, mes, dia] = iso.split("-").map(Number);
  if (!mes || !dia) return iso;

  const ultimo = new Date(ano, mes, 0).getDate();
  const diaValido = Math.min(dia, ultimo);
  return `${ano}-${`${mes}`.padStart(2, "0")}-${`${diaValido}`.padStart(2, "0")}`;
}

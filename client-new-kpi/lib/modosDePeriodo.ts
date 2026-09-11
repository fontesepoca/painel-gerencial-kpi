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
  /** Uma frase, mostrada sob o rótulo no menu: o que as colunas vão ser. */
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
    explicacao: "Uma coluna por ano inteiro, somando os doze meses.",
  },
  {
    valor: "comparar-anos",
    rotulo: "Comparar períodos",
    explicacao: "Dois intervalos lado a lado, cada um aberto em meses.",
  },
];

export const rotuloDoModo = (modo: ModoPeriodo) =>
  MODOS.find((m) => m.valor === modo)?.rotulo ?? "Meses";

/** Os anos que o seletor oferece, do mais recente para trás. */
export function anosOferecidos(hoje: Date = new Date()): number[] {
  const atual = hoje.getFullYear();
  return Array.from({ length: ANOS_OFERECIDOS }, (_, i) => atual - i);
}

/** O modo usa a lista de anos? Só o modo `anos`, desde 11/09/2026. */
export const usaAnos = (modo: ModoPeriodo) => modo === "anos";

/**
 * O modo usa as datas do campo Período?
 *
 * Em `anos` não: o recorte é o ano inteiro, e mostrar dois campos de data que não
 * influenciam nada seria mentir sobre o que o filtro faz.
 */
export const usaDatas = (modo: ModoPeriodo) => modo !== "anos";

/** O modo tem um SEGUNDO intervalo — o lado direito da comparação. */
export const usaSegundoIntervalo = (modo: ModoPeriodo) => modo === "comparar-anos";

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

  if (usaSegundoIntervalo(filtro.modo)) {
    // As mesmas regras do primeiro intervalo, ditas do lado de cá para a pessoa não
    // descobrir o limite depois de esperar a consulta.
    if (!filtro.comparacaoInicio || !filtro.comparacaoFim) {
      return "Preencha o segundo intervalo da comparação.";
    }
    if (filtro.comparacaoFim < filtro.comparacaoInicio) {
      return "No segundo intervalo, a data final não pode ser anterior à inicial.";
    }
    if (mesesEntre(filtro.comparacaoInicio, filtro.comparacaoFim) > 12) {
      return "O segundo intervalo não pode passar de 12 meses.";
    }
  }

  return null;
}

/** Meses cheios entre duas datas ISO, para o teto de 12. */
function mesesEntre(inicio: string, fim: string): number {
  const [ai, mi] = inicio.split("-").map(Number);
  const [af, mf] = fim.split("-").map(Number);
  if (!ai || !mi || !af || !mf) return 0;
  return (af - ai) * 12 + (mf - mi);
}

/**
 * Quanto isto deve demorar, em texto.
 *
 * <b>Os números são medidos, não estimados de cabeça.</b> Um ano inteiro numa filial levou
 * de 4,5 a 6,8 minutos com o cache frio (dc19), e os recortes rodam em paralelo — o custo de
 * dois é o do mais lento, mais cerca de um minuto (dc18).
 *
 * Devolve `null` quando a espera é curta o bastante para não valer aviso: um aviso que
 * aparece sempre só ensina a ignorar avisos.
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

  if (filtro.modo === "comparar-anos" && filtro.comparacaoInicio && filtro.comparacaoFim) {
    // O comparativo custa duas apurações mensais, rodando ao mesmo tempo. Só vira assunto
    // quando os intervalos são longos.
    const dias =
      (diasEntre(filtro.dataInicio, filtro.dataFim) ?? 0) +
      (diasEntre(filtro.comparacaoInicio, filtro.comparacaoFim) ?? 0);
    if (dias < 120) return null;
    return "Os dois intervalos são consultados ao mesmo tempo, mas juntos passam de quatro meses — a espera vai a minutos.";
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
 * Sim quando há dois blocos de colunas — o comparativo —, e sim no modo por ano com mais de
 * uma coluna. Nos dois casos somar tudo dá um número que ninguém usa: 2025 mais 2026, ou
 * janeiro de 2025 mais junho de 2026.
 *
 * No modo mensal o total continua sendo total, que é o que a 9815 mostra.
 */
export function mostraVariacao(modo: ModoPeriodo, periodos: PeriodoDre[]): boolean {
  if (modo === "comparar-anos") return blocos(periodos).length === 2;
  if (modo === "anos") return periodos.length >= 2;
  return false;
}

/** Os blocos presentes, em ordem. `[0]` fora do comparativo. */
export function blocos(periodos: PeriodoDre[]): number[] {
  return [...new Set(periodos.map((p) => p.bloco ?? 0))].sort((a, b) => a - b);
}

/**
 * O rótulo do bloco de variação, dizendo entre o que e o quê.
 *
 * No comparativo, os dois lados são intervalos inteiros — `Jan–Mar/2025 → Jun–Set/2026` —,
 * e não duas colunas. Sem isso, quem olha a coluna Δ supõe que ela compara os dois últimos
 * meses, que é outra conta.
 */
export function rotuloDaVariacao(modo: ModoPeriodo, periodos: PeriodoDre[]): string {
  if (modo === "comparar-anos") {
    const lados = blocos(periodos).map((b) => resumirBloco(periodos, b));
    return lados.length === 2 ? `${lados[0]} → ${lados[1]}` : "Variação";
  }

  const primeiro = periodos[0];
  const ultimo = periodos.at(-1);
  if (!primeiro || !ultimo || primeiro === ultimo) return "Variação";
  return `${primeiro.rotulo} → ${ultimo.rotulo}`;
}

/** `Jan–Mar/2025` a partir das colunas de um bloco; `Jan/2025` quando é um mês só. */
function resumirBloco(periodos: PeriodoDre[], bloco: number): string {
  const doBloco = periodos.filter((p) => (p.bloco ?? 0) === bloco);
  const primeiro = doBloco[0];
  const ultimo = doBloco.at(-1);
  if (!primeiro) return "";
  if (!ultimo || primeiro === ultimo) return primeiro.rotulo;

  const curto = (rotulo: string) => rotulo.slice(0, 3);
  const ano = ultimo.rotulo.split("/")[1] ?? "";
  return `${curto(primeiro.rotulo)}–${curto(ultimo.rotulo)}/${ano}`;
}

/**
 * A variação entre os dois lados: quanto a linha **cresceu ou encolheu**, e em que proporção.
 *
 * **No comparativo, compara a SOMA de cada intervalo**, e não a primeira contra a última
 * coluna. É o que permite os dois lados terem tamanhos diferentes — três meses de 2025
 * contra quatro de 2026 —, e é a pergunta que o modo existe para responder.
 *
 * Nos outros modos continua sendo primeira contra última coluna.
 *
 * ── A convenção de sinal, e por que ela não é `para − de` ──
 *
 * No DRE, dedução e despesa chegam **negativas**. Uma devolução que cresce vai de −1.000.000
 * para −1.127.178,73, e `para − de` dá **−127.178,73**: a subtração crua diz "negativo" para
 * uma linha que aumentou, e a tela mostrava `(127.178,73)` — que se lê como redução.
 *
 * Pior, isso **contradizia a coluna `AH %` ao lado**, que usa a fórmula da 9815
 * (`valor / anterior − 1`) e devolve **+12,7%** para essa mesma devolução. A mesma linha,
 * a mesma direção, com sinais opostos em duas colunas vizinhas — e cores opostas, porque a
 * regra de cor foi calibrada para a convenção do `AH %`.
 *
 * Aqui a variação passa a falar a mesma língua do `AH %`: **o sinal diz se a linha cresceu
 * ou encolheu**, não o que a subtração crua deu. A devolução que aumenta sai `+127.178,73`,
 * e `lerVariacao` a pinta de desfavorável, porque crescer é ruim numa linha negativa.
 *
 * O sentido vem do **total da linha**, o mesmo que a cor usa — assim o número e a cor nunca
 * podem discordar.
 *
 * `percentual` é `null` quando a base é zero: dividir por zero devolveria infinito, e uma
 * conta que saiu de nada para alguma coisa não tem percentual que a descreva. O valor
 * absoluto continua valendo.
 */
export function variacao(
  valores: readonly { valor: number }[],
  periodos: PeriodoDre[],
  modo: ModoPeriodo,
): { absoluta: number; percentual: number | null } | null {
  if (valores.length < 2) return null;

  let de: number;
  let para: number;

  if (modo === "comparar-anos") {
    const grupos = blocos(periodos);
    if (grupos.length !== 2) return null;

    const somaDoBloco = (bloco: number) =>
      valores.reduce(
        (s, v, i) => ((periodos[i]?.bloco ?? 0) === bloco ? s + v.valor : s),
        0,
      );

    de = somaDoBloco(grupos[0]!);
    para = somaDoBloco(grupos[1]!);
  } else {
    de = valores[0]!.valor;
    para = valores.at(-1)!.valor;
  }

  // Receita e resultado são positivos; dedução, custo e despesa, negativos. É o sinal do
  // total que diz de que lado esta linha está — e, portanto, o que "crescer" significa nela.
  const total = valores.reduce((s, v) => s + v.valor, 0);
  const sentido = Math.sign(total) || Math.sign(de) || Math.sign(para) || 1;

  return {
    absoluta: (para - de) * sentido,
    // A MESMA fórmula do `AH %` no montador (`valor / anterior − 1`), e não uma variante
    // com módulo: duas colunas percentuais lado a lado precisam concordar no sinal.
    percentual: de === 0 ? null : (para / de - 1) * 100,
  };
}

/**
 * Uma coluna que cobre mais de um mês? É o que decide se o duplo clique avisa antes.
 *
 * Detalhar um ano inteiro é a consulta mais cara da rotina rodando sobre doze meses, e
 * quem clica duas vezes numa célula não espera iniciar algo de minutos. A pergunta é feita
 * pelo tamanho do recorte, não pelo modo.
 */
export function recorteLongo(periodo: { dataInicio: string; dataFim: string }): boolean {
  const dias = diasEntre(periodo.dataInicio, periodo.dataFim);
  return dias !== null && dias > 45;
}

/**
 * O segundo intervalo sugerido quando alguém entra no comparativo: **o mesmo recorte, um
 * ano antes**.
 *
 * É a comparação que se pede num DRE nove vezes em dez, e deixar os campos vazios obrigaria
 * a digitar duas datas antes de ver qualquer coisa. Continua sendo só uma sugestão — os dois
 * intervalos são livres, e mexer num não mexe no outro.
 *
 * 29 de fevereiro é preso ao último dia do mês: criar 29/02 num ano comum devolveria uma
 * data inválida, e o campo mostraria vazio sem explicar por quê.
 */
export function intervaloSugerido(filtro: FiltroApuracao): {
  comparacaoInicio: string;
  comparacaoFim: string;
} {
  return {
    comparacaoInicio: umAnoAntes(filtro.dataInicio),
    comparacaoFim: umAnoAntes(filtro.dataFim),
  };
}

function umAnoAntes(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  if (!ano || !mes || !dia) return iso;

  const anterior = ano - 1;
  const ultimo = new Date(anterior, mes, 0).getDate();
  const diaValido = Math.min(dia, ultimo);
  return `${anterior}-${`${mes}`.padStart(2, "0")}-${`${diaValido}`.padStart(2, "0")}`;
}

/**
 * Os rótulos das colunas, **garantidamente distintos**.
 *
 * No comparativo os dois lados podem cair no mesmo mês — comparar 28/08–03/09 com
 * 05/09–11/09 põe `Setembro/2026` duas vezes no cabeçalho, e nada na tabela diz qual é
 * qual. Quando isso acontece, o rótulo passa a levar os dias: `Set 01–03/2026`.
 *
 * **Só quando há repetição.** O caso comum é comparar anos diferentes, onde `Janeiro/2025` e
 * `Janeiro/2026` já se distinguem sozinhos — acrescentar dias a todos encheria o cabeçalho
 * de números para resolver um problema que não existe ali.
 */
export function rotulosDistintos(periodos: PeriodoDre[]): string[] {
  const vezes = new Map<string, number>();
  for (const p of periodos) vezes.set(p.rotulo, (vezes.get(p.rotulo) ?? 0) + 1);

  return periodos.map((p) =>
    (vezes.get(p.rotulo) ?? 0) > 1 ? comOsDias(p) : p.rotulo,
  );
}

/** `Set 01–03/2026` — mês curto, os dias do recorte e o ano. */
function comOsDias(p: PeriodoDre): string {
  const dia = (iso: string) => iso.slice(8, 10);
  const [ano, , ] = p.dataInicio.split("-");
  const mes = p.rotulo.slice(0, 3);
  return `${mes} ${dia(p.dataInicio)}–${dia(p.dataFim)}/${ano}`;
}

/** Esta coluna abre um bloco novo? É onde a tabela precisa de um corte visível. */
export function abreBloco(periodos: PeriodoDre[], indice: number): boolean {
  if (indice === 0) return false;
  return (periodos[indice]?.bloco ?? 0) !== (periodos[indice - 1]?.bloco ?? 0);
}

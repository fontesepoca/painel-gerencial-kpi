/**
 * Aritmética decimal EXATA, para reproduzir na tela a conta que o Oracle faz.
 *
 * <b>Por que não `number`.</b> O `number` do JavaScript é ponto flutuante binário: `0,1 + 0,2`
 * dá `0,30000000000000004`, e `1,0005` vira `1,000499999…` por dentro. Arredondado em três
 * casas, sai `1,000` onde o Oracle — que guarda `NUMBER` em decimal — dá `1,001`. Numa tela que
 * precisa bater com o SQL ao milésimo, isso é defeito garantido, e do tipo que só aparece em
 * algumas linhas.
 *
 * <b>Como.</b> Um valor é um inteiro `BigInt` com uma escala: `12,345` é `{ m: 12345n, e: 3 }`.
 * Soma, subtração e multiplicação são exatas. A divisão só acontece dentro de {@link arredondar}
 * e de {@link dividirArredondando}, onde o resto decide o arredondamento sem nenhuma perda.
 *
 * <b>O arredondamento é o do `ROUND` do Oracle:</b> meio para LONGE do zero
 * (`ROUND(2,5) = 3`, `ROUND(-2,5) = -3`). O `Math.round` do JavaScript leva o meio para cima
 * (`Math.round(-2,5) = -2`), e o `Math.Round` do C# usa o meio para o par — nenhum dos dois
 * serve aqui.
 *
 * Sem dependência: uma biblioteca de decimal resolveria, mas é biblioteca nova (precisa de
 * aprovação) para quatro operações.
 */

export interface Decimal {
  /** Mantissa inteira. */
  readonly m: bigint;
  /** Casas decimais: o valor é `m / 10^e`. */
  readonly e: number;
}

const DEZ = 10n;
const potencia = (n: number): bigint => DEZ ** BigInt(n);

/**
 * Lê um número que veio do JSON da API.
 *
 * <b>Pelo texto, nunca pela conta.</b> `String(7.6)` é `"7.6"` — o JavaScript escreve o menor
 * texto que volta ao mesmo número, que é o que o banco mandou. Multiplicar por 10 até sumir a
 * vírgula trairia a imprecisão binária de volta. Notação científica (`1e-7`) é tratada.
 */
export function de(valor: number): Decimal {
  if (!Number.isFinite(valor)) throw new Error(`Número inválido para conta exata: ${valor}`);

  const [base = "0", expoente = "0"] = String(valor).toLowerCase().split("e");
  const negativo = base.startsWith("-");
  const [inteira = "0", fracao = ""] = base.replace("-", "").split(".");

  let m = BigInt(inteira + fracao);
  let e = fracao.length - Number(expoente);
  if (e < 0) {
    m *= potencia(-e);
    e = 0;
  }
  return { m: negativo ? -m : m, e };
}

/** Zero, com escala zero. */
export const ZERO: Decimal = { m: 0n, e: 0 };

/** Põe os dois na mesma escala, sem perder nada. */
function alinhar(a: Decimal, b: Decimal): [bigint, bigint, number] {
  const e = Math.max(a.e, b.e);
  return [a.m * potencia(e - a.e), b.m * potencia(e - b.e), e];
}

export function somar(a: Decimal, b: Decimal): Decimal {
  const [x, y, e] = alinhar(a, b);
  return { m: x + y, e };
}

export function subtrair(a: Decimal, b: Decimal): Decimal {
  const [x, y, e] = alinhar(a, b);
  return { m: x - y, e };
}

export function multiplicar(a: Decimal, b: Decimal): Decimal {
  return { m: a.m * b.m, e: a.e + b.e };
}

/** Divide por 100 — exato: só muda a escala. É o "/ 100" de todo percentual do SQL. */
export function porCento(a: Decimal): Decimal {
  return { m: a.m, e: a.e + 2 };
}

export function absoluto(a: Decimal): Decimal {
  return { m: a.m < 0n ? -a.m : a.m, e: a.e };
}

export function ehZero(a: Decimal): boolean {
  return a.m === 0n;
}

export function maiorQueZero(a: Decimal): boolean {
  return a.m > 0n;
}

/**
 * `numerador / denominador`, arredondado em `casas` como o Oracle: meio para longe do zero.
 * Exato: decide pelo resto, sem truncar dígito nenhum antes.
 */
function arredondarRazao(numerador: bigint, denominador: bigint, casas: number): Decimal {
  if (denominador === 0n) throw new Error("Divisão por zero.");
  if (denominador < 0n) {
    numerador = -numerador;
    denominador = -denominador;
  }
  const negativo = numerador < 0n;
  const n = negativo ? -numerador : numerador;

  let q = n / denominador;
  const resto = n % denominador;
  if (resto * 2n >= denominador) q += 1n;

  return { m: negativo ? -q : q, e: casas };
}

/** `ROUND(a, casas)` do Oracle. */
export function arredondar(a: Decimal, casas: number): Decimal {
  if (a.e <= casas) return { m: a.m * potencia(casas - a.e), e: casas };
  return arredondarRazao(a.m, potencia(a.e - casas), casas);
}

/** `ROUND(a / b, casas)` do Oracle, sem arredondar a divisão antes. */
export function dividirArredondando(a: Decimal, b: Decimal, casas: number): Decimal {
  // a/b = (a.m / 10^a.e) / (b.m / 10^b.e). Multiplicado por 10^casas para o resultado sair
  // na escala pedida: numerador a.m · 10^(b.e + casas), denominador b.m · 10^a.e.
  return arredondarRazao(a.m * potencia(b.e + casas), b.m * potencia(a.e), casas);
}

/** De volta a `number`, para exibir. Só no fim: a conta inteira já foi feita em decimal. */
export function paraNumero(a: Decimal): number {
  return Number(paraTexto(a));
}

/** Texto com ponto decimal e exatamente `a.e` casas (`"-12.340"`). */
export function paraTexto(a: Decimal): string {
  const negativo = a.m < 0n;
  const digitos = (negativo ? -a.m : a.m).toString().padStart(a.e + 1, "0");
  const inteira = a.e === 0 ? digitos : digitos.slice(0, -a.e);
  const fracao = a.e === 0 ? "" : `.${digitos.slice(-a.e)}`;
  return `${negativo ? "-" : ""}${inteira}${fracao}`;
}

/** Igualdade de VALOR, qualquer que seja a escala (`1,50` = `1,5`). */
export function iguais(a: Decimal, b: Decimal): boolean {
  const [x, y] = alinhar(a, b);
  return x === y;
}

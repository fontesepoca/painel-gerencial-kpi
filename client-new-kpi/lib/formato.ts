const MOEDA = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Valor no padrão da 9815: negativo entre parênteses, sem símbolo de moeda.
 * A grade antiga faz assim, e quem confere as duas lado a lado espera o mesmo.
 * Instância do Intl criada fora da função — em tabela de 123 linhas isso pesa.
 */
export function formatarValor(valor: number): string {
  const texto = MOEDA.format(Math.abs(valor));
  return valor < 0 ? `(${texto})` : texto;
}

/** Percentual com 3 casas, como na 9815. Negativo entre parênteses. */
export function formatarPercentual(valor: number | null): string {
  if (valor === null) return "";
  const texto = valor.toFixed(3).replace(".", ",").replace("-", "");
  return valor < 0 ? `(${texto})` : texto;
}

/** `2026-08-01` → `01/08/2026`. Sem fuso: a data vem sem hora e é local. */
export function formatarDataIso(iso: string): string {
  const partes = iso.split("-");
  const ano = Number(partes[0]);
  const mes = Number(partes[1]);
  const dia = Number(partes[2]);
  if (!ano || !mes || !dia) return iso;
  return DATA_CURTA.format(new Date(ano, mes - 1, dia));
}

/** Duração legível: 850 ms, 12 s, 2 min 47 s. */
export function formatarDuracao(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const segundos = Math.round(ms / 1000);
  if (segundos < 60) return `${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  return `${minutos} min ${segundos % 60} s`;
}

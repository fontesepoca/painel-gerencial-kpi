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

/**
 * Percentual, negativo entre parênteses.
 *
 * **Três casas por padrão**, como a 9815 usa em `%AV` e `%AH`. O `%PART` da devolução
 * pede duas, também como ela: aquele valor já vem arredondado em duas casas pela consulta,
 * e a terceira seria sempre zero — precisão que o número não tem.
 *
 * **Uma casa existe para o papel.** Na impressão com quatro meses, `19,474` gasta seis
 * caracteres de uma folha onde 12px decidem se a última coluna sai cortada, e a terceira
 * casa de uma variação percentual não muda decisão nenhuma. `19,5` guarda a ordem de
 * grandeza e o sentido do arredondamento, que é o que se lê num relatório impresso.
 */
export function formatarPercentual(valor: number | null, casas: 0 | 1 | 2 | 3 = 3): string {
  if (valor === null) return "";
  const texto = valor.toFixed(casas).replace(".", ",").replace("-", "");
  return valor < 0 ? `(${texto})` : texto;
}

const MILESIMOS = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

/**
 * Valor com TRÊS casas, negativo entre parênteses — para o simulador de preço, onde o SQL
 * arredonda em três casas e a tela mostra exatamente o número dele (decisão de 18/11/2026).
 * Duas casas esconderiam a terceira e fariam a tela "discordar" do SQL por arredondamento.
 */
export function formatarValor3(valor: number): string {
  const texto = MILESIMOS.format(Math.abs(valor));
  return valor < 0 ? `(${texto})` : texto;
}

const PERCENTUAL_LIVRE = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/**
 * Percentual cadastrado, de duas a quatro casas, negativo entre parênteses.
 *
 * <b>Até quatro casas</b> porque há percentual que o SQL não arredonda: o ICMS de custo com
 * base reduzida sai `18 × 61,11 / 100 = 10,9998`, e duas casas o mostrariam como `11,00` —
 * um número que não está em lugar nenhum da conta.
 */
export function formatarPercentualLivre(valor: number): string {
  const texto = PERCENTUAL_LIVRE.format(Math.abs(valor));
  return valor < 0 ? `(${texto})` : texto;
}

const SO_HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const DIA_E_MES = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

/**
 * "Consultado às 14:32" quando a consulta é de hoje; "Consultado em 22/11 às 14:32" quando não é
 * (e com o ano, se for de outro ano). Revisão final de 23/11/2026: uma tela de simulador deixada
 * aberta de um dia para o outro mostraria a consulta de ontem com cara de ser de hoje.
 *
 * @param agora injetável para o teste (sp12); na tela, `new Date()`.
 */
export function formatarMomentoDaConsulta(iso: string, agora: Date = new Date()): string {
  const quando = new Date(iso);
  const hora = SO_HORA.format(quando);
  const mesmoAno = quando.getFullYear() === agora.getFullYear();
  if (mesmoAno && quando.getMonth() === agora.getMonth() && quando.getDate() === agora.getDate()) {
    return `Consultado às ${hora}`;
  }
  const dia = mesmoAno ? DIA_E_MES.format(quando) : DATA_CURTA.format(quando);
  return `Consultado em ${dia} às ${hora}`;
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

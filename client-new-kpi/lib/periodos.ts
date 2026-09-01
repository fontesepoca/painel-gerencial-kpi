/**
 * Matemática de datas dos atalhos de período. Sem React, para o cálculo poder ser
 * conferido sozinho — e porque errar data é o tipo de defeito que passa despercebido
 * até alguém apurar o mês errado.
 */

/**
 * Formata uma `Date` **local** como `yyyy-MM-dd`.
 *
 * Não use `toISOString()` para isto. Ele converte para UTC antes de cortar, e num
 * fuso negativo como o nosso (UTC−3) qualquer horário a partir das 21h vira o dia
 * seguinte: às 21h30 de 31/08, `new Date().toISOString()` devolve `2026-09-01`.
 * O filtro nasceria apontando para amanhã, e ninguém repararia — a data existe,
 * só está errada.
 */
export function paraIso(d: Date): string {
  const mes = `${d.getMonth() + 1}`.padStart(2, "0");
  const dia = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** `dd/MM/yyyy`, para mostrar o intervalo dentro do próprio atalho. */
export function paraBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export interface AtalhoPeriodo {
  id: string;
  rotulo: string;
  dataInicio: string;
  dataFim: string;
}

/** Último dia do mês de `ano`/`mes` — dia 0 do mês seguinte. */
const ultimoDia = (ano: number, mes: number) => new Date(ano, mes + 1, 0);

/**
 * Os quatro atalhos prometidos na especificação (§3.1).
 *
 * **"Últimos 3 meses" são três meses COMPLETOS**, terminando no mês passado — não
 * inclui o mês corrente, que estaria pela metade e faria a comparação entre colunas
 * mentir. Como isso é discutível, cada atalho exibe o intervalo exato que vai
 * aplicar: quem escolhe vê `01/05/2026 a 31/07/2026`, não precisa deduzir a regra.
 *
 * `hoje` é parâmetro para o cálculo poder ser exercitado em qualquer data.
 */
export function atalhosPeriodo(hoje: Date = new Date()): AtalhoPeriodo[] {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();

  const ontem = new Date(ano, mes, hoje.getDate() - 1);
  const fimDoMesPassado = ultimoDia(ano, mes - 1);

  return [
    {
      id: "ontem",
      rotulo: "Ontem",
      dataInicio: paraIso(ontem),
      dataFim: paraIso(ontem),
    },
    {
      id: "mes-passado",
      rotulo: "Mês passado",
      dataInicio: paraIso(new Date(ano, mes - 1, 1)),
      dataFim: paraIso(fimDoMesPassado),
    },
    {
      id: "tres-meses",
      rotulo: "Últimos 3 meses",
      dataInicio: paraIso(new Date(ano, mes - 3, 1)),
      dataFim: paraIso(fimDoMesPassado),
    },
    {
      id: "ano-passado",
      rotulo: "Ano passado",
      dataInicio: paraIso(new Date(ano - 1, 0, 1)),
      dataFim: paraIso(new Date(ano - 1, 11, 31)),
    },
  ];
}

/**
 * Recorte de um mês da tabela, para o detalhamento do duplo clique.
 *
 * `mesAno` vem da API como `mm/yyyy`. O intervalo devolvido é o mês **cruzado com o
 * período apurado**, nunca o mês calendário solto: apurando de 01/08 a 27/08, clicar em
 * agosto detalha 01/08 a 27/08. Detalhar o mês inteiro mostraria lançamentos que não
 * entraram na célula clicada, e o total da tela deixaria de bater com ela — que é
 * exatamente o defeito da 9815 que decidimos corrigir.
 *
 * Devolve `null` se o mês não intersecta o período. Não deveria acontecer, já que as
 * colunas nascem do próprio período, mas devolver um intervalo invertido seria pior:
 * o banco aceita e responde vazio, e some sem erro.
 */
export function recorteDoMes(
  mesAno: string,
  dataInicio: string,
  dataFim: string,
): { dataInicio: string; dataFim: string } | null {
  const [mes, ano] = mesAno.split("/").map(Number);
  if (!mes || !ano) return null;

  const primeiro = paraIso(new Date(ano, mes - 1, 1));
  const ultimo = paraIso(ultimoDia(ano, mes - 1));

  // Comparação de texto funciona em `yyyy-MM-dd`: a ordem lexicográfica é a cronológica.
  const inicio = primeiro > dataInicio ? primeiro : dataInicio;
  const fim = ultimo < dataFim ? ultimo : dataFim;

  return inicio > fim ? null : { dataInicio: inicio, dataFim: fim };
}

/** Mês corrente, do dia 1 até hoje — o recorte que a tela abre. */
export function periodoPadrao(hoje: Date = new Date()) {
  return {
    dataInicio: paraIso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
    dataFim: paraIso(hoje),
  };
}

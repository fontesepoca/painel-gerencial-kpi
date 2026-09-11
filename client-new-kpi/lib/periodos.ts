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

/* O recorte de um mês para o duplo clique morava aqui, em `recorteDoMes`. Saiu em
   10/09/2026: a conta partia de `mm/yyyy` e só funcionava enquanto coluna fosse sinônimo
   de mês — numa coluna `2026` devolveria janeiro. Hoje cada coluna traz o próprio recorte
   do servidor, que é o único que sabe recortar uma coluna que não é um mês. A regra
   continua a mesma e agora vive em `RecorteDre.RecorteDoMes`, na API. */

/** Mês corrente, do dia 1 até hoje — o recorte que a tela abre. */
export function periodoPadrao(hoje: Date = new Date()) {
  return {
    dataInicio: paraIso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
    dataFim: paraIso(hoje),
  };
}

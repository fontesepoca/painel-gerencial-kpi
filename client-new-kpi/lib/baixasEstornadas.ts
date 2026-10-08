/**
 * Oculta do detalhamento as baixas estornadas e as da rotina 737 — **só quando o checkbox
 * pede**, e dizendo quanto saiu.
 *
 * Pedido do Gabriel em 08/10/2026, escrito como SQL:
 *
 *     pclanc.dtestornobaixa is null and pclanc.codrotinabaixa not like '%737%'
 *
 * Fica na tela o que satisfaz a condição; o resto some enquanto o checkbox estiver marcado,
 * e ele vem marcado.
 *
 * ## A diferença em relação ao SQL, acertada com ele
 *
 * **Rotina de baixa vazia continua na tela.** No Oracle, `NULL NOT LIKE '%737%'` não é
 * verdadeiro, e o filtro ao pé da letra esconderia todo lançamento sem `CODROTINABAIXA` —
 * na filial 7 em junho/2026 eram 625 lançamentos, −466.160,04, que a linha do DRE soma.
 *
 * ## Por que isto é apresentação, e não consulta
 *
 * A apuração **conta** esses lançamentos (`DTESTORNOBAIXA IS NULL` é o filtro que a 9815
 * tem só no detalhamento, e que a §4 do DIVERGENCIAS.md tirou da consulta). Por isso a
 * consulta continua trazendo tudo, e quem esconde é a tela: desmarcar o checkbox devolve as
 * linhas na hora, sem ir ao banco.
 *
 * No agregado da filial 7, junho/2026, os dois grupos somam **0,00** (160 estornadas e 48
 * da 737) — são pares. Numa conta isolada, não necessariamente: em `VENDAS` o filtro da
 * 9815 deixava −471,87 de fora. Daí `somaOculta`: a tela diz o que tirou, e o rodapé pode
 * não fechar com a célula enquanto o checkbox estiver marcado.
 */

export interface LancamentoComBaixa {
  vPago: number;
  /** Ausente quando a API é anterior a 08/10/2026 — aí nada é ocultado. */
  dtEstornoBaixa?: string | null;
  codRotinaBaixa?: string | null;
}

/** O lançamento sai da tela com o checkbox marcado. */
export function ocultavel(l: LancamentoComBaixa): boolean {
  if (l.dtEstornoBaixa) return true;
  return (l.codRotinaBaixa ?? "").includes("737");
}

/**
 * Devolve a lista sem as baixas estornadas e da rotina 737, quando `ocultar` é verdadeiro.
 *
 * `ocultos` e `somaOculta` existem para a tela poder dizer o que fez — esconder dado
 * financeiro em silêncio faria o rodapé divergir da célula sem explicação.
 */
export function semBaixasEstornadas<T extends LancamentoComBaixa>(
  linhas: readonly T[],
  ocultar: boolean,
): { visiveis: T[]; ocultos: number; somaOculta: number } {
  if (!ocultar) return { visiveis: [...linhas], ocultos: 0, somaOculta: 0 };

  const visiveis: T[] = [];
  let ocultos = 0;
  let centavos = 0;
  for (const l of linhas) {
    if (ocultavel(l)) {
      ocultos++;
      // Em centavos inteiros: somar moeda em ponto flutuante deixa resíduo de 0,0000001.
      centavos += Math.round(l.vPago * 100);
    } else {
      visiveis.push(l);
    }
  }
  return { visiveis, ocultos, somaOculta: centavos / 100 };
}

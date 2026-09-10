/**
 * Some da lista os estornos que **se anulam**, sem tocar em valor nenhum.
 *
 * Pedido do Gabriel em 10/09/2026: o detalhamento de `ADMINISTRATIVO` mostrava um par
 * `REF.ESTORN.BORDERO JA BAIXADO` de +22.000,00 e −22.000,00 que a 9815 não mostra, e o
 * usuário leu aquilo como valor entrando no cálculo.
 *
 * **O cálculo estava certo.** Medido nos dois arquivos do mesmo cenário: 5 lançamentos na
 * 9815 e 7 no nosso, e a soma **idêntica** nos dois — −71.311,55. O par se cancela; era
 * ruído na leitura, não erro de número.
 *
 * ## Por que não copiamos o filtro da 9815
 *
 * Ela tem `DTESTORNOBAIXA IS NULL` **só no detalhamento**, e a apuração dela conta os
 * estornados. Copiar isso reintroduz um defeito já medido: em `VENDAS` esconde 25
 * lançamentos que a linha conta, e em `RATEIO DESP. CORPORATIVAS` o par de ±36.726,00 cai
 * em blocos diferentes — cada linha perde um lado e **cada uma passa a errar**, com o total
 * geral fechando por acidente. Ver `DreDetalheQueries.cs` e `DIVERGENCIAS.md` §4.
 *
 * ## A regra daqui, e por que ela é segura
 *
 * Só desaparece **par exato de valores opostos, dentro do mesmo grupo da tela**. As duas
 * condições existem por motivos diferentes:
 *
 * - **valores opostos**: a soma do par é zero, então o rodapé de totais não muda — é isso
 *   que mantém o detalhamento fechando com a linha do DRE;
 * - **mesmo grupo** (centro de custo + conta): sem isso, esconder um par dividido entre duas
 *   contas manteria o total geral e **mudaria os dois subtotais**, que é o defeito da 9815
 *   com outro nome.
 *
 * Estorno sem par continua visível. Um lançamento cuja contrapartida ficou fora do período
 * é justamente o que ninguém deve esconder: ele afeta o total, e some da vista seria mentir
 * sobre a soma.
 *
 * **Nada disto chega ao banco.** As consultas continuam trazendo tudo, e este módulo é
 * apresentação — reversível apagando uma chamada.
 */

export interface LancamentoFiltravel {
  historico: string | null;
  vPago: number;
  codCcPrinc: string | null;
  codConta: number | null;
}

/**
 * `REF.ESTORN.BORDERO JA BAIXADO`, `ESTORNO DO CONTAS A PAGAR`, `Estorno de baixa`…
 *
 * Compara sem acento e sem caixa, sobre o radical `ESTORN` — que cobre "estorno",
 * "estornado" e "estornar" de uma vez. É critério de **texto**, e por isso vale só para
 * esconder: nenhum valor é calculado a partir dele.
 */
export function pareceEstorno(historico: string | null): boolean {
  if (!historico) return false;
  return historico
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .includes("ESTORN");
}

/** Centavos inteiros: comparar moeda em ponto flutuante deixa par legítimo sem casar. */
const centavos = (valor: number) => Math.round(valor * 100);

/** O grupo que a tela desenha — centro de custo principal e conta. */
const grupoDe = (l: LancamentoFiltravel) => `${l.codCcPrinc ?? "-"}|${l.codConta ?? "-"}`;

/**
 * Devolve a lista sem os pares de estorno que se anulam, e quantos saíram.
 *
 * `omitidos` é para a tela poder dizer o que fez. Esconder dado financeiro em silêncio é
 * pior que mostrar o ruído: quem confere com a rotina antiga precisa saber por que a
 * contagem de linhas difere.
 */
export function semEstornosQueSeAnulam<T extends LancamentoFiltravel>(
  linhas: readonly T[],
): { visiveis: T[]; omitidos: number } {
  /** Por grupo, os índices dos estornos positivos ainda sem par, por valor em centavos. */
  const positivos = new Map<string, Map<number, number[]>>();
  const aOmitir = new Set<number>();

  // Duas passadas: a primeira indexa os positivos, a segunda procura o oposto de cada
  // negativo. Numa passada só, um negativo que vem antes do seu par não casaria.
  linhas.forEach((l, i) => {
    if (!pareceEstorno(l.historico) || centavos(l.vPago) <= 0) return;
    const grupo = grupoDe(l);
    const porValor = positivos.get(grupo) ?? new Map<number, number[]>();
    const chave = centavos(l.vPago);
    porValor.set(chave, [...(porValor.get(chave) ?? []), i]);
    positivos.set(grupo, porValor);
  });

  linhas.forEach((l, i) => {
    if (!pareceEstorno(l.historico) || centavos(l.vPago) >= 0) return;
    const disponiveis = positivos.get(grupoDe(l))?.get(-centavos(l.vPago));
    const par = disponiveis?.shift();
    if (par === undefined) return;
    aOmitir.add(par);
    aOmitir.add(i);
  });

  return {
    visiveis: linhas.filter((_, i) => !aOmitir.has(i)),
    omitidos: aOmitir.size,
  };
}

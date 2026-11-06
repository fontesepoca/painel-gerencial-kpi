import { num, txt, type Celula, type Planilha } from "@/lib/excel";

/**
 * A COMPOSIÇÃO de um totalizador: de que linhas ele é feito, com o valor de cada uma.
 *
 * É o que o duplo clique no totalizador mostra, e — desde 06/11/2026, pedido do Gabriel — o
 * que se exporta dele, pelo botão direito ou marcado junto com as contas. **Não vai ao
 * banco:** o valor de um totalizador é aritmética sobre linhas que já estão na tela, e as
 * parcelas são lidas da própria linha citada — os dois lados leem o mesmo número.
 */

/** Só o que a composição lê de uma linha do DRE. */
interface LinhaComposta {
  chaveOrdem: string;
  descricao: string;
  valores: readonly { mesAno: string; valor: number }[];
  total: { valor: number };
  semMovimento?: boolean;
  composicao?: readonly { chaveOrdem: string; rotulo: string; sinal: number }[] | null;
}

export interface Parcela {
  rotulo: string;
  valor: number;
  semMovimento?: boolean;
}

/**
 * A composição de `linha` numa coluna (`mesAno`) ou no período inteiro (`null`).
 *
 * Parcela sem linha correspondente em `todas` não vira zero: some. Um zero inventado no meio
 * de uma composição parece uma conta que fechou.
 */
export function composicaoDaLinha(
  linha: LinhaComposta,
  todas: readonly LinhaComposta[],
  mesAno: string | null,
): { total: number; parcelas: Parcela[] } {
  const valorDe = (l: LinhaComposta) =>
    mesAno ? (l.valores.find((v) => v.mesAno === mesAno)?.valor ?? 0) : l.total.valor;

  const parcelas = (linha.composicao ?? []).flatMap((p) => {
    const alvo = todas.find((l) => l.chaveOrdem === p.chaveOrdem);
    return alvo ? [{ rotulo: p.rotulo, valor: p.sinal * valorDe(alvo), semMovimento: alvo.semMovimento }] : [];
  });

  return { total: valorDe(linha), parcelas };
}

/** A paleta do papel — a mesma do Excel do detalhamento (`exportarExcelDetalhe.ts`). */
const COR = { texto: "#0F172A", cabecalho: "#F1F5F9", divisorForte: "#B6B9C0" } as const;

/**
 * A planilha da composição: uma linha por parcela e, por último, o total com o título —
 * a mesma leitura do modal, de cima para baixo, terminando no número que foi clicado.
 */
export function planilhaDaComposicao({
  titulo,
  total,
  parcelas,
}: {
  titulo: string;
  periodo: { dataInicio: string; dataFim: string };
  total: number;
  parcelas: readonly Parcela[];
}): Planilha {
  const cabecalho: Celula[] = [
    { ...txt("Linha"), s: { negrito: true, fundo: COR.cabecalho } },
    { ...txt("Valor"), s: { negrito: true, fundo: COR.cabecalho, alinhar: "direita" } },
  ];
  const corpo: Celula[][] = parcelas.map((p) => [txt(p.rotulo), num(p.valor)]);
  const linhaDoTotal: Celula[] = [
    { ...txt(titulo), s: { negrito: true, borda: { cima: { peso: "grossa", cor: COR.divisorForte } } } },
    { ...num(total), s: { negrito: true, cor: COR.texto, borda: { cima: { peso: "grossa", cor: COR.divisorForte } } } },
  ];

  return {
    aba: "Composição",
    matriz: [cabecalho, ...corpo, linhaDoTotal],
    larguras: [48, 18],
    congelar: { colunas: 0, linhas: 1 },
  };
}

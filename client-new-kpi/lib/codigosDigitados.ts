/**
 * A leitura do campo de busca do filtro de fornecedores quando ele vira uma LISTA.
 *
 * <b>A vírgula é o que muda o modo.</b> Quem sabe de cor os códigos que quer — e quem filtra
 * DRE sabe — não quer procurar, escolher, procurar de novo, escolher de novo: quer digitar
 * `29,253,1180` e apurar. A vírgula separa um código do outro e, de quebra, diz que aquele
 * código acabou: `29,` é o 29 inteiro, enquanto `29` ainda pode virar `290`.
 *
 * <b>Por isso o último pedaço fica de fora dos confirmados.</b> Selecionar `2` no caminho de
 * quem está digitando `253` traria um fornecedor errado para o filtro e obrigaria a tirá-lo
 * na mão. O último pedaço só entra quando a pessoa fecha o popover — aí ela terminou de
 * digitar, e `29,253` quer dizer os dois.
 */

/** O que está escrito no campo, separado entre o que já acabou e o que ainda está sendo digitado. */
export interface Digitacao {
  /** Tem vírgula? Então é lista, e a busca por nome sai de cena. */
  modoLista: boolean;
  /** Os códigos antes da última vírgula — estes já podem entrar no filtro. */
  confirmados: number[];
  /** O pedaço depois da última vírgula, cru: ainda está sendo digitado. */
  pendente: string;
}

/** Um pedaço só vira código se for todo dígito e não for zero. Vazio é pedaço ignorado. */
function codigoDe(pedaco: string): number | null {
  const t = pedaco.trim();
  if (!/^\d+$/.test(t)) return null;

  const n = Number(t);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Sem repetir, preservando a ordem em que a pessoa digitou. */
function semRepetir(codigos: number[]): number[] {
  return [...new Set(codigos)];
}

export function lerDigitacao(texto: string): Digitacao {
  const pedacos = texto.split(",");

  // `split` sempre devolve ao menos um elemento, mas o tipo não sabe disso — e o projeto
  // compila com `noUncheckedIndexedAccess`.
  const pendente = pedacos.length > 1 ? (pedacos[pedacos.length - 1] ?? "") : "";
  const anteriores = pedacos.length > 1 ? pedacos.slice(0, -1) : [];

  return {
    modoLista: pedacos.length > 1,
    confirmados: semRepetir(
      anteriores.map(codigoDe).filter((c): c is number => c !== null),
    ),
    pendente,
  };
}

/**
 * Tudo o que foi digitado, inclusive o último pedaço — o que vale quando o popover fecha.
 *
 * `29,253` sem a vírgula final são dois códigos: a pessoa clicou fora porque terminou, e
 * exigir a vírgula do fim seria cobrar pontuação de quem já disse o que queria.
 *
 * <b>Sem nenhuma vírgula, nada é escolhido.</b> `29` sozinho é uma BUSCA — a pessoa está
 * olhando a lista para decidir, e fechar o popover é desistir, não confirmar. Escolher por
 * ela poria no filtro um fornecedor que ela nunca marcou, e o DRE sairia menor sem que nada
 * na tela explicasse por quê.
 */
export function codigosAoFechar(texto: string): number[] {
  const { confirmados, pendente } = lerDigitacao(texto);
  const ultimo = codigoDe(pendente);

  return semRepetir(ultimo === null ? confirmados : [...confirmados, ultimo]);
}

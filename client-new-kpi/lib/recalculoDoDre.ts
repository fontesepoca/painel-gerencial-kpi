import type { LinhaDre, PapelDaLinha, Parcela, ValorMes } from "@/types/dre-gerencial";

/**
 * O DRE recalculado pela ordem da tela.
 *
 * ── O que mudou em 15/09/2026 ──
 *
 * Até esta data, arrastar uma linha era **só leitura**: os totalizadores somavam pelas flags
 * do cadastro (`ANTESRO`/`ANTESLL`), calculadas no servidor antes de a ordem do usuário
 * existir, e a tela avisava em letras grandes que nenhum valor mudava.
 *
 * Agora **a posição manda no cálculo**. Em troca, as linhas calculadas viraram âncoras fixas:
 * elas não se movem, e o que existe entre duas delas é um **encaixe**. Uma conta soma na
 * primeira âncora abaixo dela.
 *
 * ── Por DELTA, e não refazendo a conta ──
 *
 * A tentação é recalcular cada âncora pela sua fórmula. Não funciona, e a dc35 provou em duas
 * frentes no primeiro dia:
 *
 *   • `RECEITAS LIQUIDAS` não é `BRUTA − ABAT − DEVOL` no servidor: é um número próprio do
 *     faturamento, e a identidade erra **um centavo** por arredondamento das parcelas;
 *   • `Total das Despesas` da API inclui os créditos promovidos pela divergência 9, que a
 *     tela mostra lá em cima, ao lado do LUCRO BRUTO. Refazer a soma pela posição tira os
 *     créditos de lá e muda um número já validado.
 *
 * Então o que se calcula aqui é **o quanto cada âncora se move**: quais contas entraram no
 * encaixe dela e quais saíram, comparado com a ordem que a API mandou. O valor exibido é
 * `valorDaApi + delta`.
 *
 * Isso torna a invariante verdadeira **por construção**, e não por atenção: com a ordem do
 * cadastro, todo delta é zero e esta função devolve o payload intacto — mesmo nas linhas
 * cuja fórmula ela nem conhece. É o que a dc35 cobra, com dado real, nas três dimensões.
 */

/** Meio centavo: a mesma tolerância do resto do projeto. */
const TOLERANCIA = 0.005;

/**
 * Duas casas. Usado nas **somas**, onde as parcelas já têm duas casas.
 *
 * Soma de valores de duas casas é um valor de duas casas: não existe ponto médio na terceira,
 * e `Math.round` só está desfazendo o ruído do ponto flutuante. Quem precisa de half-to-even
 * é a divisão — ver <see cref="media"/>.
 */
export function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * A média do período: soma dividida pelo número de colunas, **half-to-even**.
 *
 * <b>Em centavos inteiros, de propósito.</b> O servidor divide `decimal` por `int` e chama
 * `Math.Round(x, 2)`, que é aritmética decimal exata; o JavaScript só tem `double`, e no
 * ponto médio ele erra por representação — a dc35 pegou dez linhas com um centavo de
 * diferença na primeira rodada, todas em `,xx5`.
 *
 * Com numerador e divisor inteiros, o resto diz exatamente onde o valor cai: `2·|r| > n`
 * arredonda para longe do zero, `<` trunca, e `=` é o ponto médio, que vai para o par.
 */
export function media(soma: number, colunas: number): number {
  if (colunas === 0) return 0;

  const centavos = Math.round(soma * 100);
  const quociente = Math.trunc(centavos / colunas);
  const resto = centavos - quociente * colunas;
  if (resto === 0) return quociente / 100;

  const passo = centavos < 0 ? -1 : 1;
  const dobro = Math.abs(resto) * 2;

  if (dobro > colunas) return (quociente + passo) / 100;
  if (dobro < colunas) return quociente / 100;
  return (quociente % 2 === 0 ? quociente : quociente + passo) / 100;
}

/** As cinco deduções têm `%AV` sobre a RECEITA BRUTA; todo o resto, sobre a LÍQUIDA. */
const BASE_RECEITA_BRUTA: ReadonlySet<PapelDaLinha> = new Set([
  "abat-desc",
  "devolucao",
  "st",
  "pis",
  "cofins",
]);

/**
 * Como o movimento de um encaixe se propaga para as outras âncoras.
 *
 * É a fórmula do DRE escrita em termos de variação, e a ordem das entradas é a de cima para
 * baixo — cada uma só depende das anteriores.
 *
 * `ST`, `PIS` e `COFINS` estão de fora de propósito: elas não entram nas RECEITAS LIQUIDAS
 * (regra de negócio nº 1) e não propagam para lugar nenhum. Uma conta largada no encaixe
 * delas **some de todos os totais** — consequência legítima de "soltar em qualquer lugar", e
 * o modal avisa.
 */
const PROPAGACAO: readonly (readonly [PapelDaLinha, readonly PapelDaLinha[]])[] = [
  ["receita-bruta", []],
  ["abat-desc", []],
  ["devolucao", []],
  ["st", []],
  ["pis", []],
  ["cofins", []],
  ["receitas-liquidas", ["receita-bruta", "abat-desc", "devolucao"]],
  ["cmv", []],
  ["lucro-bruto", ["receitas-liquidas", "cmv"]],
  ["subtotal-positivo", ["lucro-bruto"]],
  ["sub-total", []],
  // Sem SUBTOTAL POSITIVO — as dimensões que não o têm — o resultado sai do LUCRO BRUTO.
  // `resolverPais` trata isso; ver a divergência 9.
  ["resultado-operacional", ["subtotal-positivo", "sub-total"]],
  // `Total das Despesas` é TUDO que separa o LUCRO BRUTO do LUCRO LIQUIDO — inclusive os
  // créditos que a divergência 9 promoveu para cima do SUBTOTAL POSITIVO. Ler como
  // "Sub-Total mais o bloco pós-operacional" daria outro número: os créditos ficariam de
  // fora, e a linha deixaria de bater com o LUCRO LIQUIDO.
  ["total-despesas", ["subtotal-positivo", "sub-total", "resultado-operacional"]],
  ["lucro-liquido", ["lucro-bruto", "total-despesas"]],
];

/** As âncoras que `total-despesas` acumula são as mesmas de RO, mais o encaixe próprio. */
const ANCORAS_ENTRE_LUCRO_BRUTO_E_LIQUIDO: readonly PapelDaLinha[] = [
  "subtotal-positivo",
  "sub-total",
  "resultado-operacional",
  "total-despesas",
];

/**
 * Qual âncora recebe a conta que estiver em `indice`: a primeira linha calculada abaixo.
 * `null` quando não há nenhuma — a conta está depois da última âncora e não entra em total.
 */
export function ancoraDoEncaixe(
  linhas: readonly { calculada: boolean }[],
  indice: number,
): number | null {
  for (let i = indice + 1; i < linhas.length; i++) {
    if (linhas[i]?.calculada) return i;
  }
  return null;
}

/** O papel da âncora que recebe cada conta, por `chaveOrdem`. */
function encaixesPorConta(linhas: readonly LinhaDre[]): Map<string, PapelDaLinha | null> {
  const mapa = new Map<string, PapelDaLinha | null>();
  linhas.forEach((l, i) => {
    if (l.calculada) return;
    const alvo = ancoraDoEncaixe(linhas, i);
    mapa.set(l.chaveOrdem, alvo === null ? null : (linhas[alvo]?.papel ?? null));
  });
  return mapa;
}

/**
 * Recalcula o DRE para a ordem dada.
 *
 * `ordenadas` são as linhas já na ordem da tela; `canonicas`, as que a API mandou. As duas
 * têm o mesmo conjunto de linhas — é a comparação entre elas que produz os deltas.
 */
export function recalcular(
  ordenadas: readonly LinhaDre[],
  canonicas: readonly LinhaDre[],
): LinhaDre[] {
  const colunas = ordenadas[0]?.valores.length ?? 0;
  if (colunas === 0) return [...ordenadas];

  const agora = encaixesPorConta(ordenadas);
  const antes = encaixesPorConta(canonicas);

  const papeis = new Set<PapelDaLinha>();
  for (const l of ordenadas) if (l.calculada && l.papel) papeis.add(l.papel);

  /** Onde um papel ausente cai. Só o SUBTOTAL POSITIVO tem substituto. */
  const resolverPais = (pais: readonly PapelDaLinha[]): PapelDaLinha[] =>
    pais.flatMap((p) => {
      if (papeis.has(p)) return [p];
      if (p === "subtotal-positivo") return papeis.has("lucro-bruto") ? ["lucro-bruto" as const] : [];
      return [];
    });

  // ── os deltas, coluna a coluna ─────────────────────────────────────────────
  const acumulado = new Map<PapelDaLinha, number[]>();
  for (const [papel] of PROPAGACAO) acumulado.set(papel, new Array<number>(colunas).fill(0));

  const valorDaConta = (l: LinhaDre, c: number) => (l.naoSoma ? 0 : (l.valores[c]?.valor ?? 0));

  for (let c = 0; c < colunas; c++) {
    /** O que entrou menos o que saiu do encaixe de cada âncora. */
    const proprio = new Map<PapelDaLinha, number>();
    for (const [papel] of PROPAGACAO) proprio.set(papel, 0);

    for (const l of ordenadas) {
      if (l.calculada) continue;
      const destino = agora.get(l.chaveOrdem) ?? null;
      const origem = antes.get(l.chaveOrdem) ?? null;
      if (destino === origem) continue;

      const v = valorDaConta(l, c);
      if (destino !== null && proprio.has(destino)) proprio.set(destino, proprio.get(destino)! + v);
      if (origem !== null && proprio.has(origem)) proprio.set(origem, proprio.get(origem)! - v);
    }

    for (const [papel, pais] of PROPAGACAO) {
      const herdado =
        papel === "total-despesas"
          ? // Soma os encaixes de todas as âncoras entre LUCRO BRUTO e LUCRO LIQUIDO, e não
            // o acumulado delas: o acumulado do SUBTOTAL POSITIVO já traz o LUCRO BRUTO
            // dentro, e ele seria contado duas vezes no LUCRO LIQUIDO.
            ANCORAS_ENTRE_LUCRO_BRUTO_E_LIQUIDO.reduce((s, p) => s + (proprio.get(p) ?? 0), 0)
          : resolverPais(pais).reduce((s, p) => s + (acumulado.get(p)?.[c] ?? 0), 0);

      const total = papel === "total-despesas" ? herdado : herdado + (proprio.get(papel) ?? 0);
      acumulado.get(papel)![c] = total;
    }
  }

  // ── aplicar ────────────────────────────────────────────────────────────────
  const valorDaAncora = (papel: PapelDaLinha, c: number): number | null => {
    const linha = ordenadas.find((l) => l.papel === papel);
    if (!linha) return null;
    return arredondar((linha.valores[c]?.valor ?? 0) + (acumulado.get(papel)?.[c] ?? 0));
  };

  return ordenadas.map((l) => {
    const delta = l.calculada && l.papel ? acumulado.get(l.papel) : undefined;

    const novosValores: ValorMes[] = l.valores.map((v, c) => {
      const valor = delta ? arredondar(v.valor + (delta[c] ?? 0)) : v.valor;
      return {
        ...v,
        valor,
        percentualAv: calcularAv(l, valor, c, valorDaAncora),
        // A coluna anterior do MESMO bloco. No comparativo a primeira coluna do segundo
        // intervalo não tem anterior, e a API já mandou `null` ali — este `=== null`
        // preserva isso sem o front precisar conhecer os blocos de período.
        percentualAh:
          c === 0 || v.percentualAh === null
            ? v.percentualAh
            : calcularAh(valor, arredondar((l.valores[c - 1]?.valor ?? 0) + (delta?.[c - 1] ?? 0))),
      };
    });

    // O total é a soma das colunas JÁ arredondadas, como o servidor faz. Somar em precisão
    // cheia e arredondar no fim erra o último centavo — divergência 8.
    const soma = novosValores.reduce((s, v) => s + v.valor, 0);

    return {
      ...l,
      valores: novosValores,
      total: {
        valor: soma,
        media: media(soma, novosValores.length),
        percentualAv: calcularAvTotal(l, soma, novosValores.length, valorDaAncora),
      },
      composicao: recomporParcelas(l, ordenadas),
    };
  });
}

/**
 * `%AV` de uma coluna. Espelha `MontadorDre.CalcularAv`, inclusive o comportamento com base
 * zero, que **não é simétrico**: as cinco deduções mostram `0,000` e as demais ficam vazias.
 * Conferido contra a 9815 num mês sem movimento — os dois grupos têm caminhos distintos no
 * Delphi, e um devolve zero onde o outro não escreve nada.
 */
function calcularAv(
  l: LinhaDre,
  valor: number,
  coluna: number,
  valorDaAncora: (papel: PapelDaLinha, c: number) => number | null,
): number | null {
  if (l.papel === "receita-bruta") return null;

  const ehDeducao = l.papel !== null && BASE_RECEITA_BRUTA.has(l.papel);
  const base = ehDeducao
    ? valorDaAncora("receita-bruta", coluna)
    : valorDaAncora("receitas-liquidas", coluna);

  if (base === null) return ehDeducao ? 0 : null;
  if (base !== 0) return (valor / base) * 100;
  return ehDeducao ? 0 : null;
}

/** `%AV` do total. Espelha `CalcularAvTotal`: nem RECEITA BRUTA nem as deduções têm. */
function calcularAvTotal(
  l: LinhaDre,
  valor: number,
  colunas: number,
  valorDaAncora: (papel: PapelDaLinha, c: number) => number | null,
): number | null {
  if (l.papel === "receita-bruta" || (l.papel !== null && BASE_RECEITA_BRUTA.has(l.papel))) {
    return null;
  }

  let base = 0;
  for (let c = 0; c < colunas; c++) base += valorDaAncora("receitas-liquidas", c) ?? 0;
  return base === 0 ? null : (valor / base) * 100;
}

/** `%AH`. A mesma fórmula do montador: `valor / anterior − 1`, indefinida com base zero. */
function calcularAh(valor: number, anterior: number): number | null {
  return anterior === 0 ? null : (valor / anterior - 1) * 100;
}

/**
 * As parcelas de um totalizador, refeitas pela posição.
 *
 * A composição que a API manda descreve os blocos do cadastro. Depois de reordenar ela
 * mentiria — e essa tela existe justamente para alguém conferir um total somando as parcelas
 * à mão. Composição desatualizada é pior que composição nenhuma.
 */
function recomporParcelas(l: LinhaDre, ordenadas: readonly LinhaDre[]): Parcela[] {
  if (!l.calculada || l.papel === null || l.composicao.length === 0) return l.composicao;

  const indice = ordenadas.indexOf(l);
  const parcela = (alvo: LinhaDre): Parcela => ({
    chaveOrdem: alvo.chaveOrdem,
    rotulo: alvo.descricao.trim(),
    sinal: 1,
  });

  // As contas do encaixe desta âncora, na ordem da tela.
  const doEncaixe: Parcela[] = [];
  for (let i = indice - 1; i >= 0; i--) {
    const anterior = ordenadas[i];
    if (!anterior || anterior.calculada) break;
    if (!anterior.naoSoma) doEncaixe.unshift(parcela(anterior));
  }

  const ancora = (papel: PapelDaLinha): Parcela[] => {
    const alvo = ordenadas.find((x) => x.papel === papel);
    return alvo ? [parcela(alvo)] : [];
  };

  switch (l.papel) {
    case "receitas-liquidas":
      return [...ancora("receita-bruta"), ...ancora("abat-desc"), ...ancora("devolucao"), ...doEncaixe];
    case "lucro-bruto":
      return [...ancora("receitas-liquidas"), ...ancora("cmv"), ...doEncaixe];
    case "subtotal-positivo":
      return [...ancora("lucro-bruto"), ...doEncaixe];
    case "sub-total":
      return doEncaixe;
    case "resultado-operacional":
      return [
        ...(ordenadas.some((x) => x.papel === "subtotal-positivo")
          ? ancora("subtotal-positivo")
          : ancora("lucro-bruto")),
        ...ancora("sub-total"),
        ...doEncaixe,
      ];
    case "total-despesas":
      return [...ancora("sub-total"), ...doEncaixe];
    case "lucro-liquido":
      return [...ancora("lucro-bruto"), ...ancora("total-despesas"), ...doEncaixe];
    default:
      return l.composicao;
  }
}

/** Duas listas de linhas têm os mesmos valores? Usado pelo aviso da tela e pelos testes. */
export function mesmosValores(a: readonly LinhaDre[], b: readonly LinhaDre[]): boolean {
  if (a.length !== b.length) return false;

  const porChave = new Map(b.map((l) => [l.chaveOrdem, l]));
  return a.every((l) => {
    const o = porChave.get(l.chaveOrdem);
    return (
      o !== undefined
      && Math.abs(l.total.valor - o.total.valor) <= TOLERANCIA
      && l.valores.every((v, c) => Math.abs(v.valor - (o.valores[c]?.valor ?? 0)) <= TOLERANCIA)
    );
  });
}

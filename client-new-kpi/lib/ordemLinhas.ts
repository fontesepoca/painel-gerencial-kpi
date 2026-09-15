/**
 * Reordenação manual das linhas do DRE.
 *
 * Sem React de propósito: é aqui que mora a parte que erra em silêncio — reconciliar
 * uma ordem salva com um DRE que voltou do banco com outro conjunto de linhas.
 *
 * **Este arquivo mexe só na ORDEM.** Quem refaz os números pela posição é
 * `recalculoDoDre.ts` — desde 15/09/2026 mover uma conta a tira de um total e a põe em
 * outro, e as duas responsabilidades ficam separadas de propósito: reconciliar ordem salva
 * com DRE novo é um problema, e aritmética de DRE é outro.
 *
 * Até essa data o cabeçalho aqui dizia o contrário — *"mover linha não muda valor nenhum"* —,
 * e `saiuDoBloco`/`linhasAfetadas` existiam para marcar a linha que passava a APARECER fora
 * do total que compõe. Saíram junto com o selo `FORA DO BLOCO`: esse descompasso entre a
 * tela e a conta deixou de existir.
 */

export interface LinhaOrdenavel {
  chaveOrdem: string;
  descricao: string;
  calculada: boolean;
}

/**
 * As duas linhas calculadas que cercam a posição `indice`.
 *
 * As calculadas são as âncoras contábeis do DRE — cabeçalhos e totalizadores. O trecho
 * entre duas delas é o que este arquivo chama de **bloco**, e é o que dá sentido de
 * leitura a uma despesa: estar "entre LUCRO BRUTO e SUB-TOTAL" é o que diz ao contador
 * que aquela linha compõe o subtotal.
 */
export function ancoras<T extends LinhaOrdenavel>(
  linhas: readonly T[],
  indice: number,
): { acima: T | null; abaixo: T | null } {
  let acima: T | null = null;
  for (let i = indice - 1; i >= 0; i--) {
    const l = linhas[i];
    if (l?.calculada) {
      acima = l;
      break;
    }
  }

  let abaixo: T | null = null;
  for (let i = indice + 1; i < linhas.length; i++) {
    const l = linhas[i];
    if (l?.calculada) {
      abaixo = l;
      break;
    }
  }

  return { acima, abaixo };
}

/** "entre LUCRO BRUTO e SUB-TOTAL", "acima de (+) RECEITA BRUTA", "no fim da tabela". */
export function descreverPosicao<T extends LinhaOrdenavel>(
  linhas: readonly T[],
  indice: number,
): string {
  const { acima, abaixo } = ancoras(linhas, indice);
  const nome = (l: T) => l.descricao.trim();

  if (acima && abaixo) return `entre ${nome(acima)} e ${nome(abaixo)}`;
  if (abaixo) return `acima de ${nome(abaixo)}`;
  if (acima) return `abaixo de ${nome(acima)}`;
  return "no fim da tabela";
}

/**
 * Move a linha de `de` para `para`, com o destino contado na lista **original**.
 *
 * Contar o destino na lista original é o que deixa a conta legível de fora: quem chama
 * está olhando para a tabela na tela, não para uma lista intermediária sem a linha.
 * O ajuste de índice acontece aqui, num lugar só.
 *
 * **`para` é "antes da linha que hoje ocupa esse índice".** Soltar uma linha logo abaixo
 * dela mesma (`para === de + 1`) é ficar parada, e é o que se espera de um arraste curto
 * que não chegou a atravessar ninguém.
 *
 * **Uma linha, nunca um bloco.** Havia aqui um `moverIntervalo` que movia a fatia
 * `[inicio, fim)`, usado para um totalizador levar consigo o bloco que ele encabeça, mais
 * um `blocoDe` que calculava essa fatia. Removidos por decisão do Gabriel em 09/09/2026:
 * mover várias linhas num gesto muda a leitura de todas elas de uma vez, e num relatório
 * onde a posição sugere o que compõe o quê, é efeito grande demais para um arraste.
 */
export function mover<T>(lista: readonly T[], de: number, para: number): T[] {
  if (de < 0 || de >= lista.length) return [...lista];

  const linha = lista[de] as T;
  const restante = [...lista.slice(0, de), ...lista.slice(de + 1)];

  // Soltar em cima de si mesma não é movimento: volta para onde estava.
  const alvo = para <= de ? para : para - 1;

  restante.splice(Math.max(0, Math.min(restante.length, alvo)), 0, linha);
  return restante;
}

/**
 * Aplica uma ordem salva sobre as linhas que a API acabou de devolver.
 *
 * Os dois conjuntos quase nunca coincidem: linha sem movimento não vem, e um período
 * novo pode trazer linha que não existia quando a ordem foi salva. Por isso a ordem é
 * guardada como **lista de chaves**, não de posições.
 *
 * Chave salva que não veio é ignorada. Linha que veio e não estava salva é inserida
 * logo depois da vizinha canônica dela — assim ela aparece perto de onde o cadastro a
 * colocou, e não empilhada no fim da tabela.
 */
export function aplicarOrdem<T extends LinhaOrdenavel>(
  canonicas: readonly T[],
  ordemSalva: readonly string[] | null,
): T[] {
  if (!ordemSalva || ordemSalva.length === 0) return [...canonicas];

  const posicao = new Map(ordemSalva.map((chave, i) => [chave, i]));

  const conhecidas = canonicas
    .filter((l) => posicao.has(l.chaveOrdem))
    .sort((a, b) => posicao.get(a.chaveOrdem)! - posicao.get(b.chaveOrdem)!);

  const resultado = [...conhecidas];
  const presentes = new Set(resultado.map((l) => l.chaveOrdem));

  // Percorre na ordem canônica para que várias linhas novas em sequência entrem
  // na ordem certa entre si: cada uma vira a vizinha da próxima.
  canonicas.forEach((linha, iCanonico) => {
    if (presentes.has(linha.chaveOrdem)) return;

    let alvo = 0;
    for (let i = iCanonico - 1; i >= 0; i--) {
      const anterior = canonicas[i];
      if (!anterior) continue;
      const onde = resultado.findIndex((l) => l.chaveOrdem === anterior.chaveOrdem);
      if (onde >= 0) {
        alvo = onde + 1;
        break;
      }
    }

    resultado.splice(alvo, 0, linha);
    presentes.add(linha.chaveOrdem);
  });

  return resultado;
}

/**
 * A ordem atual é diferente da que veio do cadastro?
 *
 * Serve para decidir se o botão de restaurar aparece. Compara chave a chave: mesma
 * sequência, nenhuma personalização a desfazer.
 */
export function ordemPersonalizada<T extends LinhaOrdenavel>(
  canonicas: readonly T[],
  atuais: readonly T[],
): boolean {
  if (canonicas.length !== atuais.length) return true;
  return canonicas.some((l, i) => l.chaveOrdem !== atuais[i]?.chaveOrdem);
}

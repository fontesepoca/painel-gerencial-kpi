/**
 * Reordenação manual das linhas do DRE.
 *
 * Sem React de propósito: é aqui que mora a parte que erra em silêncio — reconciliar
 * uma ordem salva com um DRE que voltou do banco com outro conjunto de linhas.
 *
 * **Mover linha não muda valor nenhum.** Os totalizadores somam pelas flags do cadastro
 * (`ANTESRO`, `ANTESLL`, `ANTESLF`), não pela posição na tela — quem calcula é o
 * `MontadorDre`, no servidor, antes de a ordem do usuário existir. O que a posição muda
 * é a **leitura**: uma despesa operacional arrastada para baixo de RESULTADO OPERACIONAL
 * continua dentro dele, só que passa a parecer que está fora. É esse risco que o selo e
 * o aviso de confirmação existem para tornar visível.
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
 * Assinatura do que uma linha **parece** compor: o conjunto de calculadas abaixo dela.
 *
 * Ler um DRE de cima para baixo é isso — uma despesa acima do SUB-TOTAL parece entrar
 * nele. Então é esse o relacionamento que o selo tem que vigiar.
 *
 * **Conjunto, não sequência.** Se dois totalizadores trocam de lugar entre si, quem
 * está acima dos dois continua parecendo compor os dois, e nada mudou na leitura
 * daquela linha. Ordenar as chaves antes de juntar é o que impede o selo de acender
 * em linha que ninguém encostou.
 */
function totaisAbaixo<T extends LinhaOrdenavel>(linhas: readonly T[], indice: number): string {
  const chaves: string[] = [];
  for (let i = indice + 1; i < linhas.length; i++) {
    const l = linhas[i];
    if (l?.calculada) chaves.push(l.chaveOrdem);
  }
  return chaves.sort().join(",");
}

/**
 * A linha passou a parecer compor totais diferentes dos do cadastro?
 *
 * É o critério do selo e do aviso. Compara a assinatura de agora com a da ordem
 * canônica — a que veio da API.
 *
 * <b>A primeira versão disto comparava as duas âncoras imediatas, e era ruído puro:</b>
 * mover um único totalizador acendia o selo em 8 de 10 linhas, inclusive em LUCRO BRUTO,
 * que não tinha se mexido. Um aviso que acende em quase tudo não avisa nada.
 */
export function saiuDoBloco<T extends LinhaOrdenavel>(
  canonicas: readonly T[],
  atuais: readonly T[],
  chaveOrdem: string,
): boolean {
  const iCanonico = canonicas.findIndex((l) => l.chaveOrdem === chaveOrdem);
  const iAtual = atuais.findIndex((l) => l.chaveOrdem === chaveOrdem);
  if (iCanonico < 0 || iAtual < 0) return false;

  return totaisAbaixo(canonicas, iCanonico) !== totaisAbaixo(atuais, iAtual);
}

/**
 * Quais linhas **passam** a ficar deslocadas se a nova ordem for aplicada.
 *
 * É o texto do aviso, e por isso conta **só linhas não-calculadas**. "Aparecer fora do
 * total que compõe" só faz sentido para uma despesa: RECEITA BRUTA não compõe total
 * nenhum, ela é fonte, e listá-la era o que fazia o aviso citar a tabela inteira e
 * portanto não avisar nada. O totalizador que a pessoa moveu já está descrito no
 * "sai de / vai parar" do próprio modal.
 *
 * Só conta quem vira `false → true` — quem já estava deslocado antes não é
 * consequência deste movimento.
 */
export function linhasAfetadas<T extends LinhaOrdenavel>(
  canonicas: readonly T[],
  antes: readonly T[],
  depois: readonly T[],
): T[] {
  return depois.filter(
    (l) =>
      !l.calculada &&
      saiuDoBloco(canonicas, depois, l.chaveOrdem) &&
      !saiuDoBloco(canonicas, antes, l.chaveOrdem),
  );
}

/**
 * O bloco que começa em `indice`, como intervalo `[inicio, fim)`.
 *
 * Uma calculada **encabeça** o seu bloco: ela mais as linhas não-calculadas que vêm
 * logo abaixo, até a próxima calculada. É por isso que "tudo do LUCRO LIQUIDO" é
 * LUCRO LIQUIDO com as órfãs que o seguem, e não as despesas acima dele.
 *
 * Linha não-calculada não encabeça bloco nenhum — ela é o próprio bloco, de uma linha só.
 */
export function blocoDe<T extends LinhaOrdenavel>(
  linhas: readonly T[],
  indice: number,
): { inicio: number; fim: number } {
  const cabeca = linhas[indice];
  if (!cabeca?.calculada) return { inicio: indice, fim: indice + 1 };

  let fim = indice + 1;
  while (fim < linhas.length && !linhas[fim]?.calculada) fim++;

  return { inicio: indice, fim };
}

/**
 * Move a fatia `[inicio, fim)` para a posição `destino`, contada na lista **original**.
 *
 * Contar o destino na lista original é o que deixa a conta legível de fora: quem chama
 * está olhando para a tabela na tela, não para uma lista intermediária sem a fatia.
 * O ajuste de índice acontece aqui, num lugar só.
 *
 * **`destino` é "antes da linha que hoje ocupa esse índice".** Soltar uma linha logo
 * abaixo dela mesma (`destino === fim`) é ficar parada, e é o que se espera de um
 * arraste curto que não chegou a atravessar ninguém.
 */
export function moverIntervalo<T>(
  lista: readonly T[],
  inicio: number,
  fim: number,
  destino: number,
): T[] {
  const tamanho = fim - inicio;
  if (tamanho <= 0 || inicio < 0 || fim > lista.length) return [...lista];

  const fatia = lista.slice(inicio, fim);
  const restante = [...lista.slice(0, inicio), ...lista.slice(fim)];

  // Soltar dentro da própria fatia não é movimento: volta para onde estava.
  const alvo =
    destino <= inicio ? destino : destino >= fim ? destino - tamanho : inicio;

  restante.splice(Math.max(0, Math.min(restante.length, alvo)), 0, ...fatia);
  return restante;
}

/** Move uma linha só. Caso particular de <see cref="moverIntervalo"/>. */
export function mover<T>(lista: readonly T[], de: number, para: number): T[] {
  if (de < 0 || de >= lista.length) return [...lista];
  return moverIntervalo(lista, de, de + 1, para);
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

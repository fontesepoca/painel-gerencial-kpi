/**
 * Rolagem automática enquanto se arrasta uma linha perto da borda da tabela.
 *
 * Sem ela, levar a primeira linha para o fim de uma tabela de 140 linhas é impossível
 * sem soltar no meio do caminho, rolar e pegar de novo.
 *
 * A conta mora aqui, fora do componente, porque é a única parte disto que dá para
 * conferir sem um navegador: o resto é `requestAnimationFrame` e evento de arraste.
 */

/** Teto da faixa sensível, em pixels. */
export const FAIXA_MAXIMA = 72;

/**
 * Fração da altura visível usada como faixa quando a tabela é baixa. Com 72px fixos
 * numa tabela de 300px, as duas faixas cobririam metade da área e quase não sobraria
 * onde parar o ponteiro sem rolar.
 */
export const FRACAO_DA_ALTURA = 0.18;

/**
 * Velocidade ao encostar na faixa, em pixels por segundo. Não é zero de propósito: uma
 * rampa que começa em zero faz a beirada parecer morta, e a pessoa empurra mais para
 * dentro procurando resposta.
 */
export const VELOCIDADE_MINIMA = 140;

/** Quanto a velocidade cresce da entrada da faixa até a borda. */
export const VELOCIDADE_EXTRA = 1160;

/** A faixa sensível de uma área com esta altura visível. */
export function faixaSensivel(altura: number): number {
  return Math.min(FAIXA_MAXIMA, altura * FRACAO_DA_ALTURA);
}

/**
 * Quantos pixels rolar neste quadro. Positivo desce, negativo sobe, zero fica parado.
 *
 * `ponteiroY`, `topo` e `base` são coordenadas da janela — as mesmas de
 * `getBoundingClientRect` e de `clientY`. `dt` é o tempo do quadro em **segundos**:
 * a velocidade é por segundo, e não por quadro, senão um monitor de 144 Hz rolaria ao
 * dobro da velocidade de um de 72 Hz.
 *
 * Ponteiro fora da área (acima do topo ou abaixo da base) conta como encostado na
 * borda: quem passou do fim da tabela quer a velocidade máxima, não menos.
 */
export function passoDeRolagem(
  ponteiroY: number | null,
  area: { topo: number; base: number },
  dt: number,
): number {
  if (ponteiroY === null) return 0;

  const altura = area.base - area.topo;
  if (altura <= 0) return 0;

  const faixa = faixaSensivel(altura);
  const daBordaDeCima = ponteiroY - area.topo;
  const daBordaDeBaixo = area.base - ponteiroY;

  const direcao = daBordaDeCima < faixa ? -1 : daBordaDeBaixo < faixa ? 1 : 0;
  if (direcao === 0) return 0;

  const dentro = direcao < 0 ? daBordaDeCima : daBordaDeBaixo;

  // 0 na entrada da faixa, 1 encostado na borda. Ao quadrado para dar controle fino no
  // começo — numa rampa linear, qualquer tremida na entrada já dispara rápido demais.
  const intensidade = Math.min(1, Math.max(0, (faixa - dentro) / faixa)) ** 2;

  return direcao * (VELOCIDADE_MINIMA + VELOCIDADE_EXTRA * intensidade) * dt;
}

/**
 * O céu da tela de login: geração e movimento das estrelas.
 *
 * <b>Sem React e sem canvas aqui de propósito.</b> Este arquivo é só aritmética — recebe
 * números, devolve números — e por isso pode ser conferido sem navegador. O desenho mora em
 * `components/login/CeuDeEstrelas.tsx`, e a separação é o que permite testar a parte que erra
 * em silêncio: estrela que escapa da tela e nunca volta, parallax que cresce sem limite,
 * movimento que anda mais rápido num monitor de 144 Hz.
 *
 * ── Por que não é o do Época Analytics ──
 *
 * Aquele usa Three.js com `EffectComposer`, `UnrealBloomPass` e mais três shaders, carregados
 * de `unpkg.com` em tempo de execução, dentro de um iframe — 404 linhas de HTML. Bonito, e com
 * três problemas que não queremos herdar: um script de terceiro baixado a cada visita à tela
 * de login (quem controla aquele domínio controla a nossa página de senha), um contexto WebGL
 * e um pipeline de pós-processamento para desenhar pontos brilhantes, e código que nenhum
 * teste alcança.
 *
 * Aqui são pontos num canvas 2D, com o mesmo espírito visual: profundidade, deriva lenta e
 * reação ao ponteiro. Nada sai da nossa origem.
 */

export interface Estrela {
  /** Posição em fração da tela, de 0 a 1 — independente do tamanho da janela. */
  x: number;
  y: number;
  /**
   * Profundidade, de 0 (fundo) a 1 (frente).
   *
   * Comanda três coisas ao mesmo tempo: tamanho, brilho e o quanto a estrela se desloca com o
   * ponteiro. É o que cria a sensação de espaço — sem isso, o campo vira um chuvisco plano.
   */
  z: number;
  /** Velocidade vertical, em frações de tela por segundo. */
  velocidade: number;
  /** Fase do cintilar, para as estrelas não pulsarem todas juntas. */
  fase: number;
  /** Quão rápido esta estrela cintila, em radianos por segundo. */
  ritmo: number;
}

export interface ConfiguracaoDoCeu {
  quantidade: number;
  /** Função de aleatoriedade. Injetada para o teste poder fixar a semente. */
  aleatorio?: () => number;
}

/**
 * Quantas estrelas para uma tela deste tamanho.
 *
 * <b>Por área, não um número fixo.</b> Duzentas estrelas num monitor ultrawide ficam ralas; as
 * mesmas duzentas num celular viram sopa. A densidade é constante e o teto existe porque cada
 * estrela custa um arco por quadro — num painel 5K sem limite seriam milhares, e a animação
 * começaria a disputar CPU com a página.
 */
export function quantidadeParaArea(largura: number, altura: number): number {
  const densidade = (largura * altura) / 11_000;
  return Math.max(40, Math.min(260, Math.round(densidade)));
}

/** Cria o campo inicial, já espalhado. */
export function semear({ quantidade, aleatorio = Math.random }: ConfiguracaoDoCeu): Estrela[] {
  const estrelas: Estrela[] = [];

  for (let i = 0; i < quantidade; i++) {
    // `z` ao cubo concentra as estrelas no fundo: um campo com profundidade uniforme parece
    // uma parede de pontos grandes. Poucas na frente, muitas ao longe — como no céu.
    const z = Math.pow(aleatorio(), 3);

    estrelas.push({
      x: aleatorio(),
      y: aleatorio(),
      z,
      // As da frente descem mais depressa: é a mesma pista de profundidade que o tamanho dá,
      // reforçada pelo movimento.
      velocidade: 0.004 + z * 0.012,
      fase: aleatorio() * Math.PI * 2,
      ritmo: 0.3 + aleatorio() * 0.7,
    });
  }

  return estrelas;
}

/**
 * Avança o campo em `dt` segundos.
 *
 * <b>Por segundo, e não por quadro.</b> Um monitor de 144 Hz entrega mais que o dobro dos
 * quadros de um de 60, e um passo fixo por quadro faria a mesma animação correr ao dobro da
 * velocidade — defeito que só aparece na máquina de quem tem a tela boa. O projeto já tratou
 * isso na rolagem automática da tabela do DRE.
 *
 * Muta o array em vez de recriá-lo: são centenas de objetos, sessenta vezes por segundo, e
 * alocar tudo de novo a cada quadro é trabalho para o coletor de lixo aparecer como
 * engasgo na animação.
 */
export function avancar(estrelas: Estrela[], dt: number): void {
  // Teto no passo: com a aba em segundo plano o navegador para de entregar quadros, e o
  // primeiro de volta traria segundos acumulados de uma vez — o campo inteiro saltaria.
  const passo = Math.min(dt, 0.05);

  for (const estrela of estrelas) {
    estrela.y += estrela.velocidade * passo;
    estrela.fase += estrela.ritmo * passo;

    // Quem sai por baixo volta por cima, numa coluna nova: reaparecer na mesma vertical
    // deixaria trilhas visíveis depois de um minuto olhando.
    if (estrela.y > 1.02) {
      estrela.y = -0.02;
      estrela.x = Math.random();
    }
  }
}

/**
 * O quanto uma estrela se desloca por causa do ponteiro.
 *
 * O ponteiro chega em coordenadas de −1 a 1, com zero no centro. As estrelas da frente andam
 * mais que as do fundo — é o que dá a impressão de olhar através de um campo com volume, e é o
 * efeito que o Gabriel pediu ao falar do login do Época Analytics.
 *
 * <b>O deslocamento é limitado por construção:</b> o ponteiro é uma fração da janela, então o
 * resultado nunca passa de `intensidade` frações de tela, por mais que o cursor se afaste.
 */
export function deslocamentoDoPonteiro(
  z: number,
  ponteiro: { x: number; y: number },
  intensidade = 0.03,
): { dx: number; dy: number } {
  const peso = (0.15 + z) * intensidade;
  return { dx: ponteiro.x * peso, dy: ponteiro.y * peso };
}

/**
 * O brilho de uma estrela agora: profundidade mais um cintilar suave.
 *
 * Fica entre 0 e 1 — o desenho usa isto como opacidade, e um valor fora da faixa viraria
 * `globalAlpha` inválido, que o canvas ignora em silêncio deixando a estrela sumir.
 */
export function brilho(estrela: Estrela): number {
  const base = 0.25 + estrela.z * 0.6;
  const cintilo = Math.sin(estrela.fase) * 0.12;
  return Math.max(0.05, Math.min(1, base + cintilo));
}

/** O raio em pixels, da profundidade. Meio pixel some no antialiasing; dois já é um planeta. */
export function raio(estrela: Estrela, escala: number): number {
  return (0.4 + estrela.z * 1.3) * escala;
}

/**
 * Aproxima o ponteiro do alvo — a suavização que evita o campo saltar junto com o cursor.
 *
 * <b>Corrigido pelo tempo</b>, pelo mesmo motivo de <see cref="avancar"/>: um fator fixo por
 * quadro suaviza mais em telas lentas do que em rápidas. `1 - e^(-k·dt)` dá a mesma curva em
 * qualquer taxa de quadros.
 */
export function aproximar(atual: number, alvo: number, dt: number, k = 4): number {
  return atual + (alvo - atual) * (1 - Math.exp(-k * Math.min(dt, 0.05)));
}

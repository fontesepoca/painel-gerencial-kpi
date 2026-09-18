/**
 * O céu da tela de login: geração, movimento e projeção das estrelas.
 *
 * <b>Sem React e sem canvas aqui de propósito.</b> Este arquivo é só aritmética — recebe
 * números, devolve números — e por isso pode ser conferido sem navegador. O desenho mora em
 * `components/login/CeuDeEstrelas.tsx`, e a separação é o que permite testar a parte que erra
 * em silêncio: estrela que some e nunca volta, campo que anda mais rápido num monitor de
 * 144 Hz, parallax que cresce sem limite.
 *
 * ── O que mudou em 16/09/2026 ──
 *
 * Antes as estrelas **desciam**, como chuva lenta: uma da frente levava mais de um minuto para
 * atravessar a tela, e sem mexer o mouse a tela parecia parada. O Gabriel pediu a sensação de
 * atravessar o espaço, e isso não é uma questão de velocidade — é de <b>perspectiva</b>.
 *
 * Agora cada estrela tem uma profundidade que diminui com o tempo, e a posição na tela é a
 * projeção dela: quanto mais perto, mais longe do ponto de fuga, maior e mais brilhante. O
 * resultado é que elas nascem no meio, aceleram para as bordas e passam — que é como o campo
 * de estrelas se comporta quando se viaja através dele.
 *
 * ── Por que não é o do Época Analytics ──
 *
 * Aquele usa Three.js com `EffectComposer`, `UnrealBloomPass` e mais três shaders, carregados
 * de `unpkg.com` em tempo de execução, dentro de um iframe — 404 linhas de HTML. Bonito, e com
 * três problemas que não queremos herdar: um script de terceiro baixado a cada visita à tela
 * de login (quem controla aquele domínio controla a nossa página de senha), um contexto WebGL
 * e um pipeline de pós-processamento para desenhar pontos brilhantes, e código que nenhum
 * teste alcança. Aqui são pontos num canvas 2D, e nada sai da nossa origem.
 */

export interface Estrela {
  /**
   * Posição no plano perpendicular ao movimento, em unidades arbitrárias centradas em zero.
   *
   * <b>Não é posição de tela.</b> A posição de tela sai de <see cref="projetar"/>, dividindo
   * por `z` — é a divisão que produz a perspectiva.
   */
  x: number;
  y: number;
  /**
   * Distância, de 1 (no fundo) a <see cref="Z_MINIMO"/> (passando pelo observador).
   *
   * Diminui com o tempo. Comanda tudo: posição projetada, tamanho e brilho.
   */
  z: number;
  /** Quanto de `z` a estrela vence por segundo. */
  velocidade: number;
  /** Fase do cintilar, para as estrelas não pulsarem todas juntas. */
  fase: number;
  /** Quão rápido esta estrela cintila, em radianos por segundo. */
  ritmo: number;
}

/**
 * A que distância a estrela "passa" e renasce no fundo.
 *
 * Não é zero: em `z = 0` a divisão explode, a estrela salta para o infinito num quadro e
 * aparece como um risco atravessando a tela. Parar em 0,06 corta antes disso — o tamanho
 * máximo fica limitado por construção, sem `Math.min` nenhum no desenho.
 */
export const Z_MINIMO = 0.06;

/** Espalhamento da projeção. Calibrado para o campo preencher a tela sem virar túnel. */
const ABERTURA = 0.32;

export interface ConfiguracaoDoCeu {
  quantidade: number;
  /** Função de aleatoriedade. Injetada para o teste poder fixar a semente. */
  aleatorio?: () => number;
}

/**
 * Quantas estrelas para uma tela deste tamanho.
 *
 * <b>Por área, não um número fixo.</b> Duzentas estrelas num monitor ultrawide ficam ralas; as
 * mesmas duzentas num celular viram sopa. O teto existe porque cada estrela custa um arco por
 * quadro — num painel 5K sem limite seriam milhares, e a animação passaria a disputar CPU com
 * a página.
 */
export function quantidadeParaArea(largura: number, altura: number): number {
  // Bem mais densa que no campo antigo, e o motivo é a perspectiva: boa parte das estrelas
  // está sempre fora do quadro ou tênue demais para contar. Medido na tela — com a densidade
  // do campo anterior, uma janela de 720×450 mostrava pouco mais de meia centena de pixels
  // acesos. Subiu de novo em 16/09/2026, a pedido do Gabriel, depois de ele ver o resultado.
  //
  // O teto continua existindo porque cada estrela custa um arco por quadro: num painel 5K sem
  // limite seriam milhares, e a animação passaria a disputar CPU com a página.
  const densidade = (largura * altura) / 3_000;
  return Math.max(110, Math.min(700, Math.round(densidade)));
}

/**
 * A partir de que profundidade uma estrela com este raio no plano ainda cabe na tela.
 *
 * Serve à semeadura: sortear `z` livremente criaria estrelas já fora do quadro, que morrem no
 * primeiro avanço sem nunca terem sido vistas. Na primeira versão disto, treze de quarenta
 * renasciam logo no quadro inicial — o campo abria ralo e só enchia depois de alguns segundos.
 */
function profundidadeVisivel(raioNoPlano: number): number {
  return Math.max(Z_MINIMO, (ABERTURA * raioNoPlano) / 0.55);
}

/** Uma estrela nova, sorteada no fundo do campo. */
function nascer(estrela: Estrela, aleatorio: () => number, profundidadeInicial = 1): void {
  // Sorteio em coordenadas polares, e não num quadrado: com `x` e `y` sorteados de forma
  // independente, sobram estrelas nas quinas — que projetadas saem da tela cedo e somem. Em
  // polar a densidade fica uniforme em torno do ponto de fuga, que é por onde todas passam.
  const angulo = aleatorio() * Math.PI * 2;
  // A raiz quadrada é o que espalha uniformemente pelo disco; sem ela, as estrelas se
  // amontoam no centro e o campo fica com um caroço no meio.
  const raioNoPlano = Math.sqrt(aleatorio());

  estrela.x = Math.cos(angulo) * raioNoPlano;
  estrela.y = Math.sin(angulo) * raioNoPlano;
  estrela.z = profundidadeInicial;
  estrela.velocidade = 0.05 + aleatorio() * 0.07;
  estrela.fase = aleatorio() * Math.PI * 2;
  estrela.ritmo = 0.3 + aleatorio() * 0.7;
}

/** Cria o campo inicial, já espalhado em profundidade. */
export function semear({ quantidade, aleatorio = Math.random }: ConfiguracaoDoCeu): Estrela[] {
  const estrelas: Estrela[] = [];

  for (let i = 0; i < quantidade; i++) {
    const estrela: Estrela = { x: 0, y: 0, z: 1, velocidade: 0, fase: 0, ritmo: 1 };

    // Profundidade sorteada, e não todas no fundo: começar com o campo inteiro em `z = 1`
    // faria a tela abrir vazia e ser atravessada por uma onda única de estrelas.
    nascer(estrela, aleatorio);

    const piso = profundidadeVisivel(Math.hypot(estrela.x, estrela.y));
    estrela.z = piso + aleatorio() * (1 - piso);

    estrelas.push(estrela);
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
 * alocar tudo de novo a cada quadro é trabalho para o coletor de lixo aparecer como engasgo
 * na animação.
 */
export function avancar(
  estrelas: Estrela[],
  dt: number,
  { aspecto = 1, aleatorio = Math.random }: { aspecto?: number; aleatorio?: () => number } = {},
): void {
  // Teto no passo: com a aba em segundo plano o navegador para de entregar quadros, e o
  // primeiro de volta traria segundos acumulados de uma vez — o campo inteiro saltaria.
  const passo = Math.min(dt, 0.05);

  for (const estrela of estrelas) {
    // A aproximação acelera: perto do observador, a mesma fatia de `z` cobre muito mais tela.
    // É o que dá a sensação de velocidade crescente sem ninguém mexer na velocidade.
    estrela.z -= estrela.velocidade * passo;
    estrela.fase += estrela.ritmo * passo;

    if (estrela.z <= Z_MINIMO || saiuDaTela(estrela, aspecto)) {
      nascer(estrela, aleatorio);
    }
  }
}

/**
 * A estrela já passou da borda?
 *
 * <b>Reciclar quem saiu é o que mantém o campo cheio.</b> Sem isto, uma estrela que atravessa
 * a borda continua se aproximando fora da vista até `z` chegar ao mínimo — e nesse meio-tempo
 * ela não existe para quem olha. Como a maioria sai muito antes do fim, o campo visível ia
 * ficando ralo: a primeira versão desenhava pouco mais de duzentos pixels acesos numa tela
 * inteira.
 *
 * A margem de 15% evita reciclar uma estrela que está só encostando na borda e ainda vai
 * aparecer de novo quando o ponto de fuga se mover com o ponteiro.
 */
function saiuDaTela(estrela: Estrela, aspecto: number): boolean {
  const { x, y } = projetar(estrela, { x: 0.5, y: 0.5 }, aspecto);
  return x < -0.15 || x > 1.15 || y < -0.15 || y > 1.15;
}

/**
 * Onde a estrela aparece na tela, em frações de 0 a 1, e o quanto ela está perto.
 *
 * `fuga` é o ponto de onde tudo parece nascer — o centro da tela, deslocado pelo ponteiro.
 * Mover o ponto de fuga com o mouse é o que dá a impressão de virar o rosto enquanto se
 * atravessa o campo, em vez de simplesmente empurrar os pontos para o lado.
 *
 * `aspecto` é largura ÷ altura: sem ele, o disco de estrelas vira uma elipse esticada numa
 * tela larga, e o campo passa a ter uma direção preferida que ninguém pediu.
 */
export function projetar(
  estrela: Estrela,
  fuga: { x: number; y: number },
  aspecto = 1,
): { x: number; y: number; proximidade: number } {
  const escala = ABERTURA / estrela.z;

  return {
    x: fuga.x + (estrela.x * escala) / aspecto,
    y: fuga.y + estrela.y * escala,
    // 0 no fundo, 1 ao passar. É daqui que saem tamanho e brilho, para os dois concordarem
    // sempre — uma estrela grande e apagada parece defeito de renderização.
    proximidade: (1 - estrela.z) / (1 - Z_MINIMO),
  };
}

/**
 * O brilho de uma estrela agora: proximidade mais um cintilar suave.
 *
 * Fica entre 0 e 1 — o desenho usa isto como opacidade, e um valor fora da faixa viraria
 * `globalAlpha` inválido, que o canvas ignora em silêncio deixando a estrela sumir.
 *
 * <b>As mais distantes não são invisíveis, são tênues.</b> Um piso baixo demais faria o campo
 * parecer vazio no fundo, e a sensação de profundidade vem justamente de haver alguma coisa
 * lá atrás.
 */
export function brilho(estrela: Estrela): number {
  const proximidade = (1 - estrela.z) / (1 - Z_MINIMO);
  const base = 0.18 + proximidade * 0.72;
  const cintilo = Math.sin(estrela.fase) * 0.1;
  return Math.max(0.05, Math.min(1, base + cintilo));
}

/** O raio em pixels. Meio pixel some no antialiasing; três já é um planeta. */
export function raio(estrela: Estrela, escala: number): number {
  const proximidade = (1 - estrela.z) / (1 - Z_MINIMO);
  return (0.35 + proximidade * proximidade * 1.6) * escala;
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

/**
 * O quanto o ponto de fuga se desloca por causa do ponteiro.
 *
 * O ponteiro chega em −1 a 1, com zero no centro. O deslocamento é uma fração pequena da
 * tela: o campo inteiro se reorienta, e mesmo assim o ponto de fuga nunca sai de perto do
 * meio — <b>limitado por construção</b>, por mais que o cursor se afaste.
 */
export function pontoDeFuga(
  ponteiro: { x: number; y: number },
  intensidade = 0.06,
): { x: number; y: number } {
  return {
    x: 0.5 + ponteiro.x * intensidade,
    y: 0.5 + ponteiro.y * intensidade,
  };
}

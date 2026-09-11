/**
 * Diferença de cor percebida, em CIEDE2000.
 *
 * Existe para uma decisão que parecia de gosto e não era: as faixas de cor das colunas do
 * DRE precisam ser **distinguíveis entre si e discretas contra o fundo**, e as duas coisas
 * puxam para lados opostos. Sem medir, a calibragem vira tentativa e erro — e foi assim que
 * a primeira versão saiu com Julho e Agosto praticamente iguais no tema claro.
 *
 * **Por que não a distância euclidiana em Lab (CIE76).** Ela erra exatamente onde este
 * problema vive: cores claras e pouco saturadas. Medidas com CIE76, aquelas duas faixas
 * davam ΔE 9 — acima do limiar que eu tinha adotado — enquanto o olho as via como a mesma
 * cor. CIEDE2000 corrige isso com termos de compensação para luminosidade, croma e matiz.
 *
 * A implementação é conferida contra os casos de referência de Sharma, Wu e Dalal (2005),
 * que existem justamente porque esta fórmula é fácil de escrever com um erro sutil — o
 * primeiro rascunho desta aqui somava o termo `Rt` fora da raiz e chegava a devolver
 * distância negativa.
 */

/** sRGB (0–255) para Lab, iluminante D65. */
export function rgbParaLab([r, g, b]) {
  const linear = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };

  const [R, G, B] = [linear(r), linear(g), linear(b)];

  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;

  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const [fx, fy, fz] = [f(x), f(y), f(z)];

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const rad = (graus) => (graus * Math.PI) / 180;
const graus = (radianos) => (radianos * 180) / Math.PI;

/**
 * ΔE2000 entre duas cores em Lab.
 *
 * Referência de leitura: 1 é o limiar teórico de percepção; abaixo de ~2 as cores passam por
 * iguais num relance; acima de ~10 ninguém as confunde.
 */
export function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cmedio = (C1 + C2) / 2;

  // Compensação de croma: aproxima os cinzas, onde a fórmula antiga exagerava.
  const G = 0.5 * (1 - Math.sqrt(Cmedio ** 7 / (Cmedio ** 7 + 25 ** 7)));

  const a1l = (1 + G) * a1;
  const a2l = (1 + G) * a2;
  const C1l = Math.hypot(a1l, b1);
  const C2l = Math.hypot(a2l, b2);

  const matiz = (b, a) => {
    if (a === 0 && b === 0) return 0;
    const h = graus(Math.atan2(b, a));
    return h >= 0 ? h : h + 360;
  };
  const h1 = matiz(b1, a1l);
  const h2 = matiz(b2, a2l);

  const dL = L2 - L1;
  const dC = C2l - C1l;

  let dh = 0;
  if (C1l * C2l !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(C1l * C2l) * Math.sin(rad(dh) / 2);

  const Lmedio = (L1 + L2) / 2;
  const Cmedial = (C1l + C2l) / 2;

  let hMedio;
  if (C1l * C2l === 0) {
    hMedio = h1 + h2;
  } else if (Math.abs(h1 - h2) <= 180) {
    hMedio = (h1 + h2) / 2;
  } else {
    hMedio = h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(rad(hMedio - 30)) +
    0.24 * Math.cos(rad(2 * hMedio)) +
    0.32 * Math.cos(rad(3 * hMedio + 6)) -
    0.2 * Math.cos(rad(4 * hMedio - 63));

  const Sl = 1 + (0.015 * (Lmedio - 50) ** 2) / Math.sqrt(20 + (Lmedio - 50) ** 2);
  const Sc = 1 + 0.045 * Cmedial;
  const Sh = 1 + 0.015 * Cmedial * T;

  const dTheta = 30 * Math.exp(-(((hMedio - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cmedial ** 7 / (Cmedial ** 7 + 25 ** 7));
  const Rt = -Math.sin(rad(2 * dTheta)) * Rc;

  const l = dL / Sl;
  const c = dC / Sc;
  const h = dH / Sh;

  // O termo de rotação entra DENTRO da raiz. Somá-lo fora — que foi o primeiro rascunho —
  // produz distâncias negativas em azuis saturados, e uma calibragem baseada nisso escolhe
  // as cores erradas sem nada acusar.
  return Math.sqrt(l * l + c * c + h * h + Rt * c * h);
}

/** ΔE2000 direto entre duas cores sRGB. */
export const deltaE2000Rgb = (c1, c2) =>
  deltaE2000(rgbParaLab(c1), rgbParaLab(c2));

/**
 * A cor que o olho recebe quando uma camada translúcida é pintada sobre um fundo opaco —
 * que é como as faixas do cabeçalho funcionam.
 */
export function compor(cor, alpha, fundo) {
  return [
    Math.round(cor[0] * alpha + fundo[0] * (1 - alpha)),
    Math.round(cor[1] * alpha + fundo[1] * (1 - alpha)),
    Math.round(cor[2] * alpha + fundo[2] * (1 - alpha)),
  ];
}

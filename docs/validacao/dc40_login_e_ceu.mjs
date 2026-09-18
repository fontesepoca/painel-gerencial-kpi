/**
 * dc40 — o destino de volta e a aritmética do céu.
 *
 *   node --import ./docs/validacao/_alias.mjs docs/validacao/dc40_login_e_ceu.mjs
 *
 * Duas partes da tela de login que erram em silêncio, e por isso são as duas que estão fora
 * do React:
 *
 *   • **`destinoSeguro`** — uma falha aqui é um *open redirect*: a pessoa entra no endereço
 *     da Época, digita a senha da Época, e é despejada num site estranho já confiando no que
 *     vê. Não quebra nada, não aparece em tela nenhuma, e é explorável por link.
 *   • **`ceuDeEstrelas`** — uma falha aqui é uma estrela que sai da tela e nunca volta, ou um
 *     parallax que cresce sem limite. Ninguém nota até o campo estar vazio depois de cinco
 *     minutos com a aba aberta.
 */
import assert from "node:assert/strict";
import { destinoSeguro, DESTINO_PADRAO } from "@/lib/destinoSeguro.ts";
import {
  aproximar,
  avancar,
  brilho,
  pontoDeFuga,
  projetar,
  quantidadeParaArea,
  raio,
  semear,
  Z_MINIMO,
} from "@/lib/ceuDeEstrelas.ts";
import { iniciais } from "@/lib/iniciais.ts";

let n = 0;
const eq = (achou, esperado, oque) => {
  n++;
  assert.deepEqual(achou, esperado, `${oque}\n  esperado: ${JSON.stringify(esperado)}\n  achou:    ${JSON.stringify(achou)}`);
};
const ok = (condicao, oque) => {
  n++;
  assert.ok(condicao, oque);
};

// ── destinoSeguro: o que PASSA ───────────────────────────────────────────────
eq(destinoSeguro("/dre-gerencial"), "/dre-gerencial", "caminho interno simples");
eq(destinoSeguro("/dre-gerencial?filial=7"), "/dre-gerencial?filial=7", "a query faz parte da tela pedida");
eq(destinoSeguro("/dre-gerencial/detalhe/abc"), "/dre-gerencial/detalhe/abc", "caminho com segmentos");
eq(destinoSeguro("  /dre-gerencial  "), "/dre-gerencial", "espaço nas pontas é aparado");

// ── destinoSeguro: o que NÃO passa ───────────────────────────────────────────
//
// Cada linha aqui é uma forma de escrever "leve a pessoa para fora do site" que já foi usada
// contra alguém. A segunda é a que mais engana: sem esquema, `//evil.com` PARECE um caminho,
// e o navegador o trata como domínio.
eq(destinoSeguro("https://evil.com"), DESTINO_PADRAO, "endereço absoluto");
eq(destinoSeguro("//evil.com"), DESTINO_PADRAO, "protocolo-relativo — parece caminho, é domínio");
eq(destinoSeguro("/\\evil.com"), DESTINO_PADRAO, "contrabarra, que alguns navegadores viram barra");
eq(destinoSeguro("javascript:alert(1)"), DESTINO_PADRAO, "esquema javascript");
eq(destinoSeguro("data:text/html,<script>"), DESTINO_PADRAO, "esquema data");
eq(destinoSeguro("dre-gerencial"), DESTINO_PADRAO, "sem barra inicial não é caminho absoluto");
eq(destinoSeguro("/dre\nHost: evil.com"), DESTINO_PADRAO, "quebra de linha no meio do caminho");
eq(destinoSeguro(null), DESTINO_PADRAO, "nulo");
eq(destinoSeguro(""), DESTINO_PADRAO, "vazio");

// ── quantas estrelas ─────────────────────────────────────────────────────────
ok(quantidadeParaArea(1920, 1080) <= 700, "monitor grande não passa do teto");
ok(quantidadeParaArea(360, 640) >= 110, "celular tem o piso");
ok(
  quantidadeParaArea(1920, 1080) > quantidadeParaArea(800, 600),
  "a densidade acompanha a área, senão o campo fica ralo no monitor grande",
);

// ── O CAMPO SE MOVE SOZINHO ──────────────────────────────────────────────────
//
// O pedido do Gabriel em 16/09/2026: antes as estrelas só desciam, e sem mexer o mouse a tela
// parecia parada. Este bloco é o que garante que ela não volte a parar — e é a única
// verificação possível aqui, porque o navegador em que eu testo tem
// `prefers-reduced-motion: reduce` ligado, e nele o campo fica imóvel de propósito.
{
  const estrelas = semear({ quantidade: 60 });
  const antes = estrelas.map((e) => ({ ...e }));

  // Um segundo a 60 Hz.
  for (let i = 0; i < 60; i++) avancar(estrelas, 1 / 60);

  const paradas = estrelas.filter((e, i) => e.z === antes[i].z);
  eq(paradas.length, 0, "em um segundo, nenhuma estrela ficou parada");

  // Em um segundo, uma estrela vence entre 5% e 12% da profundidade — o suficiente para o
  // olho perceber deslocamento, longe de um borrão.
  const avancos = estrelas.map((e, i) => antes[i].z - e.z).filter((d) => d > 0);
  ok(
    avancos.every((d) => d >= 0.04 && d <= 0.13),
    `todo avanço de um segundo fica na faixa calibrada (${Math.min(...avancos).toFixed(3)} a ${Math.max(...avancos).toFixed(3)})`,
  );
}

// ── a aproximação ACELERA na tela ────────────────────────────────────────────
//
// É o que distingue "atravessar o espaço" de "chuva de pontos": a mesma fatia de profundidade
// cobre muito mais tela quando a estrela está perto. Sem isso, o campo anda em velocidade
// constante e parece um protetor de tela.
{
  const longe = { x: 0.5, y: 0, z: 0.9, velocidade: 0.1, fase: 0, ritmo: 1 };
  const perto = { x: 0.5, y: 0, z: 0.2, velocidade: 0.1, fase: 0, ritmo: 1 };
  const fuga = pontoDeFuga({ x: 0, y: 0 });

  const passoLonge = Math.abs(
    projetar({ ...longe, z: longe.z - 0.05 }, fuga).x - projetar(longe, fuga).x,
  );
  const passoPerto = Math.abs(
    projetar({ ...perto, z: perto.z - 0.05 }, fuga).x - projetar(perto, fuga).x,
  );

  ok(
    passoPerto > passoLonge * 5,
    `a mesma fatia de profundidade cobre muito mais tela perto (${passoPerto.toFixed(4)} contra ${passoLonge.toFixed(4)})`,
  );
}

// ── tudo nasce do ponto de fuga ──────────────────────────────────────────────
{
  const fuga = pontoDeFuga({ x: 0, y: 0 });
  eq(fuga, { x: 0.5, y: 0.5 }, "sem ponteiro, o ponto de fuga é o centro da tela");

  // Uma estrela no fundo fica quase em cima do ponto de fuga; a mesma estrela perto está
  // longe dele. É isso que o olho lê como profundidade.
  const distante = projetar({ x: 1, y: 0, z: 1, velocidade: 0, fase: 0, ritmo: 1 }, fuga);
  const proxima = projetar({ x: 1, y: 0, z: 0.1, velocidade: 0, fase: 0, ritmo: 1 }, fuga);

  ok(
    Math.abs(proxima.x - 0.5) > Math.abs(distante.x - 0.5) * 5,
    "quanto mais perto, mais longe do centro",
  );
  ok(distante.proximidade < proxima.proximidade, "e a proximidade acompanha");
}

// ── o aspecto: o campo não vira elipse na tela larga ─────────────────────────
//
// Sem corrigir pela razão de aspecto, o disco de estrelas se estica na horizontal e o campo
// passa a ter uma direção preferida que ninguém pediu.
{
  const fuga = pontoDeFuga({ x: 0, y: 0 });
  const estrela = { x: 1, y: 1, z: 0.5, velocidade: 0, fase: 0, ritmo: 1 };

  const quadrada = projetar(estrela, fuga, 1);
  const larga = projetar(estrela, fuga, 21 / 9);

  eq(quadrada.y, larga.y, "a vertical não depende do aspecto");
  ok(
    Math.abs(larga.x - 0.5) < Math.abs(quadrada.x - 0.5),
    "e a horizontal encolhe na tela larga, mantendo o disco redondo",
  );
}

// ── nada escapa: toda estrela renasce ────────────────────────────────────────
//
// O laço roda o equivalente a dez minutos. É o teste que pega a estrela que atravessa o
// observador e some para sempre: sem o renascimento, `z` ficaria negativo, a projeção
// inverteria o sinal e o campo iria esvaziando sem ninguém entender por quê.
{
  const estrelas = semear({ quantidade: 200 });

  for (let passo = 0; passo < 36_000; passo++) {
    avancar(estrelas, 1 / 60);
  }

  const forasDaFaixa = estrelas.filter((e) => e.z < Z_MINIMO || e.z > 1);
  eq(forasDaFaixa.length, 0, "depois de dez minutos, toda profundidade continua na faixa");

  const brilhoForaDaFaixa = estrelas.filter((e) => brilho(e) < 0 || brilho(e) > 1);
  eq(brilhoForaDaFaixa.length, 0, "o brilho nunca sai de 0..1 — fora disso o canvas ignora e a estrela some");

  ok(estrelas.every((e) => raio(e, 1) > 0.3), "nenhuma estrela fica menor que o antialiasing");
  ok(
    estrelas.every((e) => raio(e, 1) < 3),
    "nem maior que um ponto — o Z_MINIMO é o que limita isso, sem precisar de teto no desenho",
  );

  // O campo continua espalhado, e não amontoado numa faixa só de profundidade.
  const naMetadeDaFrente = estrelas.filter((e) => e.z < 0.5).length;
  ok(
    naMetadeDaFrente > 20 && naMetadeDaFrente < 180,
    `as estrelas continuam distribuídas em profundidade (${naMetadeDaFrente} de 200 na metade da frente)`,
  );
}

// ── o passo é por SEGUNDO, não por quadro ────────────────────────────────────
//
// Um monitor de 144 Hz entrega mais que o dobro dos quadros de um de 60. Com passo fixo por
// quadro, a mesma animação correria ao dobro da velocidade — defeito que só aparece na
// máquina de quem tem a tela boa.
{
  const semente = () => 0.5;
  const a = semear({ quantidade: 1, aleatorio: semente });
  const b = semear({ quantidade: 1, aleatorio: semente });

  for (let i = 0; i < 60; i++) avancar(a, 1 / 60, { aleatorio: semente });
  for (let i = 0; i < 144; i++) avancar(b, 1 / 144, { aleatorio: semente });

  ok(
    Math.abs(a[0].z - b[0].z) < 1e-9,
    `60 Hz e 144 Hz percorrem o mesmo caminho em um segundo (${a[0].z} vs ${b[0].z})`,
  );
}

// ── o salto da aba em segundo plano ──────────────────────────────────────────
//
// Com a aba escondida o navegador para de entregar quadros, e o primeiro de volta traz o
// tempo acumulado de uma vez. Sem teto no passo, o campo inteiro renasceria junto — uma
// piscada de tela cheia ao voltar para a aba.
{
  const estrelas = semear({ quantidade: 40 });
  const antes = estrelas.map((e) => e.z);

  avancar(estrelas, 300); // cinco minutos num único quadro

  // Mede só quem NÃO renasceu. Quem renasceu tem `z` maior que antes, e aí a diferença é o
  // campo inteiro por definição — a primeira versão deste teste caiu nessa armadilha e
  // acusou um salto de 0,94 que era só uma estrela voltando ao fundo, como deve.
  const avancos = estrelas.map((e, i) => antes[i] - e.z).filter((d) => d > 0);
  const maior = Math.max(...avancos);
  ok(maior < 0.01, `o teto do passo segura o avanço (maior: ${maior.toFixed(4)})`);

  // E quase ninguém renasce: com o teto, um quadro de cinco minutos mexe tão pouco quanto um
  // quadro normal. Sem o teto, o campo inteiro daria a volta e a tela piscaria ao voltar
  // para a aba.
  const renasceram = estrelas.filter((e, i) => e.z > antes[i]).length;
  ok(renasceram <= 2, `no máximo duas estrelas renasceram nesse quadro (${renasceram} de 40)`);
}

// ── o ponto de fuga é limitado ───────────────────────────────────────────────
//
// O ponteiro chega em −1..1. Mesmo no extremo, o ponto de fuga tem de ficar perto do centro:
// se ele fosse até a borda, o campo inteiro sairia da tela quando o mouse encostasse no canto.
{
  for (const ponto of [{ x: -1, y: -1 }, { x: 1, y: 1 }, { x: 0, y: 0 }]) {
    const { x, y } = pontoDeFuga(ponto);
    ok(
      x >= 0.4 && x <= 0.6 && y >= 0.4 && y <= 0.6,
      `o ponto de fuga não se afasta do meio (${x.toFixed(2)}, ${y.toFixed(2)})`,
    );
  }
}

// ── a suavização chega ao alvo, e na mesma velocidade em qualquer taxa ───────
{
  let a = 0;
  for (let i = 0; i < 60; i++) a = aproximar(a, 1, 1 / 60);

  let b = 0;
  for (let i = 0; i < 144; i++) b = aproximar(b, 1, 1 / 144);

  ok(Math.abs(a - b) < 0.01, `a suavização não depende da taxa de quadros (${a} vs ${b})`);
  ok(a > 0.9 && a < 1, "e converge para o alvo sem ultrapassá-lo");
}

// ── a semeadura é determinística com aleatório fixo ──────────────────────────
// Sem isto, nenhum dos testes acima poderia ser reproduzido depois de uma falha.
{
  const fixo = () => 0.5;
  eq(semear({ quantidade: 3, aleatorio: fixo }), semear({ quantidade: 3, aleatorio: fixo }), "mesma semente, mesmo céu");
}

// ── as iniciais do avatar ────────────────────────────────────────────────────
//
// Duas letras no canto da tela, e ainda assim o lugar onde um nome estranho aparece feio para
// sempre. Os casos abaixo são todos de nomes reais do PCEMPR.
eq(iniciais("GABRIEL HENRIQUE COELHO FREITAS"), "GF", "primeira e última palavra");
eq(iniciais("MARCILEY"), "M", "nome de uma palavra só dá uma letra, não uma repetida");
eq(iniciais("JOSE DA SILVA"), "JS", "as partículas do meio não contam");
eq(iniciais("MARIA DAS GRAÇAS"), "MG", "idem, com acento no fim");
eq(iniciais("  ESDRAS   BORGES  "), "EB", "espaço sobrando não vira letra");
// Quem não tem nome completo cai no nome de guerra, que sempre existe para quem entrou.
eq(iniciais("", "VENDA_DIRETA"), "VE", "nome vazio recorre à alternativa");
eq(iniciais("de da dos", "H"), "H", "só partículas também recorre");

console.log(`✓ ${n} conferências`);

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
  deslocamentoDoPonteiro,
  quantidadeParaArea,
  raio,
  semear,
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
ok(quantidadeParaArea(1920, 1080) <= 260, "monitor grande não passa do teto");
ok(quantidadeParaArea(360, 640) >= 40, "celular tem o piso");
ok(
  quantidadeParaArea(1920, 1080) > quantidadeParaArea(800, 600),
  "a densidade acompanha a área, senão o campo fica ralo no monitor grande",
);

// ── o campo se mantém dentro da tela ─────────────────────────────────────────
//
// O laço roda o equivalente a dez minutos de animação. É o teste que pega a estrela que
// escapa: se o reposicionamento falhasse, `y` cresceria sem limite e o campo iria esvaziando
// sem ninguém entender por quê.
{
  const estrelas = semear({ quantidade: 200 });

  for (let passo = 0; passo < 36_000; passo++) {
    avancar(estrelas, 1 / 60);
  }

  const forasDaTela = estrelas.filter((e) => e.y < -0.03 || e.y > 1.03);
  eq(forasDaTela.length, 0, "depois de dez minutos, nenhuma estrela escapou");

  const brilhoForaDaFaixa = estrelas.filter((e) => brilho(e) < 0 || brilho(e) > 1);
  eq(brilhoForaDaFaixa.length, 0, "o brilho nunca sai de 0..1 — fora disso o canvas ignora e a estrela some");

  ok(estrelas.every((e) => raio(e, 1) > 0.3), "nenhuma estrela fica menor que o antialiasing");
}

// ── o passo é por SEGUNDO, não por quadro ────────────────────────────────────
//
// Um monitor de 144 Hz entrega mais que o dobro dos quadros de um de 60. Com passo fixo por
// quadro, a mesma animação correria ao dobro da velocidade — defeito que só aparece na
// máquina de quem tem a tela boa.
{
  const a = semear({ quantidade: 1 });
  const b = [{ ...a[0] }];

  for (let i = 0; i < 60; i++) avancar(a, 1 / 60); // 1 segundo a 60 Hz
  for (let i = 0; i < 144; i++) avancar(b, 1 / 144); // 1 segundo a 144 Hz

  ok(
    Math.abs(a[0].y - b[0].y) < 1e-9,
    `60 Hz e 144 Hz percorrem o mesmo caminho em um segundo (${a[0].y} vs ${b[0].y})`,
  );
}

// ── o salto da aba em segundo plano ──────────────────────────────────────────
//
// Com a aba escondida o navegador para de entregar quadros, e o primeiro de volta traz o
// tempo acumulado de uma vez. Sem teto no passo, o campo inteiro saltaria.
{
  const estrelas = semear({ quantidade: 20 });
  const antes = estrelas.map((e) => e.y);

  avancar(estrelas, 300); // cinco minutos num único quadro

  const maiorSalto = Math.max(...estrelas.map((e, i) => Math.abs(e.y - antes[i])));
  ok(maiorSalto < 0.01, `o teto do passo segura o salto (maior deslocamento: ${maiorSalto})`);
}

// ── o parallax é limitado ────────────────────────────────────────────────────
//
// O ponteiro chega em −1..1. Mesmo no extremo, o deslocamento tem de caber na tela: se
// crescesse com a distância do cursor, as estrelas sairiam voando para fora da janela.
{
  for (const z of [0, 0.5, 1]) {
    for (const ponto of [{ x: -1, y: -1 }, { x: 1, y: 1 }, { x: 0, y: 0 }]) {
      const { dx, dy } = deslocamentoDoPonteiro(z, ponto);
      ok(Math.abs(dx) <= 0.04 && Math.abs(dy) <= 0.04, `parallax contido em z=${z}`);
    }
  }

  const frente = deslocamentoDoPonteiro(1, { x: 1, y: 0 }).dx;
  const fundo = deslocamentoDoPonteiro(0, { x: 1, y: 0 }).dx;
  ok(frente > fundo, "as estrelas da frente andam mais que as do fundo — é isso que dá profundidade");

  eq(deslocamentoDoPonteiro(0.5, { x: 0, y: 0 }), { dx: 0, dy: 0 }, "ponteiro no centro não desloca nada");
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
  const a = semear({ quantidade: 3, aleatorio: fixo });
  const b = semear({ quantidade: 3, aleatorio: fixo });
  eq(a, b, "mesma semente, mesmo céu");
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

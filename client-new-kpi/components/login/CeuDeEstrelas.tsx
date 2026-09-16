"use client";

import { useEffect, useRef } from "react";
import { useTema } from "@/context/TemaProvider";
import {
  aproximar,
  avancar,
  brilho,
  pontoDeFuga,
  projetar,
  quantidadeParaArea,
  raio,
  semear,
  type Estrela,
} from "@/lib/ceuDeEstrelas";

/**
 * O campo de estrelas atrás do login.
 *
 * Canvas 2D, sem biblioteca e sem nada vindo de fora da nossa origem. A aritmética mora em
 * `lib/ceuDeEstrelas.ts`; aqui só há ciclo de vida, entrada do ponteiro e desenho.
 *
 * <b>Três coisas que uma animação de fundo precisa fazer e quase nunca faz:</b>
 *
 * 1. <b>Parar quando ninguém está olhando.</b> Com a aba em segundo plano o laço é desligado —
 *    senão a página fica queimando bateria desenhando para o nada.
 * 2. <b>Respeitar `prefers-reduced-motion`.</b> Quem pediu menos movimento vê o campo parado,
 *    não uma versão mais lenta. Movimento involuntário provoca enjoo em quem tem sensibilidade
 *    vestibular, e uma tela de login é obrigatória — não dá para simplesmente sair dela. Isso
 *    passou a importar mais desde que o campo ganhou movimento próprio.
 * 3. <b>Sumir do papel.</b> `nao-imprime` porque um fundo escuro com pontos brancos gasta
 *    tinta e não é informação.
 */

/**
 * As duas paletas.
 *
 * <b>No tema claro isto deixa de ser um céu.</b> Pontos claros sobre fundo claro somem, e
 * pontos pretos sobre branco viram sujeira na tela. O que funciona é o mesmo campo em tons
 * frios e fechados — lê-se como poeira suspensa, e não como estrelas. O gesto é o mesmo, a
 * metáfora muda com a luz.
 *
 * <b>Medido, não escolhido no olho.</b> A primeira tentativa no claro saiu com opacidade média
 * de 23 em 255 — invisível. O culpado não era a cor: um círculo de meio pixel é quase todo
 * antialiasing, e o que sobra desaparece contra o branco. Por isso o claro tem ponto maior, e
 * não só mais opaco.
 */
const PALETA = {
  escuro: { frente: "#c7d9ff", fundo: "#8aa7d8", alfa: 1, escalaDoRaio: 1 },
  claro: { frente: "#2563eb", fundo: "#64748b", alfa: 1, escalaDoRaio: 1.7 },
} as const;

export function CeuDeEstrelas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { claro } = useTema();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const contexto = canvas.getContext("2d", { alpha: true });
    if (!contexto) return;

    const menosMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");
    const paleta = claro ? PALETA.claro : PALETA.escuro;

    let estrelas: Estrela[] = [];
    let largura = 0;
    let altura = 0;
    let escala = 1;
    let aspecto = 1;

    // Onde o ponteiro está (alvo) e onde o campo acha que ele está (atual). A distância entre
    // os dois é o que produz o movimento suave em vez do salto.
    const alvo = { x: 0, y: 0 };
    const atual = { x: 0, y: 0 };

    let quadro = 0;
    let anterior = performance.now();

    function dimensionar() {
      if (!canvas) return;

      const retangulo = canvas.getBoundingClientRect();
      // Teto de 2 no devicePixelRatio: num monitor 3x seriam nove vezes mais pixels para
      // pintar, e a diferença visual num ponto de dois pixels é nenhuma.
      escala = Math.min(window.devicePixelRatio || 1, 2);

      largura = Math.max(1, Math.floor(retangulo.width * escala));
      altura = Math.max(1, Math.floor(retangulo.height * escala));
      aspecto = largura / altura;

      canvas.width = largura;
      canvas.height = altura;

      estrelas = semear({ quantidade: quantidadeParaArea(retangulo.width, retangulo.height) });
    }

    function desenhar() {
      if (!contexto) return;

      contexto.clearRect(0, 0, largura, altura);

      const fuga = pontoDeFuga(atual);

      for (const estrela of estrelas) {
        const { x, y, proximidade } = projetar(estrela, fuga, aspecto);

        // Fora da tela: a estrela continua existindo e se aproximando, só não é pintada. É o
        // que permite ela entrar pela borda em vez de aparecer do nada quando cruza o limite.
        if (x < -0.05 || x > 1.05 || y < -0.05 || y > 1.05) continue;

        const r = raio(estrela, escala) * paleta.escalaDoRaio;

        contexto.globalAlpha = brilho(estrela) * paleta.alfa;

        // As que estão passando puxam para o claro; as do fundo ficam mais frias. É a mesma
        // pista que o tamanho dá, reforçada pela cor.
        contexto.fillStyle = proximidade > 0.62 ? paleta.frente : paleta.fundo;

        contexto.beginPath();
        contexto.arc(x * largura, y * altura, r, 0, Math.PI * 2);
        contexto.fill();
      }

      contexto.globalAlpha = 1;
    }

    function laco(agora: number) {
      const dt = (agora - anterior) / 1000;
      anterior = agora;

      atual.x = aproximar(atual.x, alvo.x, dt);
      atual.y = aproximar(atual.y, alvo.y, dt);

      avancar(estrelas, dt, { aspecto });
      desenhar();

      quadro = requestAnimationFrame(laco);
    }

    function ligar() {
      if (quadro !== 0) return;
      anterior = performance.now();
      quadro = requestAnimationFrame(laco);
    }

    function desligar() {
      if (quadro === 0) return;
      cancelAnimationFrame(quadro);
      quadro = 0;
    }

    function aoMover(evento: PointerEvent) {
      // −1 a 1, com zero no centro da janela.
      alvo.x = (evento.clientX / window.innerWidth) * 2 - 1;
      alvo.y = (evento.clientY / window.innerHeight) * 2 - 1;

      // Com movimento reduzido o campo fica parado, mas o ponto de fuga continua respondendo
      // ao ponteiro: ele só se move quando a pessoa mexe o mouse, então é movimento que ela
      // provocou. O que incomoda é o que se move sozinho.
      if (menosMovimento.matches) {
        atual.x = alvo.x;
        atual.y = alvo.y;
        desenhar();
      }
    }

    function aoTrocarVisibilidade() {
      if (document.hidden || menosMovimento.matches) desligar();
      else ligar();
    }

    function aoMudarPreferencia() {
      if (menosMovimento.matches) {
        desligar();
        desenhar();
      } else {
        ligar();
      }
    }

    dimensionar();
    desenhar();

    if (!menosMovimento.matches) ligar();

    const observador = new ResizeObserver(() => {
      dimensionar();
      desenhar();
    });
    observador.observe(canvas);

    window.addEventListener("pointermove", aoMover, { passive: true });
    document.addEventListener("visibilitychange", aoTrocarVisibilidade);
    menosMovimento.addEventListener("change", aoMudarPreferencia);

    return () => {
      desligar();
      observador.disconnect();
      window.removeEventListener("pointermove", aoMover);
      document.removeEventListener("visibilitychange", aoTrocarVisibilidade);
      menosMovimento.removeEventListener("change", aoMudarPreferencia);
    };
    // `claro` entra nas dependências: trocar o tema desmonta e remonta o laço com a paleta
    // nova. Custa uma semeadura — o campo se reorganiza —, e é aceitável porque acontece
    // só quando alguém aperta o interruptor.
  }, [claro]);

  return (
    <canvas
      ref={canvasRef}
      // Decoração pura: não entra na árvore de acessibilidade e não recebe ponteiro — um
      // canvas em cima da tela roubaria o clique do formulário.
      aria-hidden
      className="nao-imprime pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}

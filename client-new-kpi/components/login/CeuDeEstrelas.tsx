"use client";

import { useEffect, useRef } from "react";
import {
  aproximar,
  avancar,
  brilho,
  deslocamentoDoPonteiro,
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
 *    vestibular, e uma tela de login é obrigatória — não dá para simplesmente sair dela.
 * 3. <b>Sumir do papel.</b> `nao-imprime` porque um fundo escuro com pontos brancos gasta
 *    tinta e não é informação.
 */
export function CeuDeEstrelas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const contexto = canvas.getContext("2d", { alpha: true });
    if (!contexto) return;

    const menosMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");

    let estrelas: Estrela[] = [];
    let largura = 0;
    let altura = 0;
    let escala = 1;

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

      canvas.width = largura;
      canvas.height = altura;

      estrelas = semear({ quantidade: quantidadeParaArea(retangulo.width, retangulo.height) });
    }

    function desenhar() {
      if (!contexto) return;

      contexto.clearRect(0, 0, largura, altura);

      for (const estrela of estrelas) {
        const { dx, dy } = deslocamentoDoPonteiro(estrela.z, atual);

        const x = (estrela.x + dx) * largura;
        const y = (estrela.y + dy) * altura;
        const r = raio(estrela, escala);

        contexto.globalAlpha = brilho(estrela);

        // As da frente puxam para o azul do tema; as do fundo ficam quase brancas. É o que
        // amarra o campo ao resto da identidade em vez de parecer um protetor de tela.
        contexto.fillStyle = estrela.z > 0.72 ? "#93b8ff" : "#e8eeff";

        contexto.beginPath();
        contexto.arc(x, y, r, 0, Math.PI * 2);
        contexto.fill();
      }

      contexto.globalAlpha = 1;
    }

    function laco(agora: number) {
      const dt = (agora - anterior) / 1000;
      anterior = agora;

      atual.x = aproximar(atual.x, alvo.x, dt);
      atual.y = aproximar(atual.y, alvo.y, dt);

      avancar(estrelas, dt);
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

      // Com movimento reduzido o campo fica parado, mas o parallax continua respondendo ao
      // ponteiro: ele só acontece quando a pessoa mexe o mouse, então é movimento que ela
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
  }, []);

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

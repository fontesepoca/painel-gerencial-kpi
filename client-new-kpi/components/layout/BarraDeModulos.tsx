"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSessao } from "@/hooks/useSessao";
import { cn } from "@/lib/cn";
import { modulosVisiveis, telaAtiva, type ModuloDoMenu } from "@/lib/navegacao";
import { IconeDaTela, IconeDoModulo } from "./Icones";

/**
 * Os módulos na barra lateral: um ícone por módulo, e as telas dele num painel que abre ao
 * lado quando o mouse passa por cima.
 *
 * <b>Só aparece o que a pessoa pode abrir.</b> A lista vem da sessão, filtrada pela mesma
 * regra do portão de cada rota — um módulo sem nenhuma tela liberada nem ganha ícone.
 */
export function BarraDeModulos() {
  const { data: usuario } = useSessao();
  const modulos = modulosVisiveis(usuario?.rotinas);

  if (modulos.length === 0) return null;

  return (
    <nav aria-label="Módulos" className="flex flex-col items-center gap-1.5">
      {modulos.map((modulo) => (
        <ItemDeModulo key={modulo.id} modulo={modulo} />
      ))}
    </nav>
  );
}

/**
 * Quanto o painel espera antes de fechar quando o mouse sai.
 *
 * Sem a espera, o caminho do ícone ao painel fecha o painel: basta o cursor cortar o canto
 * em diagonal e sair da área por um instante. 150 ms cobre o trajeto e ainda não parece que
 * o painel ficou preso.
 */
const ESPERA_PARA_FECHAR_MS = 150;

function ItemDeModulo({ modulo }: { modulo: ModuloDoMenu }) {
  const pathname = usePathname();
  const ativo = modulo.telas.some((t) => telaAtiva(pathname, t.href));

  const [aberto, setAberto] = useState(false);
  const fechamento = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const idDoPainel = useId();

  function cancelarFechamento() {
    if (fechamento.current) clearTimeout(fechamento.current);
    fechamento.current = null;
  }

  function abrir() {
    cancelarFechamento();
    setAberto(true);
  }

  function fecharDepois() {
    cancelarFechamento();
    fechamento.current = setTimeout(() => setAberto(false), ESPERA_PARA_FECHAR_MS);
  }

  useEffect(() => cancelarFechamento, []);

  // Clique fora e Esc fecham — os mesmos gestos do menu do usuário e do Exportar. O foco volta
  // ao ícone no Esc, para quem está no teclado não cair no começo do documento.
  useEffect(() => {
    if (!aberto) return;

    function aoClicar(evento: MouseEvent) {
      if (!containerRef.current?.contains(evento.target as Node)) setAberto(false);
    }

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      setAberto(false);
      botaoRef.current?.focus();
    }

    document.addEventListener("mousedown", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  function focarPrimeiraTela() {
    // Depois da pintura: o painel ainda não existe no mesmo tique em que abriu.
    requestAnimationFrame(() => painelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus());
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      // Só mouse abre por passagem. No toque, `pointerenter` dispara junto com o toque e o
      // clique logo depois fecharia o que acabou de abrir.
      onPointerEnter={(e) => e.pointerType === "mouse" && abrir()}
      onPointerLeave={(e) => e.pointerType === "mouse" && fecharDepois()}
      // Sair com o Tab do último item fecha; mover o foco de dentro para dentro, não.
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node | null)) setAberto(false);
      }}
    >
      <button
        ref={botaoRef}
        type="button"
        aria-label={modulo.nome}
        aria-expanded={aberto}
        aria-controls={idDoPainel}
        onClick={() => setAberto((a) => !a)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            abrir();
            focarPrimeiraTela();
          }
        }}
        className={cn(
          "relative grid size-10 place-items-center rounded-[var(--radius-md)] transition-colors duration-[var(--dur-fast)]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
          ativo
            ? "bg-[var(--primary-glow)] text-[var(--primary)]"
            : "text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]",
          aberto && !ativo && "bg-[var(--surface-3)] text-[var(--text-primary)]",
        )}
      >
        {/* O traço junto à borda marca o módulo da tela aberta mesmo com o painel fechado —
            o fundo sozinho some no tema claro, onde o azul translúcido fica quase branco. */}
        {ativo && (
          <span
            aria-hidden
            className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r-full bg-[var(--primary)]"
          />
        )}
        <IconeDoModulo icone={modulo.icone} />
      </button>

      {aberto && (
        // `pl-2` em vez de `ml-2`: o espaço entre o ícone e a caixa faz parte do painel, então
        // o cursor atravessa sem sair da área e sem disparar o fechamento.
        <div
          ref={painelRef}
          id={idDoPainel}
          className="painel-de-modulo absolute top-0 left-full z-50 pl-3"
        >
          <div className="w-72 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-float)]">
            <p className="border-b border-[var(--border)] px-4 pt-3 pb-2 text-[length:var(--fs-rotulo)] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase">
              {modulo.nome}
            </p>

            <ul className="flex flex-col p-1.5">
              {modulo.telas.map((tela) => {
                const atual = telaAtiva(pathname, tela.href);
                return (
                  <li key={tela.codigo}>
                    <Link
                      href={tela.href}
                      aria-current={atual ? "page" : undefined}
                      // Fecha ao escolher: o painel não deve sobreviver à navegação parado em
                      // cima da página nova.
                      onClick={() => setAberto(false)}
                      onKeyDown={(e) => {
                        // Seta para cima e para baixo andam entre as telas, como numa lista.
                        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                        e.preventDefault();
                        const links = [
                          ...(painelRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []),
                        ];
                        const i = links.indexOf(e.currentTarget);
                        const proximo = links[i + (e.key === "ArrowDown" ? 1 : -1)];
                        if (proximo) proximo.focus();
                        else if (e.key === "ArrowUp") botaoRef.current?.focus();
                      }}
                      className={cn(
                        "group flex items-center gap-3 rounded-[var(--radius-md)] px-2.5 py-2 transition-colors duration-[var(--dur-instant)]",
                        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)]",
                        atual ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]",
                      )}
                    >
                      {/* O ícone da tela na frente do nome — o mesmo do cartão da tela inicial. */}
                      <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--primary-glow)] text-[var(--primary)]">
                        <IconeDaTela icone={tela.icone} className="size-[18px]" />
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[length:var(--fs-base)] font-medium text-[var(--text-primary)]">
                          {tela.nome}
                        </span>
                        <span className="text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
                          {atual ? "Você está aqui" : tela.descricao}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

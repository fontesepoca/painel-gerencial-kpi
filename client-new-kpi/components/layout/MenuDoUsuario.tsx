"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useSessao } from "@/hooks/useSessao";
import { iniciais } from "@/lib/iniciais";
import { cn } from "@/lib/cn";

/**
 * Quem está logado, no canto superior direito — e por onde se sai.
 *
 * <b>Um componente para as duas telas.</b> A inicial e a tela do DRE mostram o mesmo menu, e
 * ele busca a sessão sozinho em vez de recebê-la por propriedade: assim não existe uma tela
 * que diz uma coisa e outra que diz outra, e acrescentar a terceira rotina não exige lembrar
 * de passar o usuário por mais um nível de componentes.
 *
 * <b>O que o painel mostra não é enfeite.</b> Matrícula e filiais são o que decide o que a
 * pessoa consegue apurar — quando alguém reclama que "a filial 12 não aparece", é aqui que se
 * olha primeiro, sem abrir o Winthor.
 */
export function MenuDoUsuario() {
  const router = useRouter();
  const { data: usuario, isPending } = useSessao();

  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const idDoPainel = useId();

  // Fecha ao clicar fora e ao apertar Esc. As duas coisas juntas porque são os dois gestos que
  // a pessoa tenta sem pensar — e um menu que não fecha por nenhum deles parece travado.
  useEffect(() => {
    if (!aberto) return;

    function aoClicar(evento: MouseEvent) {
      if (!containerRef.current?.contains(evento.target as Node)) setAberto(false);
    }

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      setAberto(false);
      // O foco volta para o botão: sem isso ele cai no começo do documento, e quem navega por
      // teclado precisa atravessar a página inteira para voltar ao ponto onde estava.
      botaoRef.current?.focus();
    }

    document.addEventListener("mousedown", aoClicar);
    document.addEventListener("keydown", aoTeclar);

    return () => {
      document.removeEventListener("mousedown", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  async function sair() {
    if (saindo) return;
    setSaindo(true);

    try {
      await fetch("/api/sessao", { method: "DELETE" });
    } finally {
      // Vai para o login mesmo se a chamada falhar: o pior desfecho é a sessão continuar viva
      // no servidor até expirar, e manter a pessoa numa tela logada por cima disso não ajuda.
      router.refresh();
      router.push("/login");
    }
  }

  // Enquanto carrega, um espaço do tamanho do botão. Sem ele o cabeçalho salta quando o nome
  // chega — logo ao lado dos interruptores, que a pessoa pode estar tentando clicar.
  if (isPending || !usuario) {
    return <div aria-hidden className="h-9 w-9 rounded-full bg-[var(--surface-2)]" />;
  }

  return (
    <div ref={containerRef} className="nao-imprime relative">
      <button
        ref={botaoRef}
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls={idDoPainel}
        aria-haspopup="true"
        title={`${usuario.nome} — ${usuario.filiais.length} filiais`}
        className={cn(
          "flex items-center gap-2 rounded-full border py-1 pr-1 pl-1 transition-colors sm:pl-3",
          aberto
            ? "border-[var(--border-focus)] bg-[var(--surface-2)]"
            : "border-[var(--border-strong)] hover:bg-[var(--surface-2)]",
        )}
      >
        {/* O nome some em tela estreita; o avatar nunca some, porque é o alvo do clique. */}
        <span className="hidden text-[length:var(--fs-apoio)] font-medium text-[var(--text-secondary)] sm:inline">
          {usuario.nomeGuerra}
        </span>
        <span
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-[length:var(--fs-rotulo)] font-semibold text-white"
        >
          {iniciais(usuario.nome, usuario.nomeGuerra)}
        </span>
      </button>

      {aberto && (
        <div
          id={idDoPainel}
          role="group"
          aria-label="Sessão"
          className="absolute top-[calc(100%+0.5rem)] right-0 z-50 w-[17rem] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface-1)] shadow-[0_16px_48px_rgb(0_0_0/0.5)]"
        >
          <div className="flex flex-col gap-1 border-b border-[var(--border)] p-4">
            <span className="text-[length:var(--fs-base)] font-semibold text-[var(--text-primary)]">
              {usuario.nome}
            </span>
            <span className="text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
              {usuario.nomeGuerra} · matrícula {usuario.matricula}
            </span>
          </div>

          <div className="flex flex-col gap-2 border-b border-[var(--border)] p-4">
            <span className="text-[length:var(--fs-rotulo)] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase">
              Filiais liberadas
            </span>
            <div className="flex flex-wrap gap-1">
              {usuario.filiais.map((filial) => (
                <span
                  key={filial}
                  className="tabular rounded-[var(--radius-sm)] bg-[var(--surface-3)] px-1.5 py-0.5 text-[length:var(--fs-apoio)] text-[var(--text-secondary)]"
                >
                  {filial}
                </span>
              ))}
            </div>
            <p className="text-[length:var(--fs-apoio)] leading-relaxed text-[var(--text-muted)]">
              Vêm do Winthor. Mudanças valem no próximo login.
            </p>
          </div>

          <button
            type="button"
            onClick={sair}
            disabled={saindo}
            className="w-full px-4 py-3 text-left text-[length:var(--fs-base)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] disabled:opacity-60"
          >
            {saindo ? "Saindo…" : "Sair"}
          </button>
        </div>
      )}
    </div>
  );
}

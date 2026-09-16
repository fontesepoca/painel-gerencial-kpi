import { Suspense } from "react";
import type { Metadata } from "next";
import { CeuDeEstrelas } from "@/components/login/CeuDeEstrelas";
import { ControlesDeExibicao } from "@/components/layout/ControlesDeExibicao";
import { FormularioDeLogin } from "./FormularioDeLogin";

export const metadata: Metadata = {
  title: "Entrar · Época Analytics",
};

/**
 * A tela de entrada.
 *
 * O campo de estrelas é decoração, e por isso vem depois do conteúdo na ordem do documento e
 * atrás dele na pilha. Quem navega por teclado chega ao campo de usuário no primeiro Tab.
 */
export default function LoginPage() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-[var(--bg)] px-4 py-10">
      <CeuDeEstrelas />

      {/* Os controles de exibição vão em toda tela, e esta não é exceção — quem precisa de
          fonte grande precisa dela já no login, não depois de atravessá-lo. */}
      <div className="absolute top-4 right-4 z-10 sm:top-5 sm:right-6">
        <ControlesDeExibicao />
      </div>

      {/* Vinheta: escurece as bordas e levanta o centro, para o cartão não competir com as
          estrelas justamente onde estão os campos. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 45%, transparent 35%, var(--bg) 100%)",
        }}
      />

      <section className="relative w-full max-w-[26rem]">
        <header className="mb-7 flex flex-col items-center gap-3 text-center">
          <span
            aria-hidden
            className="grid size-12 place-items-center rounded-[var(--radius-md)] bg-[var(--primary)] text-lg font-semibold text-white"
            style={{ boxShadow: "0 8px 32px var(--primary-ring)" }}
          >
            E
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-[length:var(--fs-titulo)] font-semibold text-[var(--text-primary)]">
              Época Analytics
            </h1>
            <p className="text-[length:var(--fs-apoio)] text-[var(--text-secondary)]">
              Entre com o seu usuário do Winthor
            </p>
          </div>
        </header>

        {/* O cartão. O desfoque sobre o campo é o que dá o vidro: as partículas continuam
            visíveis atrás, borradas, e o texto fica legível. A cor sai de `--surface-1`, então
            ele acompanha o tema — ver `.cartao-login` em globals.css. */}
        <div className="cartao-login rounded-[var(--radius-lg)] border border-[var(--border-strong)] p-6 sm:p-7">
          {/* `useSearchParams` obriga um limite de Suspense — sem ele a rota inteira vira
              dinâmica e o Next recusa a compilação. O recuo é o cartão vazio, que dura um
              quadro. */}
          <Suspense fallback={<div className="h-[19rem]" />}>
            <FormularioDeLogin />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

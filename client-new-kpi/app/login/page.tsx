import { Suspense } from "react";
import type { Metadata } from "next";
import { CeuDeEstrelas } from "@/components/login/CeuDeEstrelas";
import { FormularioDeLogin } from "./FormularioDeLogin";

export const metadata: Metadata = {
  title: "Entrar · Época KPI",
};

/**
 * A tela de entrada.
 *
 * O campo de estrelas é decoração, e por isso vem depois do conteúdo na ordem do documento e
 * atrás dele na pilha. Quem navega por teclado chega ao campo de usuário no primeiro Tab.
 */
export default function LoginPage() {
  return (
    // `tela-login` redefine os tokens para o escuro: esta tela não segue o tema do usuário,
    // porque o campo de estrelas desapareceria no claro. Ver globals.css.
    <main className="tela-login relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <CeuDeEstrelas />

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
              Época KPI
            </h1>
            <p className="text-[length:var(--fs-apoio)] text-[var(--text-secondary)]">
              Entre com o seu usuário do Winthor
            </p>
          </div>
        </header>

        {/* O cartão. `backdrop-blur` sobre o campo de estrelas é o que dá o vidro: as estrelas
            continuam visíveis atrás, desfocadas, e o texto fica legível. */}
        <div
          className="rounded-[var(--radius-lg)] border border-[var(--border-strong)] p-6 sm:p-7"
          style={{
            background: "rgb(12 18 32 / 0.72)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            boxShadow: "0 24px 64px rgb(0 0 0 / 0.45)",
          }}
        >
          {/* `useSearchParams` obriga um limite de Suspense — sem ele a rota inteira vira
              dinâmica e o Next recusa a compilação. O recuo é o cartão vazio, que dura um
              quadro. */}
          <Suspense fallback={<div className="h-[19rem]" />}>
            <FormularioDeLogin />
          </Suspense>
        </div>

        <p className="mt-5 text-center text-[length:var(--fs-apoio)] leading-relaxed text-[var(--text-muted)]">
          O acesso é o mesmo da rotina 9815, guia 4-DRE.
          <br />
          Sem permissão lá, não há acesso aqui.
        </p>
      </section>
    </main>
  );
}

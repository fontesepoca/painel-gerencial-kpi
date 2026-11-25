"use client";

import { useEffect, useState } from "react";

/**
 * A tela de espera das consultas ao banco do simulador (Gabriel, 24/11/2026):
 * - **no lugar da tabela**, na primeira consulta e ao trocar filial, região ou fornecedores;
 * - **por cima da tabela esmaecida** (`sobreposto`), na página, busca ou classe que ainda não veio
 *   do banco. Página já vista volta do cache do React Query e não mostra nada.
 *
 * É uma CÓPIA do `Apurando` do DRE (`app/dre-gerencial/page.tsx`), por decisão do Gabriel: o DRE
 * não é tocado. Mudou o visual lá, mude aqui também.
 *
 * O relógio é a única informação verdadeira que há para mostrar: o Oracle não informa o
 * andamento, e uma porcentagem seria inventada. Um número que muda a cada segundo prova que a
 * página está viva.
 */
export function ConsultandoProdutos({
  sobreposto = false,
}: {
  /**
   * Por cima da tabela esmaecida (página, busca ou classe ainda não vista): cartão mais baixo,
   * com sombra, para se destacar dos números atrás dele.
   */
  sobreposto?: boolean;
}) {
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const mm = Math.floor(segundos / 60);
  const ss = `${segundos % 60}`.padStart(2, "0");

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        sobreposto
          ? "w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-6 py-8 text-center shadow-[var(--shadow-float)]"
          : "rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] px-6 py-14 text-center"
      }
    >
      <div className="mb-6 flex justify-center gap-2.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="pulsa size-3 rounded-full bg-[var(--primary)]"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </div>

      <p className="text-[length:var(--fs-base)] text-[var(--text-primary)]">Consultando produtos…</p>

      <p className="tabular mt-3 text-[length:var(--fs-titulo)] font-semibold text-[var(--text-primary)]">
        {mm}:{ss}
      </p>

      <div className="mx-auto mt-5 h-[3px] w-56 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div className="cometa h-full w-1/3 rounded-full bg-[var(--primary)]" />
      </div>

      <p className="mx-auto mt-5 max-w-md text-[length:var(--fs-apoio)] leading-relaxed text-[var(--text-muted)]">
        Não feche a página.
      </p>
    </div>
  );
}

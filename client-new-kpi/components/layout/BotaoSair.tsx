"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Encerra a sessão dos dois lados: apaga o cookie e derruba o token guardado no servidor.
 *
 * Só limpar o cookie deixaria a sessão viva no Next, válida para quem tivesse copiado o
 * identificador — e "sair" tem de significar sair. Quem faz as duas coisas é o `DELETE` em
 * `/api/sessao`.
 */
export function BotaoSair() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    if (saindo) return;
    setSaindo(true);

    try {
      await fetch("/api/sessao", { method: "DELETE" });
    } finally {
      // Vai para o login mesmo se a chamada falhar: o pior desfecho é a sessão continuar viva
      // no servidor por até oito horas, e manter a pessoa numa tela logada por cima disso não
      // melhora nada. `refresh` limpa o que os componentes de servidor já tinham renderizado.
      router.refresh();
      router.push("/login");
    }
  }

  return (
    <button
      type="button"
      onClick={sair}
      disabled={saindo}
      className="nao-imprime rounded-[var(--radius-md)] border border-[var(--border-strong)] px-3 py-1.5 text-[length:var(--fs-apoio)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] disabled:opacity-60"
    >
      {saindo ? "Saindo…" : "Sair"}
    </button>
  );
}

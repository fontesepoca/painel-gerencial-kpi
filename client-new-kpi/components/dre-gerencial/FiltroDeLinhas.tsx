"use client";

import { useId } from "react";

/**
 * O campo que filtra as linhas da tabela do DRE, por descrição ou por código da conta.
 *
 * Fica entre o resumo da apuração e o `Mostrar contas zeradas` — ao lado do outro controle
 * que também decide **quais linhas aparecem**, e não junto de exportar e imprimir, que
 * decidem o que fazer com elas.
 *
 * <b>O botão de limpar não é enfeite.</b> Com o filtro escrito e nenhuma linha casando, a
 * tabela fica vazia; sem um alvo óbvio para desfazer isso, a saída que sobra é apagar o
 * texto caractere a caractere ou apurar tudo de novo.
 */
export function FiltroDeLinhas({
  valor,
  onMudar,
}: {
  valor: string;
  onMudar: (texto: string) => void;
}) {
  const id = useId();

  return (
    <div className="relative flex items-center">
      {/* O rótulo existe para o leitor de tela; na tela quem explica é o placeholder, e um
          rótulo visível aqui empurraria os outros controles para a linha de baixo. */}
      <label htmlFor={id} className="sr-only">
        Filtrar linhas por descrição ou código da conta
      </label>

      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute left-3 size-[1.1em] text-[var(--text-muted)]"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>

      <input
        id={id}
        type="search"
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        placeholder="Filtrar linhas…"
        title="Filtra por parte da descrição ou pelo código da conta — 3000080 acha PNEUS E CAMARAS"
        // O X NATIVO DO NAVEGADOR SAI, o nosso fica.
        //
        // `type="search"` desenha um botão de limpar próprio, e com o nosso ao lado a caixa
        // aparecia com DOIS X — um deles sem rótulo, sem cor do tema e de tamanho fixo.
        // Some o nativo, que não dá para estilizar nem anunciar para leitor de tela; fica o
        // nosso, que tem `aria-label` e acompanha o tema.
        //
        // O `type` continua `search`: ele é quem dá o papel de campo de busca ao elemento e
        // quem faz o `Esc` limpar o texto no Chrome e no Safari.
        className="w-[13rem] rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-1)] py-2 pl-9 pr-9 text-[length:var(--fs-base)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:border-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--primary)] [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
      />

      {valor !== "" && (
        <button
          type="button"
          onClick={() => onMudar("")}
          aria-label="Limpar o filtro"
          title="Limpar o filtro"
          className="absolute right-1 rounded-[var(--radius-md)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-[1.05em]"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

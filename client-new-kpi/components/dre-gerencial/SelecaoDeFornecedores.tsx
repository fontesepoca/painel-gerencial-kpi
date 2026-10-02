"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useBuscarFornecedores } from "@/hooks/useDreGerencial";
import type { Fornecedor } from "@/types/dre-gerencial";

const CAMPO =
  "h-[var(--altura-controle)] w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border-strong)] " +
  "bg-[var(--surface-2)] px-3 text-[length:var(--fs-base)] text-[var(--text-primary)] " +
  "focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-ring)]";

/**
 * O CNPJ como as pessoas leem, não como o Winthor guarda.
 *
 * Ele aparece porque é o que distingue um cadastro do outro: a P&G tem meia dúzia de
 * cadastros com nomes quase iguais — `PROCTER & GAMBLE INDUSTRIAL E COMERCIAL LTDA` aparece
 * duas vezes —, e sem o CNPJ a lista obriga a escolher no escuro.
 *
 * Devolve o que veio quando não tem 14 dígitos: cadastro antigo às vezes tem CPF, ou nada.
 */
function cnpj(valor: string | null): string | null {
  if (valor === null) return null;
  const so = valor.replace(/\D/g, "");
  if (so.length !== 14) return valor.trim() === "" ? null : valor;
  return `${so.slice(0, 2)}.${so.slice(2, 5)}.${so.slice(5, 8)}/${so.slice(8, 12)}-${so.slice(12)}`;
}

/**
 * Seleção de fornecedores para o filtro do DRE — busca por nome ou por código.
 *
 * <b>Busca, e não lista.</b> São mais de treze mil fornecedores no cadastro; uma lista
 * corrida como a das filiais seria inútil aqui. Quem filtra o DRE sabe de quem está falando,
 * e digita.
 *
 * <b>Por que o nome do fornecedor não basta.</b> O filtro é por CÓDIGO, e cadastros
 * diferentes da mesma empresa são recortes diferentes: pedir o 29 traz o DRE do 29, pedir o
 * 2453 traz o do 2453, e um não puxa o outro. A tela mostra código e CNPJ junto do nome
 * porque é a única forma de a pessoa saber qual dos cadastros ela está escolhendo — e avisa
 * quando o escolhido tem irmãos. Ver `docs/FILTRO_FORNECEDOR.md`.
 */
export function SelecaoDeFornecedores({
  selecionados,
  onMudar,
}: {
  selecionados: Fornecedor[];
  onMudar: (fornecedores: Fornecedor[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const caixa = useRef<HTMLDivElement>(null);
  const campoBusca = useRef<HTMLInputElement>(null);

  /**
   * O debounce.
   *
   * Sem ele, cada tecla vira uma consulta ao Oracle — e o `LIKE '%...%'` sobre treze mil
   * fornecedores não é de graça. 250 ms é o intervalo em que quem digita depressa termina a
   * palavra antes da primeira viagem.
   */
  useEffect(() => {
    const t = setTimeout(() => setTermo(busca), 250);
    return () => clearTimeout(t);
  }, [busca]);

  // Mesma mecânica de fechar do seletor de filiais: clique fora e Escape.
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fechar);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fechar);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  // O foco vai para a busca ao abrir: o campo existe para ser digitado, e obrigar um clique
  // a mais seria pedir duas ações para uma intenção.
  useEffect(() => {
    if (aberto) campoBusca.current?.focus();
  }, [aberto]);

  const { data: achados, isFetching } = useBuscarFornecedores(termo);

  const alternar = (f: Fornecedor) =>
    onMudar(
      selecionados.some((s) => s.codFornec === f.codFornec)
        ? selecionados.filter((s) => s.codFornec !== f.codFornec)
        : [...selecionados, f],
    );

  /**
   * O resumo é curto porque a coluna é estreita — 7rem, a menor da grade.
   *
   * <b>"Todos" em vez de "Todos os fornecedores"</b>: o rótulo do campo já diz Fornecedor, e
   * repetir a palavra dentro dele gastava 60px de uma coluna que não os tem. Com um
   * selecionado aparece só o CÓDIGO, que é o que identifica o recorte — o nome inteiro está
   * no cabeçalho da apuração, onde há largura para ele.
   */
  const resumo =
    selecionados.length === 0
      ? "Todos"
      : selecionados.length === 1
        ? String(selecionados[0]!.codFornec)
        : `${selecionados.length} forn.`;

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className={cn(CAMPO, "flex items-center justify-between text-left")}
      >
        <span
          className={cn("truncate", selecionados.length === 0 && "text-[var(--text-muted)]")}
        >
          {resumo}
        </span>
        <Seta className={cn("ml-2", aberto && "rotate-180")} />
      </button>

      {aberto && (
        <div className="absolute top-full left-0 z-20 mt-1 w-[min(30rem,92vw)] rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface-2)] p-2 shadow-[var(--shadow-float)]">
          <input
            ref={campoBusca}
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome ou código do fornecedor"
            className={cn(CAMPO, "mb-2")}
          />

          {selecionados.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5 border-b border-[var(--border)] pb-2">
              {selecionados.map((f) => (
                <button
                  key={f.codFornec}
                  type="button"
                  onClick={() => alternar(f)}
                  title={`Tirar ${f.fornecedor} do filtro`}
                  className="flex max-w-full items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-3)] px-2 py-1 text-[length:var(--fs-apoio)] hover:border-[var(--negative)]"
                >
                  <span className="tabular text-[var(--text-muted)]">{f.codFornec}</span>
                  <span className="truncate">{f.fornecedor}</span>
                  <span aria-hidden className="text-[var(--text-muted)]">
                    ✕
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => onMudar([])}
                className="rounded-[var(--radius-sm)] px-2 py-1 text-[length:var(--fs-apoio)] text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
              >
                limpar
              </button>
            </div>
          )}

          <div className="max-h-72 overflow-y-auto">
            {termo.trim().length < 2 ? (
              <p className="px-2 py-3 text-[length:var(--fs-apoio)] leading-relaxed text-[var(--text-muted)]">
                Digite ao menos duas letras do nome, ou o código do fornecedor.
                <br />
                Sem nenhum selecionado, o DRE sai com todos — como sempre foi.
              </p>
            ) : isFetching && achados === undefined ? (
              <p className="px-2 py-3 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
                Procurando…
              </p>
            ) : (achados?.length ?? 0) === 0 ? (
              <p className="px-2 py-3 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
                Nenhum fornecedor com <strong>{termo}</strong> no nome ou no código.
              </p>
            ) : (
              achados!.map((f) => {
                const marcado = selecionados.some((s) => s.codFornec === f.codFornec);
                return (
                  <label
                    key={f.codFornec}
                    className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] px-2 py-[var(--celula-y)] hover:bg-[var(--surface-3)]"
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternar(f)}
                      className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[length:var(--fs-base)]">
                        {f.fornecedor}
                      </span>
                      <span className="block text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
                        <span className="tabular">{f.codFornec}</span>
                        {cnpj(f.cgc) !== null && (
                          <>
                            {" · "}
                            <span className="tabular">{cnpj(f.cgc)}</span>
                          </>
                        )}
                        {/* O AVISO QUE EVITA A ESCOLHA ERRADA.
                            A P&G tem meia dúzia de cadastros, com nomes quase idênticos.
                            Escolher um e achar que levou a empresa inteira é o engano mais
                            provável desta tela — e silencioso, porque o DRE sai com números
                            plausíveis, só menores. */}
                        {f.codFornecPrinc !== null && f.codFornecPrinc !== f.codFornec && (
                          <>
                            {" · "}
                            <span className="text-[var(--warning)]">
                              grupo do {f.codFornecPrinc} — este DRE é só deste cadastro
                            </span>
                          </>
                        )}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A mesma seta dos outros campos que abrem lista, em `FiltrosDre`. */
function Seta({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4 shrink-0 text-[var(--text-muted)] transition-transform", className)}
    >
      <path d="m5 7.5 5 5 5-5" />
    </svg>
  );
}

"use client";

import { useEffect, useRef } from "react";

/** Quantos nomes cabem antes de a lista virar parede de texto. */
const LIMITE_DA_LISTA = 6;

export interface MovimentoPendente {
  /** "a linha DESPESAS COM PESSOAL" — sempre uma linha, desde 09/09/2026. */
  oQue: string;
  deOnde: string;
  paraOnde: string;
  /** Descrições das linhas que passam a parecer compor outros totais. */
  afetadas: string[];
}

/**
 * Confirmação de um movimento que muda a leitura do DRE.
 *
 * Só aparece quando alguma linha passa a parecer compor totais diferentes dos do
 * cadastro. Arrastar duas despesas do mesmo bloco não abre nada — avisar sobre o que
 * não mudou é o caminho mais curto para o usuário aprender a clicar em "Mover" sem ler.
 *
 * Usa `<dialog>` nativo: foco preso, `Esc` para fechar e leitura como diálogo já vêm
 * do navegador, sem biblioteca e sem reimplementar armadilha de foco à mão.
 */
export function ModalMoverLinha({
  pendente,
  onConfirmar,
  onCancelar,
}: {
  pendente: MovimentoPendente | null;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;

    if (pendente && !dialogo.open) dialogo.showModal();
    if (!pendente && dialogo.open) dialogo.close();
  }, [pendente]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="titulo-mover"
      // `Esc` e clique no backdrop fecham sem aplicar — cancelar é o caminho seguro.
      onCancel={(e) => {
        e.preventDefault();
        onCancelar();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancelar();
      }}
      className="dialogo-mover"
    >
      {pendente && (
        <div className="flex flex-col gap-5 p-6">
          <h2
            id="titulo-mover"
            className="text-[length:var(--fs-titulo)] font-semibold text-[var(--text-primary)]"
          >
            Mover {pendente.oQue}?
          </h2>

          <dl className="flex flex-col gap-3 rounded-[var(--radius-md)] bg-[var(--surface-2)] p-4 text-[length:var(--fs-base)]">
            <div className="flex flex-col gap-0.5">
              <dt className="text-[length:var(--fs-rotulo)] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase">
                Sai de
              </dt>
              <dd className="text-[var(--text-secondary)]">{pendente.deOnde}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-[length:var(--fs-rotulo)] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase">
                Vai parar
              </dt>
              <dd className="text-[var(--text-secondary)]">{pendente.paraOnde}</dd>
            </div>
          </dl>

          {/* O ponto que evita o mal-entendido caro: ninguém pode sair daqui achando
              que arrastou dinheiro de um total para outro. */}
          <p className="text-[length:var(--fs-base)] leading-relaxed text-[var(--text-secondary)]">
            <strong className="font-semibold text-[var(--text-primary)]">
              Nenhum valor muda.
            </strong>{" "}
            Os totais somam pelas marcações do cadastro, não pela posição na tela — depois
            de mover, as mesmas linhas continuam entrando exatamente nos mesmos totais.
          </p>

          {pendente.afetadas.length === 0 ? (
            // Totalizador movido sem arrastar despesa nenhuma para fora do lugar. Ainda
            // assim pergunta: ele é a âncora do bloco, e trocar a ordem dos totais muda
            // a sequência em que o DRE é lido.
            <p className="text-[length:var(--fs-base)] leading-relaxed text-[var(--text-secondary)]">
              Nenhuma despesa visível passa a aparecer fora do total que compõe. O que
              muda é a ordem em que os totais são lidos.
            </p>
          ) : (
            <div className="rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-glow)] p-4">
              <p className="text-[length:var(--fs-base)] leading-relaxed text-[var(--text-primary)]">
                O que muda é a <strong className="font-semibold">leitura</strong>:{" "}
                {pendente.afetadas.length === 1
                  ? "esta despesa passa a aparecer"
                  : `estas ${pendente.afetadas.length} despesas passam a aparecer`}{" "}
                fora do total que {pendente.afetadas.length === 1 ? "compõe" : "compõem"}.
                Quem ler ou imprimir a tabela vai ver uma coisa e a conta faz outra.
              </p>
              <ul className="mt-3 flex flex-col gap-1 text-[length:var(--fs-apoio)] text-[var(--text-secondary)]">
                {/* Lista longa vira parede de texto e ninguém lê. Alguns nomes situam
                    onde olhar; a contagem acima já deu o tamanho do estrago. */}
                {pendente.afetadas.slice(0, LIMITE_DA_LISTA).map((d) => (
                  <li key={d} className="flex gap-2">
                    <span aria-hidden className="text-[var(--warning)]">
                      •
                    </span>
                    {d}
                  </li>
                ))}
                {pendente.afetadas.length > LIMITE_DA_LISTA && (
                  <li className="pl-4 text-[var(--text-muted)]">
                    e mais {pendente.afetadas.length - LIMITE_DA_LISTA}
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onCancelar}
              className="h-[var(--altura-controle)] rounded-[var(--radius-md)] border border-[var(--border-strong)] px-5 text-[length:var(--fs-base)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirmar}
              // Não é o botão preferido: quem chegou aqui está fazendo algo que a tela
              // acabou de desaconselhar. Confirmar tem que ser deliberado.
              className="h-[var(--altura-controle)] rounded-[var(--radius-md)] bg-[var(--warning)] px-5 text-[length:var(--fs-base)] font-semibold text-[var(--sobre-warning)] transition-opacity hover:opacity-90"
            >
              Mover assim mesmo
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

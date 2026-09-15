"use client";

import { useEffect, useRef } from "react";
import { formatarValor } from "@/lib/formato";

/** Quantos totais cabem antes de a lista virar parede de texto. */
const LIMITE_DA_LISTA = 8;

export interface TotalAfetado {
  rotulo: string;
  antes: number;
  depois: number;
}

export interface MovimentoPendente {
  /** O nome da conta que está sendo movida. */
  conta: string;
  deOnde: string;
  paraOnde: string;
  /**
   * O totalizador que passa a contar esta conta, pelo nome.
   *
   * Sem isto o modal dizia só *"vai parar entre (-) DEVOLUCAO e (-) ST"* — e quem lê supõe
   * que a conta entra no ST. Ela atravessa os impostos e cai nas RECEITAS LIQUIDAS; a
   * posição na tela e o total que recebe deixaram de ser a mesma linha, então o modal diz
   * as duas coisas.
   *
   * `null` quando não há total nenhum para receber — aí quem fala é o aviso de `saiDaConta`.
   */
  somaEm: string | null;
  /** Os totalizadores que mudam de valor, com o antes e o depois. */
  totais: TotalAfetado[];
  /**
   * O destino não soma em lugar nenhum: **abaixo do LUCRO LIQUIDO**, onde não há mais
   * totalizador para receber a conta. Dentro do cabeçalho isso não acontece — a conta
   * atravessa `ST`, `PIS` e `COFINS` e cai nas RECEITAS LIQUIDAS.
   */
  saiDaConta: boolean;
}

/**
 * Confirmação de um movimento que muda os totais.
 *
 * ── Esta tela foi reescrita em 15/09/2026, e o motivo importa ──
 *
 * A versão anterior dizia, em negrito, **"Nenhum valor muda"**, e avisava que *"quem ler ou
 * imprimir a tabela vai ver uma coisa e a conta faz outra"*. Era verdade: os totalizadores
 * somavam pelas flags do cadastro, e a posição na tela era só leitura.
 *
 * Agora a posição manda no cálculo, e aquele texto passou a afirmar o oposto do que acontece.
 * Pior: ele alertava justamente contra o descompasso que deixou de existir.
 *
 * O que substitui não é um aviso mais brando — é **o número**. A pergunta que alguém precisa
 * responder antes de confirmar é "quanto muda, e em quê", e isso nenhum texto genérico
 * responde. Por isso a lista de totais com o antes e o depois.
 *
 * **E ele não abre mais quando nada muda.** Reordenar duas despesas dentro do mesmo bloco não
 * pergunta nada: avisar sobre o que não mudou é o caminho mais curto para a pessoa aprender a
 * confirmar sem ler.
 *
 * Usa `<dialog>` nativo: foco preso, `Esc` para fechar e leitura como diálogo já vêm do
 * navegador, sem biblioteca e sem reimplementar armadilha de foco à mão.
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
            Mover {pendente.conta}?
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
            {pendente.somaEm && (
              <div className="flex flex-col gap-0.5">
                <dt className="text-[length:var(--fs-rotulo)] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase">
                  Passa a somar em
                </dt>
                <dd className="font-medium text-[var(--text-primary)]">{pendente.somaEm}</dd>
              </div>
            )}
          </dl>

          {pendente.saiDaConta && (
            // O único caso que ainda merece cor de alerta: o valor continua na tela e para
            // de entrar em qualquer total. Não é um erro — é o que a pessoa pediu —, mas é
            // o movimento mais fácil de fazer sem perceber.
            <div className="rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-glow)] p-4">
              <p className="text-[length:var(--fs-base)] leading-relaxed text-[var(--text-primary)]">
                Aí esta conta <strong className="font-semibold">deixa de entrar em qualquer
                total</strong>. O valor continua aparecendo na linha, e nenhum totalizador
                passa a contá-lo.
              </p>
            </div>
          )}

          {pendente.totais.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[length:var(--fs-base)] leading-relaxed text-[var(--text-secondary)]">
                {pendente.totais.length === 1
                  ? "Um total muda de valor:"
                  : `${pendente.totais.length} totais mudam de valor:`}
              </p>
              <ul className="flex flex-col gap-1.5">
                {pendente.totais.slice(0, LIMITE_DA_LISTA).map((t) => (
                  <li
                    key={t.rotulo}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-3 py-[var(--celula-y)]"
                  >
                    <span className="text-[length:var(--fs-base)] text-[var(--text-primary)]">
                      {t.rotulo}
                    </span>
                    <span className="tabular text-[length:var(--fs-apoio)] text-[var(--text-secondary)]">
                      {formatarValor(t.antes)}{" "}
                      <span aria-hidden className="text-[var(--text-muted)]">
                        →
                      </span>
                      <span className="sr-only">passa a</span>{" "}
                      <strong className="font-semibold text-[var(--text-primary)]">
                        {formatarValor(t.depois)}
                      </strong>
                    </span>
                  </li>
                ))}
                {pendente.totais.length > LIMITE_DA_LISTA && (
                  <li className="pl-3 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
                    e mais {pendente.totais.length - LIMITE_DA_LISTA}
                  </li>
                )}
              </ul>
            </div>
          )}

          <p className="text-[length:var(--fs-apoio)] leading-relaxed text-[var(--text-muted)]">
            A ordem fica só neste navegador, e o botão{" "}
            <strong className="font-medium">Restaurar ordem do cadastro</strong> devolve os
            números da apuração.
          </p>

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
              // Deixou de ser "Mover assim mesmo" em cor de aviso: mover é a funcionalidade,
              // não um deslize que a tela desaconselha. A exceção é o destino que tira a
              // conta de todos os totais, e aí quem avisa é a caixa lá em cima.
              className={
                pendente.saiDaConta
                  ? "h-[var(--altura-controle)] rounded-[var(--radius-md)] bg-[var(--warning)] px-5 text-[length:var(--fs-base)] font-semibold text-[var(--sobre-warning)] transition-opacity hover:opacity-90"
                  : "h-[var(--altura-controle)] rounded-[var(--radius-md)] bg-[var(--primary)] px-5 text-[length:var(--fs-base)] font-semibold text-white transition-opacity hover:opacity-90"
              }
            >
              Mover
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

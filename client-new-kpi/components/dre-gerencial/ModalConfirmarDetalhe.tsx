"use client";

import { useEffect, useRef } from "react";

export interface DetalhePendente {
  /** A linha e a coluna clicadas, do jeito que aparecem no título do detalhamento. */
  oQue: string;
  /** O recorte, já em `dd/MM/yyyy`. */
  de: string;
  ate: string;
  /** Quantos dias o recorte cobre — é ele que justifica a pergunta. */
  dias: number;
}

/**
 * Confirmação antes de detalhar um recorte longo.
 *
 * **Por que perguntar.** O duplo clique numa célula sempre foi barato: um mês numa filial
 * responde em segundos. Com colunas de ano, o mesmo gesto passa a disparar a consulta mais
 * cara da rotina sobre doze meses — minutos de espera, sem cancelamento, iniciados por um
 * clique a mais. Quem apura por ano ainda vai querer detalhar; o que não pode é começar
 * isso sem saber.
 *
 * **A pergunta é pelo tamanho do recorte, não pelo modo.** Um comparativo de dez dias entre
 * dois anos não avisa nada — seria um alerta que só ensina a confirmar sem ler.
 *
 * `<dialog>` nativo, como o modal de mover linha: foco preso, `Esc` e leitura como diálogo
 * vêm do navegador.
 */
export function ModalConfirmarDetalhe({
  pendente,
  onConfirmar,
  onCancelar,
}: {
  pendente: DetalhePendente | null;
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
      aria-labelledby="titulo-detalhe-longo"
      // `Esc` e clique no fundo cancelam — não iniciar a consulta é o caminho seguro.
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
            id="titulo-detalhe-longo"
            className="text-[length:var(--fs-titulo)] font-semibold text-[var(--text-primary)]"
          >
            Detalhar {pendente.dias} dias?
          </h2>

          <dl className="flex flex-col gap-3 rounded-[var(--radius-md)] bg-[var(--surface-2)] p-4 text-[length:var(--fs-base)]">
            <div className="flex flex-col gap-0.5">
              <dt className="text-[length:var(--fs-rotulo)] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase">
                Linha
              </dt>
              <dd className="text-[var(--text-secondary)]">{pendente.oQue}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-[length:var(--fs-rotulo)] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase">
                Recorte
              </dt>
              <dd className="tabular text-[var(--text-secondary)]">
                {pendente.de} a {pendente.ate}
              </dd>
            </div>
          </dl>

          <p className="text-[length:var(--fs-base)] leading-relaxed text-[var(--text-secondary)]">
            O detalhamento percorre esse período inteiro no banco. Num recorte deste tamanho
            a espera é de{" "}
            <strong className="font-semibold text-[var(--text-primary)]">minutos</strong>, e
            não há como interromper depois de começar — a apuração que já está na tela
            continua intacta enquanto isso.
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
              // Este é o botão preferido, ao contrário do modal de mover: detalhar não é
              // uma escolha desaconselhada, só demorada.
              className="h-[var(--altura-controle)] rounded-[var(--radius-md)] bg-[var(--primary)] px-5 text-[length:var(--fs-base)] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Detalhar mesmo assim
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { CorpoDoDetalhe } from "@/components/dre-gerencial/ModalDetalhe";
import { recuperar, type DetalheAberto } from "@/lib/detalheAberto";
import { paraBr } from "@/lib/periodos";

/**
 * O detalhamento numa página inteira, em vez do diálogo.
 *
 * Pedido do Gabriel em 03/09/2026: com 15 mil clientes ou 6 mil lançamentos, o modal
 * empresta uma janela dentro da janela, e quem vai passar meia hora lendo aquilo quer a
 * tela toda — com endereço próprio, botão de voltar do navegador e impressão direta.
 *
 * **Não consulta nada.** O detalhamento chega pela memória do navegador, guardado quando o
 * modal abriu — ver `lib/detalheAberto.ts`. Uma página que refizesse a consulta ao ser
 * aberta cobraria de 8 s a 2 minutos para mostrar exatamente os mesmos números que já
 * estavam na tela anterior.
 *
 * `params` é uma Promise nesta versão do Next, e em componente de cliente se lê com `use`.
 */
export default function DetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  /**
   * `undefined` enquanto ninguém procurou, `null` quando procurou e não achou.
   *
   * **A busca só pode acontecer depois da hidratação.** No servidor não existe `Map` do
   * navegador nem `sessionStorage`: ler durante o render faz o servidor desenhar "não está
   * mais aqui" e o cliente desenhar a tabela, e o React reclama de HTML divergente. Foi
   * exatamente o que aconteceu na primeira versão disto — mesma armadilha que o
   * `TemaProvider` documenta.
   */
  const [detalhe, setDetalhe] = useState<DetalheAberto | null | undefined>(undefined);

  useEffect(() => {
    setDetalhe(recuperar(id));
  }, [id]);

  if (detalhe === undefined) return <Procurando />;
  if (detalhe === null) return <NaoEstaMaisAqui />;

  return (
    <AppShell trilha={["Época Analytics", "DRE Gerencial", detalhe.titulo]}>
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[110rem] flex-col gap-3">
        <section className="flex min-h-0 flex-1 flex-col rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] shadow-[var(--shadow-card)]">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div className="min-w-0">
              <h2 className="truncate text-[length:var(--fs-titulo)] font-semibold text-[var(--text-primary)]">
                {detalhe.titulo}
              </h2>
              <p className="mt-1 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
                {paraBr(detalhe.periodo.dataInicio)} a {paraBr(detalhe.periodo.dataFim)} ·
                apurado em {(detalhe.dados.duracaoMs / 1000).toFixed(1)} s
              </p>
            </div>

            <Voltar />
          </header>

          {/* A mesma área de rolagem da tabela do DRE: cabeçalho e coluna fixos, uma barra
              só, e a altura vindo do que sobra na coluna. */}
          <div className="tabela-rolagem tabela-detalhe">
            <CorpoDoDetalhe dados={detalhe.dados} linha={detalhe.linha} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Voltar() {
  return (
    <Link
      href="/dre-gerencial"
      className="flex shrink-0 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-4 py-2 text-[length:var(--fs-base)] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-[1.15em] shrink-0"
      >
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </svg>
      Voltar ao DRE
    </Link>
  );
}

/**
 * O instante entre o primeiro desenho e a leitura do armazenamento. Some em milissegundos:
 * não busca nada em rede, só lê memória do navegador. Existe para que o servidor e o
 * cliente desenhem a MESMA coisa no primeiro render.
 */
function Procurando() {
  return (
    <AppShell trilha={["Época Analytics", "DRE Gerencial", "Detalhamento"]}>
      <p className="px-6 py-16 text-center text-[length:var(--fs-base)] text-[var(--text-muted)]">
        Abrindo o detalhamento…
      </p>
    </AppShell>
  );
}

/**
 * O detalhamento não está mais na memória — recarregou fora do alcance do
 * `sessionStorage`, ou o endereço foi aberto em outra aba.
 *
 * **Não dispara consulta nenhuma.** Buscar de novo aqui transformaria um link colado em
 * dois minutos de espera que ninguém pediu, e o dado voltaria de outro instante do banco,
 * podendo não ser o mesmo que a pessoa tinha na tela.
 */
function NaoEstaMaisAqui() {
  return (
    <AppShell trilha={["Época Analytics", "DRE Gerencial", "Detalhamento"]}>
      <div className="mx-auto w-full max-w-2xl rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] px-6 py-16 text-center">
        <p className="text-[length:var(--fs-base)] text-[var(--text-primary)]">
          Este detalhamento não está mais aberto.
        </p>
        <p className="mx-auto mt-3 max-w-md text-[length:var(--fs-apoio)] leading-relaxed text-[var(--text-muted)]">
          A página mostra o que já tinha sido apurado, e por isso não busca nada sozinha —
          seria repetir uma consulta de minutos e trazer números de outro instante. Volte ao
          DRE, apure o período e abra o detalhamento de novo.
        </p>
        <div className="mt-6 flex justify-center">
          <Voltar />
        </div>
      </div>
    </AppShell>
  );
}

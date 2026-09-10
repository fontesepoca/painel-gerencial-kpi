"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { IconeImpressora } from "@/components/dre-gerencial/impressao";

/**
 * O menu de saída da tabela: imprimir, PDF e Excel atrás de um botão só.
 *
 * Mesmo padrão do popover de atalhos de período — `mousedown` fora fecha, `Esc` fecha,
 * `role="menu"` com `aria-expanded` no botão. Três botões soltos na barra ocupariam a
 * largura que a tela não tem, e "exportar" é uma intenção só com três formatos.
 *
 * **PDF e Imprimir passam pelo MESMO caminho**, e isso é decisão registrada: os dois
 * chamam `window.print()`, com a folha e a fonte que `useEscalaDeImpressao` calibra. Um
 * gerador de PDF no navegador seria uma segunda implementação dos padrões de impressão —
 * cabeçalho repetido a cada página, folha por número de colunas, as duas armadilhas de
 * `@page` — e divergiria na primeira correção feita em um dos dois.
 *
 * O que muda entre os dois itens é **o que se diz a quem clica**: em PDF, que o destino
 * `Salvar como PDF` precisa ser escolhido no diálogo. Nenhuma API do navegador pré-seleciona
 * esse destino, e prometer o contrário deixaria a pessoa esperando um download que não vem.
 */
export function MenuExportar({
  onImprimir,
  onExcel,
  excelOcupado,
  avisoDaImpressao,
}: {
  onImprimir: () => void;
  /** `null` desabilita o item — sem apuração na tela não há o que exportar. */
  onExcel: (() => void) | null;
  /** O `import()` do xlsx e a escrita do arquivo, em andamento. */
  excelOcupado?: boolean;
  /**
   * Troca o texto de apoio de Imprimir e de PDF.
   *
   * Existe para o modal: lá os dois abrem a página dedicada em nova aba, porque um
   * `<dialog>` vive na *top layer* e conteúdo da top layer não se fragmenta entre páginas.
   * Uma aba que aparece sem avisar parece defeito — o texto avisa.
   */
  avisoDaImpressao?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={caixa} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        title="Imprimir ou exportar esta tabela"
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-2.5 py-1.5",
          "text-[length:var(--fs-apoio)] font-medium",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]",
          aberto
            ? "border-[var(--primary)] text-[var(--text-primary)]"
            : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]",
        )}
      >
        <IconeExportar />
        Exportar
        <Seta className={cn(aberto && "rotate-180")} />
      </button>

      {aberto && (
        <div
          role="menu"
          className="absolute top-full right-0 z-30 mt-1 w-[min(19rem,90vw)] rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface-2)] p-2 shadow-[var(--shadow-float)]"
        >
          <ItemDoMenu
            icone={<IconeImpressora classe="size-5" />}
            rotulo="Imprimir"
            apoio={avisoDaImpressao ?? "Abre o diálogo de impressão"}
            onClick={() => {
              setAberto(false);
              onImprimir();
            }}
          />

          <ItemDoMenu
            icone={<IconePdf />}
            rotulo="Exportar PDF"
            apoio={
              avisoDaImpressao
                ? `${avisoDaImpressao}. Escolha Salvar como PDF`
                : "No diálogo, escolha o destino Salvar como PDF"
            }
            onClick={() => {
              setAberto(false);
              onImprimir();
            }}
          />

          <ItemDoMenu
            icone={<IconePlanilha />}
            rotulo="Exportar Excel"
            apoio={
              excelOcupado
                ? "Gerando o arquivo…"
                : "Arquivo .xlsx, com os valores como número"
            }
            onClick={
              onExcel === null || excelOcupado
                ? null
                : () => {
                    setAberto(false);
                    onExcel();
                  }
            }
          />
        </div>
      )}
    </div>
  );
}

/**
 * Uma opção do menu. `onClick` nulo desabilita — e o item **fica visível**: esconder a
 * opção faria a pessoa procurar onde ela foi, em vez de entender que ainda não dá.
 */
function ItemDoMenu({
  icone,
  rotulo,
  apoio,
  onClick,
}: {
  icone: React.ReactNode;
  rotulo: string;
  apoio: string;
  onClick: (() => void) | null;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={onClick === null}
      onClick={onClick ?? undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-[var(--celula-y)] text-left",
        onClick === null
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:bg-[var(--surface-3)]",
      )}
    >
      {/* Alinhado ao topo: com o rótulo em duas linhas, um ícone centrado verticalmente
          flutuaria entre as duas e perderia a ligação com o nome da opção. */}
      <span className="mt-0.5 shrink-0 self-start text-[var(--text-secondary)]">{icone}</span>
      <span className="min-w-0">
        <span className="block text-[length:var(--fs-base)] text-[var(--text-primary)]">
          {rotulo}
        </span>
        <span className="block text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
          {apoio}
        </span>
      </span>
    </button>
  );
}

/** Caixa com a seta saindo para cima — o "sair daqui para outro formato". */
function IconeExportar() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M12 4v12" />
    </svg>
  );
}

/**
 * Os dois ícones se distinguem pela **silhueta**, não por detalhe interno.
 *
 * A primeira versão desenhava as letras `PDF` numa folha e uma grade fina em outra folha:
 * a 18px as duas viravam a mesma folha cinza, e nada no menu diferenciava as opções além
 * do texto. Documento com linhas de texto contra grade de células decide em relance.
 */

/** Folha com a dobra e linhas de texto — documento. */
function IconePdf() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  );
}

/** Grade de células, sem moldura de folha — planilha. */
function IconePlanilha() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 14.5h18" />
      <path d="M9 9v11" />
      <path d="M15 9v11" />
    </svg>
  );
}

function Seta({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        "size-3.5 shrink-0 transition-transform duration-[var(--dur-fast)]",
        className,
      )}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

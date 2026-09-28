/**
 * Os primitivos das tabelas do detalhamento — cabeçalho, rodapé, célula numérica, célula de
 * identidade e os utilitários de soma e destaque.
 *
 * **Saíram do `ModalDetalhe.tsx` em 28/09/2026**, quando a tela de notas da devolução
 * passou a precisar dos mesmos. Duplicá-los deixaria duas tabelas com o mesmo nome e
 * aparências que divergem na primeira vez que alguém mexer numa só; importá-los do modal
 * criaria um ciclo, porque o modal importa a tabela.
 *
 * Nada aqui mudou na mudança de arquivo — só ganhou `export`.
 */

"use client";

import { formatarPercentual } from "@/lib/formato";
import { cn } from "@/lib/cn";
import { igual } from "@/lib/colunaDoTotal";

export function Vazio() {
  return (
    <p className="px-5 py-16 text-center text-[length:var(--fs-base)] text-[var(--text-muted)]">
      Nenhum lançamento no período.
    </p>
  );
}

/**
 * O cabeçalho sem a cor, para quem precisa pintá-lo de outra.
 *
 * **`cn` não resolve conflito entre classes Tailwind** — é concatenação, e no CSS gerado
 * quem ganha é a ordem da folha, não a do atributo. Somar `text-[var(--primary)]` a um `TH`
 * que já traz `text-[var(--text-muted)]` não muda cor nenhuma; foi o que aconteceu na
 * primeira versão do destaque, e o cabeçalho ficou cinza sem erro nenhum aparecer.
 */
/**
 * **Negrito nos cabeçalhos**, por decisão do Gabriel em 10/09/2026: eles precisam se
 * separar dos dados, e `font-medium` (500) contra o 400 do corpo era diferença que só
 * aparecia lado a lado.
 *
 * **A cor sobe junto, de `--text-muted` para `--text-primary`** — e isso foi medido na tela,
 * não escolhido no escuro. Com o cabeçalho em `--text-secondary`, os números do corpo
 * ficavam em `rgb(241,245,249)` e o cabeçalho em `rgb(203,213,225)`: no tema escuro, mais
 * claro é o que salta, então o cabeçalho continuava **atrás** do dado por mais negrito que
 * tivesse. Igualando a cor, o que separa os dois passa a ser peso, caixa alta e
 * letter-spacing, e o cabeçalho vem para a frente.
 */
export const TH_BASE =
  "px-3 py-[var(--celula-y)] text-[length:var(--fs-rotulo)] font-bold tracking-[0.14em] uppercase whitespace-nowrap";
export const TH = `${TH_BASE} text-[var(--text-primary)]`;
export const TD = "px-3 py-[var(--celula-y)] whitespace-nowrap";
export const NUM = `${TD} tabular text-right`;

/** Cabeçalho da tabela do modal, colado no topo da própria área de rolagem. */
export function Cabecalho({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-[var(--border-strong)]">{children}</tr>
    </thead>
  );
}

/**
 * Linha de totais. Existe para o usuário poder conferir com a célula que clicou sem
 * somar 15 mil linhas na mão — é a razão de a §4 ter sido corrigida.
 */
export function Total({ children }: { children: React.ReactNode }) {
  return (
    <tfoot>
      <tr className="border-t border-[var(--border-strong)] font-semibold">
        {children}
      </tr>
    </tfoot>
  );
}

export const soma = <T,>(linhas: readonly T[], campo: (l: T) => number) =>
  linhas.reduce((s, l) => s + campo(l), 0);

/**
 * `<th>` de coluna numérica, que se anuncia quando é ela que fecha o total.
 *
 * O nome da linha do DRE entra **acima** do rótulo, não no lugar dele: quem confere contra
 * a 9815 procura a coluna pelo nome que ela sempre teve, e trocar `Líquido` por `ST` faria
 * a coluna sumir para esse olhar.
 */
export function ThNum({
  rotulo,
  coluna,
  nome,
}: {
  rotulo: string;
  coluna: string | null;
  nome: string | null;
}) {
  const eOTotal = coluna === rotulo;
  const prefixo =
    eOTotal && nome !== null && !igual(nome, rotulo) ? `(${nome})` : null;

  return (
    <th
      className={cn(
        TH_BASE,
        "text-right",
        eOTotal ? "text-[var(--primary)]" : "text-[var(--text-primary)]",
      )}
      title={
        eOTotal && nome !== null
          ? `A soma desta coluna é o valor de ${nome} na tabela do DRE.`
          : undefined
      }
    >
      {prefixo && <span className="block">{prefixo}</span>}
      {rotulo}
    </th>
  );
}

/** Célula de rodapé: o mesmo destaque do cabeçalho, para o olho ligar as duas pontas. */
export const totalDe = (coluna: string | null, rotulo: string) =>
  cn(NUM, coluna === rotulo && "text-[var(--primary)]");

/**
 * `% part.` — duas casas na tela, uma no papel.
 *
 * Mesmo par de `%AV` e `%AH` na tabela do DRE: as duas grafias vivem no DOM e o CSS
 * escolhe, em vez de um estado trocado no `beforeprint` que um `Ctrl+P` direto não espera.
 */
export function ParteDoTotal({ valor }: { valor: number | null }) {
  return (
    <>
      <span className="so-na-tela">{formatarPercentual(valor, 2)}</span>
      <span className="so-no-papel">{formatarPercentual(valor, 1)}</span>
    </>
  );
}

/**
 * Célula que identifica a linha, e a única que fica parada na rolagem lateral.
 *
 * Código e nome moram **na mesma célula**, não em duas colunas fixas lado a lado. Duas
 * teriam que concordar até o pixel sobre onde a primeira termina, e o algoritmo de tabela
 * não garante isso — foi assim que a tabela principal abriu uma fresta por onde os valores
 * passavam por baixo. Uma coluna não tem com o que discordar.
 */
export function Identidade({
  codigo,
  nome,
}: {
  codigo: React.ReactNode;
  nome: string;
}) {
  return (
    <td className={cn(TD, "col-identidade max-w-[24rem]")}>
      <div className="flex items-baseline gap-2">
        <span className="tabular shrink-0 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
          {codigo}
        </span>
        {/* `descricao-conta` deixa o `@media print` desligar o corte: no papel não há
            hover para ler o `title`, e nome cortado com reticências é dado perdido. */}
        <span className="descricao-conta truncate" title={nome}>
          {nome}
        </span>
      </div>
    </td>
  );
}

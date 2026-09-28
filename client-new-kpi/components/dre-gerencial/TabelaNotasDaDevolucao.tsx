"use client";

import { formatarValor } from "@/lib/formato";
import { paraBr } from "@/lib/periodos";
import { cn } from "@/lib/cn";
import {
  Cabecalho,
  Identidade,
  NUM,
  ParteDoTotal,
  TD,
  ThDetalhe,
  Total,
  soma,
  totalDe,
} from "@/components/dre-gerencial/primitivosDoDetalhe";
import { useOrdenacaoDoDetalhe } from "@/hooks/useOrdenacaoDoDetalhe";
import type { ColunaOrdenavel } from "@/lib/ordenacaoDoDetalhe";
import type { DetalheNota } from "@/types/dre-gerencial";

/**
 * As colunas, declaradas como dado.
 *
 * <b>O `ler` devolve o valor bruto, não o que aparece na célula.</b> Ordenar pelo texto
 * renderizado poria `9,50` depois de `1.226.270,82`, porque `9` &gt; `1` quando se compara
 * string. A data sai em ISO pelo mesmo motivo: `02/09` e `14/09` comparam errado no formato
 * brasileiro, e certo em `2026-09-02`.
 */
const COLUNAS: readonly ColunaOrdenavel<DetalheNota>[] = [
  { rotulo: "Nota", tipo: "numero", ler: (n) => n.numNota },
  { rotulo: "Série", tipo: "texto", ler: (n) => n.serie },
  { rotulo: "Entrada", tipo: "texto", ler: (n) => n.dtEnt },
  { rotulo: "Parceiro", tipo: "texto", ler: (n) => n.parceiro },
  { rotulo: "Itens", tipo: "numero", ler: (n) => n.itens },
  { rotulo: "Devolução", tipo: "numero", ler: (n) => n.vlDevolucao },
  { rotulo: "% part.", tipo: "numero", ler: (n) => n.pPart },
];

/**
 * As notas de um motivo de devolução — o segundo nível de `(-) DEVOLUCAO`.
 *
 * A tela de motivos mostra uma coluna `Notas` com a quantidade de notas fiscais de cada
 * motivo, e até 28/09/2026 esse número não levava a lugar nenhum: a pessoa via "10 notas" e
 * não tinha como saber **quais**. Esta tabela responde isso.
 *
 * <b>A soma da coluna `Devolução` fecha com o valor do motivo</b>, e a contagem de linhas
 * com o número que foi clicado. É a mesma invariante dos 162/162 do duplo clique, um nível
 * abaixo — a `dc72` é quem mede.
 *
 * O `numTransEnt` não vira coluna, mas viaja no `title` da nota: é a chave real no Winthor
 * (o número sozinho se repete entre séries e filiais), e é o que alguém precisa para achar
 * a nota lá. Como coluna, seriam nove dígitos que ninguém lê.
 */
export function TabelaNotasDaDevolucao({
  linhas,
  coluna,
  nome,
}: {
  linhas: readonly DetalheNota[];
  /** O rótulo da coluna que soma no valor da célula clicada — ver `colunaDoTotal`. */
  coluna: string | null;
  /** O nome da linha do DRE, sem o sinal, para anunciar a coluna. */
  nome: string | null;
}) {
  const { ordem, ordenar, ordenadas } = useOrdenacaoDoDetalhe(linhas, COLUNAS);

  if (linhas.length === 0) return <SemNotas />;

  const th = { ordem, onOrdenar: ordenar, coluna, nome };

  return (
    <table className="w-full border-collapse text-[length:var(--fs-base)]">
      <Cabecalho>
        <ThDetalhe {...th} rotulo="Nota" tipo="numero" className="col-identidade" />
        <ThDetalhe {...th} rotulo="Série" tipo="texto" />
        <ThDetalhe {...th} rotulo="Entrada" tipo="texto" />
        <ThDetalhe {...th} rotulo="Itens" tipo="numero" numerica />
        <ThDetalhe {...th} rotulo="Devolução" tipo="numero" numerica />
        <ThDetalhe {...th} rotulo="% part." tipo="numero" numerica />
      </Cabecalho>
      <tbody>
        {ordenadas.map((n) => (
          // `numTransEnt` na chave, e não o número da nota: duas notas com a mesma
          // numeração em séries diferentes dariam chave repetida, e o React passaria a
          // reaproveitar a linha errada ao reordenar.
          <tr
            key={n.numTransEnt}
            className="border-b border-[var(--border)] odd:bg-[var(--zebra)] hover:bg-[var(--surface-2)]"
          >
            <Identidade
              codigo={n.numNota}
              nome={n.parceiro ?? "Sem parceiro identificado"}
            />
            <td className={TD}>{n.serie ?? "—"}</td>
            <td className={TD} title={`Transação de entrada ${n.numTransEnt}`}>
              {n.dtEnt ? paraBr(n.dtEnt.slice(0, 10)) : "—"}
            </td>
            <td className={NUM}>{n.itens}</td>
            <td className={NUM}>{formatarValor(n.vlDevolucao)}</td>
            <td className={NUM}>
              <ParteDoTotal valor={n.pPart} />
            </td>
          </tr>
        ))}
      </tbody>
      <Total>
        <td className={cn(TD, "col-identidade")}>
          {linhas.length} {linhas.length === 1 ? "nota" : "notas"}
        </td>
        <td className={TD} />
        <td className={TD} />
        <td className={NUM}>{soma(linhas, (n) => n.itens)}</td>
        <td className={totalDe(coluna, "Devolução")}>
          {formatarValor(soma(linhas, (n) => n.vlDevolucao))}
        </td>
        <td className={NUM}>
          <ParteDoTotal valor={soma(linhas, (n) => n.pPart)} />
        </td>
      </Total>
    </table>
  );
}

/**
 * Vazio próprio, em vez do `Vazio` compartilhado.
 *
 * Aquele diz "Nenhum lançamento no período", que aqui seria mentira em dois sentidos: não
 * são lançamentos, e o período tem movimento — quem chegou nesta tela veio de um motivo
 * com valor. Lista vazia aqui significa que a consulta das notas discorda da que somou o
 * motivo, e é isso que a mensagem tem de dizer para alguém poder investigar.
 */
function SemNotas() {
  return (
    <div className="px-5 py-16 text-center">
      <p className="text-[length:var(--fs-base)] text-[var(--text-muted)]">
        Nenhuma nota encontrada para este motivo.
      </p>
      <p className="mx-auto mt-2 max-w-[42rem] text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
        O motivo tem valor na tela anterior, então isto não deveria acontecer. Vale conferir
        a <span className="tabular">dc72</span> antes de confiar no número.
      </p>
    </div>
  );
}

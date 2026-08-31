"use client";

import { cn } from "@/lib/cn";
import { formatarPercentual, formatarValor } from "@/lib/formato";
import type { LinhaDre } from "@/types/dre-gerencial";

export function TabelaDre({
  linhas,
  mostrarZeradas,
}: {
  linhas: LinhaDre[];
  mostrarZeradas: boolean;
}) {
  const visiveis = mostrarZeradas ? linhas : linhas.filter((l) => !l.zerada);

  if (visiveis.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-[var(--text-muted)]">
        Nenhum lançamento no período selecionado.
      </p>
    );
  }

  // Escala das barras de %AV: a maior proporção da tela define 100% da largura.
  // Sem isso, o Lucro Bruto (26%) e o CMV (73%) ficariam quase indistinguíveis.
  const maiorAv = Math.max(
    ...visiveis.map((l) => Math.abs(l.percentualAv ?? 0)).filter((n) => n < 100),
    1,
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border-strong)]">
            <Th className="text-left">Descrição</Th>
            <Th className="text-right">Valor</Th>
            <Th className="w-[13rem] text-right">AV %</Th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((linha, indice) => (
            <Linha
              key={`${linha.id ?? "s"}-${linha.chave}-${indice}`}
              linha={linha}
              maiorAv={maiorAv}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-[11px] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Linha({ linha, maiorAv }: { linha: LinhaDre; maiorAv: number }) {
  const negativo = linha.valor < 0;

  return (
    <tr
      className={cn(
        "border-b border-[var(--border)] transition-colors duration-[var(--dur-instant)]",
        "hover:bg-[var(--surface-2)]",
        linha.totalizadora && "bg-[var(--surface-2)]",
        // O bloco informativo recua: está na tela para conferência, não para leitura.
        linha.naoSoma && "opacity-60",
      )}
    >
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          {/* A cor do EPCPARDRE é informação que o contador já reconhece: vira um
              marcador fino, não um fundo colorido que brigaria com o tema escuro. */}
          <span
            aria-hidden
            className="h-4 w-[3px] shrink-0 rounded-full"
            style={{ background: linha.cor ?? "transparent" }}
          />
          <span
            className={cn(
              "truncate",
              linha.totalizadora
                ? "font-semibold text-[var(--text-primary)]"
                : "text-[var(--text-secondary)]",
              // Conta individual, fora da hierarquia de grupos: recua para dentro.
              !linha.calculada && linha.naoSoma && "pl-3",
            )}
            title={linha.descricao}
          >
            {linha.descricao.trim()}
          </span>
          {linha.naoSoma && <SeloNaoSoma />}
        </div>
      </td>

      <td
        className={cn(
          "tabular px-4 py-2 text-right whitespace-nowrap",
          linha.totalizadora && "font-semibold",
          negativo ? "text-[var(--negative)]" : "text-[var(--text-primary)]",
          linha.zerada && "text-[var(--text-muted)]",
        )}
      >
        {formatarValor(linha.valor)}
      </td>

      <td className="px-4 py-2">
        <BarraAv percentual={linha.percentualAv} maior={maiorAv} />
      </td>
    </tr>
  );
}

/**
 * `%AV` como número e como proporção.
 *
 * Análise vertical é, por definição, uma proporção — e uma coluna de 123 percentuais
 * esconde justamente o que deveria mostrar. A barra devolve a leitura de relevância
 * que a grade do Winthor não conseguia dar, sem tirar o número de quem confere.
 */
function BarraAv({ percentual, maior }: { percentual: number | null; maior: number }) {
  if (percentual === null) {
    return <div className="text-right text-[var(--text-muted)]">—</div>;
  }

  const magnitude = Math.abs(percentual);
  const base = magnitude >= 100 ? 100 : maior;
  const largura = Math.min(100, (magnitude / base) * 100);
  const negativo = percentual < 0;

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="tabular text-xs text-[var(--text-secondary)]">
        {formatarPercentual(percentual)}
      </span>
      <span aria-hidden className="h-[2px] w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
        <span
          className="block h-full rounded-full transition-[width] duration-[var(--dur-normal)]"
          style={{
            width: `${largura}%`,
            background: negativo ? "var(--negative)" : "var(--primary)",
            opacity: magnitude >= 100 ? 1 : 0.7,
          }}
        />
      </span>
    </div>
  );
}

function SeloNaoSoma() {
  return (
    <span className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--warning-glow)] px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.1em] text-[var(--warning)] uppercase">
      Não soma
    </span>
  );
}

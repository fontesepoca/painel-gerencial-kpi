"use client";

import { cn } from "@/lib/cn";
import { formatarPercentual, formatarValor } from "@/lib/formato";
import type { LinhaDre, PeriodoDre } from "@/types/dre-gerencial";

export function TabelaDre({
  periodos,
  linhas,
  mostrarZeradas,
}: {
  periodos: PeriodoDre[];
  linhas: LinhaDre[];
  mostrarZeradas: boolean;
}) {
  // Esconde por AUSÊNCIA DE MOVIMENTO, não por valor zero — é o critério da 9815.
  // `DESCONTO FUNCIONÁRIOS` fecha em 0,00 com 16 lançamentos e continua na tela.
  const visiveis = mostrarZeradas ? linhas : linhas.filter((l) => !l.semMovimento);

  if (visiveis.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-[var(--text-muted)]">
        Nenhum lançamento no período selecionado.
      </p>
    );
  }

  // Com um mês só, a coluna de total repetiria a do mês — e o %AH seria sempre vazio.
  const multiMes = periodos.length > 1;

  // Escala das barras de %AV: a maior proporção abaixo de 100 define a largura cheia.
  // Sem isso, 26% e 73% ficariam quase indistinguíveis perto das Receitas Líquidas.
  const maiorAv = Math.max(
    ...visiveis.flatMap((l) =>
      l.valores.map((v) => Math.abs(v.percentualAv ?? 0)).filter((n) => n < 100),
    ),
    1,
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          {multiMes && (
            <tr className="border-b border-[var(--border)]">
              <th />
              {periodos.map((p) => (
                <th
                  key={p.mesAno}
                  colSpan={3}
                  className="border-l border-[var(--border)] px-4 pt-3 pb-1 text-center text-[11px] font-semibold tracking-[0.14em] text-[var(--text-secondary)] uppercase"
                >
                  {p.rotulo}
                </th>
              ))}
              <th
                colSpan={3}
                className="border-l border-[var(--border-strong)] bg-[var(--surface-2)] px-4 pt-3 pb-1 text-center text-[11px] font-semibold tracking-[0.14em] text-[var(--text-primary)] uppercase"
              >
                Total
              </th>
            </tr>
          )}
          <tr className="border-b border-[var(--border-strong)]">
            <Th className="text-left">Descrição</Th>
            {periodos.map((p) => (
              <ColunasCabecalho key={p.mesAno} mostrarAh={multiMes} />
            ))}
            {multiMes && <ColunasCabecalho total />}
          </tr>
        </thead>
        <tbody>
          {visiveis.map((linha, indice) => (
            <Linha
              key={`${linha.id ?? "s"}-${linha.chave}-${indice}`}
              linha={linha}
              maiorAv={maiorAv}
              multiMes={multiMes}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ColunasCabecalho({ mostrarAh, total }: { mostrarAh?: boolean; total?: boolean }) {
  return (
    <>
      <Th className={cn("text-right", total && "border-l border-[var(--border-strong)]")}>
        {total ? "Valor" : "Valor"}
      </Th>
      <Th className="w-[9rem] text-right">AV %</Th>
      {total ? <Th className="text-right">Média</Th> : mostrarAh ? <Th className="text-right">AH %</Th> : <th />}
    </>
  );
}

function Th({ className, children }: { className?: string; children?: React.ReactNode }) {
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

function Linha({
  linha,
  maiorAv,
  multiMes,
}: {
  linha: LinhaDre;
  maiorAv: number;
  multiMes: boolean;
}) {
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
          {/* A cor do EPCPARDRE é informação que o contador já reconhece: vira marcador
              fino, não fundo colorido que brigaria com o tema escuro. */}
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
              !linha.calculada && linha.naoSoma && "pl-3",
            )}
            title={linha.descricao}
          >
            {linha.descricao.trim()}
          </span>
          {linha.naoSoma && <SeloNaoSoma />}
        </div>
      </td>

      {linha.valores.map((v) => (
        <BlocoMes
          key={v.mesAno}
          valor={v.valor}
          av={v.percentualAv}
          ah={v.percentualAh}
          mostrarAh={multiMes}
          maiorAv={maiorAv}
          destaque={linha.totalizadora}
        />
      ))}

      {multiMes && (
        <BlocoMes
          valor={linha.total.valor}
          av={linha.total.percentualAv}
          media={linha.total.media}
          maiorAv={maiorAv}
          destaque={linha.totalizadora}
          total
        />
      )}
    </tr>
  );
}

function BlocoMes({
  valor,
  av,
  ah,
  media,
  mostrarAh,
  maiorAv,
  destaque,
  total,
}: {
  valor: number;
  av: number | null;
  ah?: number | null;
  media?: number;
  mostrarAh?: boolean;
  maiorAv: number;
  destaque: boolean;
  total?: boolean;
}) {
  const celula = cn("px-4 py-2 whitespace-nowrap tabular", destaque && "font-semibold");
  const corValor = (v: number) =>
    v < 0 ? "text-[var(--negative)]" : v === 0 ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]";

  return (
    <>
      <td
        className={cn(
          celula,
          "text-right",
          corValor(valor),
          total && "border-l border-[var(--border-strong)] bg-[var(--surface-2)]",
        )}
      >
        {formatarValor(valor)}
      </td>

      <td className={cn("px-4 py-2", total && "bg-[var(--surface-2)]")}>
        <BarraAv percentual={av} maior={maiorAv} />
      </td>

      {total ? (
        <td className={cn(celula, "text-right bg-[var(--surface-2)]", corValor(media ?? 0))}>
          {formatarValor(media ?? 0)}
        </td>
      ) : mostrarAh ? (
        <td className={cn(celula, "text-right")}>
          <Variacao percentual={ah ?? null} />
        </td>
      ) : (
        <td />
      )}
    </>
  );
}

/**
 * `%AV` como número e como proporção.
 *
 * Análise vertical é proporção por definição, e uma coluna de percentuais esconde
 * justamente o que deveria mostrar. A barra devolve a leitura de relevância que a grade
 * do Winthor não dava, sem tirar o número de quem confere.
 */
function BarraAv({ percentual, maior }: { percentual: number | null; maior: number }) {
  if (percentual === null) {
    return <div className="text-right text-[var(--text-muted)]">—</div>;
  }

  const magnitude = Math.abs(percentual);
  const base = magnitude >= 100 ? 100 : maior;
  const largura = Math.min(100, (magnitude / base) * 100);

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
            background: percentual < 0 ? "var(--negative)" : "var(--primary)",
            opacity: magnitude >= 100 ? 1 : 0.7,
          }}
        />
      </span>
    </div>
  );
}

/**
 * `%AH` — variação sobre o mês anterior. Verde sobe, vermelho desce, sem seta:
 * o sinal já diz a direção e a seta só competiria com ele.
 */
function Variacao({ percentual }: { percentual: number | null }) {
  if (percentual === null) {
    return <span className="text-[var(--text-muted)]">—</span>;
  }

  return (
    <span className={percentual < 0 ? "text-[var(--negative)]" : "text-[var(--positive)]"}>
      {percentual > 0 ? "+" : ""}
      {formatarPercentual(percentual)}
    </span>
  );
}

function SeloNaoSoma() {
  return (
    <span className="shrink-0 rounded-[var(--radius-sm)] bg-[var(--warning-glow)] px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.1em] text-[var(--warning)] uppercase">
      Não soma
    </span>
  );
}

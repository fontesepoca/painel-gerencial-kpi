"use client";

import { memo, useMemo } from "react";
import { cn } from "@/lib/cn";
import { formatarPercentualLivre, formatarValor3 } from "@/lib/formato";
import {
  calcular,
  lerPreco,
  linhaSimulada,
  percentuaisDe,
  percentuaisEfetivos,
  precoEfetivo,
} from "@/lib/simuladorPreco";
import type { AjusteDaLinha, CampoPercentual, ProdutoSimulado } from "@/types/simulador-preco";

/**
 * A tabela do simulador. Uma linha por produto, o preço de compra editável na própria célula e
 * tudo à direita recalculado na hora (decisão D1).
 *
 * <b>Sem alteração, a linha mostra o número DO SQL</b>, não o da nossa conta: a primeira tela é
 * a resposta do banco (spec A3). A conta só entra quando a pessoa muda o preço aqui ou confirma
 * o quadro do produto (D24) — e a `sp8` prova que, com os mesmos valores, as duas dão o mesmo
 * número.
 *
 * <b>Dois modos.</b> `consulta` é a tabela principal. `novo` é a seção "Produtos novos
 * simulados" (D26): as mesmas colunas, sem campo de preço na célula (edita-se pelo quadro) e
 * sem variação do preço futuro (D27).
 *
 * <b>Cores leves, por token</b>: a coluna editável em azul claro (`--primary-dim`), o preço
 * futuro em verde claro (`--positive-glow`), o percentual trocado em azul (D25).
 */

/**
 * A identidade de uma linha: código + tributação de CBS (spec §3.6). As linhas repetidas por NCM
 * (Q1) são de tributações diferentes; se ainda assim duas coincidirem, a página acrescenta um
 * contador. Não é a POSIÇÃO na lista, porque a simulação guardada tem de achar a mesma linha
 * numa consulta de amanhã.
 */
export const chaveDaLinha = (p: ProdutoSimulado) => `${p.codProd}|${p.codigoTributacao ?? "-"}`;

const TH =
  "px-[var(--celula-x)] py-1.5 text-left text-[length:var(--fs-rotulo)] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)] whitespace-nowrap";
const TH_NUM = cn(TH, "text-right");
const TD = "px-[var(--celula-x)] py-[var(--celula-y)] align-top";
const TD_NUM = cn(TD, "tabular text-right whitespace-nowrap");
/** Divisor entre GRUPOS de colunas (Entrada, Custo, Saída…), o mesmo do DRE entre blocos. */
const BLOCO = "border-l border-[var(--divisor-bloco)]";

export function TabelaSimulador({
  linhas,
  ajustes,
  onPreco,
  onRedefinir,
  onAbrir,
  modo = "consulta",
  className,
}: {
  linhas: { produto: ProdutoSimulado; chave: string }[];
  /** O que foi alterado, por chave de linha. Ausente = a linha do SQL. */
  ajustes: Readonly<Record<string, AjusteDaLinha>>;
  onPreco: (chave: string, texto: string) => void;
  /** Volta a linha inteira ao SQL; no modo `novo`, remove o produto. */
  onRedefinir: (chave: string) => void;
  onAbrir: (chave: string) => void;
  modo?: "consulta" | "novo";
  className?: string;
}) {
  return (
    // `overflow-auto`: a tabela rola DENTRO do contêiner, e o cabeçalho e as colunas do produto
    // ficam grudados (sticky) enquanto ela rola.
    <div className={cn("overflow-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]", className)}>
      <table className="w-max min-w-full border-separate border-spacing-0 text-[length:var(--fs-base)]">
        <thead className="sticky top-0 z-20 bg-[var(--surface-2)]">
          <tr>
            <th colSpan={2} className={cn(TH, "sticky left-0 z-30 bg-[var(--surface-2)]")}>
              {modo === "novo" ? "Produto novo" : "Produto"}
            </th>
            <th className={cn(TH, BLOCO, "bg-[var(--primary-dim)] text-[var(--primary)]")}>Compra</th>
            <th colSpan={6} className={cn(TH, BLOCO)}>Entrada</th>
            <th colSpan={3} className={cn(TH, BLOCO)}>Custo</th>
            <th colSpan={5} className={cn(TH, BLOCO)}>Saída</th>
            <th className={cn(TH, BLOCO, "bg-[var(--positive-glow)] text-[var(--positive)]")}>Preço</th>
          </tr>
          <tr>
            <th className={cn(TH, "sticky left-0 z-30 w-20 bg-[var(--surface-2)]")}>Código</th>
            <th className={cn(TH, "sticky left-20 z-30 min-w-[16rem] bg-[var(--surface-2)]")}>Descrição</th>
            <th className={cn(TH_NUM, BLOCO, "bg-[var(--primary-dim)]")}>Preço de compra</th>
            <th className={cn(TH_NUM, BLOCO)}>IPI</th>
            <th className={TH_NUM} title="Na versão 1 do SQL o ST é fixo em zero e não entra na conta.">ST</th>
            <th className={TH_NUM}>ICMS</th>
            <th className={TH_NUM}>PIS</th>
            <th className={TH_NUM}>COFINS</th>
            <th className={TH_NUM}>Frete FOB</th>
            <th className={cn(TH_NUM, BLOCO)}>Antes da CBS</th>
            <th className={TH_NUM}>CBS</th>
            <th className={TH_NUM}>Custo</th>
            <th className={cn(TH_NUM, BLOCO)}>Margem</th>
            <th className={TH_NUM}>ICMS</th>
            <th className={TH_NUM}>PIS</th>
            <th className={TH_NUM}>COFINS</th>
            <th className={TH_NUM}>Índice</th>
            <th className={cn(TH_NUM, BLOCO, "bg-[var(--positive-glow)]")}>Preço futuro</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ produto, chave }) => (
            <Linha
              key={chave}
              produto={produto}
              chave={chave}
              ajuste={ajustes[chave]}
              modo={modo}
              onPreco={onPreco}
              onRedefinir={onRedefinir}
              onAbrir={onAbrir}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Uma linha. `memo`: digitar num preço só redesenha a linha daquele preço — com quase dez mil
 * produtos na tela (sp6), redesenhar todas a cada tecla seria sentido.
 */
const Linha = memo(function Linha({
  produto: p,
  chave,
  ajuste,
  modo,
  onPreco,
  onRedefinir,
  onAbrir,
}: {
  produto: ProdutoSimulado;
  chave: string;
  ajuste: AjusteDaLinha | undefined;
  modo: "consulta" | "novo";
  onPreco: (chave: string, texto: string) => void;
  onRedefinir: (chave: string) => void;
  onAbrir: (chave: string) => void;
}) {
  const novo = modo === "novo";
  const texto = ajuste?.preco ?? "";
  const invalido = Number.isNaN(lerPreco(texto));
  const simulado = !novo && linhaSimulada(p, ajuste);
  const trocado = (campo: CampoPercentual) => ajuste?.percentuais?.[campo] !== undefined;

  // Simulado: a nossa conta, com o preço e os percentuais que valem. Senão: o SQL, como veio.
  const r = useMemo(
    () => (simulado ? calcular(precoEfetivo(p, ajuste), percentuaisEfetivos(p, ajuste)) : null),
    [simulado, p, ajuste],
  );
  const pc = simulado ? percentuaisEfetivos(p, ajuste) : percentuaisDe(p);

  const vl = <K extends keyof NonNullable<typeof r> & keyof ProdutoSimulado>(k: K) =>
    (r ? r[k] : p[k]) as number | null;

  const prFuturo = vl("prFuturo");
  const indice = vl("indice");
  // D16: índice ≤ 0 (impostos + margem ≥ 100%) não tem preço que faça sentido.
  const semPreco = indice === null || indice <= 0 || prFuturo === null;
  const variacao =
    simulado && !semPreco && p.prFuturo !== null && prFuturo !== null ? prFuturo - p.prFuturo : null;

  const fundoFixo = simulado ? "bg-[var(--surface-2)]" : "bg-[var(--surface-1)]";
  const temAjuste = ajuste !== undefined;

  return (
    <tr className={cn("group hover:bg-[var(--realce-linha)]", simulado && "bg-[var(--surface-2)]")}>
      {/* A marca da linha simulada é a borda à esquerda do código — discreta, e some no ↺. */}
      <td
        className={cn(
          TD,
          "tabular sticky left-0 z-10 w-20 border-b border-l-2 border-b-[var(--border)]",
          simulado ? "border-l-[var(--primary)]" : "border-l-transparent",
          fundoFixo,
        )}
      >
        {novo ? (
          <span className="rounded-[var(--radius-sm)] bg-[var(--primary-dim)] px-1.5 py-0.5 text-[length:var(--fs-apoio)] font-medium text-[var(--primary)]">
            NOVO
          </span>
        ) : (
          <button type="button" onClick={() => onAbrir(chave)} className="hover:text-[var(--primary)] hover:underline" title="Abrir o quadro do produto">
            {p.codProd}
          </button>
        )}
      </td>
      <td className={cn(TD, "sticky left-20 z-10 max-w-[22rem] min-w-[16rem] border-b border-[var(--border)]", fundoFixo)}>
        {/* O produto inteiro é o botão do quadro (D21): é onde a mão vai para "abrir o item". */}
        <button
          type="button"
          onClick={() => onAbrir(chave)}
          className="block w-full text-left"
          title={novo ? "Abrir o quadro para editar" : "Abrir o quadro do produto"}
        >
          <span className="line-clamp-2 text-[var(--text-primary)] group-hover:text-[var(--primary)]">{p.descricao}</span>
          <span className="mt-0.5 block text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
            {novo ? "Produto hipotético · percentuais digitados" : <>NCM {p.ncm ?? "—"}{p.descricaoTributacao && ` · ${p.descricaoTributacao}`}</>}
          </span>
        </button>
      </td>

      {/* ── Compra: o único campo editável da célula (D10) ── */}
      <td className={cn(TD, BLOCO, "border-b border-b-[var(--border)] bg-[var(--primary-dim)]")}>
        <div className="flex items-center justify-end gap-1">
          {novo ? (
            <span className="tabular py-1">{formatarValor3(p.vlUltPCompra ?? 0)}</span>
          ) : (
            <input
              aria-label={`Preço de compra do produto ${p.codProd}`}
              inputMode="decimal"
              value={texto}
              placeholder={p.vlUltPCompra === null ? "" : formatarValor3(p.vlUltPCompra)}
              data-campo-preco
              onChange={(e) => onPreco(chave, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onPreco(chave, "");
                if (e.key === "Enter") {
                  e.preventDefault();
                  irParaOutroPreco(e.currentTarget, e.shiftKey ? -1 : 1);
                }
              }}
              className={cn(
                "tabular h-8 w-28 rounded-[var(--radius-sm)] border bg-[var(--surface-1)] px-2 text-right",
                "focus:outline-none focus:ring-2 focus:ring-[var(--primary-ring)]",
                invalido
                  ? "border-[var(--negative)] text-[var(--negative)]"
                  : simulado && texto !== ""
                    ? "border-[var(--primary)] text-[var(--text-primary)]"
                    : "border-[var(--border-strong)] text-[var(--text-primary)]",
              )}
            />
          )}
          <button
            type="button"
            onClick={() => onRedefinir(chave)}
            title={novo ? "Remover este produto novo" : "Voltar a linha ao SQL: preço e percentuais"}
            aria-label={novo ? `Remover o produto novo ${p.descricao}` : `Voltar o produto ${p.codProd} ao SQL`}
            className={cn(
              "grid size-6 place-items-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--surface-3)]",
              novo ? "hover:text-[var(--negative)]" : "hover:text-[var(--text-primary)]",
              !novo && !temAjuste && "invisible",
            )}
          >
            {novo ? "✕" : "↺"}
          </button>
        </div>
        {invalido && (
          <div className="mt-0.5 text-right text-[length:var(--fs-apoio)] text-[var(--negative)]">Preço inválido</div>
        )}
        {/* D13: sem última compra o SQL entra com zero, e não com o custo de reposição. */}
        {!novo && !invalido && p.vlUltPCompra === 0 && !simulado && (
          <div className="mt-0.5 text-right text-[length:var(--fs-apoio)] text-[var(--warning)]">sem última compra</div>
        )}
      </td>

      {/* ── Entrada ── */}
      <ValorEPercentual valor={vl("vlIpi")} percentual={pc.percIpi} trocado={trocado("percIpi")} original={p.percIpi} bloco />
      <ValorEPercentual
        valor={vl("vlSt")}
        percentual={p.percSt}
        titulo="O % ST é só informativo na versão 1: o SQL fixa o valor em zero."
        apagado
      />
      <ValorEPercentual
        valor={vl("vlIcmsEnt")}
        percentual={vl("percIcmCusto")}
        trocado={trocado("percIcmsEnt") || trocado("percBaseRedEnt")}
        original={p.percIcmCusto}
        titulo={
          pc.percBaseRedEnt
            ? `ICMS ${formatarPercentualLivre(pc.percIcmsEnt ?? 0)}% com base reduzida a ${formatarPercentualLivre(pc.percBaseRedEnt)}%`
            : undefined
        }
      />
      <ValorEPercentual valor={vl("vlPisEnt")} percentual={pc.perPis} trocado={trocado("perPis")} original={p.perPisEnt} />
      <ValorEPercentual valor={vl("vlCofinsEnt")} percentual={pc.perCofins} trocado={trocado("perCofins")} original={p.perCofinsEnt} />
      <ValorEPercentual valor={vl("vlFreteFobEnt")} percentual={pc.percFreteFob} trocado={trocado("percFreteFob")} original={p.percFreteFobEnt} />

      {/* ── Custo ── */}
      <td className={cn(TD_NUM, BLOCO, "border-b border-b-[var(--border)]")}>{numero(vl("custoAntesCbs"))}</td>
      <ValorEPercentual
        valor={vl("vlCbs")}
        percentual={pc.percCbs}
        trocado={trocado("percCbs")}
        original={p.percCbs}
        titulo={`Base da CBS: ${numero(vl("baseCbs"))}${novo ? "" : p.codigoTributacao ? ` · tributação ${p.codigoTributacao}` : " · sem tributação para o NCM"}`}
      />
      <td className={cn(TD_NUM, "border-b border-[var(--border)] font-semibold text-[var(--text-primary)]")}>{numero(vl("custoCalc"))}</td>

      {/* ── Saída ── */}
      <Percentual valor={pc.margem} trocado={trocado("margem")} original={p.margem} bloco />
      <Percentual valor={pc.percIcmsSaid} trocado={trocado("percIcmsSaid")} original={p.percIcmsSaid} />
      <Percentual valor={pc.perPis} trocado={trocado("perPis")} original={p.perPisSaid} />
      <Percentual valor={pc.perCofins} trocado={trocado("perCofins")} original={p.perCofinsSaid} />
      <td className={cn(TD_NUM, "border-b border-[var(--border)]")}>{indice === null ? "—" : indice.toFixed(6).replace(".", ",")}</td>

      {/* ── Preço futuro ── */}
      <td className={cn(TD_NUM, BLOCO, "border-b border-b-[var(--border)] bg-[var(--positive-glow)]")}>
        {semPreco ? (
          <span
            className="text-[var(--warning)]"
            title={`Impostos + margem ≥ 100%: o índice é ${indice ?? "nulo"}. O resultado da conta é ${prFuturo === null ? "nulo" : formatarValor3(prFuturo)}.`}
          >
            — <span className="text-[length:var(--fs-apoio)]">impostos + margem ≥ 100%</span>
          </span>
        ) : (
          <>
            <div className="font-semibold text-[var(--text-primary)]">{numero(prFuturo)}</div>
            {variacao !== null && variacao !== 0 && (
              // Cor neutra de propósito: preço futuro subir não é "ruim" nem "bom" por si — é o
              // que a simulação quer mostrar. A seta diz o sentido sem julgar.
              <div
                className="text-[length:var(--fs-apoio)] text-[var(--text-secondary)]"
                title={`SQL: ${numero(p.prFuturo)}`}
              >
                {variacao > 0 ? "▲ +" : "▼ −"}
                {formatarValor3(Math.abs(variacao))}
              </div>
            )}
          </>
        )}
      </td>
    </tr>
  );
});

/**
 * Enter leva ao preço da linha de baixo; Shift+Enter, ao de cima (D20).
 *
 * <b>Pela ordem do DOM</b>, e não pelo índice dos dados: é a ordem que a pessoa vê, já com a
 * busca aplicada. O campo de destino vem com o texto selecionado, para digitar por cima, e
 * rola para a vista sem pular a página inteira.
 */
function irParaOutroPreco(atual: HTMLInputElement, passo: 1 | -1) {
  const campos = Array.from(
    atual.closest("table")?.querySelectorAll<HTMLInputElement>("input[data-campo-preco]") ?? [],
  );
  const destino = campos[campos.indexOf(atual) + passo];
  if (!destino) return;
  destino.focus();
  destino.select();
  destino.scrollIntoView({ block: "nearest" });
}

function numero(valor: number | null): string {
  return valor === null ? "—" : formatarValor3(valor);
}

const percentual = (v: number | null) => (v === null ? "—" : `${formatarPercentualLivre(v)}%`);

/**
 * Valor em reais e, embaixo, o percentual que o gerou. Percentual trocado no quadro fica em azul,
 * com o do SQL no `title` (D25).
 */
function ValorEPercentual({
  valor,
  percentual: pct,
  trocado,
  original,
  titulo,
  bloco,
  apagado,
}: {
  valor: number | null;
  percentual: number | null;
  trocado?: boolean;
  original?: number | null;
  titulo?: string;
  bloco?: boolean;
  apagado?: boolean;
}) {
  return (
    <td
      className={cn(TD_NUM, "border-b border-b-[var(--border)]", bloco && BLOCO, apagado && "opacity-60")}
      title={trocado ? `Alterado no quadro · SQL: ${percentual(original ?? null)}` : titulo}
    >
      <div className="text-[var(--text-primary)]">{numero(valor)}</div>
      <div className={cn("text-[length:var(--fs-apoio)]", trocado ? "font-medium text-[var(--primary)]" : "text-[var(--text-muted)]")}>
        {percentual(pct)}
      </div>
    </td>
  );
}

function Percentual({
  valor,
  trocado,
  original,
  bloco,
}: {
  valor: number | null;
  trocado?: boolean;
  original?: number | null;
  bloco?: boolean;
}) {
  return (
    <td
      className={cn(
        TD_NUM,
        "border-b border-b-[var(--border)]",
        bloco && BLOCO,
        trocado ? "font-medium text-[var(--primary)]" : "text-[var(--text-secondary)]",
      )}
      title={trocado ? `Alterado no quadro · SQL: ${percentual(original ?? null)}` : undefined}
    >
      {percentual(valor)}
    </td>
  );
}

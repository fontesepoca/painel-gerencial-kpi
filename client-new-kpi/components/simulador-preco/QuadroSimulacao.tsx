"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatarValor3 } from "@/lib/formato";
import {
  CAMPOS_PERCENTUAIS,
  calcular,
  lerPercentual,
  lerPreco,
  percentuaisDe,
  percentuaisEfetivos,
  precoEfetivo,
  stEfetivo,
  type PercentuaisDaLinha,
} from "@/lib/simuladorPreco";
import type {
  AjusteDaLinha,
  CampoPercentual,
  ProdutoNovo,
  ProdutoSimulado,
} from "@/types/simulador-preco";

/**
 * O quadro de um produto (D21): preço e percentuais editáveis, o resultado ao lado,
 * recalculado a cada tecla pelo mesmo `calcular()` da tabela.
 *
 * <b>É um rascunho até o Confirmar.</b> Produto do cadastro: Confirmar leva as alterações à
 * linha da tabela (D24). Produto novo: Confirmar o leva à seção "Produtos novos simulados"
 * (D26). Cancelar, Esc ou o X descartam o que foi digitado aqui.
 *
 * <b>`<dialog>` com `showModal`</b>: o navegador cuida do foco preso dentro do quadro, do Esc e
 * do fundo inerte. É também o que PADROES_DE_TELA §3 chama de "modal não imprime" — aceitável:
 * o quadro é ferramenta de simulação, não relatório.
 */

type Props =
  | {
      modo: "existente";
      produto: ProdutoSimulado;
      ajuste: AjusteDaLinha | undefined;
      onConfirmar: (ajuste: AjusteDaLinha | undefined) => void;
      onFechar: () => void;
    }
  | {
      modo: "novo";
      /** Ausente: produto novo do zero. Presente: reabrindo um já confirmado. */
      inicial: ProdutoNovo | undefined;
      onConfirmar: (produto: ProdutoNovo) => void;
      onFechar: () => void;
    };

/** Foco de teclado visível nos botões do quadro — o mesmo anel da tabela e da página. */
const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring)]";

/** Número para dentro de um campo: vírgula decimal, sem separador de milhar. */
const paraCampo = (valor: number | null) => (valor === null ? "" : String(valor).replace(".", ","));

export function QuadroSimulacao(props: Props) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  // Os valores de referência: os do SQL (produto do cadastro) ou zero (produto novo). São eles
  // que o ↺ de cada campo devolve, e é contra eles que um campo conta como "alterado".
  // Fixa durante a vida do quadro: ele é montado de novo a cada abertura.
  const [referencia] = useState<{ preco: number | null; percentuais: PercentuaisDaLinha; st: number }>(() => {
    if (props.modo === "existente") {
      return {
        preco: props.produto.vlUltPCompra,
        percentuais: percentuaisDe(props.produto),
        st: props.produto.vlSt ?? 0,
      };
    }
    return {
      preco: null,
      percentuais: Object.fromEntries(CAMPOS_PERCENTUAIS.map(({ campo }) => [campo, 0])) as PercentuaisDaLinha,
      st: 0,
    };
  });

  // O ponto de partida: o que já está valendo na tabela (ou no produto novo reaberto).
  const [descricao, setDescricao] = useState(props.modo === "novo" ? (props.inicial?.descricao ?? "") : "");
  const [preco, setPreco] = useState(() => {
    if (props.modo === "existente") return paraCampo(precoEfetivo(props.produto, props.ajuste));
    return props.inicial ? paraCampo(props.inicial.preco) : "";
  });
  // O ST em R$ (SQL v2, decisão V2): do quadro anterior, do ajuste, ou do SQL.
  const [st, setSt] = useState(() =>
    paraCampo(props.modo === "existente" ? stEfetivo(props.produto, props.ajuste) : (props.inicial?.st ?? 0)),
  );
  const [percentuais, setPercentuais] = useState<Record<CampoPercentual, string>>(() => {
    const partida =
      props.modo === "existente"
        ? percentuaisEfetivos(props.produto, props.ajuste)
        : (props.inicial?.percentuais ?? referencia.percentuais);
    return Object.fromEntries(
      CAMPOS_PERCENTUAIS.map(({ campo }) => [campo, paraCampo(partida[campo])]),
    ) as Record<CampoPercentual, string>;
  });

  useEffect(() => {
    dialogo.current?.showModal();
  }, []);

  // ── A leitura do que está digitado ──
  const precoLido = lerPreco(preco);
  const precoInvalido = Number.isNaN(precoLido);
  const lidos = Object.fromEntries(
    CAMPOS_PERCENTUAIS.map(({ campo }) => {
      const v = lerPercentual(percentuais[campo]);
      // Vazio = zero no produto novo; no do cadastro, vazio volta ao SQL.
      return [campo, v === null ? referencia.percentuais[campo] ?? 0 : v];
    }),
  ) as Record<CampoPercentual, number>;
  const invalidos = CAMPOS_PERCENTUAIS.filter(({ campo }) => Number.isNaN(lidos[campo])).map((c) => c.campo);

  const precoUsado = precoLido === null || precoInvalido ? (referencia.preco ?? 0) : precoLido;
  // ST: em reais, nunca negativo (lerPreco). Vazio volta ao do SQL (zero no produto novo).
  const stLido = lerPreco(st);
  const stInvalido = Number.isNaN(stLido);
  const stUsado = stLido === null || stInvalido ? referencia.st : stLido;
  const r = invalidos.length === 0 && !precoInvalido && !stInvalido ? calcular(precoUsado, lidos, stUsado) : null;

  const faltaDescricao = props.modo === "novo" && descricao.trim() === "";
  const faltaPreco = props.modo === "novo" && precoLido === null;
  const podeConfirmar = r !== null && !faltaDescricao && !faltaPreco;

  const confirmar = () => {
    if (!podeConfirmar) return;
    if (props.modo === "existente") {
      // Só o que difere do SQL vira ajuste: o resto continua seguindo o banco (spec §3.6).
      const trocados = Object.fromEntries(
        CAMPOS_PERCENTUAIS.filter(({ campo }) => lidos[campo] !== (referencia.percentuais[campo] ?? 0)).map(
          ({ campo }) => [campo, lidos[campo]],
        ),
      );
      const ajuste: AjusteDaLinha = {};
      if (precoUsado !== referencia.preco) ajuste.preco = preco;
      if (Object.keys(trocados).length > 0) ajuste.percentuais = trocados;
      if (stUsado !== referencia.st) ajuste.st = stUsado;
      props.onConfirmar(Object.keys(ajuste).length > 0 ? ajuste : undefined);
    } else {
      props.onConfirmar({
        id: props.inicial?.id ?? crypto.randomUUID(),
        descricao: descricao.trim(),
        preco: precoUsado,
        percentuais: lidos,
        st: stUsado,
      });
    }
  };

  const p = props.modo === "existente" ? props.produto : null;
  const semPreco = r !== null && (r.indice <= 0 || r.prFuturo === null);
  // A variação é do PREÇO FINAL (V1): é ele que está em destaque.
  const variacao =
    p && r && !semPreco && p.prFinal !== null && r.prFinal !== null ? r.prFinal - p.prFinal : null;

  return (
    <dialog
      ref={dialogo}
      aria-labelledby={idTitulo}
      onCancel={(e) => {
        // Esc: o próprio <dialog> fecharia, mas quem decide o que está aberto é a página.
        e.preventDefault();
        props.onFechar();
      }}
      className="m-auto w-[min(60rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-auto rounded-[var(--radius-xl)] border border-[var(--border-strong)] bg-[var(--surface-1)] p-0 text-[var(--text-primary)] shadow-[var(--shadow-modal)] backdrop:bg-black/50"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          confirmar();
        }}
      >
        <header className="flex items-start gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={idTitulo} className="text-[length:var(--fs-base)] font-semibold">
              {p ? (
                <>
                  <span className="tabular text-[var(--text-muted)]">{p.codProd}</span> · {p.descricao}
                </>
              ) : props.modo === "novo" && props.inicial ? (
                "Produto novo simulado"
              ) : (
                "Simular novo produto"
              )}
            </h2>
            <p className="mt-0.5 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
              {p
                ? `NCM ${p.ncm ?? "—"}${p.descricaoTributacao ? ` · ${p.descricaoTributacao}` : " · sem tributação de CBS para o NCM"}`
                : "Produto hipotético: percentuais digitados, sem SQL por trás."}
            </p>
          </div>
          <button
            type="button"
            onClick={props.onFechar}
            aria-label="Fechar sem confirmar"
            className={cn(FOCO, "grid size-8 place-items-center rounded-[var(--radius-md)] text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]")}
          >
            ✕
          </button>
        </header>

        <div className="grid gap-5 p-5 md:grid-cols-[1.3fr_1fr]">
          {/* ── Os campos ── Em 6 colunas finas (Gabriel, 25/11/2026: o quadro tinha scroll): os
              percentuais ocupam 2 (três por linha), Preço de compra e ST ocupam 3 (lado a lado).
              Eram 7 linhas, são 4. Cada Campo é um subgrid de 3 linhas (rótulo, caixa, apoio):
              um rótulo que quebra em duas linhas não desalinha as caixas vizinhas. */}
          <div className="grid content-start gap-3 sm:grid-cols-6">
            {props.modo === "novo" && (
              <Campo rotulo="Descrição" className="sm:col-span-6" erro={faltaDescricao ? "Informe a descrição." : undefined}>
                {(id) => (
                  <input
                    id={id}
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    placeholder="Ex.: Arroz 5 kg marca X"
                    className={campo(false, false)}
                  />
                )}
              </Campo>
            )}

            <Campo
              rotulo="Preço de compra (R$)"
              className="sm:col-span-3"
              erro={precoInvalido ? "Preço inválido." : faltaPreco ? "Informe o preço." : undefined}
              alterado={p !== null && !precoInvalido && precoUsado !== referencia.preco}
              original={p ? formatarValor3(referencia.preco ?? 0) : undefined}
              onRedefinir={p ? () => setPreco(paraCampo(referencia.preco)) : undefined}
            >
              {(id) => (
                <input
                  id={id}
                  inputMode="decimal"
                  value={preco}
                  onChange={(e) => setPreco(e.target.value)}
                  className={cn(campo(precoInvalido, false), "tabular bg-[var(--primary-dim)] text-right")}
                />
              )}
            </Campo>

            {/* O ST ao lado do preço (antes ficava no fim): os dois em R$, numa linha só. */}
            <Campo
              rotulo="ST (R$)"
              className="sm:col-span-3"
              info="O VLST da tabela de preço. Não depende do preço de compra; entra só no preço final."
              erro={stInvalido ? "Valor inválido." : undefined}
              alterado={p !== null && !stInvalido && stUsado !== referencia.st}
              original={p ? formatarValor3(referencia.st) : undefined}
              onRedefinir={p ? () => setSt(paraCampo(referencia.st)) : undefined}
            >
              {(id) => (
                <input
                  id={id}
                  inputMode="decimal"
                  value={st}
                  placeholder="0"
                  onChange={(e) => setSt(e.target.value)}
                  className={cn(campo(stInvalido, p !== null && stUsado !== referencia.st), "tabular text-right")}
                />
              )}
            </Campo>

            {CAMPOS_PERCENTUAIS.map(({ campo: c, rotulo, info }) => {
              const invalido = invalidos.includes(c);
              const alterado = !invalido && lidos[c] !== (referencia.percentuais[c] ?? 0);
              return (
                <Campo
                  key={c}
                  className="sm:col-span-2"
                  rotulo={`${rotulo} (%)`}
                  info={info}
                  erro={invalido ? "Percentual inválido." : undefined}
                  alterado={p !== null && alterado}
                  original={p ? `${paraCampo(referencia.percentuais[c] ?? 0)}%` : undefined}
                  onRedefinir={p ? () => setPercentuais((t) => ({ ...t, [c]: paraCampo(referencia.percentuais[c]) })) : undefined}
                >
                  {(id) => (
                    <input
                      id={id}
                      inputMode="decimal"
                      value={percentuais[c]}
                      placeholder="0"
                      onChange={(e) => setPercentuais((t) => ({ ...t, [c]: e.target.value }))}
                      className={cn(campo(invalido, p !== null && alterado), "tabular text-right")}
                    />
                  )}
                </Campo>
              );
            })}
          </div>

          {/* ── O resultado ── */}
          <div className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-4 text-[length:var(--fs-base)]">
            {r === null ? (
              <p className="text-[var(--negative)]">Corrija os campos marcados para ver o resultado.</p>
            ) : (
              <>
                <Resultado rotulo="Preço de compra" valor={r.vlUltPCompra} />
                <Resultado rotulo="+ IPI" valor={r.vlIpi} />
                <Resultado rotulo="− ICMS" valor={r.vlIcmsEnt} detalhe={`${paraCampo(r.percIcmCusto)}% de custo`} />
                <Resultado rotulo="− PIS" valor={r.vlPisEnt} />
                <Resultado rotulo="− COFINS" valor={r.vlCofinsEnt} />
                <Resultado rotulo="+ Frete FOB" valor={r.vlFreteFobEnt} />
                <Resultado rotulo="Custo antes da CBS" valor={r.custoAntesCbs} forte />
                <Resultado rotulo="Base da CBS" valor={r.baseCbs} apagado />
                <Resultado rotulo="− CBS" valor={r.vlCbs} />
                <Resultado rotulo="Custo calculado" valor={r.custoCalc} forte />
                <Resultado rotulo="Índice" texto={r.indice.toFixed(6).replace(".", ",")} apagado />

                <Resultado rotulo="Preço futuro (sem ST)" texto={semPreco ? "—" : formatarValor3(r.prFuturo ?? 0)} forte />
                <Resultado rotulo="+ ST" valor={r.vlSt} />

                <div className="mt-2 rounded-[var(--radius-md)] bg-[var(--positive-glow)] px-3 py-2">
                  <div className="text-[length:var(--fs-rotulo)] font-medium tracking-[0.08em] text-[var(--text-muted)] uppercase">
                    Preço final
                  </div>
                  {semPreco ? (
                    <div className="text-[var(--warning)]">— impostos + margem ≥ 100%</div>
                  ) : (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="tabular text-[length:var(--fs-titulo)] font-semibold">
                        {formatarValor3(r.prFinal ?? 0)}
                      </span>
                      {/* D27: produto novo não tem com que comparar. */}
                      {variacao !== null && variacao !== 0 && (
                        <span className="tabular text-[length:var(--fs-apoio)] text-[var(--text-secondary)]" title={`SQL: ${formatarValor3(p?.prFinal ?? 0)}`}>
                          {variacao > 0 ? "▲ +" : "▼ −"}
                          {formatarValor3(Math.abs(variacao))}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            type="button"
            onClick={props.onFechar}
            className={cn(FOCO, "h-[var(--altura-controle)] rounded-[var(--radius-md)] border border-[var(--border-strong)] px-4 text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]")}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!podeConfirmar}
            className={cn(
              FOCO,
              "h-[var(--altura-controle)] rounded-[var(--radius-md)] px-5 font-medium",
              podeConfirmar
                ? "bg-[var(--primary)] text-white hover:brightness-110"
                : "cursor-not-allowed bg-[var(--surface-3)] text-[var(--text-muted)]",
            )}
          >
            Confirmar
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function campo(invalido: boolean, alterado: boolean) {
  return cn(
    "h-[var(--altura-controle)] w-full min-w-0 rounded-[var(--radius-md)] border bg-[var(--surface-2)] px-3 text-[length:var(--fs-base)]",
    "focus:outline-none focus:ring-2 focus:ring-[var(--primary-ring)]",
    invalido
      ? "border-[var(--negative)] text-[var(--negative)]"
      : alterado
        ? "border-[var(--primary)] text-[var(--primary)]"
        : "border-[var(--border-strong)] text-[var(--text-primary)]",
  );
}

/** Rótulo, campo, e a linha de apoio: erro, ou "SQL: x ↺" quando o valor foi alterado. */
function Campo({
  rotulo,
  info,
  erro,
  alterado,
  original,
  onRedefinir,
  className,
  children,
}: {
  rotulo: string;
  info?: string;
  erro?: string;
  alterado?: boolean;
  original?: string;
  onRedefinir?: () => void;
  className?: string;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    // Subgrid de 3 linhas (rótulo, caixa, apoio): na mesma linha da grade, as caixas ficam
    // alinhadas mesmo quando um rótulo ou um apoio quebra em duas linhas. O rótulo encosta
    // embaixo (perto da caixa), o apoio encosta em cima.
    <div className={cn("row-span-3 grid min-w-0 grid-rows-subgrid gap-y-1", className)}>
      <label htmlFor={id} className="self-end text-[length:var(--fs-rotulo)] font-medium tracking-[0.08em] text-[var(--text-muted)] uppercase">
        {rotulo}
      </label>
      {children(id)}
      <div className="flex min-h-4 items-start justify-between gap-2 self-start text-[length:var(--fs-apoio)]">
        {erro ? (
          <span className="text-[var(--negative)]">{erro}</span>
        ) : alterado ? (
          <span className="text-[var(--primary)]">SQL: {original}</span>
        ) : (
          <span className="text-[var(--text-muted)]">{info}</span>
        )}
        {alterado && onRedefinir && (
          <button
            type="button"
            onClick={onRedefinir}
            title="Voltar ao valor do SQL"
            className={cn(FOCO, "rounded-[var(--radius-sm)] px-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]")}
          >
            ↺
          </button>
        )}
      </div>
    </div>
  );
}

function Resultado({
  rotulo,
  valor,
  texto,
  detalhe,
  forte,
  apagado,
}: {
  rotulo: string;
  valor?: number;
  texto?: string;
  detalhe?: string;
  forte?: boolean;
  apagado?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3",
        forte && "border-t border-[var(--border)] pt-1 font-semibold",
        apagado && "text-[var(--text-muted)]",
      )}
    >
      <span>
        {rotulo}
        {detalhe && <span className="ml-1 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">({detalhe})</span>}
      </span>
      <span className="tabular">{texto ?? formatarValor3(valor ?? 0)}</span>
    </div>
  );
}

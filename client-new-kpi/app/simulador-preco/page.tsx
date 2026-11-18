"use client";

import { useCallback, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  FiltrosSimulador,
  type EstadoDosFiltros,
} from "@/components/simulador-preco/FiltrosSimulador";
import { QuadroSimulacao } from "@/components/simulador-preco/QuadroSimulacao";
import { TabelaSimulador, chaveDaLinha } from "@/components/simulador-preco/TabelaSimulador";
import { useFiliais } from "@/hooks/useDreGerencial";
import { useSessao } from "@/hooks/useSessao";
import { chaveDaConsulta, useSimulacaoGuardada } from "@/hooks/useSimulacaoGuardada";
import { useConsultaSimulador } from "@/hooks/useSimuladorPreco";
import { linhaDeProdutoNovo, linhaSimulada } from "@/lib/simuladorPreco";
import type { AjusteDaLinha, ProdutoNovo } from "@/types/simulador-preco";

/**
 * Simulador de preço. Spec: docs/superpowers/specs/2026-11-18-simulador-de-preco-design.md.
 *
 * O fluxo: a pessoa escolhe filial, região e (se quiser) um fornecedor, consulta uma vez, e a
 * partir daí só digita — na célula de preço ou no quadro do produto. Nenhuma tecla volta ao banco
 * (D1). A simulação se guarda sozinha no navegador (D22) e volta na próxima consulta igual.
 */

/** O que está aberto no quadro: um produto da consulta, um produto novo, ou nada. */
type Quadro = { tipo: "existente"; chave: string } | { tipo: "novo"; id: string | null } | null;

export default function SimuladorPrecoPage() {
  const [filtros, setFiltros] = useState<EstadoDosFiltros>({
    codFilial: "",
    regiao: "",
    fornecedor: null,
  });
  const [busca, setBusca] = useState("");
  const [quadro, setQuadro] = useState<Quadro>(null);
  /** A consulta que ESTÁ na tela — não a dos filtros, que a pessoa pode já ter mudado. */
  const [consultaAtual, setConsultaAtual] = useState<string | null>(null);

  const { data: usuario } = useSessao();
  const filiais = useFiliais();
  const consulta = useConsultaSimulador();
  const { simulacao, alterar } = useSimulacaoGuardada(usuario?.base.id ?? null, usuario?.matricula ?? null);

  const ajustes = useMemo(
    () => (consultaAtual ? (simulacao.consultas[consultaAtual] ?? {}) : {}),
    [simulacao, consultaAtual],
  );

  const consultar = () => {
    const numRegiao = Number(filtros.regiao);
    const codFornec = filtros.fornecedor?.codFornec ?? null;
    setBusca("");
    setConsultaAtual(chaveDaConsulta(filtros.codFilial, numRegiao, codFornec));
    consulta.mutate({ codFilial: filtros.codFilial, numRegiao, codFornec });
  };

  /** Troca o ajuste de uma linha da consulta atual. `undefined` apaga: a linha volta ao SQL. */
  const ajustar = useCallback(
    (chave: string, mudar: (atual: AjusteDaLinha | undefined) => AjusteDaLinha | undefined) => {
      if (!consultaAtual) return;
      alterar((s) => {
        const daConsulta = { ...(s.consultas[consultaAtual] ?? {}) };
        const novo = mudar(daConsulta[chave]);
        if (novo === undefined || (novo.preco === undefined && novo.percentuais === undefined)) {
          delete daConsulta[chave];
        } else {
          daConsulta[chave] = novo;
        }
        return { ...s, consultas: { ...s.consultas, [consultaAtual]: daConsulta } };
      });
    },
    [alterar, consultaAtual],
  );

  // Estáveis: as linhas são `memo`, e uma função nova a cada render as redesenharia todas.
  const mudarPreco = useCallback(
    (chave: string, texto: string) =>
      ajustar(chave, (a) => ({ ...a, preco: texto === "" ? undefined : texto })),
    [ajustar],
  );
  const redefinir = useCallback((chave: string) => ajustar(chave, () => undefined), [ajustar]);
  const abrir = useCallback((chave: string) => setQuadro({ tipo: "existente", chave }), []);

  const removerNovo = useCallback(
    (id: string) => alterar((s) => ({ ...s, novos: s.novos.filter((n) => n.id !== id) })),
    [alterar],
  );
  const abrirNovo = useCallback((id: string) => setQuadro({ tipo: "novo", id }), []);

  // A chave de cada linha: código + tributação, com contador se ainda assim repetir.
  const linhas = useMemo(() => {
    const vistas = new Map<string, number>();
    return (consulta.data?.produtos ?? []).map((produto) => {
      const base = chaveDaLinha(produto);
      const n = vistas.get(base) ?? 0;
      vistas.set(base, n + 1);
      return { produto, chave: n === 0 ? base : `${base}#${n}` };
    });
  }, [consulta.data]);

  // Busca local, sem banco: por código ou por pedaço da descrição.
  const visiveis = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    if (termo === "") return linhas;
    return linhas.filter(
      ({ produto }) => String(produto.codProd) === termo || produto.descricao.toUpperCase().includes(termo),
    );
  }, [linhas, busca]);

  const simulados = useMemo(
    () => linhas.filter(({ produto, chave }) => linhaSimulada(produto, ajustes[chave])).length,
    [linhas, ajustes],
  );

  const novos = useMemo(
    () => simulacao.novos.map((n) => ({ produto: linhaDeProdutoNovo(n), chave: n.id })),
    [simulacao.novos],
  );

  const repetidos = linhas.length - new Set(linhas.map((l) => l.produto.codProd)).size;
  const linhaDoQuadro = quadro?.tipo === "existente" ? linhas.find((l) => l.chave === quadro.chave) : undefined;
  const novoDoQuadro = quadro?.tipo === "novo" && quadro.id ? simulacao.novos.find((n) => n.id === quadro.id) : undefined;

  return (
    <AppShell trilha={["Gerencial", "Simulador de Preço"]}>
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-4">
          <FiltrosSimulador
            filtros={filtros}
            onMudar={setFiltros}
            filiais={filiais.data ?? []}
            carregandoFiliais={filiais.isLoading}
            consultando={consulta.isPending}
            onConsultar={consultar}
          />
        </section>

        {/* A barra de ações: o produto novo não depende de consulta (D23), então ela existe sempre. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[length:var(--fs-apoio)] text-[var(--text-secondary)]">
          {consulta.isSuccess && linhas.length > 0 && (
            <>
              <span className="rounded-[var(--radius-sm)] bg-[var(--surface-3)] px-2 py-0.5 font-medium text-[var(--text-primary)]">
                {consulta.data.base?.rotulo}
              </span>
              <span className="tabular">
                {linhas.length} produto{linhas.length === 1 ? "" : "s"}
                {simulados > 0 && (
                  <> · <b className="text-[var(--primary)]">{simulados} simulado{simulados === 1 ? "" : "s"}</b></>
                )}
              </span>
              {repetidos > 0 && (
                <span className="text-[var(--warning)]" title="O mesmo NCM está em mais de uma tributação de CBS (spec §7, Q1).">
                  {repetidos} linha{repetidos === 1 ? "" : "s"} repetida{repetidos === 1 ? "" : "s"} por NCM em mais de uma tributação
                </span>
              )}
            </>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {consulta.isSuccess && linhas.length > 0 && (
              <>
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar produto ou código"
                  aria-label="Buscar produto na tabela"
                  className="h-8 w-56 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[length:var(--fs-base)] text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none"
                />
                {simulados > 0 && (
                  <button
                    type="button"
                    onClick={() => alterar((s) => ({ ...s, consultas: { ...s.consultas, [consultaAtual ?? ""]: {} } }))}
                    title="Volta todas as linhas desta consulta ao SQL"
                    className="h-8 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-3 text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
                  >
                    Desfazer todas
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => setQuadro({ tipo: "novo", id: null })}
              className="h-8 rounded-[var(--radius-md)] border border-[var(--primary)] bg-[var(--primary-dim)] px-3 font-medium text-[var(--primary)] hover:bg-[var(--primary-glow)]"
            >
              + Simular novo produto
            </button>
          </div>
        </div>

        {consulta.isIdle && (
          <Aviso>
            Escolha a filial e a região e clique em <b>Consultar</b>. Depois, digite o preço de compra
            de qualquer produto, ou clique nele para ajustar também os impostos: custo e preço futuro
            mudam na hora, sem consultar de novo. A simulação fica guardada só neste navegador.
          </Aviso>
        )}

        {consulta.isPending && (
          <Aviso>Consultando os produtos da filial. Pode levar alguns instantes — não recarregue a página.</Aviso>
        )}

        {consulta.isError && (
          <Aviso tom="erro">
            {consulta.error instanceof Error ? consulta.error.message : "Falha ao consultar a API."}
          </Aviso>
        )}

        {consulta.isSuccess && linhas.length === 0 && (
          <Aviso>Nenhum produto para esta filial e região{filtros.fornecedor ? " com este fornecedor" : ""}.</Aviso>
        )}

        {/* D26: os produtos novos, numa seção à parte, ACIMA da tabela grande — com dez mil
            linhas embaixo, uma seção depois dela ficaria fora de alcance. */}
        {novos.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[length:var(--fs-rotulo)] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase">
              Produtos novos simulados ({novos.length})
            </h2>
            <TabelaSimulador
              linhas={novos}
              ajustes={{}}
              modo="novo"
              onPreco={() => {}}
              onRedefinir={removerNovo}
              onAbrir={abrirNovo}
              className="max-h-[40vh]"
            />
          </section>
        )}

        {consulta.isSuccess && linhas.length > 0 && (
          <TabelaSimulador
            linhas={visiveis}
            ajustes={ajustes}
            onPreco={mudarPreco}
            onRedefinir={redefinir}
            onAbrir={abrir}
            className="min-h-0 flex-1"
          />
        )}
      </div>

      {/* Montado só quando aberto: o quadro nasce com os valores do momento e some ao fechar. */}
      {linhaDoQuadro && (
        <QuadroSimulacao
          key={linhaDoQuadro.chave}
          modo="existente"
          produto={linhaDoQuadro.produto}
          ajuste={ajustes[linhaDoQuadro.chave]}
          onConfirmar={(ajuste) => {
            ajustar(linhaDoQuadro.chave, () => ajuste);
            setQuadro(null);
          }}
          onFechar={() => setQuadro(null)}
        />
      )}
      {quadro?.tipo === "novo" && (
        <QuadroSimulacao
          key={quadro.id ?? "novo"}
          modo="novo"
          inicial={novoDoQuadro}
          onConfirmar={(produto: ProdutoNovo) => {
            alterar((s) => ({
              ...s,
              novos: s.novos.some((n) => n.id === produto.id)
                ? s.novos.map((n) => (n.id === produto.id ? produto : n))
                : [...s.novos, produto],
            }));
            setQuadro(null);
          }}
          onFechar={() => setQuadro(null)}
        />
      )}
    </AppShell>
  );
}

function Aviso({ children, tom }: { children: React.ReactNode; tom?: "erro" }) {
  return (
    <p
      className={
        tom === "erro"
          ? "rounded-[var(--radius-md)] border border-[var(--negative)] bg-[var(--negative-glow)] px-4 py-3 text-[length:var(--fs-base)] text-[var(--negative)]"
          : "rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-[length:var(--fs-base)] leading-relaxed text-[var(--text-secondary)]"
      }
    >
      {children}
    </p>
  );
}

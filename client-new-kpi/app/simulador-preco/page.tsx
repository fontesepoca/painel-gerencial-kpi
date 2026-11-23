"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { formatarMomentoDaConsulta } from "@/lib/formato";
import { TAMANHO_DA_PAGINA, paginar } from "@/lib/paginacao";
import {
  type AjustesPorConsulta,
  ajustesNaTela,
  contarPendencias,
  limparSimulacao,
  salvarRascunhos,
  trocarAjuste,
} from "@/lib/rascunhoSimulacao";
import { linhaDeProdutoNovo, linhaSimulada } from "@/lib/simuladorPreco";
import { QuadroLimpar } from "@/components/simulador-preco/QuadroLimpar";
import type { AjusteDaLinha, ConsultaSimulador, ProdutoNovo } from "@/types/simulador-preco";

/**
 * Simulador de preço. Specs: docs/superpowers/specs/2026-11-18-simulador-de-preco-design.md e
 * 2026-11-23-simulador-paginacao-design.md.
 *
 * O fluxo: a pessoa escolhe filial, região e (se quiser) um fornecedor, consulta uma vez, e a
 * partir daí só digita — na célula de preço ou no quadro do produto. Nenhuma tecla volta ao banco
 * (D1). A simulação (só os ajustes) vai ao localStorage (D22, revista em 23/11/2026 — spec
 * 2026-11-23-simulador-salvar-limpar): as edições dos produtos da consulta ficam num rascunho
 * na memória da aba e só são guardadas no "Salvar simulação"; os produtos novos se guardam
 * sozinhos. "Limpar simulações" apaga, com confirmação, o que a pessoa marcar.
 *
 * <b>A consulta NÃO é guardada no navegador</b> (decisão V4, 23/11/2026, pela orientação do Dev de
 * não armazenar dados no navegador): ela vive só no estado da tela — o resultado da `useMutation`
 * do React Query —, e depois de um F5 consulta-se de novo, como na apuração do DRE. Houve uma
 * versão que guardava a consulta comprimida no sessionStorage; saiu por isso.
 *
 * <b>A tabela desenha 100 produtos por vez</b> (23/11/2026). Com os ~9.800 de uma filial inteira,
 * cada mudança de estado custava ~0,3 s ao navegador; a lista inteira continua na memória, e a
 * busca, as contagens e a simulação valem para todos.
 */

/** Foco de teclado visível nos botões da página — o mesmo anel da tabela e do quadro. */
const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring)]";

const BOTAO =
  "h-8 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-3 text-[var(--text-secondary)] " +
  "hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40 " +
  FOCO;

/** O que está aberto no quadro: um produto da consulta, um produto novo, ou nada. */
type Quadro = { tipo: "existente"; chave: string } | { tipo: "novo"; id: string | null } | null;

/** O que está na tela: a consulta e a hora em que foi feita. */
interface Resultado {
  dados: ConsultaSimulador;
  consultadoEm: string;
}

const chaveDoFiltro = (f: EstadoDosFiltros) =>
  chaveDaConsulta(f.codFilial, Number(f.regiao), f.fornecedor?.codFornec ?? null);

export default function SimuladorPrecoPage() {
  const [filtros, setFiltros] = useState<EstadoDosFiltros>({
    codFilial: "",
    regiao: "",
    fornecedor: null,
  });
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [quadro, setQuadro] = useState<Quadro>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  /** A consulta que ESTÁ na tela — não a dos filtros, que a pessoa pode já ter mudado. */
  const [consultaAtual, setConsultaAtual] = useState<string | null>(null);
  /** As edições da tabela ainda não salvas, por consulta (spec salvar-limpar). Somem no F5. */
  const [rascunhos, setRascunhos] = useState<AjustesPorConsulta>({});
  const [limpando, setLimpando] = useState(false);

  const { data: usuario } = useSessao();
  const filiais = useFiliais();
  const consulta = useConsultaSimulador();
  const { simulacao, alterar } = useSimulacaoGuardada(usuario?.base.id ?? null, usuario?.matricula ?? null);

  const consultar = () => {
    const filtroDaConsulta = filtros;
    consulta.mutate(
      {
        codFilial: filtroDaConsulta.codFilial,
        numRegiao: Number(filtroDaConsulta.regiao),
        codFornec: filtroDaConsulta.fornecedor?.codFornec ?? null,
      },
      {
        onSuccess: (dados) => {
          setResultado({ dados, consultadoEm: new Date().toISOString() });
          setConsultaAtual(chaveDoFiltro(filtroDaConsulta));
          setBusca("");
          setPagina(1);
        },
      },
    );
  };

  const ajustes = useMemo(
    () => ajustesNaTela(simulacao.consultas, rascunhos, consultaAtual),
    [simulacao.consultas, rascunhos, consultaAtual],
  );

  /**
   * Troca o ajuste de uma linha da consulta atual — NO RASCUNHO, na memória da aba. Só o
   * "Salvar simulação" leva ao navegador. `undefined` apaga: a linha volta ao SQL.
   */
  const ajustar = useCallback(
    (chave: string, mudar: (atual: AjusteDaLinha | undefined) => AjusteDaLinha | undefined) => {
      if (!consultaAtual) return;
      setRascunhos((r) => {
        // O rascunho nasce do que estava salvo: a primeira edição parte do que a pessoa já via.
        const daConsulta = r[consultaAtual] ?? simulacao.consultas[consultaAtual] ?? {};
        return { ...r, [consultaAtual]: trocarAjuste(daConsulta, chave, mudar(daConsulta[chave])) };
      });
    },
    [consultaAtual, simulacao.consultas],
  );

  const pendencias = useMemo(
    () => contarPendencias(simulacao.consultas, rascunhos),
    [simulacao.consultas, rascunhos],
  );

  const salvar = useCallback(() => {
    alterar((s) => ({ ...s, consultas: salvarRascunhos(s.consultas, rascunhos) }));
    setRascunhos({});
  }, [alterar, rascunhos]);

  // Com alteração não salva, recarregar ou fechar a aba pergunta antes (o texto é do navegador).
  useEffect(() => {
    if (pendencias === 0) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [pendencias]);

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
    return (resultado?.dados.produtos ?? []).map((produto) => {
      const base = chaveDaLinha(produto);
      const n = vistas.get(base) ?? 0;
      vistas.set(base, n + 1);
      return { produto, chave: n === 0 ? base : `${base}#${n}` };
    });
  }, [resultado]);

  // Busca local, sem banco: por código ou por pedaço da descrição, nos produtos TODOS.
  const visiveis = useMemo(() => {
    const termo = busca.trim().toUpperCase();
    if (termo === "") return linhas;
    return linhas.filter(
      ({ produto }) => String(produto.codProd) === termo || produto.descricao.toUpperCase().includes(termo),
    );
  }, [linhas, busca]);

  const recorte = useMemo(() => paginar(visiveis, pagina, TAMANHO_DA_PAGINA), [visiveis, pagina]);

  // Contagem sobre a consulta INTEIRA, não sobre a página.
  const simulados = useMemo(
    () => linhas.filter(({ produto, chave }) => linhaSimulada(produto, ajustes[chave])).length,
    [linhas, ajustes],
  );

  const novos = useMemo(
    () => simulacao.novos.map((n) => ({ produto: linhaDeProdutoNovo(n), chave: n.id })),
    [simulacao.novos],
  );

  const temConsulta = resultado !== null && linhas.length > 0;
  const temEdicoes = Object.keys(simulacao.consultas).length > 0 || pendencias > 0;
  const temAlgoParaLimpar = temEdicoes || simulacao.novos.length > 0;
  const repetidos = linhas.length - new Set(linhas.map((l) => l.produto.codProd)).size;
  const linhaDoQuadro = quadro?.tipo === "existente" ? linhas.find((l) => l.chave === quadro.chave) : undefined;
  const novoDoQuadro = quadro?.tipo === "novo" && quadro.id ? simulacao.novos.find((n) => n.id === quadro.id) : undefined;

  return (
    // A CASCA DO DRE (23/11/2026): mesma trilha, mesma largura máxima, mesmo cartão de filtros —
    // ver app/dre-gerencial/page.tsx. Uma tela da casa não pode parecer de outro sistema.
    <AppShell trilha={["Época Analytics", "Simulador de Preço"]}>
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[110rem] flex-col gap-3">
        <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-4 shadow-[var(--shadow-card)]">
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
          {temConsulta && (
            <>
              <span className="rounded-[var(--radius-sm)] bg-[var(--surface-3)] px-2 py-0.5 font-medium text-[var(--text-primary)]">
                {resultado.dados.base?.rotulo}
              </span>
              <span className="tabular">
                {linhas.length} produto{linhas.length === 1 ? "" : "s"}
                {simulados > 0 && (
                  <> · <b className="text-[var(--primary)]">{simulados} simulado{simulados === 1 ? "" : "s"}</b></>
                )}
              </span>
              {/* O dado envelhece: sem a hora, alguém simularia sobre o custo da manhã achando que
                  é o de agora numa tela deixada aberta por horas. */}
              <span className="flex items-center gap-2">
                <span className="tabular">{formatarMomentoDaConsulta(resultado.consultadoEm)}</span>
                <button type="button" onClick={consultar} disabled={consulta.isPending} className={BOTAO}>
                  Consultar de novo
                </button>
              </span>
              {repetidos > 0 && (
                <span className="text-[var(--warning)]" title="O mesmo NCM está em mais de uma tributação de CBS (spec §7, Q1).">
                  {repetidos} linha{repetidos === 1 ? "" : "s"} repetida{repetidos === 1 ? "" : "s"} por NCM em mais de uma tributação
                </span>
              )}
            </>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {temConsulta && (
              <>
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setPagina(1);
                  }}
                  placeholder="Buscar produto ou código"
                  aria-label="Buscar produto na tabela"
                  className="h-8 w-56 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[length:var(--fs-base)] text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none"
                />
                {simulados > 0 && (
                  <button
                    type="button"
                    onClick={() => consultaAtual && setRascunhos((r) => ({ ...r, [consultaAtual]: {} }))}
                    title="Volta todas as linhas desta consulta ao SQL (vale depois do Salvar)"
                    className={BOTAO}
                  >
                    Desfazer todas
                  </button>
                )}
              </>
            )}
            {temAlgoParaLimpar && (
              <button type="button" onClick={() => setLimpando(true)} className={BOTAO}>
                Limpar simulações
              </button>
            )}
            <button
              type="button"
              onClick={() => setQuadro({ tipo: "novo", id: null })}
              className={`h-8 rounded-[var(--radius-md)] border border-[var(--primary)] bg-[var(--primary-dim)] px-3 font-medium text-[var(--primary)] hover:bg-[var(--primary-glow)] ${FOCO}`}
            >
              + Simular novo produto
            </button>
            {/* Só as edições da tabela esperam o Salvar; os produtos novos já se guardam sozinhos. */}
            {temConsulta && (
              <span className="flex items-center gap-2">
                <span aria-live="polite" className="tabular text-[var(--warning)]">
                  {pendencias > 0 &&
                    `${pendencias} ${pendencias === 1 ? "alteração não salva" : "alterações não salvas"}`}
                </span>
                <button
                  type="button"
                  onClick={salvar}
                  disabled={pendencias === 0}
                  title={pendencias === 0 ? "Nada a salvar" : "Guarda as edições da tabela neste navegador"}
                  className={`h-8 rounded-[var(--radius-md)] border border-[var(--primary)] bg-[var(--primary)] px-3 font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${FOCO}`}
                >
                  Salvar simulação
                </button>
              </span>
            )}
          </div>
        </div>

        {temConsulta && recorte.totalPaginas > 1 && (
          <nav aria-label="Páginas da tabela" className="flex items-center justify-end gap-2 text-[length:var(--fs-apoio)] text-[var(--text-secondary)]">
            <button type="button" onClick={() => setPagina(recorte.pagina - 1)} disabled={recorte.pagina <= 1} className={BOTAO}>
              ‹ Anterior
            </button>
            <span className="tabular" aria-live="polite">
              Página {recorte.pagina} de {recorte.totalPaginas}
            </span>
            <button
              type="button"
              onClick={() => setPagina(recorte.pagina + 1)}
              disabled={recorte.pagina >= recorte.totalPaginas}
              className={BOTAO}
            >
              Próxima ›
            </button>
          </nav>
        )}

        {resultado === null && !consulta.isPending && !consulta.isError && (
          <Aviso>
            Escolha a filial e a região e clique em <b>Consultar</b>. Depois, digite o preço de compra
            de qualquer produto, ou clique nele para ajustar também os impostos: custo e preço futuro
            mudam na hora, sem consultar de novo. Clique em <b>Salvar simulação</b> para guardá-la
            neste navegador.
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

        {resultado !== null && linhas.length === 0 && (
          <Aviso>Nenhum produto para esta filial e região{filtros.fornecedor ? " com este fornecedor" : ""}.</Aviso>
        )}

        {temConsulta && visiveis.length === 0 && (
          <Aviso>Nenhum produto encontrado para “{busca.trim()}”.</Aviso>
        )}

        {/* Os produtos novos vivem DENTRO da tabela, no topo (D26 revista em 23/11/2026): as colunas
            batem por construção. Sem consulta, a tabela aparece só com eles. */}
        {(temConsulta || novos.length > 0) && (
          <TabelaSimulador
            // A `key` muda com a página e a busca: o contêiner nasce de novo, e a rolagem volta ao
            // topo (revisão final, 23/11/2026). Sem isto, quem rolava até o fim da página 1 e ia
            // à próxima via a página 2 já rolada para o fim. São no máximo 100 linhas por vez.
            key={`${recorte.pagina}|${busca}`}
            linhas={temConsulta ? recorte.itens : []}
            ajustes={ajustes}
            onPreco={mudarPreco}
            onRedefinir={redefinir}
            onAbrir={abrir}
            novos={novos}
            onAbrirNovo={abrirNovo}
            onRemoverNovo={removerNovo}
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
      {limpando && (
        <QuadroLimpar
          temEdicoes={temEdicoes}
          temNovos={simulacao.novos.length > 0}
          onLimpar={(o) => {
            alterar((s) => limparSimulacao(s, o));
            if (o.edicoes) setRascunhos({});
            setQuadro(null);
            setLimpando(false);
          }}
          onFechar={() => setLimpando(false)}
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

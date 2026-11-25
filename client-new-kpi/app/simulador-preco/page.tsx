"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  FiltrosSimulador,
  type EstadoDosFiltros,
} from "@/components/simulador-preco/FiltrosSimulador";
import { QuadroSimulacao } from "@/components/simulador-preco/QuadroSimulacao";
import { FiltroDeClasses } from "@/components/simulador-preco/FiltroDeClasses";
import { TabelaSimulador } from "@/components/simulador-preco/TabelaSimulador";
import { useSessao } from "@/hooks/useSessao";
import { chaveDaConsulta, useSimulacaoGuardada } from "@/hooks/useSimulacaoGuardada";
import { useFiliaisDoSimulador, usePaginaSimulador } from "@/hooks/useSimuladorPreco";
import { useValorComAtraso } from "@/hooks/useValorComAtraso";
import { formatarMomentoDaConsulta } from "@/lib/formato";
import {
  ATRASO_DA_BUSCA_MS,
  CLASSES,
  LIMITE_DE_CODIGOS,
  TAMANHO_MAXIMO_DA_BUSCA,
  chaveDaLinha,
  classesParaApi,
  codigosNaoEncontrados,
  codigosSimulados,
  lerListaDeCodigos,
  paginaAoEsvaziar,
} from "@/lib/filtroSimulador";
import {
  type AjustesPorConsulta,
  ajustesNaTela,
  contarPendencias,
  contarPendenciasDeNovos,
  limparSimulacao,
  salvarRascunhos,
  trocarAjuste,
} from "@/lib/rascunhoSimulacao";
import { linhaDeProdutoNovo } from "@/lib/simuladorPreco";
import { QuadroLimpar } from "@/components/simulador-preco/QuadroLimpar";
import { ConsultandoProdutos } from "@/components/simulador-preco/ConsultandoProdutos";
import type {
  AjusteDaLinha,
  Classe,
  FiltroSimulador,
  PedidoDePagina,
  ProdutoNovo,
} from "@/types/simulador-preco";

/**
 * Simulador de preço. Specs: docs/superpowers/specs/2026-11-18-simulador-de-preco-design.md e
 * 2026-11-24-simulador-paginacao-no-backend-design.md.
 *
 * O fluxo: a pessoa escolhe a filial e (se quiser) fornecedores, consulta uma vez, e a
 * partir daí só digita — na célula de preço ou no quadro do produto. Nenhuma tecla volta ao banco
 * (D1). A simulação (só os ajustes) vai ao localStorage (D22, revista em 23/11/2026 — spec
 * 2026-11-23-simulador-salvar-limpar): as edições dos produtos da consulta ficam num rascunho
 * na memória da aba e só são guardadas no "Salvar simulação" — e, desde 24/11/2026, os
 * produtos novos também. "Limpar simulações" apaga, com confirmação, o que a pessoa marcar.
 *
 * <b>O dado fica no back-end</b> (orientação do Dev, spec de 24/11/2026): cada página é uma
 * consulta ao Oracle que traz só as suas 100 linhas, já filtradas (busca, classes, "só
 * simulados") e ordenadas (classe A → B → C). O navegador guarda só a página, no cache do React
 * Query, por 60 s. A busca espera a pessoa parar de digitar (`useValorComAtraso`), e uma busca
 * nova cancela a anterior até o Oracle.
 *
 * O recálculo com o preço digitado continua na tela (D1): mudar um preço não volta ao banco.
 */

/** Foco de teclado visível nos botões da página — o mesmo anel da tabela e do quadro. */
const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring)]";

const BOTAO =
  "h-8 rounded-[var(--radius-md)] border border-[var(--border-strong)] px-3 text-[var(--text-secondary)] " +
  "hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40 " +
  FOCO;

/** O que está aberto no quadro: um produto da consulta, um produto novo, ou nada. */
type Quadro = { tipo: "existente"; chave: string } | { tipo: "novo"; id: string | null } | null;

const paraFiltro = (f: EstadoDosFiltros): FiltroSimulador => ({
  codFilial: f.codFilial,
  // Sem região: a API a tira do vínculo do comprador com a filial (25/11/2026).
  // Ordenados e sem repetição: a mesma lista em outra ordem é a mesma consulta.
  fornecedores: [...new Set(f.fornecedores.map((x) => x.codFornec))].sort((a, b) => a - b),
});

const mesmoFiltro = (a: FiltroSimulador, b: FiltroSimulador) =>
  a.codFilial === b.codFilial && a.fornecedores.join(",") === b.fornecedores.join(",");

export default function SimuladorPrecoPage() {
  const [filtros, setFiltros] = useState<EstadoDosFiltros>({
    codFilial: "",
    fornecedores: [],
  });
  /** O filtro do último Consultar — não o dos campos, que a pessoa pode já ter mudado. */
  const [aplicado, setAplicado] = useState<FiltroSimulador | null>(null);
  const [busca, setBusca] = useState("");
  const [classes, setClasses] = useState<readonly Classe[]>(CLASSES);
  /**
   * "Ver só os simulados": os códigos FIXADOS no clique, e não a lista viva. Com a lista viva,
   * cada produto novo simulado com a opção ligada mudaria o pedido e refaria a consulta (~3 s)
   * no meio da digitação. Nulo = desligado.
   */
  const [soSimulados, setSoSimulados] = useState<string[] | null>(null);
  const [pagina, setPagina] = useState(1);
  const [quadro, setQuadro] = useState<Quadro>(null);
  /** As edições da tabela ainda não salvas, por consulta (spec salvar-limpar). Somem no F5. */
  const [rascunhos, setRascunhos] = useState<AjustesPorConsulta>({});
  const [limpando, setLimpando] = useState(false);

  const { data: usuario } = useSessao();
  // Só as filiais em que o comprador tem região vinculada, cada uma com a sua (25/11/2026).
  const filiais = useFiliaisDoSimulador();
  const { simulacao, alterar } = useSimulacaoGuardada(usuario?.base.id ?? null, usuario?.matricula ?? null);

  /** A busca que vai ao Oracle: a digitada, só depois de uma pausa. */
  const buscaAtrasada = useValorComAtraso(busca.trim(), ATRASO_DA_BUSCA_MS);

  // A busca nova volta à página 1. Ajuste DURANTE o render (o padrão do React para "derivar de
  // uma mudança"), e não num efeito: num efeito, a página 7 da busca nova chegaria a ser pedida.
  const [buscaDaPagina, setBuscaDaPagina] = useState(buscaAtrasada);
  if (buscaDaPagina !== buscaAtrasada) {
    setBuscaDaPagina(buscaAtrasada);
    setPagina(1);
  }

  const pedido = useMemo<PedidoDePagina | null>(
    () =>
      aplicado && {
        ...aplicado,
        pagina,
        busca: buscaAtrasada === "" ? null : buscaAtrasada,
        classes: classesParaApi(classes),
        codigos: soSimulados,
      },
    [aplicado, pagina, buscaAtrasada, classes, soSimulados],
  );
  const consulta = usePaginaSimulador(pedido);
  const dados = consulta.data?.pagina;
  /** A região do vínculo que a API usou (25/11/2026). Só existe com a resposta na mão. */
  const regiaoUsada = consulta.data?.numRegiao ?? null;

  /**
   * A consulta que ESTÁ na tela, como chave da simulação guardada: filial + região. O fornecedor
   * saiu da chave em 24/11/2026, e a edição acompanha o produto em qualquer combinação.
   *
   * Desde 25/11/2026 a região é a que VEIO NA RESPOSTA (o vínculo do comprador), não uma
   * digitada. Sem resposta não há tabela, e portanto nada a editar: a chave nula não perde nada.
   * As simulações salvas antes (ex.: `12|1`) continuam valendo, porque o formato é o mesmo.
   */
  const consultaAtual = aplicado && regiaoUsada !== null ? chaveDaConsulta(aplicado.codFilial, regiaoUsada) : null;

  const consultar = () => {
    const filtro = paraFiltro(filtros);
    // O mesmo filtro de antes: a chave do React Query não muda, então pede de novo à mão.
    if (aplicado && mesmoFiltro(aplicado, filtro)) {
      void consulta.refetch();
      return;
    }
    setAplicado(filtro);
    setBusca("");
    setSoSimulados(null);
    setPagina(1);
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

  /**
   * Os produtos novos em rascunho (Gabriel, 24/11/2026): como as edições da tabela, só vão ao
   * navegador no "Salvar simulação". `null` = sem rascunho, valem os salvos.
   */
  const [novosRascunho, setNovosRascunho] = useState<ProdutoNovo[] | null>(null);
  const novosNaTela = novosRascunho ?? simulacao.novos;

  const pendencias = useMemo(
    () => contarPendencias(simulacao.consultas, rascunhos) + contarPendenciasDeNovos(simulacao.novos, novosRascunho),
    [simulacao.consultas, simulacao.novos, rascunhos, novosRascunho],
  );

  const salvar = useCallback(() => {
    alterar((s) => ({
      consultas: salvarRascunhos(s.consultas, rascunhos),
      novos: novosRascunho ?? s.novos,
    }));
    setRascunhos({});
    setNovosRascunho(null);
  }, [alterar, rascunhos, novosRascunho]);

  /** Troca a lista de produtos novos — no rascunho, partindo do salvo na primeira mudança. */
  const mudarNovos = useCallback(
    (mudar: (atual: ProdutoNovo[]) => ProdutoNovo[]) =>
      setNovosRascunho((r) => mudar(r ?? simulacao.novos)),
    [simulacao.novos],
  );

  // Com alteração não salva, recarregar ou fechar a aba pergunta antes (o texto é do navegador).
  useEffect(() => {
    if (pendencias === 0) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    // Ir a outra tela pela barra lateral não recarrega a página (é um `next/link`): o
    // `beforeunload` não dispara, e o rascunho sumiria calado (revisão de 24/11/2026). Na fase de
    // CAPTURA do documento, o clique é visto antes de o React o entregar ao link.
    const conferirLink = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank") return;
      const destino = new URL(link.href, window.location.href);
      if (destino.origin !== window.location.origin || destino.pathname === window.location.pathname) return;
      const texto = `${pendencias} ${pendencias === 1 ? "alteração não salva" : "alterações não salvas"}`;
      if (!window.confirm(`Há ${texto} na simulação. Sair sem salvar?`)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", avisar);
    document.addEventListener("click", conferirLink, true);
    return () => {
      window.removeEventListener("beforeunload", avisar);
      document.removeEventListener("click", conferirLink, true);
    };
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
    (id: string) => mudarNovos((lista) => lista.filter((n) => n.id !== id)),
    [mudarNovos],
  );
  const abrirNovo = useCallback((id: string) => setQuadro({ tipo: "novo", id }), []);

  // As linhas DA PÁGINA. A chave numera a repetição pela `ocorrencia` que o Oracle manda: uma
  // repetição pode estar noutra página, e a chave não pode depender de onde a linha caiu.
  const linhas = useMemo(
    () => (dados?.itens ?? []).map((produto) => ({ produto, chave: chaveDaLinha(produto) })),
    [dados],
  );

  // A página ficou além do fim (um "Consultar" com o mesmo filtro trouxe menos linhas): volta à 1, em vez
  // de mostrar "nenhum produto" sem barra de páginas. Ajuste durante o render, como o da busca;
  // `isPlaceholderData` de fora, para não reagir à página anterior ainda na tela.
  const paginaCorrigida = dados && !consulta.isPlaceholderData ? paginaAoEsvaziar(pagina, dados.itens.length) : null;
  if (paginaCorrigida !== null) {
    setPagina(paginaCorrigida);
  }

  // "N simulados" e os códigos saem das alterações (rascunho ou salvo), não dos produtos: a lista
  // inteira não vem mais ao navegador.
  const simulados = Object.keys(ajustes).length;
  const codigos = useMemo(() => codigosSimulados(ajustes), [ajustes]);

  // Os produtos novos são do navegador: a busca os filtra aqui, pela descrição.
  const novos = useMemo(() => {
    const termo = buscaAtrasada.toUpperCase();
    return novosNaTela
      .filter((n) => termo === "" || n.descricao.toUpperCase().includes(termo))
      .map((n) => ({ produto: linhaDeProdutoNovo(n), chave: n.id }));
  }, [novosNaTela, buscaAtrasada]);

  // A busca por lista de códigos (Gabriel, 25/11/2026): quais da lista NÃO vieram. Só com todas
  // as linhas na mão (página 1, total cabendo nela) e com a resposta desta busca, não a anterior.
  const listaDaBusca = useMemo(() => lerListaDeCodigos(buscaAtrasada), [buscaAtrasada]);
  const faltandoDaLista =
    listaDaBusca && dados && !consulta.isPlaceholderData
      ? codigosNaoEncontrados(listaDaBusca, dados.itens.map((p) => p.codProd), pagina, dados.totalItens)
      : null;

  const temConsulta = aplicado !== null && dados !== undefined;
  const totalItens = dados?.totalItens ?? 0;
  const totalPaginas = dados?.totalPaginas ?? 0;
  const temEdicoes = Object.keys(simulacao.consultas).length > 0 || pendencias > 0;
  const temNovos = simulacao.novos.length > 0 || novosNaTela.length > 0;
  const temAlgoParaLimpar = temEdicoes || temNovos;
  const filtrando = buscaAtrasada !== "" || classesParaApi(classes) !== null || soSimulados !== null;
  const linhaDoQuadro = quadro?.tipo === "existente" ? linhas.find((l) => l.chave === quadro.chave) : undefined;
  const novoDoQuadro = quadro?.tipo === "novo" && quadro.id ? novosNaTela.find((n) => n.id === quadro.id) : undefined;

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
            consultando={consulta.isFetching}
            onConsultar={consultar}
          />
        </section>

        {/* A barra de ações: o produto novo não depende de consulta (D23), então ela existe sempre. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[length:var(--fs-apoio)] text-[var(--text-secondary)]">
          {temConsulta && (
            <>
              <span className="rounded-[var(--radius-sm)] bg-[var(--surface-3)] px-2 py-0.5 font-medium text-[var(--text-primary)]">
                {consulta.data?.base?.rotulo}
              </span>
              <span className="tabular">
                {totalItens.toLocaleString("pt-BR")} produto{totalItens === 1 ? "" : "s"}
                {filtrando && " no filtro"}
                {simulados > 0 && (
                  <>
                    {" · "}
                    <b className="text-[var(--primary)]" title={`Códigos: ${codigos.join(", ")}`}>
                      {/* "nesta filial e região" (Gabriel, 24/11/2026): a simulação acompanha o
                          produto, então conta as edições de TODOS os fornecedores, e não só os
                          do filtro. */}
                      {simulados} simulado{simulados === 1 ? "" : "s"} nesta filial e região
                    </b>
                  </>
                )}
              </span>
              {/* O dado envelhece: sem a hora, alguém simularia sobre o custo da manhã achando que
                  é o de agora numa tela deixada aberta por horas. Para atualizar, o "Consultar" com o
                  mesmo filtro busca de novo (o botão "Consultar de novo" saiu em 24/11/2026, redundante). */}
              <span className="tabular">
                {consulta.dataUpdatedAt > 0 && formatarMomentoDaConsulta(new Date(consulta.dataUpdatedAt).toISOString())}
              </span>
              {/* A região não é escolhida: vem do vínculo do comprador com a filial, na
                  TAB_REG_PR_FILIAL (Gabriel, 25/11/2026). Mostrada para ninguém ter de adivinhar. */}
              {regiaoUsada !== null && (
                <span title="A região vem do vínculo do comprador com a filial (TAB_REG_PR_FILIAL), como na rotina em operação.">
                  Região {regiaoUsada} (vínculo do comprador)
                </span>
              )}
            </>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {temConsulta && (
              <>
                <FiltroDeClasses
                  marcadas={classes}
                  onMudar={(novas) => {
                    setClasses(novas);
                    setPagina(1);
                  }}
                />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  maxLength={TAMANHO_MAXIMO_DA_BUSCA}
                  placeholder="Produto, código ou códigos com vírgula"
                  title="Um produto pelo nome ou código, ou vários códigos separados por vírgula: 49555,49556,66635"
                  aria-label="Buscar produto, código ou vários códigos separados por vírgula (consulta ao parar de digitar)"
                  className="h-8 w-56 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 text-[length:var(--fs-base)] text-[var(--text-primary)] focus:border-[var(--primary)] focus:outline-none"
                />
                {simulados > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      // Vale para a filial e a região inteiras, de todos os fornecedores, inclusive
                      // edições que não estão na tela (Gabriel, 24/11/2026): por isso pergunta antes.
                      if (!consultaAtual) return;
                      const quantos = simulados === 1 ? "o produto simulado" : `os ${simulados} produtos simulados`;
                      if (
                        !window.confirm(
                          `Voltar ao SQL ${quantos} nesta filial e região, de todos os fornecedores? Só fica gravado no Salvar.`,
                        )
                      ) {
                        return;
                      }
                      setRascunhos((r) => ({ ...r, [consultaAtual]: {} }));
                    }}
                    title="Volta ao SQL todas as edições desta filial e região, de todos os fornecedores (vale depois do Salvar)"
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
            {/* Edições da tabela E produtos novos esperam o Salvar (24/11/2026). O botão existe
                também sem consulta, porque o produto novo não depende dela (D23). */}
            {(temConsulta || temNovos || pendencias > 0) && (
              <span className="flex items-center gap-2">
                <span aria-live="polite" className="tabular text-[var(--warning)]">
                  {pendencias > 0 &&
                    `${pendencias} ${pendencias === 1 ? "alteração não salva" : "alterações não salvas"}`}
                </span>
                {/* À esquerda do Salvar (Gabriel, 24/11/2026): os dois tratam do que foi simulado. */}
                {temConsulta && (
                  <button
                    type="button"
                    aria-pressed={soSimulados !== null}
                    disabled={soSimulados === null && (codigos.length === 0 || codigos.length > LIMITE_DE_CODIGOS)}
                    title={
                      codigos.length > LIMITE_DE_CODIGOS
                        ? `Mais de ${LIMITE_DE_CODIGOS} produtos simulados: use a busca`
                        : codigos.length === 0 && soSimulados === null
                          ? "Nenhum produto simulado nesta consulta"
                          : "Mostra só os produtos que você alterou"
                    }
                    onClick={() => {
                      setSoSimulados(soSimulados === null ? codigos : null);
                      setPagina(1);
                    }}
                    className={
                      soSimulados !== null
                        ? `h-8 rounded-[var(--radius-md)] border border-[var(--primary)] bg-[var(--primary-dim)] px-3 font-medium text-[var(--primary)] ${FOCO}`
                        : BOTAO
                    }
                  >
                    Ver só os simulados
                  </button>
                )}
                <button
                  type="button"
                  onClick={salvar}
                  disabled={pendencias === 0}
                  title={pendencias === 0 ? "Nada a salvar" : "Guarda as edições e os produtos novos neste navegador"}
                  className={`h-8 rounded-[var(--radius-md)] border border-[var(--primary)] bg-[var(--primary)] px-3 font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${FOCO}`}
                >
                  Salvar simulação
                </button>
              </span>
            )}
          </div>
        </div>

        {temConsulta && totalPaginas > 1 && (
          <nav aria-label="Páginas da tabela" className="flex items-center justify-end gap-2 text-[length:var(--fs-apoio)] text-[var(--text-secondary)]">
            <button
              type="button"
              onClick={() => setPagina(pagina - 1)}
              disabled={pagina <= 1 || consulta.isPlaceholderData}
              className={BOTAO}
            >
              ‹ Anterior
            </button>
            <span className="tabular" aria-live="polite">
              Página {pagina} de {totalPaginas}
              {consulta.isPlaceholderData && " — carregando…"}
            </span>
            <button
              type="button"
              onClick={() => setPagina(pagina + 1)}
              disabled={pagina >= totalPaginas || consulta.isPlaceholderData}
              className={BOTAO}
            >
              Próxima ›
            </button>
          </nav>
        )}

        {aplicado === null && (
          <Aviso>
            Escolha a filial e clique em <b>Consultar</b>. A região é a do seu vínculo com a filial,
            como na rotina em operação. Depois, digite o preço de compra
            de qualquer produto, ou clique nele para ajustar também os impostos: custo e preço futuro
            mudam na hora, sem consultar de novo. Clique em <b>Salvar simulação</b> para guardá-la
            neste navegador.
          </Aviso>
        )}

        {/* A tela de espera do DRE (cópia), só nas consultas demoradas: a primeira e a troca de
            filial ou de fornecedores. `isPending` = ainda não há página nenhuma desta
            consulta; ir para outra página, buscar ou trocar a classe usa a página anterior como
            `placeholderData` e não cai aqui (Gabriel, 24/11/2026). */}
        {aplicado !== null && consulta.isPending && <ConsultandoProdutos />}

        {consulta.isError && (
          <Aviso tom="erro">
            {consulta.error instanceof Error ? consulta.error.message : "Falha ao consultar a API."}
          </Aviso>
        )}

        {temConsulta && totalItens === 0 && !filtrando && (
          <Aviso>Nenhum produto para esta filial e região{aplicado.fornecedores.length === 1
            ? " com este fornecedor"
            : aplicado.fornecedores.length > 1
              ? " com estes fornecedores"
              : ""}.</Aviso>
        )}

        {/* Os códigos da lista que não vieram (Gabriel, 25/11/2026): quem cola 20 códigos sabe na
            hora quais faltam. Com resultado nenhum, o aviso de baixo já diz; este fica para o
            caso de PARTE da lista não vir. */}
        {temConsulta && totalItens > 0 && faltandoDaLista !== null && faltandoDaLista.length > 0 && (
          <Aviso>
            Sem resultado para {faltandoDaLista.length === 1 ? "o código" : "os códigos"}{" "}
            <b className="tabular">{faltandoDaLista.join(", ")}</b> nesta filial e região
            {soSimulados !== null ? " entre os simulados" : ""}.
          </Aviso>
        )}

        {temConsulta && totalItens === 0 && filtrando && (
          <Aviso>
            Nenhum produto encontrado{buscaAtrasada !== "" ? <> para “{buscaAtrasada}”</> : null}
            {classesParaApi(classes) !== null ? ` nas classes ${classes.join(", ")}` : ""}
            {soSimulados !== null ? " entre os simulados" : ""}.
          </Aviso>
        )}

        {/* Os produtos novos vivem DENTRO da tabela, no topo (D26 revista em 23/11/2026): as colunas
            batem por construção. Sem consulta, a tabela aparece só com eles. */}
        {(temConsulta || novos.length > 0) && (
          <TabelaSimulador
            // A `key` muda com a página e a busca: o contêiner nasce de novo, e a rolagem volta ao
            // topo (revisão final, 23/11/2026). Sem isto, quem rolava até o fim da página 1 e ia
            // à próxima via a página 2 já rolada para o fim. São no máximo 100 linhas por vez.
            key={JSON.stringify(pedido)}
            linhas={temConsulta ? linhas : []}
            carregando={consulta.isPlaceholderData}
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
            // No rascunho: só o "Salvar simulação" leva ao navegador (24/11/2026).
            mudarNovos((lista) =>
              lista.some((n) => n.id === produto.id)
                ? lista.map((n) => (n.id === produto.id ? produto : n))
                : [...lista, produto],
            );
            setQuadro(null);
          }}
          onFechar={() => setQuadro(null)}
        />
      )}
      {limpando && (
        <QuadroLimpar
          temEdicoes={temEdicoes}
          temNovos={temNovos}
          onLimpar={(o) => {
            alterar((s) => limparSimulacao(s, o));
            if (o.edicoes) setRascunhos({});
            if (o.novos) setNovosRascunho(null);
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

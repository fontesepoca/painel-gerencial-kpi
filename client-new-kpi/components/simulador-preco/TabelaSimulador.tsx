"use client";

import { memo, useMemo } from "react";
import { cn } from "@/lib/cn";
import { ConsultandoProdutos } from "@/components/simulador-preco/ConsultandoProdutos";
import { formatarPercentualLivre, formatarValor3 } from "@/lib/formato";
import {
  calcular,
  lerPreco,
  linhaSimulada,
  percentuaisDe,
  percentuaisEfetivos,
  precoEfetivo,
  stEfetivo,
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
 * A identidade de uma linha mora em `lib/filtroSimulador.ts` (`chaveDaLinha`, conferida pela sp17):
 * código + tributação e, na repetição, `#n` numerado pelo Oracle (`ocorrencia`). Reexportada
 * aqui para quem já a importava desta tabela.
 */
export { chaveDaLinha } from "@/lib/filtroSimulador";

/*
 * AS CLASSES DA TABELA SÃO AS DO DRE (23/11/2026, docs/superpowers/specs/
 * 2026-11-23-simulador-alinhamento-visual-design.md): `.tabela-rolagem`, `.celula-descricao`,
 * `.largura-da-descricao`, `.col-bloco` e `.col-interna`, todas em `app/globals.css`. Com elas
 * vêm de graça o teto de 50vw da coluna fixa no celular, a costura do cabeçalho fixo (o texto do
 * corpo não vaza sob ele) e os divisores desenhados por dentro da célula.
 *
 * FUNDO POR `style`, E NÃO POR CLASSE, ONDE O `globals.css` JÁ PINTA. As regras de lá não estão
 * em `@layer`, e por isso vencem as utilitárias do Tailwind: `.tabela-rolagem thead th` e
 * `.celula-descricao` fixam o fundo, e um `bg-…` nessas células é ignorado sem erro nenhum.
 */
const TH =
  "px-[var(--celula-x)] py-1.5 text-left text-[length:var(--fs-rotulo)] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)] whitespace-nowrap";
const TH_NUM = cn(TH, "text-right");
/** A faixa de cima do cabeçalho — os GRUPOS —, no desenho da faixa dos meses do DRE. */
const TH_GRUPO =
  "px-[var(--celula-x)] pt-3 pb-1 text-center text-[length:var(--fs-rotulo)] font-semibold uppercase tracking-[0.14em] text-[var(--text-primary)] whitespace-nowrap";
/**
 * As colunas depois da do Produto: Classe (1, 24/11/2026), Classe de tributação e CST (2,
 * 25/11/2026), Compra (1), Entrada (5), Custo (3), Saída (5) e Preço (3) — SQL v2:
 * o ST saiu da Entrada e o grupo Preço tem Preço futuro, ST e Preço final.
 * É o `colSpan` da linha de título dos grupos — com 17 ele criava uma coluna fantasma (revisão
 * final, 23/11/2026). Coluna nova no cabeçalho muda este número junto.
 */
const COLUNAS_DEPOIS_DO_PRODUTO = 1 + 2 + 1 + 5 + 3 + 5 + 3;
/** A tabela inteira: a coluna do Produto e as de depois. */
const TOTAL_DE_COLUNAS = 1 + COLUNAS_DEPOIS_DO_PRODUTO;
const TD = "px-[var(--celula-x)] py-[var(--celula-y)] align-top";
const TD_NUM = cn(TD, "tabular text-right whitespace-nowrap");
/** Foco de teclado visível em todo botão da tabela (o piso de acessibilidade da spec). */
const FOCO =
  "rounded-[var(--radius-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-ring)]";
/*
 * DOIS JEITOS DE PINTAR, CONFORME A CÉLULA (revisão final de 23/11/2026):
 *
 * - CABEÇALHO: `backgroundImage`, nunca `background`. `--primary-dim` e `--positive-glow` são
 *   TRANSLÚCIDOS (8% e 12%). Trocar o fundo do `th` por eles apagaria o `--surface-1` opaco que
 *   `.tabela-rolagem thead th` dá, e os números do corpo apareceriam através do cabeçalho fixo
 *   ao rolar. Como camada de imagem, a cor compõe POR CIMA do fundo opaco, que fica.
 * - CORPO: `backgroundColor`, nunca o atalho `background`. O realce sob o ponteiro e a zebra são
 *   `background-image` pintados pelo `globals.css`, e o atalho os zeraria só nessas células.
 */
const camada = (cor: string) => ({ backgroundImage: `linear-gradient(${cor}, ${cor})` });
const TH_FUNDO_GRUPO = camada("var(--surface-2)");
const TH_FUNDO_COMPRA = camada("var(--primary-dim)");
const TH_FUNDO_PRECO = camada("var(--positive-glow)");
const TD_FUNDO_SIMULADA = { backgroundColor: "var(--surface-2)" };
/**
 * A linha EDITADA na grid (Gabriel, 24/11/2026; azul desde 25/11, porque aqui o âmbar é cor de
 * alerta e o azul já marca o que foi trocado ou simulado). O token é OPACO (`color-mix`
 * no globals.css): a célula fixa precisa de fundo opaco, senão os números que rolam por baixo
 * apareceriam através dela.
 */
const TD_FUNDO_EDITADA = { backgroundColor: "var(--linha-editada)" };
const TD_FUNDO_COMPRA = { backgroundColor: "var(--primary-dim)" };
const TD_FUNDO_PRECO = { backgroundColor: "var(--positive-glow)" };

export function TabelaSimulador({
  linhas,
  ajustes,
  onPreco,
  onRedefinir,
  onAbrir,
  novos,
  onAbrirNovo,
  onRemoverNovo,
  carregando = false,
  className,
}: {
  /** Os produtos da consulta — só os da página atual (a página pagina; spec de 23/11/2026). */
  linhas: { produto: ProdutoSimulado; chave: string }[];
  /** O que foi alterado, por chave de linha. Ausente = a linha do SQL. */
  ajustes: Readonly<Record<string, AjusteDaLinha>>;
  onPreco: (chave: string, texto: string) => void;
  /** Volta a linha inteira ao SQL. */
  onRedefinir: (chave: string) => void;
  onAbrir: (chave: string) => void;
  /**
   * Os produtos novos simulados, num grupo NO TOPO desta mesma tabela (D26, revista em
   * 23/11/2026). Eram uma segunda tabela, e cada tabela mede as colunas pelo próprio conteúdo:
   * as colunas nunca batiam. Na mesma tabela batem por construção, e aparecem em toda página.
   */
  novos: { produto: ProdutoSimulado; chave: string }[];
  onAbrirNovo: (chave: string) => void;
  onRemoverNovo: (chave: string) => void;
  /** A próxima página está a caminho e esta é a anterior, ainda na tela (React Query). */
  carregando?: boolean;
  className?: string;
}) {
  return (
    // O invólucro existe só para a TELA DE ESPERA POR CIMA (Gabriel, 24/11/2026): ela fica fora da
    // área que rola e fora do esmaecido. Ele repassa o `flex-1 min-h-0` para a `.tabela-rolagem`
    // continuar ocupando o que sobra da coluna.
    <div className={cn("relative flex min-h-0 flex-1 flex-col", className)}>
    {/* `.tabela-rolagem`: a tabela rola DENTRO do contêiner, com o cabeçalho e a coluna do produto
        grudados enquanto ela rola — as mesmas regras da tabela do DRE. */}
    <div
      aria-busy={carregando}
      className={cn(
        "tabela-rolagem rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] transition-opacity",
        carregando && "opacity-60",
      )}
    >
      <table className="w-full border-collapse text-[length:var(--fs-base)]">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="celula-descricao largura-codigo-e-produto" style={TH_FUNDO_GRUPO} />
            {/* Sobre Classe, Classe de tributação e CST: sem título de grupo. */}
            <th colSpan={3} style={TH_FUNDO_GRUPO} />
            <th className={cn(TH_GRUPO, "col-bloco text-[var(--primary)]")} style={TH_FUNDO_COMPRA}>Compra</th>
            <th colSpan={5} className={cn(TH_GRUPO, "col-bloco")} style={TH_FUNDO_GRUPO}>Entrada</th>
            <th colSpan={3} className={cn(TH_GRUPO, "col-bloco")} style={TH_FUNDO_GRUPO}>Custo</th>
            <th colSpan={5} className={cn(TH_GRUPO, "col-bloco")} style={TH_FUNDO_GRUPO}>Saída</th>
            <th colSpan={3} className={cn(TH_GRUPO, "col-bloco text-[var(--positive)]")} style={TH_FUNDO_PRECO}>Preço</th>
          </tr>
          <tr className="border-b border-[var(--border-strong)]">
            {/* Código e Produto: UMA célula fixa com duas partes (Gabriel, 24/11/2026). Sem o
                `px` do TH: cada parte tem o seu, e a divisória cai exatamente entre elas. */}
            <th className="celula-descricao largura-codigo-e-produto py-1.5 text-left text-[length:var(--fs-rotulo)] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)] whitespace-nowrap">
              <span className="codigo-e-produto">
                <span className="px-[var(--celula-x)]">Código</span>
                <span className="px-[var(--celula-x)]">Produto</span>
              </span>
            </th>
            {/* A classe de venda (A, B, C) em coluna própria (Gabriel, 24/11/2026): a lista vem
                ordenada por ela, e o filtro é por ela. */}
            <th className={cn(TH, "text-center")}>Classe</th>
            {/* Da PCTRIBUTACAO, só exibidas (spec 2026-11-25-simulador-classe-de-tributacao-e-cst). */}
            <th className={cn(TH, "col-interna text-center")} title="CCLASSTRIB da PCTRIBUTACAO, pela tributação do NCM.">
              Classe de tributação
            </th>
            <th className={cn(TH, "col-interna text-center")} title="CST da PCTRIBUTACAO. Não é o ST da coluna Preço.">
              CST
            </th>
            {/* A legenda diz de onde vem o número (Gabriel, 24/11/2026). "Preço de última compra"
                no título seria falso nas linhas editadas e nos produtos novos, onde o preço é o
                digitado: só a célula sem edição mostra a última compra (VLULTPCOMPRA). */}
            <th
              className={cn(TH, "col-bloco text-center")}
              style={TH_FUNDO_COMPRA}
              title="Sem edição, mostra o preço da última compra (VLULTPCOMPRA). Digite um valor para simular outro preço."
            >
              Preço de compra
              <span className="block font-normal normal-case tracking-normal">últ. compra ou digitado</span>
            </th>
            <th className={cn(TH_NUM, "col-bloco")}>IPI</th>
            <th className={cn(TH_NUM, "col-interna")}>ICMS</th>
            <th className={cn(TH_NUM, "col-interna")}>PIS</th>
            <th className={cn(TH_NUM, "col-interna")}>COFINS</th>
            <th className={cn(TH_NUM, "col-interna")}>Frete FOB</th>
            <th className={cn(TH_NUM, "col-bloco")}>Antes da CBS</th>
            <th className={cn(TH_NUM, "col-interna")}>CBS</th>
            <th className={cn(TH_NUM, "col-interna")}>Custo</th>
            <th className={cn(TH_NUM, "col-bloco")}>Margem</th>
            <th className={cn(TH_NUM, "col-interna")}>ICMS</th>
            <th className={cn(TH_NUM, "col-interna")}>PIS</th>
            <th className={cn(TH_NUM, "col-interna")}>COFINS</th>
            <th className={cn(TH_NUM, "col-interna")}>Índice</th>
            <th className={cn(TH_NUM, "col-bloco")} title="Sem o ST: o PR_FUTURO do SQL.">Preço futuro</th>
            <th className={cn(TH_NUM, "col-interna")} title="O VLST da tabela de preço da região, em R$. Não depende do preço de compra.">ST</th>
            <th className={cn(TH_NUM, "col-interna")} style={TH_FUNDO_PRECO}>Preço final</th>
          </tr>
        </thead>
        <tbody>
          {novos.length > 0 && (
            <>
              <TituloDoGrupo texto={`Produtos novos simulados (${novos.length})`} />
              {novos.map(({ produto, chave }) => (
                <Linha
                  key={chave}
                  produto={produto}
                  chave={chave}
                  ajuste={undefined}
                  modo="novo"
                  onPreco={onPreco}
                  onRedefinir={onRemoverNovo}
                  onAbrir={onAbrirNovo}
                />
              ))}
              {linhas.length > 0 && (
                <>
                  {/* Um respiro entre os grupos: o comprador não confunde produto novo com produto
                      da consulta (spec salvar-limpar, 23/11/2026). */}
                  <tr aria-hidden="true">
                    <td colSpan={TOTAL_DE_COLUNAS} className="h-5 border-0 p-0" style={{ backgroundColor: "var(--surface-1)" }} />
                  </tr>
                  <TituloDoGrupo texto="Produtos da consulta" />
                </>
              )}
            </>
          )}
          {linhas.map(({ produto, chave }) => (
            <Linha
              key={chave}
              produto={produto}
              chave={chave}
              ajuste={ajustes[chave]}
              modo="consulta"
              onPreco={onPreco}
              onRedefinir={onRedefinir}
              onAbrir={onAbrir}
            />
          ))}
        </tbody>
      </table>
    </div>
    {/* Página, busca ou classe que ainda não veio do banco: a tabela anterior fica esmaecida e o
        relógio aparece POR CIMA, no centro (Gabriel, 24/11/2026). Página já vista volta do cache
        sem passar por aqui. `pointer-events-none` no fundo: a tabela continua rolável. */}
    {carregando && (
      <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-4">
        <ConsultandoProdutos sobreposto />
      </div>
    )}
    </div>
  );
}

/**
 * A linha que abre um grupo dentro da tabela ("Produtos novos simulados", "Produtos da
 * consulta"). Uma célula só, da largura da tabela; o texto fica no CENTRO DA ÁREA VISÍVEL
 * (spec salvar-limpar, 23/11/2026) e acompanha a rolagem lateral: `sticky` com `left: 50%` o
 * segura no meio do que está à vista, e o `translateX(-50%)` centra o próprio texto. Por isso a
 * célula é `text-left`: com `text-center` o texto nasceria no meio da tabela inteira, fora da
 * vista numa tela estreita. Fundo por `backgroundColor` (ver o topo do arquivo).
 */
function TituloDoGrupo({ texto }: { texto: string }) {
  return (
    <tr className="border-b border-[var(--border-strong)]">
      <th scope="colgroup" colSpan={TOTAL_DE_COLUNAS} className={cn(TH_GRUPO, "text-left")} style={TD_FUNDO_SIMULADA}>
        <span className="sticky left-1/2 inline-block -translate-x-1/2">{texto}</span>
      </th>
    </tr>
  );
}

/**
 * Uma linha. `memo`: digitar num preço só redesenha a linha daquele preço.
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
    () => (simulado ? calcular(precoEfetivo(p, ajuste), percentuaisEfetivos(p, ajuste), stEfetivo(p, ajuste)) : null),
    [simulado, p, ajuste],
  );
  const pc = simulado ? percentuaisEfetivos(p, ajuste) : percentuaisDe(p);

  const vl = <K extends keyof NonNullable<typeof r> & keyof ProdutoSimulado>(k: K) =>
    (r ? r[k] : p[k]) as number | null;

  const prFuturo = vl("prFuturo");
  const prFinal = vl("prFinal");
  const indice = vl("indice");
  // D16: índice ≤ 0 (impostos + margem ≥ 100%) não tem preço que faça sentido.
  const semPreco = indice === null || indice <= 0 || prFuturo === null;
  const variacao =
    simulado && !semPreco && p.prFinal !== null && prFinal !== null ? prFinal - p.prFinal : null;

  const temAjuste = ajuste !== undefined;

  return (
    // A LINHA DO DRE (TabelaDre.tsx): o realce sob o ponteiro mora no globals.css ("A LINHA SOB O
    // PONTEIRO"), que o pinta célula a célula — um `hover:bg-…` aqui o dobraria nas células
    // comuns e não chegaria às que têm fundo próprio. A zebra é a do DRE, mas só em linha não
    // simulada: `odd:` tem especificidade maior e apagaria o fundo da simulada.
    <tr className={cn("group border-b border-[var(--border)]", simulado ? "bg-[var(--linha-editada)]" : "odd:bg-[var(--zebra)]")}>
      {/*
        UMA COLUNA FIXA SÓ, com o código dentro (spec de 23/11/2026, objetivo 2). Duas colunas
        fixas lado a lado é o defeito documentado no globals.css: o navegador não respeita a
        largura pedida, e os valores passam pela fresta entre elas. Desde 24/11/2026 a célula tem
        DUAS PARTES (`.codigo-e-produto`): o código com o fornecedor embaixo, e o produto.

        A marca da linha simulada é uma sombra por dentro à esquerda — com `border-collapse` a
        borda é da tabela, e não da célula. O fundo vai por `style` (ver o topo do arquivo).
      */}
      <td
        className={cn(
          "py-[var(--celula-y)] align-top celula-descricao largura-codigo-e-produto",
          simulado && "shadow-[inset_4px_0_0_var(--primary)]",
        )}
        style={simulado ? TD_FUNDO_EDITADA : undefined}
      >
        {/* O produto inteiro é o botão do quadro (D21): é onde a mão vai para "abrir o item". */}
        <button
          type="button"
          onClick={() => onAbrir(chave)}
          className={cn(FOCO, "codigo-e-produto w-full text-left")}
          title={novo ? "Abrir o quadro para editar" : "Abrir o quadro do produto"}
        >
          {/* A parte do código: o código do produto e, embaixo, o fornecedor (código e nome curto,
              o nome inteiro no title). No produto novo, "Simulado" (Gabriel, 24/11/2026). */}
          <span className="min-w-0 px-[var(--celula-x)]">
            {novo ? (
              <span className="rounded-[var(--radius-sm)] bg-[var(--primary-dim)] px-1.5 py-0.5 text-[length:var(--fs-apoio)] font-medium text-[var(--primary)]">
                Simulado
              </span>
            ) : (
              <>
                <span className="tabular block text-[var(--text-primary)]">{p.codProd}</span>
                <span
                  className="mt-0.5 block truncate text-[length:var(--fs-apoio)] text-[var(--text-muted)]"
                  title={p.fornecedor ? `Fornecedor ${p.codFornec} · ${p.fornecedor}` : undefined}
                >
                  <span className="tabular">{p.codFornec ?? "—"}</span>
                  {p.fornecedor && ` · ${p.fornecedor}`}
                </span>
              </>
            )}
          </span>
          <span className="min-w-0 px-[var(--celula-x)]">
            <span className="line-clamp-2 text-[var(--text-primary)] group-hover:text-[var(--primary)]">
              {p.descricao}
            </span>
            <span className="mt-0.5 block text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
              {novo ? "Produto hipotético · percentuais digitados" : <>NCM {p.ncm ?? "—"}{p.descricaoTributacao && ` · ${p.descricaoTributacao}`}</>}
            </span>
          </span>
        </button>
      </td>

      <td className={cn(TD, "text-center font-semibold text-[var(--text-secondary)]")}>{novo ? "—" : (p.classeVenda ?? "—")}</td>
      {/* Divisória fina (col-interna) entre Classe, Classe de tributação e CST (Gabriel, 25/11/2026). */}
      <td className={cn(TD, "col-interna tabular text-center whitespace-nowrap text-[var(--text-secondary)]")}>{p.cClassTrib ?? "—"}</td>
      <td className={cn(TD, "col-interna tabular text-center whitespace-nowrap text-[var(--text-secondary)]")}>{p.cst ?? "—"}</td>

      {/* ── Compra: o único campo editável da célula (D10) ── */}
      <td className={cn(TD, "col-bloco")} style={TD_FUNDO_COMPRA}>
        <div className="flex items-center justify-center gap-1">
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
                // `em`, e não `rem`: na leitura ampliada a fonte vai de 14 para 18px sem mudar a
                // raiz, e uma largura em rem cortaria `1.234,567`.
                "tabular h-8 w-[8.5em] rounded-[var(--radius-sm)] border bg-[var(--surface-1)] px-2 text-right",
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
              FOCO,
              "grid size-6 place-items-center text-[var(--text-muted)] hover:bg-[var(--surface-3)]",
              novo ? "hover:text-[var(--negative)]" : "hover:text-[var(--text-primary)]",
              !novo && !temAjuste && "invisible",
            )}
          >
            {novo ? "✕" : "↺"}
          </button>
        </div>
        {invalido && (
          <div className="mt-0.5 text-center text-[length:var(--fs-apoio)] text-[var(--negative)]">Preço inválido</div>
        )}
        {/* D13: sem última compra o SQL entra com zero, e não com o custo de reposição. */}
        {!novo && !invalido && p.vlUltPCompra === 0 && !simulado && (
          <div className="mt-0.5 text-center text-[length:var(--fs-apoio)] text-[var(--warning)]">sem última compra</div>
        )}
      </td>

      {/* ── Entrada ── */}
      <ValorEPercentual valor={vl("vlIpi")} percentual={pc.percIpi} trocado={trocado("percIpi")} original={p.percIpi} bloco />
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
      <td className={cn(TD_NUM, "col-bloco")}>{numero(vl("custoAntesCbs"))}</td>
      <ValorEPercentual
        valor={vl("vlCbs")}
        percentual={pc.percCbs}
        trocado={trocado("percCbs")}
        original={p.percCbs}
        titulo={`Base da CBS: ${numero(vl("baseCbs"))}${novo ? "" : p.codigoTributacao ? ` · tributação ${p.codigoTributacao}` : " · sem tributação para o NCM"}`}
      />
      <td className={cn(TD_NUM, "col-interna font-semibold text-[var(--text-primary)]")}>{numero(vl("custoCalc"))}</td>

      {/* ── Saída ── */}
      <Percentual valor={pc.margem} trocado={trocado("margem")} original={p.margem} bloco />
      <Percentual valor={pc.percIcmsSaid} trocado={trocado("percIcmsSaid")} original={p.percIcmsSaid} />
      <Percentual valor={pc.perPis} trocado={trocado("perPis")} original={p.perPisSaid} />
      <Percentual valor={pc.perCofins} trocado={trocado("perCofins")} original={p.perCofinsSaid} />
      <td className={cn(TD_NUM, "col-interna")}>{indice === null ? "—" : indice.toFixed(6).replace(".", ",")}</td>

      {/* ── Preço (SQL v2): futuro sem ST, o ST da tabela de preço, e o FINAL em destaque (V1) ── */}
      <td className={cn(TD_NUM, "col-bloco")}>
        {semPreco ? <span className="text-[var(--warning)]">—</span> : numero(prFuturo)}
      </td>
      <td
        className={cn(TD_NUM, "col-interna", ajuste?.st !== undefined ? "font-medium text-[var(--primary)]" : "text-[var(--text-secondary)]")}
        title={
          ajuste?.st !== undefined
            ? `Alterado no quadro · SQL: ${numero(p.vlSt)}`
            : p.percSt
              ? `% ST de entrada: ${formatarPercentualLivre(p.percSt)}% (informativo: na v2 o ST que entra é o da tabela de preço)`
              : undefined
        }
      >
        {numero(vl("vlSt"))}
      </td>
      <td className={cn(TD_NUM, "col-interna")} style={TD_FUNDO_PRECO}>
        {semPreco ? (
          <span
            className="text-[var(--warning)]"
            title={`Impostos + margem ≥ 100%: o índice é ${indice ?? "nulo"}. O resultado da conta é ${prFinal === null ? "nulo" : formatarValor3(prFinal)}.`}
          >
            — <span className="text-[length:var(--fs-apoio)]">impostos + margem ≥ 100%</span>
          </span>
        ) : (
          <>
            <div className="font-semibold text-[var(--text-primary)]">{numero(prFinal)}</div>
            {variacao !== null && variacao !== 0 && (
              // Cor neutra de propósito: preço subir não é "ruim" nem "bom" por si — é o que a
              // simulação quer mostrar. A seta diz o sentido sem julgar.
              <div
                className="text-[length:var(--fs-apoio)] text-[var(--text-secondary)]"
                title={`SQL: ${numero(p.prFinal)}`}
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
      className={cn(TD_NUM, bloco ? "col-bloco" : "col-interna", apagado && "opacity-60")}
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
        bloco ? "col-bloco" : "col-interna",
        trocado ? "font-medium text-[var(--primary)]" : "text-[var(--text-secondary)]",
      )}
      title={trocado ? `Alterado no quadro · SQL: ${percentual(original ?? null)}` : undefined}
    >
      {percentual(valor)}
    </td>
  );
}

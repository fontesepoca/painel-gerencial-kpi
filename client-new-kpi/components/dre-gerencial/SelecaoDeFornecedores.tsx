"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { codigosAoFechar, lerDigitacao } from "@/lib/codigosDigitados";
import { useBuscarFornecedores, useFornecedoresPorCodigo } from "@/hooks/useDreGerencial";
import type { Fornecedor } from "@/types/dre-gerencial";

const CAMPO =
  "h-[var(--altura-controle)] w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border-strong)] " +
  "bg-[var(--surface-2)] px-3 text-[length:var(--fs-base)] text-[var(--text-primary)] " +
  "focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-ring)]";

/**
 * O CNPJ como as pessoas leem, não como o Winthor guarda.
 *
 * Ele aparece porque é o que distingue um cadastro do outro: a P&G tem meia dúzia de
 * cadastros com nomes quase iguais — `PROCTER & GAMBLE INDUSTRIAL E COMERCIAL LTDA` aparece
 * duas vezes —, e sem o CNPJ a lista obriga a escolher no escuro.
 *
 * Devolve o que veio quando não tem 14 dígitos: cadastro antigo às vezes tem CPF, ou nada.
 */
function cnpj(valor: string | null): string | null {
  if (valor === null) return null;
  const so = valor.replace(/\D/g, "");
  if (so.length !== 14) return valor.trim() === "" ? null : valor;
  return `${so.slice(0, 2)}.${so.slice(2, 5)}.${so.slice(5, 8)}/${so.slice(8, 12)}-${so.slice(12)}`;
}

/**
 * Vale consultar? <b>Duas letras do nome, ou qualquer número.</b>
 *
 * O piso de dois caracteres é do NOME: `LIKE '%a%'` sobre treze mil cadastros devolve
 * vinte linhas quaisquer. Mas ele tornava o <b>fornecedor 1 inalcançável</b> — não há como
 * digitar um código de um dígito a mais do que ele tem.
 *
 * Com dígitos o piso não faz sentido: a consulta procura o código exato e o número INTEIRO
 * dentro do nome — `POSTO 29` entra, o `29` no meio de um CPF não. São poucas linhas, todas
 * pertinentes, mesmo com um dígito só.
 */
const buscavel = (termo: string) => {
  const t = termo.trim();
  return t.length >= 2 || /^\d+$/.test(t);
};

/**
 * Seleção de fornecedores para o filtro do DRE — busca por nome ou por código.
 *
 * <b>Busca, e não lista.</b> São mais de treze mil fornecedores no cadastro; uma lista
 * corrida como a das filiais seria inútil aqui. Quem filtra o DRE sabe de quem está falando,
 * e digita.
 *
 * <b>Por que o nome do fornecedor não basta.</b> O filtro é por CÓDIGO, e cadastros
 * diferentes da mesma empresa são recortes diferentes: pedir o 29 traz o DRE do 29, pedir o
 * 2453 traz o do 2453, e um não puxa o outro. A tela mostra código e CNPJ junto do nome
 * porque é a única forma de a pessoa saber qual dos cadastros ela está escolhendo — e avisa
 * quando o escolhido tem irmãos. Ver `docs/FILTRO_FORNECEDOR.md`.
 */
export function SelecaoDeFornecedores({
  selecionados,
  onMudar,
}: {
  selecionados: Fornecedor[];
  onMudar: (fornecedores: Fornecedor[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [termo, setTermo] = useState("");
  const [pedidos, setPedidos] = useState<number[]>([]);
  const [naoEncontrados, setNaoEncontrados] = useState<number[]>([]);
  const caixa = useRef<HTMLDivElement>(null);
  const campoBusca = useRef<HTMLInputElement>(null);

  // O que está escrito, lido como lista. Memorizado para a identidade de `confirmados` só
  // mudar quando o texto muda — é ela que dispara o efeito que põe os códigos no filtro.
  const digitacao = useMemo(() => lerDigitacao(busca), [busca]);

  /**
   * O que a tela precisa ler de FORA do ciclo de efeitos, sempre na versão mais nova.
   *
   * `onMudar` e `selecionados` vêm do pai e mudam de identidade a cada render dele; pô-los
   * nas dependências faria os efeitos reagirem a renders alheios em vez de reagirem ao que
   * aconteceu aqui. `busca` entra porque o efeito que fecha o popover é disparado por
   * `aberto`, e precisa do texto que estava escrito naquele instante.
   */
  const agora = useRef({ selecionados, onMudar, busca });
  agora.current = { selecionados, onMudar, busca };

  /**
   * Os códigos que já viraram decisão — entraram no filtro ou foram dados como inexistentes.
   *
   * Sem esta marca o efeito de resolução reagiria duas vezes à mesma resposta: ele roda a
   * cada render enquanto houver pedido resolvido, e `selecionados` só chega atualizado no
   * render seguinte ao do pai.
   */
  const tratados = useRef(new Set<number>());

  /** Põe códigos na fila de resolução, sem repetir o que já está lá. */
  const pedir = useCallback((codigos: number[]) => {
    const querer = codigos.filter(
      (c) => !agora.current.selecionados.some((s) => s.codFornec === c),
    );
    if (querer.length === 0) return;

    setPedidos((fila) => {
      const novos = querer.filter((c) => !fila.includes(c));
      if (novos.length === 0) return fila;

      // Pedir de novo é mudar de ideia: quem tirou o 29 do filtro e tornou a digitar `29,`
      // está pedindo o 29 outra vez, e a marca de "já tratado" não pode calar esse pedido.
      for (const c of novos) tratados.current.delete(c);
      return [...fila, ...novos];
    });
  }, []);

  const resolucoes = useFornecedoresPorCodigo(pedidos);

  /** As respostas que chegaram viram seleção — ou aviso de código que não existe. */
  useEffect(() => {
    const prontos = resolucoes.filter(
      (r) => r.resolvido && !tratados.current.has(r.codigo),
    );
    if (prontos.length === 0) return;

    for (const r of prontos) tratados.current.add(r.codigo);

    const { selecionados: atuais, onMudar: mudar } = agora.current;
    const achados = prontos
      .map((r) => r.fornecedor)
      .filter((f): f is Fornecedor => f !== null)
      .filter((f) => !atuais.some((s) => s.codFornec === f.codFornec));
    const faltando = prontos.filter((r) => r.fornecedor === null).map((r) => r.codigo);

    if (achados.length > 0) mudar([...atuais, ...achados]);
    if (faltando.length > 0) {
      setNaoEncontrados((n) => [...new Set([...n, ...faltando])]);
    }
    setPedidos((fila) => fila.filter((c) => !prontos.some((r) => r.codigo === c)));
  }, [resolucoes]);

  /**
   * A VÍRGULA FECHA O CÓDIGO.
   *
   * `29,` já põe o 29 no filtro, enquanto `29` sozinho ainda pode virar `290` — por isso o
   * último pedaço fica de fora até a pessoa fechar o popover. Ver `lib/codigosDigitados.ts`.
   */
  useEffect(() => {
    pedir(digitacao.confirmados);
  }, [digitacao.confirmados, pedir]);

  /**
   * O debounce.
   *
   * Sem ele, cada tecla vira uma consulta ao Oracle — e o `LIKE '%...%'` sobre treze mil
   * fornecedores não é de graça. 250 ms é o intervalo em que quem digita depressa termina a
   * palavra antes da primeira viagem.
   *
   * <b>No modo lista a busca sai de cena.</b> `29,253` não é nome nem código: mandá-lo à API
   * só gastaria viagem para mostrar "nenhum fornecedor" embaixo de uma lista que está, ela
   * sim, funcionando.
   */
  useEffect(() => {
    const t = setTimeout(() => setTermo(lerDigitacao(busca).modoLista ? "" : busca), 250);
    return () => clearTimeout(t);
  }, [busca]);

  // Mesma mecânica de fechar do seletor de filiais: clique fora e Escape.
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fechar);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fechar);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  /**
   * Abrir dá foco à busca; fechar a apaga.
   *
   * O foco ao abrir existe porque o campo é para ser digitado, e obrigar um clique a mais
   * seria pedir duas ações para uma intenção.
   *
   * <b>A limpeza ao fechar é o que faz cada abertura começar do zero.</b> Sem ela, quem
   * procurou `PROCTER`, escolheu o 29 e fechou reabre no mesmo `PROCTER` — e vê uma lista
   * que parece ser dos selecionados, mas é só a pesquisa velha parada ali.
   *
   * <b>Os dois estados, e não só o `busca`.</b> Apagar apenas o que está escrito deixaria o
   * `termo` com o valor anterior por mais 250 ms — o tempo do debounce —, e a lista antiga
   * voltaria a aparecer por um instante na abertura seguinte. O que já está SELECIONADO não
   * se perde: ele vive em `selecionados`, que é do filtro, não da busca.
   *
   * <b>Mas antes de apagar, o último código da lista é colhido.</b> Quem digitou `29,253` e
   * clicou fora terminou de digitar — exigir a vírgula do fim seria cobrar pontuação de quem
   * já disse o que queria. A colheita vem antes do `setBusca("")` justamente porque o texto
   * é a única fonte dessa informação.
   */
  useEffect(() => {
    if (aberto) {
      campoBusca.current?.focus();
      return;
    }

    pedir(codigosAoFechar(agora.current.busca));
    setBusca("");
    setTermo("");
    setNaoEncontrados([]);
  }, [aberto, pedir]);

  const { data: achados, isFetching } = useBuscarFornecedores(termo);

  const alternar = (f: Fornecedor) =>
    onMudar(
      selecionados.some((s) => s.codFornec === f.codFornec)
        ? selecionados.filter((s) => s.codFornec !== f.codFornec)
        : [...selecionados, f],
    );

  /**
   * O resumo é curto porque a coluna é estreita — 7rem, a menor da grade.
   *
   * <b>"Todos" em vez de "Todos os fornecedores"</b>: o rótulo do campo já diz Fornecedor, e
   * repetir a palavra dentro dele gastava 60px de uma coluna que não os tem. Com um
   * selecionado aparece só o CÓDIGO, que é o que identifica o recorte — o nome inteiro está
   * no cabeçalho da apuração, onde há largura para ele.
   */
  const resumo =
    selecionados.length === 0
      ? "Todos"
      : selecionados.length === 1
        ? String(selecionados[0]!.codFornec)
        : `${selecionados.length} forn.`;

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className={cn(CAMPO, "flex items-center justify-between text-left")}
      >
        <span
          className={cn("truncate", selecionados.length === 0 && "text-[var(--text-muted)]")}
        >
          {resumo}
        </span>
        <Seta className={cn("ml-2", aberto && "rotate-180")} />
      </button>

      {aberto && (
        <div className="absolute top-full left-0 z-20 mt-1 w-[min(30rem,92vw)] rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface-2)] p-2 shadow-[var(--shadow-float)]">
          <input
            ref={campoBusca}
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, código, ou vários códigos separados por vírgula"
            className={cn(CAMPO, "mb-2")}
          />

          {selecionados.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5 border-b border-[var(--border)] pb-2">
              {selecionados.map((f) => (
                <button
                  key={f.codFornec}
                  type="button"
                  onClick={() => alternar(f)}
                  title={`Tirar ${f.fornecedor} do filtro`}
                  className="flex max-w-full items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-3)] px-2 py-1 text-[length:var(--fs-apoio)] hover:border-[var(--negative)]"
                >
                  <span className="tabular text-[var(--text-muted)]">{f.codFornec}</span>
                  <span className="truncate">{f.fornecedor}</span>
                  <span aria-hidden className="text-[var(--text-muted)]">
                    ✕
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => onMudar([])}
                className="rounded-[var(--radius-sm)] px-2 py-1 text-[length:var(--fs-apoio)] text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
              >
                limpar
              </button>
            </div>
          )}

          {naoEncontrados.length > 0 && (
            <p className="mb-2 px-2 text-[length:var(--fs-apoio)] leading-relaxed text-[var(--warning)]">
              Sem cadastro para{" "}
              <span className="tabular font-semibold">{naoEncontrados.join(", ")}</span> — o
              código não entrou no filtro.
            </p>
          )}

          <div className="max-h-72 overflow-y-auto">
            {/* MODO LISTA: a busca sai de cena e quem manda é o texto. Os escolhidos já
                aparecem como fichas logo acima, então aqui basta dizer a regra — e dizê-la
                enquanto ela está valendo é o que torna o atalho descobrível para quem o
                acionou sem querer, digitando uma vírgula. */}
            {digitacao.modoLista ? (
              <p className="px-2 py-3 text-[length:var(--fs-apoio)] leading-relaxed text-[var(--text-muted)]">
                Lista de códigos: cada <strong>vírgula</strong> fecha um código e o põe no
                filtro.
                <br />O último só entra ao fechar esta caixa — até lá ele ainda pode crescer.
                {pedidos.length > 0 && (
                  <>
                    <br />
                    Procurando{" "}
                    <span className="tabular">{pedidos.join(", ")}</span>…
                  </>
                )}
              </p>
            ) : !buscavel(termo) ? (
              <p className="px-2 py-3 text-[length:var(--fs-apoio)] leading-relaxed text-[var(--text-muted)]">
                Digite o código do fornecedor, ou ao menos duas letras do nome.
                <br />
                Vários de uma vez, separados por vírgula: <span className="tabular">
                  29,253
                </span>
                .
                <br />
                Sem nenhum selecionado, o DRE sai com todos — como sempre foi.
              </p>
            ) : isFetching && achados === undefined ? (
              <p className="px-2 py-3 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
                Procurando…
              </p>
            ) : (achados?.length ?? 0) === 0 ? (
              <p className="px-2 py-3 text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
                {/* A frase acompanha o que a consulta realmente fez: com dígitos ela procura
                    o código e o número inteiro no nome — e dizer só "no nome" mandaria
                    procurar onde ninguém procurou. */}
                {/^\d+$/.test(termo.trim()) ? (
                  <>
                    Nenhum fornecedor com o código <strong>{termo.trim()}</strong>, nem com{" "}
                    <strong>{termo.trim()}</strong> no nome.
                  </>
                ) : (
                  <>
                    Nenhum fornecedor com <strong>{termo}</strong> no nome.
                  </>
                )}
              </p>
            ) : (
              achados!.map((f) => {
                const marcado = selecionados.some((s) => s.codFornec === f.codFornec);
                return (
                  <label
                    key={f.codFornec}
                    className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] px-2 py-[var(--celula-y)] hover:bg-[var(--surface-3)]"
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={() => alternar(f)}
                      className="mt-1 size-4 shrink-0 accent-[var(--primary)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[length:var(--fs-base)]">
                        {f.fornecedor}
                      </span>
                      <span className="block text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
                        <span className="tabular">{f.codFornec}</span>
                        {cnpj(f.cgc) !== null && (
                          <>
                            {" · "}
                            <span className="tabular">{cnpj(f.cgc)}</span>
                          </>
                        )}
                        {/* O AVISO QUE EVITA A ESCOLHA ERRADA.
                            A P&G tem meia dúzia de cadastros, com nomes quase idênticos.
                            Escolher um e achar que levou a empresa inteira é o engano mais
                            provável desta tela — e silencioso, porque o DRE sai com números
                            plausíveis, só menores. */}
                        {f.codFornecPrinc !== null && f.codFornecPrinc !== f.codFornec && (
                          <>
                            {" · "}
                            <span className="text-[var(--warning)]">
                              grupo do {f.codFornecPrinc} — este DRE é só deste cadastro
                            </span>
                          </>
                        )}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A mesma seta dos outros campos que abrem lista, em `FiltrosDre`. */
function Seta({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4 shrink-0 text-[var(--text-muted)] transition-transform", className)}
    >
      <path d="m5 7.5 5 5 5-5" />
    </svg>
  );
}

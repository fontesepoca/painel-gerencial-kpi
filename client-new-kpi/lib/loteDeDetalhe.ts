import { ApiError } from "@/services/apiClient";
import type { Detalhamento, TipoDetalhe } from "@/types/dre-gerencial";

/**
 * A EXPORTAÇÃO EM LOTE no navegador (06/11/2026, pedido do Gabriel): o pedido, a leitura do
 * fluxo NDJSON e o aviso do zip parcial. Quem monta os Excels e o zip é
 * `exportarDetalhesDaLinha.ts`; a API está em `LoteDeDetalhe.cs`.
 */

export interface LinhaDoLote {
  id: number;
  tipo: TipoDetalhe;
  bloco: string | null;
  chave: string | null;
  sobra?: string[] | null;
}

export interface PedidoDoLote {
  filiais: string[];
  regime: string;
  analise: string;
  fornecedores?: number[];
  colunas: { dataInicio: string; dataFim: string }[];
  linhas: LinhaDoLote[];
}

export type PacoteDoLote =
  | { t: "inicio"; partes: number; base?: { id: string; rotulo: string } | null }
  | { t: "aguarde" }
  | { t: "parte"; linha: number; coluna: number; dados: Detalhamento }
  | { t: "falha"; linhas: number[]; coluna: number; mensagem: string }
  | { t: "fim" }
  | { t: "erro"; mensagem: string };

/**
 * Quanto tempo sem NENHUM pacote — nem o batimento de 15 s — até dar a conexão por perdida.
 * Seis batimentos: folga para uma rede lenta, e ninguém fica olhando um "consultando" eterno.
 */
export const SILENCIO_MAXIMO_MS = 90_000;

export class SilencioDoServidor extends Error {
  constructor() {
    super("O servidor ficou mais de 90 segundos sem responder; a conexão foi dada como perdida.");
    this.name = "SilencioDoServidor";
  }
}

/**
 * Os pacotes do fluxo, um a um. Junta pacote partido entre pedaços (inclusive no meio de um
 * caractere acentuado) e procura a quebra só no trecho novo — um pacote de 8 MB chega em
 * centenas de pedaços. Ao sair, por fim, erro ou vigia, solta a conexão: cancelar o corpo é o
 * que faz o BFF e a API desistirem da consulta.
 */
export async function* lerNdjson(
  corpo: ReadableStream<Uint8Array>,
  silencioMaximoMs = SILENCIO_MAXIMO_MS,
): AsyncGenerator<PacoteDoLote> {
  const leitor = corpo.getReader();
  const texto = new TextDecoder();
  /**
   * Os trechos do pacote em andamento, ainda sem a quebra. NÃO um `resto += ...`: concatenar e
   * procurar no acumulado copia o buffer inteiro a cada pedaço — 8 MB acentuados em pedaços de
   * 4 KB levavam ~8 s com a aba travada (revisão final, 06/11/2026). Junta-se uma vez só,
   * quando a quebra chega.
   */
  let trechos: string[] = [];

  function* emitir(linha: string): Generator<PacoteDoLote> {
    const limpa = linha.trim();
    if (limpa) yield JSON.parse(limpa) as PacoteDoLote;
  }

  try {
    for (;;) {
      let relogio: ReturnType<typeof setTimeout> | undefined;
      const silencio = new Promise<never>((_, rejeitar) => {
        relogio = setTimeout(() => rejeitar(new SilencioDoServidor()), silencioMaximoMs);
      });

      let lido: ReadableStreamReadResult<Uint8Array>;
      try {
        lido = await Promise.race([leitor.read(), silencio]);
      } finally {
        clearTimeout(relogio);
      }
      if (lido.done) break;

      // Procura a quebra só no trecho NOVO.
      const novo = texto.decode(lido.value, { stream: true });
      let inicio = 0;
      let quebra = novo.indexOf("\n");
      while (quebra >= 0) {
        trechos.push(novo.slice(inicio, quebra));
        const linha = trechos.join("");
        trechos = [];
        yield* emitir(linha);
        inicio = quebra + 1;
        quebra = novo.indexOf("\n", inicio);
      }
      if (inicio < novo.length) trechos.push(novo.slice(inicio));
    }

    trechos.push(texto.decode());
    yield* emitir(trechos.join(""));
  } finally {
    leitor.cancel().catch(() => {});
  }
}

/**
 * Abre o fluxo do lote pelo BFF. Recusa antes de começar (400, 401, 409) vira `ApiError` com
 * a mensagem da API; depois de aberto, o que chega é pacote.
 *
 * **O vigia começa aqui, e não só na leitura** (revisão final, 06/11/2026): a API manda o
 * cabeçalho antes da primeira consulta, então esperar mais que `silencioMaximoMs` por ele é
 * conexão perdida. O limite vale só até o cabeçalho chegar — dali em diante quem vigia é o
 * `lerNdjson`, e o `fetch` não pode mais ser abortado por ele, senão o corpo cairia junto.
 */
export async function pedirLote(
  pedido: PedidoDoLote,
  signal: AbortSignal,
  silencioMaximoMs = SILENCIO_MAXIMO_MS,
): Promise<ReadableStream<Uint8Array>> {
  const limite = new AbortController();
  const relogio = setTimeout(() => limite.abort(new SilencioDoServidor()), silencioMaximoMs);

  let resposta: Response;
  try {
    resposta = await fetch("/api/dre-gerencial/detalhe/lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pedido),
      cache: "no-store",
      signal: AbortSignal.any([signal, limite.signal]),
    });
  } catch (e) {
    if (signal.aborted) throw e;
    if (limite.signal.aborted) throw new SilencioDoServidor();
    throw new ApiError("Não foi possível conectar à API.", 0);
  } finally {
    clearTimeout(relogio);
  }

  if (!resposta.ok || !resposta.body) {
    let mensagem = `Erro ${resposta.status} ao exportar.`;
    try {
      const envelope = (await resposta.json()) as { mensagem?: string } | null;
      if (envelope?.mensagem) mensagem = envelope.mensagem;
    } catch {
      // Sem corpo JSON: fica a mensagem com o status.
    }
    if (resposta.status === 401) mensagem = "A sessão expirou. Entre de novo e repita a exportação.";
    throw new ApiError(mensagem, resposta.status);
  }

  return resposta.body;
}

export const NOME_DO_LEIA = "LEIA - arquivos que faltaram.txt";

/** O aviso do zip parcial, em CRLF para abrir certo no Bloco de Notas. */
export function textoDoLeia(faltas: readonly { caminho: string; motivo: string }[]): string {
  return [
    "Arquivos que faltaram nesta exportação",
    "",
    "Os arquivos abaixo não foram gerados; os demais deste zip estão completos.",
    "Para obtê-los, exporte de novo só estas linhas.",
    "",
    ...faltas.flatMap((f) => [`- ${f.caminho}`, `  Motivo: ${f.motivo}`]),
    "",
  ].join("\r\n");
}

import type { Detalhamento } from "@/types/dre-gerencial";

/**
 * Guarda o detalhamento já apurado para a página dedicada abrir sem consultar de novo.
 *
 * **Este é o ponto do recurso.** A consulta de receita por cliente leva de 8 s a 2 minutos
 * e varre as mesmas notas da apuração; refazê-la só para trocar de tela seria cobrar do
 * usuário, e do banco, por um dado que já está na memória do navegador.
 *
 * Duas camadas, e as duas de propósito:
 *
 * 1. **`localStorage`.** É a que faz o recurso funcionar, porque o destino é **outra aba**
 *    e nada mais atravessa. Memória de módulo é por documento; `sessionStorage` é por aba,
 *    e mesmo a cópia que o navegador faria para uma aba filha não acontece aqui — abrir
 *    com `target="_blank"` implica `noopener`, e sem vínculo com a aba de origem não há o
 *    que copiar. Sobra o armazenamento por origem.
 * 2. **Memória do módulo.** Atalho para não desserializar megabytes de novo quando a mesma
 *    aba reabre o mesmo detalhamento.
 *
 * **Guarda só o último.** Sem isso uma tarde de trabalho enche o armazenamento com
 * detalhamentos que ninguém vai reabrir, e a gravação seguinte falha por cota — e falharia
 * justamente na hora de usar.
 *
 * O que **não** existe aqui é buscar de novo quando não acha. Uma página de detalhamento
 * que dispara uma consulta de dois minutos porque alguém abriu o link direto seria uma
 * armadilha; a página diz que o dado não está mais disponível e manda voltar ao DRE.
 */
export interface DetalheAberto {
  titulo: string;
  periodo: { dataInicio: string; dataFim: string };
  /** A célula clicada, para o resumo do cálculo se conferir contra ela. */
  linha: { descricao: string; valor: number };
  dados: Detalhamento;
  /**
   * As filiais apuradas, já escritas — `Filiais: EPC-MAT (7), EPC-ES (12)`.
   *
   * **Vai o texto pronto, e não os códigos.** A página de destino é outra aba, sem o
   * cadastro de filiais em memória; mandá-la buscar de novo custaria uma requisição só
   * para reescrever uma frase que a aba de origem já tinha — e abriria a chance de as
   * duas abas descreverem a mesma apuração com palavras diferentes.
   *
   * Opcional porque um detalhamento guardado antes desta mudança não tem o campo, e a
   * página precisa abrir mesmo assim.
   */
  filiais?: string;
}

const PREFIXO = "epoca:detalhe:";

const memoria = new Map<string, DetalheAberto>();

/**
 * Guarda e devolve o identificador para a URL, ou `null` se não conseguiu guardar.
 *
 * **`null` importa:** quem chama precisa saber que não dá para abrir a outra aba, porque
 * ela abriria vazia. Sem armazenamento não há como atravessar, e prometer o contrário
 * levaria a pessoa a uma tela dizendo que o dado sumiu.
 */
export function guardar(detalhe: DetalheAberto): string | null {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    // Limpa antes de gravar: o espaço do detalhamento anterior é o espaço deste.
    for (const chave of Object.keys(localStorage)) {
      if (chave.startsWith(PREFIXO)) localStorage.removeItem(chave);
    }
    localStorage.setItem(PREFIXO + id, JSON.stringify(detalhe));
  } catch {
    // Cota estourada — a receita por cliente traz 15 mil linhas — ou armazenamento
    // bloqueado pelo navegador.
    return null;
  }

  memoria.set(id, detalhe);
  return id;
}

/** `null` quando o detalhamento não está mais disponível — a página trata esse caso. */
export function recuperar(id: string): DetalheAberto | null {
  const daMemoria = memoria.get(id);
  if (daMemoria) return daMemoria;

  try {
    const bruto = localStorage.getItem(PREFIXO + id);
    if (!bruto) return null;

    const recuperado = JSON.parse(bruto) as DetalheAberto;
    // Guarda em memória: recarregar a aba não paga a desserialização de novo.
    memoria.set(id, recuperado);
    return recuperado;
  } catch {
    return null;
  }
}

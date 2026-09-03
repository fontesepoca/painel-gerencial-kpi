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
 * 1. **Memória do módulo.** É a que sempre funciona na navegação normal — o Next mantém o
 *    JavaScript vivo entre rotas, então o objeto atravessa intacto, sem serializar.
 * 2. **`sessionStorage`, na tentativa.** Serve só para o caso de a pessoa recarregar a
 *    página aberta. Pode falhar por cota: a receita por cliente traz 15 mil linhas, o que
 *    dá alguns megabytes, e o limite varia por navegador. Falhar aí não é problema — a
 *    camada 1 já cobriu o caminho normal, e por isso o erro é engolido.
 *
 * O que **não** existe aqui é buscar de novo quando não acha. Uma página de detalhamento
 * que dispara uma consulta de dois minutos porque alguém abriu o link direto seria uma
 * armadilha; a página diz que o dado não está mais em memória e manda voltar ao DRE.
 */
export interface DetalheAberto {
  titulo: string;
  periodo: { dataInicio: string; dataFim: string };
  /** A célula clicada, para o resumo do cálculo se conferir contra ela. */
  linha: { descricao: string; valor: number };
  dados: Detalhamento;
}

const PREFIXO = "epoca:detalhe:";

const memoria = new Map<string, DetalheAberto>();

/** Guarda e devolve o identificador para a URL. */
export function guardar(detalhe: DetalheAberto): string {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  memoria.set(id, detalhe);

  // Só o último interessa. Sem isto, uma tarde de trabalho enche o armazenamento com
  // detalhamentos que ninguém vai reabrir, e a gravação seguinte falha por cota.
  try {
    for (const chave of Object.keys(sessionStorage)) {
      if (chave.startsWith(PREFIXO)) sessionStorage.removeItem(chave);
    }
    sessionStorage.setItem(PREFIXO + id, JSON.stringify(detalhe));
  } catch {
    // Cota estourada ou armazenamento bloqueado: a memória do módulo cobre a navegação,
    // e o que se perde é sobreviver a um recarregamento.
  }

  return id;
}

/** `null` quando o detalhamento não está mais disponível — a página trata esse caso. */
export function recuperar(id: string): DetalheAberto | null {
  const daMemoria = memoria.get(id);
  if (daMemoria) return daMemoria;

  try {
    const bruto = sessionStorage.getItem(PREFIXO + id);
    if (!bruto) return null;

    const recuperado = JSON.parse(bruto) as DetalheAberto;
    // Volta para a memória: um segundo recarregamento não precisa desserializar de novo.
    memoria.set(id, recuperado);
    return recuperado;
  } catch {
    return null;
  }
}

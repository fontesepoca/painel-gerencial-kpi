/**
 * As opções do menu Exibição do DRE: o padrão de cada uma e o que se guarda delas no banco
 * (25/11/2026). Ver docs/plataforma/PREFERENCIAS.md.
 *
 * Sem React e sem rede — é o que deixa o pr1 rodar este módulo de verdade no Node. A
 * instância da loja, com o `POST` de verdade, mora em `hooks/useExibicao.ts`.
 */

export const IDS_DA_EXIBICAO = [
  "zeradas",
  "informativos",
  "ocultar-baixas",
  "av",
  "ah",
  "provisionado",
  "confirmados",
  "sem-total",
  "so-total",
  "selecionar-linhas",
  "mover-linhas",
  "codigos",
] as const;

export type IdDaExibicao = (typeof IDS_DA_EXIBICAO)[number];
export type Exibicao = Readonly<Record<IdDaExibicao, boolean>>;
export type MudancasDaExibicao = Partial<Record<IdDaExibicao, boolean>>;
/** O corpo do `POST`: só a seção da Exibição, só com o que mudou. */
export type TrechoDaExibicao = { exibicao: MudancasDaExibicao };

/**
 * O estado com que cada opção abre para quem nunca mexeu nela. É também contra ele que o selo
 * do botão Exibição conta.
 *
 * Opção ausente no banco segue ESTE valor — se um dia ele mudar, quem nunca mexeu acompanha, e
 * quem mexeu mantém a escolha.
 */
export const PADRAO_DA_EXIBICAO: Exibicao = Object.freeze({
  zeradas: false,
  // Ligado por padrão: a tela de sempre mostra os informativos (29/10/2026).
  informativos: true,
  // "Ocultar títulos estornados ou desdobrados", marcado por padrão (30/10/2026): o mesmo
  // estado do checkbox do detalhamento (`useOcultarBaixas`). Escolhe qual dos dois DREs da API
  // vai à tela.
  "ocultar-baixas": true,
  // As colunas de análise, marcadas ao abrir, a pedido do Gabriel em 05/10/2026: a tela
  // continua sendo o que sempre foi, e esconder coluna é escolha de quem está lendo. Numa
  // conversa sobre valores, %AV e %AH são ruído; numa análise de composição, o %AV é o assunto.
  av: true,
  ah: true,
  // As colunas Provisionado e Total (competência, 14/10/2026). Marcado ao abrir, como os
  // outros dois: quem não quer vê-las desmarca.
  provisionado: true,
  // O Vl. Realizado dividido em pago e confirmado (24/11/2026, divergência 23). DESMARCADO ao
  // abrir, a pedido do Gabriel: a tela abre como sempre, com o confirmado dentro do realizado.
  confirmados: false,
  // O recorte das colunas (15/10/2026): sem o bloco Total no fim, ou só ele. Os dois se
  // excluem — marcar um desmarca o outro.
  "sem-total": false,
  "so-total": false,
  // Os controles da linha (06/11/2026): a seleção para exportar várias contas começa
  // escondida, o punho de mover começa à vista.
  "selecionar-linhas": false,
  "mover-linhas": true,
  // O código de cada linha à esquerda da descrição — desligado, como a tela era (10/11/2026).
  codigos: false,
});

function ehId(chave: string): chave is IdDaExibicao {
  return (IDS_DA_EXIBICAO as readonly string[]).includes(chave);
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * O que o banco tem da Exibição, só o que é válido. O documento é do banco, e o banco guarda
 * o que já foi verdade: uma opção que saiu do menu, um valor de outro tipo, ou o par Sem
 * Total/Só Total marcado junto (que só sai de defeito) não podem quebrar a tela — ficam no
 * padrão.
 */
export function lerExibicao(documento: unknown): MudancasDaExibicao {
  if (!ehObjeto(documento)) return {};
  const secao = documento.exibicao;
  if (!ehObjeto(secao)) return {};

  const lido: MudancasDaExibicao = {};
  for (const [chave, valor] of Object.entries(secao)) {
    if (ehId(chave) && typeof valor === "boolean") lido[chave] = valor;
  }

  if (lido["sem-total"] === true && lido["so-total"] === true) {
    delete lido["sem-total"];
    delete lido["so-total"];
  }
  return lido;
}

/**
 * Junta o que chegou do banco ao que a pessoa já mexeu antes de ele chegar.
 *
 * - `estado`: o que a tela mostra. A opção que a pessoa CLICOU (`clicadas`) fica como ela
 *   deixou; as outras vêm do banco, ou do padrão.
 * - `gravado`: o que o banco efetivamente diz. A diferença entre os dois é o clique anterior à
 *   carga — e é ela que a loja grava em seguida.
 *
 * **É a lista de cliques, e não "diferente do padrão"** (revisão final, 25/11/2026): quem
 * clicou e desfez antes da carga ficaria com o banco por cima do último clique; e o valor que
 * a página dedicada do detalhe recebe de quem a abriu seria gravado como se fosse clique.
 */
export function aoCarregar(
  atual: Exibicao,
  salvo: MudancasDaExibicao,
  clicadas: ReadonlySet<IdDaExibicao>,
): { estado: Exibicao; gravado: Exibicao } {
  const estado = {} as Record<IdDaExibicao, boolean>;
  const gravado = {} as Record<IdDaExibicao, boolean>;

  for (const id of IDS_DA_EXIBICAO) {
    const doBanco = salvo[id] ?? PADRAO_DA_EXIBICAO[id];
    gravado[id] = doBanco;
    estado[id] = clicadas.has(id) ? atual[id] : doBanco;
  }

  // Sem Total clicado + Só Total vindo do banco (ou o contrário): vale o clique.
  if (estado["sem-total"] && estado["so-total"]) {
    if (clicadas.has("sem-total") && atual["sem-total"]) estado["so-total"] = false;
    else estado["sem-total"] = false;
  }

  return { estado, gravado };
}

/** As opções em que `atual` difere de `gravado`, com o valor de `atual`. */
export function diferencas(atual: Exibicao, gravado: Exibicao): MudancasDaExibicao {
  const mudou: MudancasDaExibicao = {};
  for (const id of IDS_DA_EXIBICAO) {
    if (atual[id] !== gravado[id]) mudou[id] = atual[id];
  }
  return mudou;
}

export function trechoDaExibicao(mudancas: MudancasDaExibicao): TrechoDaExibicao {
  return { exibicao: { ...mudancas } };
}

/**
 * Quantas opções estão fora do padrão — o selo do botão Exibição: avisa que a tabela está
 * recortada sem precisar abrir o menu. Opção escondida ou desabilitada não conta: não está
 * agindo sobre a tabela.
 *
 * Conta contra o PADRÃO, não contra a preferência salva: com a gravação automática as duas
 * seriam sempre iguais, e o selo seria sempre zero.
 */
export function contarForaDoPadrao(
  opcoes: readonly { id: string; marcada: boolean; oculta?: boolean; motivo?: string | null }[],
): number {
  return opcoes.filter(
    (o) => !o.oculta && !o.motivo && ehId(o.id) && o.marcada !== PADRAO_DA_EXIBICAO[o.id],
  ).length;
}

export type LojaDaExibicao = {
  /** O estado atual. Mesmo objeto enquanto nada muda — o `useSyncExternalStore` compara por identidade. */
  ler: () => Exibicao;
  inscrever: (ouvinte: () => void) => () => void;
  /** O clique: aplica na hora e manda gravar o que ficou diferente do banco (depois de carregado). */
  mudar: (mudancas: MudancasDaExibicao) => void;
  /**
   * Aplica um valor que NÃO é escolha da pessoa — o que a página dedicada do detalhe recebe de
   * quem a abriu. Muda a tela e nunca vai ao banco, nem agora nem depois.
   */
  aplicarSemGravar: (mudancas: MudancasDaExibicao) => void;
  /** Aplica o documento do banco, uma vez por `chave` (base:matrícula). */
  carregar: (chave: string, documento: unknown) => void;
  jaCarregou: (chave: string) => boolean;
};

/**
 * O estado das 12 opções, fora do React.
 *
 * Guarda duas coisas: o que a tela mostra e o que o banco tem. Cada mudança manda a `gravar`
 * **só o que difere do banco** — nunca o documento inteiro, para uma aba não apagar o que
 * outra gravou. Antes de o banco responder nada é gravado (não se sabe o que ele tem); o que
 * a pessoa mexeu nesse meio-tempo vence a carga e é gravado nela.
 */
export function criarLojaDaExibicao(gravar: (trecho: TrechoDaExibicao) => void): LojaDaExibicao {
  let estado: Exibicao = PADRAO_DA_EXIBICAO;
  let gravado: Exibicao | null = null;
  let carregadoPara: string | null = null;
  /** As opções clicadas antes da carga — as únicas que vencem o banco nela. */
  const clicadas = new Set<IdDaExibicao>();
  const ouvintes = new Set<() => void>();

  /** Troca o estado; devolve se algo mudou. */
  const aplicar = (mudancas: MudancasDaExibicao): boolean => {
    const novo: Exibicao = { ...estado, ...mudancas };
    if (IDS_DA_EXIBICAO.every((id) => novo[id] === estado[id])) return false;
    estado = novo;
    avisar();
    return true;
  };

  const avisar = () => {
    for (const ouvinte of ouvintes) ouvinte();
  };

  const gravarDiferencas = () => {
    if (gravado === null) return;
    const mudou = diferencas(estado, gravado);
    gravado = estado;
    if (Object.keys(mudou).length > 0) gravar(trechoDaExibicao(mudou));
  };

  return {
    ler: () => estado,

    inscrever: (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },

    mudar: (mudancas) => {
      if (gravado === null) {
        for (const id of IDS_DA_EXIBICAO) if (id in mudancas) clicadas.add(id);
      }
      if (!aplicar(mudancas)) return;
      gravarDiferencas();
    },

    aplicarSemGravar: (mudancas) => {
      if (!aplicar(mudancas)) return;
      // Já carregado: o "banco" passa a dizer o mesmo, para o próximo clique não levar este
      // valor junto na diferença.
      if (gravado !== null) gravado = { ...gravado, ...mudancas };
    },

    carregar: (chave, documento) => {
      if (carregadoPara === chave) return;
      carregadoPara = chave;
      const junto = aoCarregar(estado, lerExibicao(documento), clicadas);
      clicadas.clear();
      estado = junto.estado;
      gravado = junto.gravado;
      avisar();
      gravarDiferencas();
    },

    jaCarregou: (chave) => carregadoPara === chave,
  };
}

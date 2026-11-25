import { ROTINA_DRE, podeAbrir } from "@/lib/rotinas";

/**
 * O mapa de navegação: os módulos da barra lateral e as telas de cada um.
 *
 * <b>Uma tela nova entra aqui, e só aqui.</b> A barra lateral lê esta lista; nenhuma página
 * precisa saber que existe menu. Um módulo novo é um item a mais em `MODULOS`, com um ícone
 * acrescentado em components/layout/Icones.tsx — o mesmo vale para o ícone de uma tela nova.
 *
 * <b>A permissão é a mesma do portão.</b> Cada tela aponta para o código da rotina no Winthor,
 * e a barra esconde o que a pessoa não pode abrir com o mesmo `podeAbrir` que o layout da
 * rota usa para barrar. Esconder aqui é conforto; quem barra continua sendo o layout.
 */

export interface TelaDoMenu {
  /**
   * Código da rotina no Winthor. Decide a permissão e mais nada: desde 12/11/2026 o número
   * não aparece na tela — a pessoa procura a tela pelo nome e pelo ícone.
   *
   * <b>Não é único:</b> duas telas podem dividir a mesma permissão (o Simulador de Preço usa a
   * 9815 do DRE). O que identifica uma tela é o `href`.
   */
  codigo: string;
  nome: string;
  icone: IconeDeTela;
  /** Uma linha: o que a pessoa encontra ao abrir. */
  descricao: string;
  /**
   * O texto mais longo do cartão em "Rotinas disponíveis", na tela inicial (24/11/2026). A tela
   * inicial lê esta mesma lista: uma tela nova aparece no menu e no início sem mais nada.
   */
  resumo: string;
  href: string;
}

export type IconeDeModulo = "gerencial";
export type IconeDeTela = "dre" | "preco";

export interface ModuloDoMenu {
  id: string;
  nome: string;
  icone: IconeDeModulo;
  telas: readonly TelaDoMenu[];
}

export const MODULOS: readonly ModuloDoMenu[] = [
  {
    id: "gerencial",
    nome: "Gerencial",
    icone: "gerencial",
    telas: [
      {
        codigo: ROTINA_DRE,
        nome: "DRE Gerencial",
        icone: "dre",
        descricao: "Resultado por filial e período",
        resumo:
          "Demonstrativo de resultado por filial e período, em quatro dimensões de análise, com detalhamento por duplo clique e exportação.",
        href: "/dre-gerencial",
      },
      {
        // Tela nova, sem rotina própria no Winthor: a permissão é a do DRE (decisão D4 da
        // spec docs/superpowers/specs/2026-11-18-simulador-de-preco-design.md).
        codigo: ROTINA_DRE,
        nome: "Simulador de Preço",
        icone: "preco",
        descricao: "Impostos, custo e preço futuro a partir do preço de compra",
        // Texto do Gabriel (24/11/2026). Sem falar em "salvar no navegador": a forma de guardar
        // as simulações ainda vai ser revista (localStorage, análise multifilial).
        resumo:
          "Impostos, custo e preço futuro a partir do preço de compra, com edição por produto, simulação de produtos novos.",
        href: "/simulador-preco",
      },
    ],
  },
];

/** Os módulos com pelo menos uma tela liberada, cada um só com as telas liberadas. */
export function modulosVisiveis(rotinas: readonly string[] | undefined): ModuloDoMenu[] {
  return MODULOS.map((m) => ({ ...m, telas: m.telas.filter((t) => podeAbrir(rotinas, t.codigo)) }))
    .filter((m) => m.telas.length > 0);
}

/** A tela está aberta — ela mesma ou uma subpágina dela, como o detalhamento do DRE. */
export function telaAtiva(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

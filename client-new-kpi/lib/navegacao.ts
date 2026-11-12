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
   */
  codigo: string;
  nome: string;
  icone: IconeDeTela;
  /** Uma linha: o que a pessoa encontra ao abrir. */
  descricao: string;
  href: string;
}

export type IconeDeModulo = "gerencial";
export type IconeDeTela = "dre";

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
        href: "/dre-gerencial",
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

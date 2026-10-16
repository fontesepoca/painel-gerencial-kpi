/**
 * O mecanismo da exportação para `.xlsx` — o que a apuração e o detalhamento têm em comum.
 *
 * Cada tela monta a **matriz** dela; daqui para frente é tudo igual: formato numérico
 * célula a célula, largura de coluna, painel congelado, e o arquivo em memória.
 *
 * **ExcelJS, e não mais o SheetJS, desde 16/10/2026** — a versão gratuita do SheetJS não grava
 * estilo de célula, e o Gabriel pediu a planilha "tão bonita quanto o DRE na tela": cor de cada
 * mês, totalizadores em negrito, sinal em cor, bordas dos resultados. O SheetJS continua no
 * projeto para LER arquivos (os testes reabrem o que é gerado aqui).
 *
 * **`import()` dinâmico.** A biblioteca só interessa a quem exporta; no pacote inicial
 * atrasaria a apuração de todo mundo.
 */

/** Formato brasileiro com o negativo entre parênteses, como a 9815 mostra. */
export const MOEDA = "#,##0.00;(#,##0.00)";
export const PERCENTUAL_3 = "#,##0.000;(#,##0.000)";
export const PERCENTUAL_2 = "#,##0.00;(#,##0.00)";
export const INTEIRO = "#,##0";

/**
 * A aparência de uma célula. Cores em `#RRGGBB`, opacas: o Excel não compõe transparência, e
 * quem traduz as cores translúcidas da tela é quem monta a matriz.
 */
export interface Estilo {
  negrito?: boolean;
  /** Cor do texto. */
  cor?: string;
  /** Cor de fundo. */
  fundo?: string;
  alinhar?: "esquerda" | "centro" | "direita";
  /** Recuo do texto, em níveis do Excel. */
  recuo?: number;
  /** Quebra o texto em várias linhas dentro da célula. */
  quebrar?: boolean;
  /** Tamanho da fonte, em pt. Ausente: 10. */
  tamanho?: number;
  /** Bordas: `fina` ou `grossa`, com a cor de cada uma. */
  borda?: Partial<Record<"cima" | "baixo" | "esquerda" | "direita", { peso: "fina" | "grossa"; cor: string }>>;
}

export interface Celula {
  v: string | number | null;
  /** Formato numérico do Excel. Ausente em texto. */
  z?: string;
  /** Aparência. Ausente: a célula sai com o padrão da planilha. */
  s?: Estilo;
}

/**
 * Célula numérica.
 *
 * **O valor vai cru e o formato cuida da aparência.** A tela mostra `(617.283,95)`, mas o
 * que a planilha recebe é `-617283.95`: quem abre consegue somar, filtrar e montar tabela
 * dinâmica. Exportar o texto já formatado dá uma planilha bonita e inútil — e é o defeito
 * mais fácil de cometer aqui, porque na tela ele não aparece.
 */
export const num = (valor: number | null | undefined, formato = MOEDA): Celula =>
  valor === null || valor === undefined ? { v: null } : { v: valor, z: formato };

/** Célula de texto. `null` e vazio viram célula vazia, não a string "null". */
export const txt = (valor: string | number | null | undefined): Celula =>
  valor === null || valor === undefined || valor === "" ? { v: null } : { v: String(valor) };

/** `2026-08-05T00:00:00` → `05/08/2026`, como texto — data de planilha é outra briga. */
export const data = (iso: string | null | undefined): Celula => {
  if (!iso) return { v: null };
  const partes = iso.slice(0, 10).split("-");
  return partes.length === 3 ? { v: `${partes[2]}/${partes[1]}/${partes[0]}` } : { v: iso };
};

export interface Planilha {
  /** Nome da aba. */
  aba: string;
  matriz: Celula[][];
  /** Largura de cada coluna, em caracteres. */
  larguras: number[];
  /** Junções de célula, no formato do SheetJS. */
  merges?: { s: { r: number; c: number }; e: { r: number; c: number } }[];
  /** Quantas colunas e linhas ficam congeladas. */
  congelar?: { colunas: number; linhas: number };
}

/** `#RRGGBB` → o ARGB do ExcelJS, sempre opaco. */
const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

const ALINHAMENTO = { esquerda: "left", centro: "center", direita: "right" } as const;

/**
 * Gera o arquivo em memória.
 *
 * Separado do download de propósito: assim a geração é exercitável sem abrir diálogo de
 * salvar em máquina de ninguém.
 */
export async function gerarPlanilha(planilhas: Planilha[]): Promise<Blob> {
  // `default` no bundle do navegador; o próprio módulo quando o Node o carrega como CommonJS.
  const modulo = await import("exceljs");
  const ExcelJS = modulo.default ?? (modulo as unknown as typeof modulo.default);
  const livro = new ExcelJS.Workbook();

  for (const p of planilhas) {
    const folha = livro.addWorksheet(p.aba, {
      views: p.congelar
        ? [{ state: "frozen", xSplit: p.congelar.colunas, ySplit: p.congelar.linhas }]
        : [],
    });

    // Sem largura, o Excel abre tudo com 8,43 e a coluna de dinheiro mostra `#######` —
    // o primeiro motivo de alguém achar que a exportação veio quebrada.
    p.larguras.forEach((wch, i) => {
      folha.getColumn(i + 1).width = wch;
    });

    p.matriz.forEach((linha, r) => {
      linha.forEach((celula, c) => {
        // Célula vazia COM estilo também é escrita: a cor do mês desce pela coluna inteira,
        // inclusive onde não há número.
        if (celula.v === null && celula.s === undefined) return;
        const alvo = folha.getCell(r + 1, c + 1);
        if (celula.v !== null) alvo.value = celula.v;
        if (celula.z !== undefined) alvo.numFmt = celula.z;
        const e = celula.s;
        if (!e) return;
        alvo.font = {
          name: "Calibri",
          size: e.tamanho ?? 10,
          bold: e.negrito === true,
          ...(e.cor ? { color: { argb: argb(e.cor) } } : {}),
        };
        if (e.fundo) {
          alvo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(e.fundo) } };
        }
        if (e.alinhar || e.recuo || e.quebrar) {
          alvo.alignment = {
            vertical: "middle",
            ...(e.alinhar ? { horizontal: ALINHAMENTO[e.alinhar] } : {}),
            ...(e.recuo ? { indent: e.recuo } : {}),
            ...(e.quebrar ? { wrapText: true } : {}),
          };
        }
        if (e.borda) {
          const lado = (b?: { peso: "fina" | "grossa"; cor: string }) =>
            b ? { style: b.peso === "grossa" ? ("medium" as const) : ("thin" as const), color: { argb: argb(b.cor) } } : undefined;
          alvo.border = {
            top: lado(e.borda.cima),
            bottom: lado(e.borda.baixo),
            left: lado(e.borda.esquerda),
            right: lado(e.borda.direita),
          };
        }
      });
    });

    for (const m of p.merges ?? []) {
      folha.mergeCells(m.s.r + 1, m.s.c + 1, m.e.r + 1, m.e.c + 1);
    }
  }

  const bytes = await livro.xlsx.writeBuffer();
  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Baixa o arquivo.
 *
 * A URL é revogada depois de um segundo: sem isso o navegador segura o arquivo inteiro na
 * memória até a aba fechar, e este pode ter alguns megabytes. Revogar no mesmo tique
 * cancela o download em alguns navegadores, daí a folga.
 */
export function baixar(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = nome;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Tira do texto o que o Windows recusa em nome de arquivo. */
export const nomeSeguro = (texto: string) =>
  texto
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();

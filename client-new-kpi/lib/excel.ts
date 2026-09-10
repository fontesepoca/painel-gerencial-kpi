/**
 * O mecanismo da exportação para `.xlsx` — o que a apuração e o detalhamento têm em comum.
 *
 * Cada tela monta a **matriz** dela; daqui para frente é tudo igual: formato numérico
 * célula a célula, largura de coluna, painel congelado, e o arquivo em memória.
 *
 * **`import()` dinâmico do `xlsx`.** São ~400KB que só interessam a quem exporta; no pacote
 * inicial atrasariam a apuração de todo mundo.
 */

/** Formato brasileiro com o negativo entre parênteses, como a 9815 mostra. */
export const MOEDA = "#,##0.00;(#,##0.00)";
export const PERCENTUAL_3 = "#,##0.000;(#,##0.000)";
export const PERCENTUAL_2 = "#,##0.00;(#,##0.00)";
export const INTEIRO = "#,##0";

export interface Celula {
  v: string | number | null;
  /** Formato numérico do Excel. Ausente em texto. */
  z?: string;
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

/**
 * Gera o arquivo em memória.
 *
 * Separado do download de propósito: assim a geração é exercitável sem abrir diálogo de
 * salvar em máquina de ninguém — e o `writeFile` do SheetJS não dá essa escolha, ele monta
 * e baixa numa chamada só.
 */
export async function gerarPlanilha(planilhas: Planilha[]): Promise<Blob> {
  const XLSX = await import("xlsx");
  const livro = XLSX.utils.book_new();

  for (const p of planilhas) {
    const folha = XLSX.utils.aoa_to_sheet(p.matriz.map((linha) => linha.map((c) => c.v)));

    // O formato vai célula a célula: `aoa_to_sheet` só leva o valor.
    p.matriz.forEach((linha, r) => {
      linha.forEach((celula, c) => {
        if (celula.z === undefined) return;
        const alvo = folha[XLSX.utils.encode_cell({ r, c })];
        if (alvo) alvo.z = celula.z;
      });
    });

    // Sem largura, o Excel abre tudo com 8,43 e a coluna de dinheiro mostra `#######` —
    // o primeiro motivo de alguém achar que a exportação veio quebrada.
    folha["!cols"] = p.larguras.map((wch) => ({ wch }));
    if (p.merges) folha["!merges"] = p.merges;
    if (p.congelar) {
      folha["!freeze"] = {
        xSplit: String(p.congelar.colunas),
        ySplit: String(p.congelar.linhas),
      };
    }

    XLSX.utils.book_append_sheet(livro, folha, p.aba);
  }

  const bytes = XLSX.write(livro, {
    bookType: "xlsx",
    type: "array",
    compression: true,
  }) as ArrayBuffer;

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

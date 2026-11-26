import { ajusteVazio } from "@/lib/simuladorPreco";
import type { SimulacaoGuardada } from "@/hooks/useSimulacaoGuardada";
import type { AjusteDaLinha, ProdutoNovo } from "@/types/simulador-preco";

/**
 * O rascunho da simulação e o "Salvar simulação" (spec 2026-11-23-simulador-salvar-limpar,
 * que revê a D22 só para as edições da tabela).
 *
 * As edições dos produtos da consulta ficam num RASCUNHO, na memória da aba, e só vão ao
 * localStorage quando a pessoa clica em Salvar. Desde 24/11/2026 (Gabriel), os produtos novos
 * também esperam o Salvar. Aqui mora só a lógica pura, conferida pelo sp13: a tela chama estas
 * funções.
 *
 * Em PL/SQL seria o mesmo que editar numa tabela temporária e só dar o MERGE na definitiva
 * quando a pessoa confirma.
 */

/** Por consulta (`chaveDaConsulta`), e dentro dela por linha (`chaveDaLinha`). */
export type AjustesPorConsulta = Record<string, Record<string, AjusteDaLinha>>;

/**
 * A consulta que a simulação acompanha: filial e região. O fornecedor saiu da chave em
 * 24/11/2026 (Gabriel, spec 2026-11-24-simulador-varios-fornecedores): o filtro de fornecedor só
 * escolhe quais produtos aparecem, e os números do produto não dependem dele. Assim a edição
 * acompanha o produto em qualquer combinação de fornecedores.
 */
export const chaveDaConsulta = (codFilial: string, numRegiao: number) => `${codFilial}|${numRegiao}`;

/**
 * Junta as chaves antigas `filial|região|fornecedor` na chave nova `filial|região`, linha a linha.
 * Prioridade quando a mesma linha aparece em mais de uma: a chave nova, depois a de fornecedor
 * específico, depois a de "todos" (0). Idempotente: o que já está no formato novo fica igual.
 */
export function juntarChavesAntigas(consultas: AjustesPorConsulta): AjustesPorConsulta {
  // Quanto MAIOR, mais forte: 2 = chave nova, 1 = fornecedor específico, 0 = "todos".
  const forca = (partes: string[]) => (partes.length === 2 ? 2 : partes[2] === "0" ? 0 : 1);
  const ordenadas = Object.keys(consultas)
    .map((chave) => ({ chave, partes: chave.split("|") }))
    .filter(({ partes }) => partes.length === 2 || partes.length === 3)
    // Das fracas para as fortes: a mais forte escreve por último e vence.
    .sort((a, b) => forca(a.partes) - forca(b.partes));

  const resultado: AjustesPorConsulta = {};
  for (const { chave, partes } of ordenadas) {
    const nova = chaveDaConsulta(partes[0]!, Number(partes[1]));
    resultado[nova] = { ...resultado[nova], ...consultas[chave] };
  }
  return resultado;
}

/** O que a tela mostra: o rascunho da consulta, se houver; senão o salvo; senão nada. */
export function ajustesNaTela(
  salvos: AjustesPorConsulta,
  rascunhos: AjustesPorConsulta,
  consulta: string | null,
): Record<string, AjusteDaLinha> {
  if (consulta === null) return {};
  return rascunhos[consulta] ?? salvos[consulta] ?? {};
}

/** Uma cópia com o ajuste da linha trocado. `undefined` ou ajuste vazio apaga a linha. */
export function trocarAjuste(
  daConsulta: Record<string, AjusteDaLinha>,
  chave: string,
  novo: AjusteDaLinha | undefined,
): Record<string, AjusteDaLinha> {
  const copia = { ...daConsulta };
  if (novo === undefined || ajusteVazio(novo)) {
    delete copia[chave];
  } else {
    copia[chave] = novo;
  }
  return copia;
}

/** JSON com as chaves em ordem, para comparar ajustes pelo conteúdo e não pela ordem. */
function textoEstavel(valor: unknown): string {
  return JSON.stringify(valor, (_, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

/**
 * Quantas linhas do rascunho diferem do salvo, somando as consultas. Editar e depois desfazer
 * até voltar ao salvo NÃO conta: o contador da tela tem de voltar a zero.
 */
export function contarPendencias(salvos: AjustesPorConsulta, rascunhos: AjustesPorConsulta): number {
  let total = 0;
  for (const [consulta, rascunho] of Object.entries(rascunhos)) {
    const salvo = salvos[consulta] ?? {};
    const linhas = new Set([...Object.keys(salvo), ...Object.keys(rascunho)]);
    for (const linha of linhas) {
      if (textoEstavel(salvo[linha]) !== textoEstavel(rascunho[linha])) total++;
    }
  }
  return total;
}

/**
 * Quantos produtos novos o rascunho criou, removeu ou mudou em relação ao salvo. Desde
 * 24/11/2026 (Gabriel) os produtos novos também esperam o "Salvar simulação": `null` = sem
 * rascunho, nada pendente.
 */
export function contarPendenciasDeNovos(salvos: readonly ProdutoNovo[], rascunho: readonly ProdutoNovo[] | null): number {
  if (rascunho === null) return 0;
  const porId = (lista: readonly ProdutoNovo[]) => new Map(lista.map((n) => [n.id, textoEstavel(n)]));
  const antes = porId(salvos);
  const depois = porId(rascunho);
  let total = 0;
  for (const id of new Set([...antes.keys(), ...depois.keys()])) {
    if (antes.get(id) !== depois.get(id)) total++;
  }
  return total;
}

/** O salvo depois do Salvar: o rascunho substitui cada consulta; consulta vazia sai. */
export function salvarRascunhos(salvos: AjustesPorConsulta, rascunhos: AjustesPorConsulta): AjustesPorConsulta {
  const resultado = { ...salvos };
  for (const [consulta, rascunho] of Object.entries(rascunhos)) {
    if (Object.keys(rascunho).length === 0) {
      delete resultado[consulta];
    } else {
      resultado[consulta] = rascunho;
    }
  }
  return resultado;
}

/** O "Limpar simulações": apaga de TODAS as consultas o que foi marcado. */
export function limparSimulacao(
  s: SimulacaoGuardada,
  o: { edicoes: boolean; novos: boolean },
): SimulacaoGuardada {
  if (!o.edicoes && !o.novos) return s;
  return {
    consultas: o.edicoes ? {} : s.consultas,
    novos: o.novos ? [] : s.novos,
  };
}

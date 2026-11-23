import { ajusteVazio } from "@/lib/simuladorPreco";
import type { SimulacaoGuardada } from "@/hooks/useSimulacaoGuardada";
import type { AjusteDaLinha } from "@/types/simulador-preco";

/**
 * O rascunho da simulação e o "Salvar simulação" (spec 2026-11-23-simulador-salvar-limpar,
 * que revê a D22 só para as edições da tabela).
 *
 * As edições dos produtos da consulta ficam num RASCUNHO, na memória da aba, e só vão ao
 * localStorage quando a pessoa clica em Salvar. Os produtos novos continuam se guardando
 * sozinhos. Aqui mora só a lógica pura, conferida pelo sp13: a tela chama estas funções.
 *
 * Em PL/SQL seria o mesmo que editar numa tabela temporária e só dar o MERGE na definitiva
 * quando a pessoa confirma.
 */

/** Por consulta (`chaveDaConsulta`), e dentro dela por linha (`chaveDaLinha`). */
export type AjustesPorConsulta = Record<string, Record<string, AjusteDaLinha>>;

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

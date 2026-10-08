import { ApiError } from "@/services/apiClient";

/**
 * Confere que uma resposta do DRE é da base da sessão — e lança se não for.
 *
 * <b>É a segunda barreira, e existe de propósito.</b> A primeira é o token: a API consulta na
 * base que o JWT diz. Esta pega o que a primeira não pega: uma aba velha, um cache mal
 * chaveado, um proxy configurado para a API errada. Numa tela financeira, "os números estão
 * plausíveis, só são de outra empresa" é o pior defeito possível — porque ninguém o percebe.
 *
 * <b>Falha fechada em tudo o que não for igualdade exata:</b> resposta sem `base` (uma API
 * anterior à bifurcação), `base` nula, e sessão ainda sem base. Presumir que "deve estar
 * certo" é exatamente o que esta função existe para não fazer.
 */
export function exigirMesmaBase<T extends { base?: { id: string } | null }>(
  resposta: T,
  baseDaSessao: string | undefined,
): T {
  if (baseDaSessao === undefined) {
    throw new ApiError(
      "Não foi possível confirmar a base da sessão. Recarregue a página e entre de novo.",
      0,
    );
  }

  if (resposta.base?.id !== baseDaSessao) {
    throw new ApiError(
      `Esta resposta veio de outra base (${resposta.base?.id ?? "nenhuma"}) que a da sessão ` +
        `(${baseDaSessao}). Os números não foram exibidos. Entre de novo.`,
      409,
    );
  }

  return resposta;
}

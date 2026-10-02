"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/apiClient";
import { useSessao } from "@/hooks/useSessao";
import type {
  Apuracao,
  Detalhamento,
  Filial,
  FiltroApuracao,
  FiltroDetalhe,
  Fornecedor,
} from "@/types/dre-gerencial";

/**
 * Filiais do filtro — **só as que a pessoa logada pode apurar**.
 *
 * A API devolve o cadastro inteiro; o recorte de quem está logado vem do `PCLIB`, e viaja na
 * sessão. O cruzamento acontece aqui, num lugar só: qualquer tela que peça filiais já recebe
 * a lista certa, sem precisar lembrar de filtrar.
 *
 * <b>Isto é filtro de tela, não de acesso.</b> A rota de apuração ainda aceita qualquer filial
 * que o corpo da requisição pedir — quem montar a chamada à mão continua alcançando tudo. O
 * fechamento de verdade é o `[Authorize]` na API com as filiais lidas do token, e está na fase
 * seguinte; ver `docs/AUTENTICACAO.md`. Até lá, o que existe aqui evita o erro honesto, não o
 * mal-intencionado.
 *
 * Cadastro muda raramente, então segura por meia hora.
 */
/**
 * Busca fornecedores para o filtro, pelo que a pessoa digitou.
 *
 * <b>Só consulta a partir do segundo caractere.</b> Com um só, a busca devolveria centenas de
 * linhas que ninguém ia ler, a cada tecla — e o cadastro tem mais de treze mil fornecedores.
 *
 * <b>O `staleTime` é generoso de propósito.</b> Cadastro de fornecedor não muda durante uma
 * sessão de DRE, e quem está procurando digita, apaga e redigita o mesmo prefixo várias vezes:
 * o cache evita a viagem repetida sem custo nenhum de atualidade.
 *
 * Quem debounce é a tela, não este hook — ela é quem sabe o ritmo de quem digita.
 */
export function useBuscarFornecedores(busca: string) {
  const termo = busca.trim();

  return useQuery({
    queryKey: ["dre-gerencial", "fornecedores", termo],
    queryFn: () =>
      apiClient.get<Fornecedor[]>(
        `/api/dre-gerencial/fornecedores?busca=${encodeURIComponent(termo)}&limite=20`,
      ),
    enabled: termo.length >= 2,
    staleTime: 30 * 60 * 1000,
  });
}

export function useFiliais() {
  const { data: usuario } = useSessao();

  return useQuery({
    // A matrícula entra na chave: sem ela, trocar de usuário no mesmo navegador serviria a
    // lista da sessão anterior direto do cache.
    queryKey: ["dre-gerencial", "filiais", usuario?.matricula ?? null],
    queryFn: async () => {
      const todas = await apiClient.get<Filial[]>("/api/dre-gerencial/filiais");
      if (!usuario) return [];

      const permitidas = new Set(usuario.filiais.map(normalizarCodigo));
      return todas.filter((f) => permitidas.has(normalizarCodigo(f.codFilial)));
    },
    // Espera a sessão: sem ela o filtro devolveria lista vazia, e a tela mostraria "nenhuma
    // filial" por um instante antes de se corrigir — o que parece falta de permissão.
    enabled: usuario !== undefined && usuario !== null,
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * Os dois lados vêm de tabelas diferentes: o cadastro de filiais e o `PCLIB`. Nenhum promete
 * a mesma grafia, e `"07"` contra `"7"` é o tipo de divergência que passaria como "esta pessoa
 * não tem acesso à filial 7". Comparar pelo número quando os dois são numéricos evita isso.
 */
function normalizarCodigo(codigo: string): string {
  const texto = codigo.trim();
  const numero = Number(texto);
  return Number.isNaN(numero) ? texto.toUpperCase() : String(numero);
}

/**
 * Apuração do DRE. `useMutation` e não `useQuery`: a consulta leva dezenas de
 * segundos e quem decide quando rodar é o usuário, no botão Apurar.
 */
export function useApuracao() {
  return useMutation({
    mutationFn: (filtro: FiltroApuracao) =>
      apiClient.post<Apuracao>("/api/dre-gerencial/apuracao", paraApi(filtro)),
  });
}

/**
 * O filtro como a API o espera.
 *
 * <b>A tela guarda os fornecedores como OBJETOS</b> — precisa do nome para mostrar o que está
 * selecionado e para escrever no cabeçalho de quem é o DRE. O servidor só quer os códigos, e
 * mandar o objeto inteiro faria a desserialização falhar no primeiro campo que ele não
 * conhece.
 *
 * Lista vazia some do corpo: é o DRE inteiro, e `undefined` é o que o contrato chama de
 * "sem filtro". Mandar `[]` funcionaria igual hoje, mas documenta o oposto do que acontece.
 */
function paraApi(filtro: FiltroApuracao) {
  const { fornecedores, ...resto } = filtro;
  return {
    ...resto,
    fornecedores:
      fornecedores.length > 0 ? fornecedores.map((f) => f.codFornec) : undefined,
  };
}

/**
 * Detalhamento de uma célula — o duplo clique.
 *
 * `useMutation` pelo mesmo motivo da apuração: quem dispara é o gesto do usuário, não o
 * render. E a receita por cliente varre as mesmas notas da apuração — 116,9 s medidos com
 * um mês e três filiais.
 */
export function useDetalhe() {
  return useMutation({
    // Pelo `paraApi` como a apuração, e não pelo filtro cru: a tela guarda os fornecedores
    // como OBJETOS, e o servidor só quer os códigos. Mandar o objeto inteiro faria a
    // desserialização falhar no primeiro campo que ele não conhece — e o detalhe voltaria
    // sem filtro nenhum, mostrando a filial toda com cara de certo.
    mutationFn: ({ tipo, bloco, chave, ...filtro }: FiltroDetalhe) =>
      apiClient.post<Detalhamento>("/api/dre-gerencial/detalhe", {
        ...paraApi(filtro),
        tipo,
        bloco,
        chave,
      }),
  });
}

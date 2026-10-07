import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { decidirRepasse, sessaoMorreu } from "@/lib/servidor/decidirRepasse";
import { repassarParaApi } from "@/lib/servidor/repassarParaApi";
import { NOME_DO_COOKIE, encerrarSessao, lerSessao } from "@/lib/servidor/sessoes";
import { URL_DA_API } from "@/lib/servidor/urlDaApi";

/**
 * O BFF das rotas do DRE: o navegador chama `/api/dre-gerencial/...` aqui, e este arquivo
 * repassa à API .NET com o JWT da sessão.
 *
 * <b>Só repassa `dre-gerencial` e `health`.</b> `/api/auth/*` NÃO passa: o navegador não pode
 * chamar o login da API pulando o freio de tentativas de `app/api/sessao/route.ts`, e
 * `/api/bases` e `/api/sessao` têm arquivo próprio (rota estática vence a coringa).
 *
 * <b>401 da API encerra a sessão em memória.</b> Token sem o claim `base`, expirado, ou de
 * uma base que saiu da configuração: se a sessão ficasse, o navegador teria cookie vivo e
 * sessão morta, e cada tela daria 401 sem nunca mandar a pessoa entrar de novo.
 */
export const dynamic = "force-dynamic";

type Contexto = { params: Promise<{ caminho: string[] }> };

async function repassar(requisicao: Request, { params }: Contexto) {
  const { caminho } = await params;

  const cookieStore = await cookies();
  const id = cookieStore.get(NOME_DO_COOKIE)?.value;
  const sessao = lerSessao(id);

  // A decisão (o que passa, o que exige sessão) mora em `decidirRepasse`, que o dc87 testa.
  const decisao = decidirRepasse(caminho, sessao !== null);
  if (decisao.tipo === "recusar") {
    return NextResponse.json(
      { sucesso: false, mensagem: decisao.mensagem },
      { status: decisao.status },
    );
  }

  const consulta = new URL(requisicao.url).search;
  const resposta = await repassarParaApi(
    requisicao,
    URL_DA_API,
    `${decisao.caminho}${consulta}`,
    sessao?.token ?? null,
  );

  if (sessaoMorreu(resposta.status, sessao !== null)) {
    encerrarSessao(id);
    cookieStore.delete(NOME_DO_COOKIE);
  }

  return resposta;
}

export { repassar as GET, repassar as POST };

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NOME_DO_COOKIE, lerSessaoPublica } from "@/lib/servidor/sessoes";
import { ROTINA_DRE, podeAbrir } from "@/lib/rotinas";

/**
 * O portão do DRE.
 *
 * <b>Isto existe porque a página é um componente de cliente.</b> `page.tsx` do DRE começa com
 * `"use client"` — ela precisa de estado, de teclado e de React Query —, e uma verificação
 * feita lá roda no navegador, onde ninguém deveria decidir sobre permissão. Este layout é um
 * componente de servidor e envolve a página: ele roda antes, no processo que tem o Map das
 * sessões, e quem não pode abrir nunca recebe o HTML.
 *
 * <b>Por que não no `proxy.ts`.</b> O proxy roda antes da aplicação, num bundle separado, e
 * não enxerga a memória onde as sessões vivem — ele só consegue olhar se o cookie existe. Para
 * saber o que a pessoa pode abrir é preciso ler a sessão, e isso só acontece aqui.
 *
 * <b>O que isto NÃO faz.</b> Não protege a API: as rotas de `/api/dre-gerencial` continuam sem
 * `[Authorize]`, e quem montar a chamada à mão alcança os dados sem passar por aqui. Este é o
 * bloqueio da PÁGINA; o da API é a fase seguinte, registrada em `docs/AUTENTICACAO.md`.
 */
export default async function LayoutDoDre({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessao = lerSessaoPublica(cookieStore.get(NOME_DO_COOKIE)?.value);

  // Sem sessão viva vai para o login, como em qualquer rota. O proxy já teria desviado quem
  // chega sem cookie nenhum; aqui pega quem tem cookie apontando para sessão morta ou forjada.
  if (!sessao) {
    redirect("/login?destino=%2Fdre-gerencial");
  }

  // Com sessão, mas sem a rotina: volta para a tela inicial, que é onde a explicação está.
  //
  // <b>Volta em silêncio, sem mensagem de erro.</b> Quem chega aqui por URL digitada ou por
  // link antigo não fez nada de errado, e uma página de "acesso negado" só serviria para
  // confirmar que a rota existe. A tela inicial já diz, com todas as letras, que não há
  // rotina liberada — e diz o que fazer a respeito.
  if (!podeAbrir(sessao.usuario.rotinas, ROTINA_DRE)) {
    redirect("/");
  }

  return <>{children}</>;
}

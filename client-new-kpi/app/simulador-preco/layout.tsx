import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NOME_DO_COOKIE, lerSessaoPublica } from "@/lib/servidor/sessoes";
import { ROTINA_DRE, podeAbrir } from "@/lib/rotinas";

/**
 * O portão do simulador de preço — o mesmo desenho do portão do DRE
 * (`app/dre-gerencial/layout.tsx`), que explica por que ele é um layout de servidor e não uma
 * verificação na página.
 *
 * <b>A permissão é a do DRE</b> (decisão D4). E, ao contrário do DRE, a API do simulador
 * também a cobra: o `SimuladorPrecoController` recusa com 403 quem não tem a rotina no token.
 */
export default async function LayoutDoSimulador({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const sessao = lerSessaoPublica(cookieStore.get(NOME_DO_COOKIE)?.value);

  if (!sessao) {
    redirect("/login?destino=%2Fsimulador-preco");
  }

  if (!podeAbrir(sessao.usuario.rotinas, ROTINA_DRE)) {
    redirect("/");
  }

  return <>{children}</>;
}

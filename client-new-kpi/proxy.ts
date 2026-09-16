import { NextResponse, type NextRequest } from "next/server";
import { NOME_DO_COOKIE } from "@/lib/servidor/sessoes";

/**
 * Desvia para o login quem chega sem sessão — e guarda para onde a pessoa ia.
 *
 * <b>Chama-se `proxy.ts` e não `middleware.ts`</b>: o Next 16 renomeou o arquivo, e o nome
 * antigo está depreciado. A função é a mesma.
 *
 * <b>Isto é uma verificação otimista, não a autorização.</b> Aqui só se olha se o cookie
 * existe — não se ele aponta para uma sessão viva. A documentação do Next é explícita ao
 * dizer que o proxy não serve como gestão de sessão, e há um motivo concreto: ele roda antes
 * da aplicação, num bundle separado, e não enxerga a memória onde as sessões moram. Quem
 * valida de verdade é o `/api/sessao`, no processo que tem o Map.
 *
 * O que isto entrega é o que se espera de um desvio: ninguém vê a tela do DRE piscar antes de
 * ser mandado para o login. Um cookie forjado à mão passaria por aqui e encontraria uma tela
 * sem dado nenhum, porque a sessão não existe do outro lado.
 */

/** Rotas abertas. O resto exige sessão. */
const PUBLICAS = ["/login"];

export function proxy(requisicao: NextRequest) {
  const { pathname, search } = requisicao.nextUrl;

  if (PUBLICAS.some((rota) => pathname === rota || pathname.startsWith(`${rota}/`))) {
    return NextResponse.next();
  }

  if (requisicao.cookies.has(NOME_DO_COOKIE)) {
    return NextResponse.next();
  }

  const destino = new URL("/login", requisicao.url);

  // O caminho pedido viaja junto, para o login devolver a pessoa onde ela estava indo. Vai
  // como parâmetro, e é validado na volta — ver `lib/destinoSeguro.ts`: um caminho vindo da
  // URL é texto de quem chegou, e não se redireciona ninguém para um texto desses sem olhar.
  //
  // A raiz não precisa ser lembrada: é para lá que o login manda por padrão.
  if (pathname !== "/") {
    destino.searchParams.set("destino", `${pathname}${search}`);
  }

  return NextResponse.redirect(destino);
}

export const config = {
  /**
   * Tudo, menos o que não é página.
   *
   * `/api/sessao` fica de fora porque é justamente a rota que cria a sessão — protegê-la seria
   * exigir estar logado para poder entrar. Arquivos estáticos e o favicon saem porque não têm
   * o que proteger e pagariam o custo do desvio a cada carregamento.
   */
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)"],
};

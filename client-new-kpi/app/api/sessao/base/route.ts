import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { NOME_DO_COOKIE, trocarBase } from "@/lib/servidor/sessoes";

/**
 * A TROCA DE BASE SEM NOVO LOGIN (26/10/2026, pedido do Gabriel).
 *
 * Não fala com a API nem pede senha: a conferência foi feita no login, e aqui o BFF só passa a
 * usar outro token que já guardou — ver `trocarBase`. O cookie não muda: é a mesma sessão,
 * apontando para outra base.
 */
export async function POST(requisicao: Request) {
  let corpo: { base?: unknown };
  try {
    corpo = await requisicao.json();
  } catch {
    return NextResponse.json({ sucesso: false, mensagem: "Requisição inválida." }, { status: 400 });
  }

  const base = typeof corpo.base === "string" ? corpo.base.trim() : "";
  const cookieStore = await cookies();

  switch (trocarBase(cookieStore.get(NOME_DO_COOKIE)?.value, base)) {
    case "trocou":
      return NextResponse.json({ sucesso: true });
    case "sem-sessao":
      return NextResponse.json(
        { sucesso: false, mensagem: "Sessão expirada ou ausente. Entre novamente." },
        { status: 401 },
      );
    case "base-desconhecida":
      return NextResponse.json(
        {
          sucesso: false,
          mensagem: "Esta base não está disponível nesta sessão. Entre nela pelo login.",
        },
        { status: 400 },
      );
  }
}

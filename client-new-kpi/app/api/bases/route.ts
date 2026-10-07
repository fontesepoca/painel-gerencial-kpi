import { NextResponse } from "next/server";
import { enderecoDaApi } from "@/lib/servidor/urlDaApi";

/**
 * As bases do seletor do login. Público, como o próprio login: antes de haver sessão a tela
 * precisa saber o que oferecer.
 *
 * Só repassa `GET /api/auth/bases` da API, que devolve id e rótulo — nunca host, usuário nem
 * string de conexão. `/api/bases` tem arquivo próprio porque o proxy de `app/api/[...caminho]`
 * não repassa `auth/*`, de propósito.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const resposta = await fetch(enderecoDaApi("/api/auth/bases"), { cache: "no-store" });
    const conteudo = await resposta.json();
    return NextResponse.json(conteudo, { status: resposta.status });
  } catch {
    return NextResponse.json(
      { sucesso: false, mensagem: "Não foi possível falar com o servidor. Tente de novo." },
      { status: 502 },
    );
  }
}

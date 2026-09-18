import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  NOME_DO_COOKIE,
  criarSessao,
  encerrarSessao,
  lerSessaoPublica,
} from "@/lib/servidor/sessoes";
import { esquecerTentativas, registrarTentativa } from "@/lib/servidor/limiteDeTentativas";

/**
 * A sessão do navegador — o BFF do login.
 *
 * <b>Só este arquivo fala com `/api/auth` da API .NET.</b> O navegador nunca vê o JWT: ele
 * envia usuário e senha para cá, e recebe de volta um cookie `HttpOnly` com um identificador
 * opaco. O token fica na memória do Next — ver `lib/servidor/sessoes.ts`.
 *
 * `POST` entra · `GET` diz quem está logado · `DELETE` sai.
 */

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5207";

/** Oito horas, o mesmo fôlego do token — o cookie não deve sobreviver ao que ele aponta. */
const VALIDADE_DO_COOKIE_SEGUNDOS = 8 * 60 * 60;

interface RespostaDaApi {
  sucesso: boolean;
  mensagem?: string | null;
  dados?: {
    token: string;
    expiraEm: string;
    usuario: {
      matricula: number;
      nome: string;
      nomeGuerra: string;
      filiais: string[];
      rotinas: string[];
    };
  } | null;
}

export async function POST(requisicao: Request) {
  let corpo: { login?: unknown; senha?: unknown };

  try {
    corpo = await requisicao.json();
  } catch {
    return NextResponse.json(
      { sucesso: false, mensagem: "Requisição inválida." },
      { status: 400 },
    );
  }

  const login = typeof corpo.login === "string" ? corpo.login.trim() : "";
  const senha = typeof corpo.senha === "string" ? corpo.senha : "";

  if (!login || !senha) {
    return NextResponse.json(
      { sucesso: false, mensagem: "Preencha o usuário e a senha." },
      { status: 400 },
    );
  }

  const freio = registrarTentativa(await enderecoDeOrigem(), login);
  if (!freio.liberado) {
    // 429 com `Retry-After`: é o cabeçalho que o navegador e qualquer cliente HTTP entendem
    // sem precisar ler o corpo da resposta.
    return NextResponse.json(
      {
        sucesso: false,
        mensagem:
          `Muitas tentativas seguidas. Espere ${Math.ceil(freio.esperarSegundos / 60)} ` +
          "minuto(s) e tente de novo.",
      },
      { status: 429, headers: { "Retry-After": String(freio.esperarSegundos) } },
    );
  }

  let resposta: Response;
  try {
    resposta = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, senha }),
      // Nunca cacheia: é uma verificação de senha, e o resultado vale só para esta chamada.
      cache: "no-store",
    });
  } catch {
    // A API fora do ar é um caso que o contador acima já registrou, e é o que a pessoa vê
    // quando o back não subiu. Dizer "usuário ou senha incorretos" aqui a faria trocar a
    // senha para resolver um problema que não é dela.
    return NextResponse.json(
      { sucesso: false, mensagem: "Não foi possível falar com o servidor. Tente de novo." },
      { status: 502 },
    );
  }

  const conteudo = (await resposta.json().catch(() => null)) as RespostaDaApi | null;

  if (!resposta.ok || !conteudo?.sucesso || !conteudo.dados) {
    // A mensagem vem da API, que é quem sabe o motivo — senha errada, cadastro inativo, falta
    // de permissão. Repetir a decisão aqui seria manter duas listas de mensagens em sincronia.
    return NextResponse.json(
      { sucesso: false, mensagem: conteudo?.mensagem ?? "Não foi possível entrar." },
      { status: resposta.status === 400 ? 400 : 401 },
    );
  }

  const { token, expiraEm, usuario } = conteudo.dados;

  const id = criarSessao(token, new Date(expiraEm), {
    matricula: usuario.matricula,
    nome: usuario.nome,
    nomeGuerra: usuario.nomeGuerra,
    filiais: usuario.filiais,
    // `?? []` porque uma API mais antiga que este campo devolveria `undefined`, e aí
    // ninguém abriria nada — o que é o padrão seguro, mas quebrado de um jeito difícil de
    // diagnosticar. Com a lista vazia explícita, a tela inicial diz o que está acontecendo.
    rotinas: usuario.rotinas ?? [],
  });

  esquecerTentativas(await enderecoDeOrigem(), login);

  const cookieStore = await cookies();
  cookieStore.set(NOME_DO_COOKIE, id, {
    httpOnly: true,
    // `lax` e não `strict`: com `strict` o cookie não acompanha a primeira navegação vinda de
    // um link externo, e quem clicasse no endereço da tela num e-mail cairia no login mesmo
    // com sessão viva. `lax` já barra o envio em requisição de outro site.
    sameSite: "lax",
    // Em desenvolvimento o endereço é http, e um cookie `Secure` simplesmente não seria
    // gravado — o login pareceria funcionar e nunca logaria ninguém.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: VALIDADE_DO_COOKIE_SEGUNDOS,
  });

  // A resposta leva o usuário, nunca o token.
  return NextResponse.json({ sucesso: true, dados: usuario });
}

/** Quem está logado — ou 401 limpo, que é o que a tela usa para saber que precisa entrar. */
export async function GET() {
  const cookieStore = await cookies();
  const sessao = lerSessaoPublica(cookieStore.get(NOME_DO_COOKIE)?.value);

  if (!sessao) {
    return NextResponse.json({ sucesso: false, mensagem: "Sem sessão." }, { status: 401 });
  }

  return NextResponse.json({ sucesso: true, dados: sessao.usuario });
}

export async function DELETE() {
  const cookieStore = await cookies();
  const id = cookieStore.get(NOME_DO_COOKIE)?.value;

  // Apaga dos DOIS lados. Só limpar o cookie deixaria a sessão viva no servidor, válida para
  // quem tivesse copiado o identificador — e "sair" tem de significar sair.
  encerrarSessao(id);
  cookieStore.delete(NOME_DO_COOKIE);

  return NextResponse.json({ sucesso: true });
}

/**
 * O IP de quem chamou, para o freio de tentativas.
 *
 * Atrás de proxy reverso, `x-forwarded-for` traz a cadeia inteira e o primeiro é o cliente.
 * <b>É um cabeçalho que o cliente pode forjar</b>, então ele não serve para autorizar nada —
 * só para agrupar tentativas. Quem forja ganha um balde separado; quem não forja fica no
 * dele, que é o que precisamos.
 */
async function enderecoDeOrigem(): Promise<string> {
  const cabecalhos = await headers();
  const encaminhado = cabecalhos.get("x-forwarded-for");

  if (encaminhado) return encaminhado.split(",")[0]!.trim();
  return cabecalhos.get("x-real-ip") ?? "desconhecido";
}

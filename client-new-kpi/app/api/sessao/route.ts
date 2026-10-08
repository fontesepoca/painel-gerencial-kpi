import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  NOME_DO_COOKIE,
  criarSessao,
  encerrarSessao,
  lerSessaoPublica,
} from "@/lib/servidor/sessoes";
import { esquecerTentativas, registrarTentativa } from "@/lib/servidor/limiteDeTentativas";
import { enderecoDaApi } from "@/lib/servidor/urlDaApi";

/**
 * A sessão do navegador — o BFF do login.
 *
 * <b>Só este arquivo fala com `/api/auth` da API .NET.</b> O navegador nunca vê o JWT: ele
 * envia usuário e senha para cá, e recebe de volta um cookie `HttpOnly` com um identificador
 * opaco. O token fica na memória do Next — ver `lib/servidor/sessoes.ts`.
 *
 * `POST` entra · `GET` diz quem está logado · `DELETE` sai.
 */

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
      base: { id: string; rotulo: string };
    };
  } | null;
}

/**
 * Se o navegador chegou por https — o que decide se o cookie pode ser `Secure`.
 *
 * <b>`x-forwarded-proto` vem primeiro</b> porque atrás de um proxy reverso que termina TLS a
 * requisição interna é http, e só esse cabeçalho sabe que a externa era https. Sem proxy, ele
 * não existe e vale o protocolo da própria URL.
 *
 * <b>O cabeçalho é forjável por quem chama.</b> Dizer `https` sendo http faz o cookie sair
 * `Secure` e o próprio navegador o descartar — quem forja só se prejudica. O caminho que
 * importaria, dizer `http` sendo https, exige já estar no meio da conexão, e aí o cookie não
 * é a primeira preocupação. Quando houver proxy reverso na frente, ele deve sobrescrever este
 * cabeçalho em vez de repassar o que veio.
 */
async function conexaoSegura(requisicao: Request): Promise<boolean> {
  const repassado = (await headers()).get("x-forwarded-proto");

  if (repassado) {
    // Pode vir como lista quando há mais de um proxy: `https, http`. O primeiro é o de fora.
    return repassado.split(",")[0]?.trim().toLowerCase() === "https";
  }

  try {
    return new URL(requisicao.url).protocol === "https:";
  } catch {
    // URL impossível de ler não deveria acontecer numa requisição que chegou até aqui. Se
    // acontecer, `false` mantém o login funcionando em vez de quebrá-lo — o cookie continua
    // `HttpOnly` e `SameSite=Lax`, que é o que protege de script e de outro site.
    return false;
  }
}
export async function POST(requisicao: Request) {
  let corpo: { login?: unknown; senha?: unknown; base?: unknown };

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
  // A base NÃO é validada aqui: quem sabe quais bases existem é a API, e repetir a lista no
  // BFF seria mantê-la em dois lugares. Vazia ou desconhecida, a API responde 400 com a
  // mensagem certa, e o 400 passa como está (item 7).
  const base = typeof corpo.base === "string" ? corpo.base.trim() : "";

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
    resposta = await fetch(enderecoDaApi("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, senha, base }),
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
    // 400 (campo ou base inválida) e 503 (a base não respondeu) passam como são. O 503 em
    // especial: virar 401 faria a pessoa ler "usuário ou senha incorretos" para um banco fora
    // do ar, e ela trocaria a senha para resolver um problema que não é dela.
    const repassa = resposta.status === 400 || resposta.status === 503;
    return NextResponse.json(
      { sucesso: false, mensagem: conteudo?.mensagem ?? "Não foi possível entrar." },
      { status: repassa ? resposta.status : 401 },
    );
  }

  const { token, expiraEm, usuario } = conteudo.dados;

  // Uma API que não diz a base é uma API anterior à bifurcação (ou um defeito dela). Seguir
  // criaria uma sessão que o proxy recusaria na primeira chamada, com um 401 que ninguém
  // saberia explicar.
  if (!usuario.base?.id) {
    return NextResponse.json(
      { sucesso: false, mensagem: "A API não informou a base da sessão. Atualize a API e tente de novo." },
      { status: 502 },
    );
  }

  const id = criarSessao(token, new Date(expiraEm), {
    matricula: usuario.matricula,
    nome: usuario.nome,
    nomeGuerra: usuario.nomeGuerra,
    filiais: usuario.filiais,
    // `?? []` porque uma API mais antiga que este campo devolveria `undefined`, e aí
    // ninguém abriria nada — o que é o padrão seguro, mas quebrado de um jeito difícil de
    // diagnosticar. Com a lista vazia explícita, a tela inicial diz o que está acontecendo.
    rotinas: usuario.rotinas ?? [],
    base: usuario.base,
  });

  esquecerTentativas(await enderecoDeOrigem(), login);

  const cookieStore = await cookies();
  cookieStore.set(NOME_DO_COOKIE, id, {
    httpOnly: true,
    // `lax` e não `strict`: com `strict` o cookie não acompanha a primeira navegação vinda de
    // um link externo, e quem clicasse no endereço da tela num e-mail cairia no login mesmo
    // com sessão viva. `lax` já barra o envio em requisição de outro site.
    sameSite: "lax",
    // `Secure` acompanha a CONEXÃO, não o ambiente.
    //
    // Aqui havia `NODE_ENV === "production"`, e ele derrubou o login no Docker em
    // 18/09/2026: no container o Next roda em produção, o acesso era por http, e o navegador
    // DESCARTA um cookie `Secure` em conexão não-segura — sem erro, sem aviso. O login dava
    // certo, a sessão era criada, o cookie sumia, o proxy mandava de volta para o login. Na
    // tela, parecia que a página tinha recarregado.
    //
    // Ambiente e protocolo são coisas diferentes: há desenvolvimento em https e produção em
    // http atrás de rede interna, que é justamente o caso desta empresa hoje.
    secure: await conexaoSegura(requisicao),
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

import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NOME_DO_COOKIE, lerSessaoPublica } from "@/lib/servidor/sessoes";
import { BotaoSair } from "@/components/layout/BotaoSair";

/**
 * A tela inicial: por onde se escolhe a rotina.
 *
 * <b>Aqui a sessão é conferida de verdade.</b> O proxy só olha se o cookie existe — ele roda
 * antes da aplicação e não enxerga a memória onde as sessões vivem. Este componente roda no
 * processo que tem o Map, então um cookie forjado ou apontando para uma sessão já expirada
 * cai no `redirect` abaixo em vez de ver a página.
 */
export default async function Home() {
  const cookieStore = await cookies();
  const sessao = lerSessaoPublica(cookieStore.get(NOME_DO_COOKIE)?.value);

  if (!sessao) {
    redirect("/login");
  }

  const { usuario } = sessao;
  const primeiroNome = usuario.nome.split(" ")[0] ?? usuario.nomeGuerra;

  return (
    <main className="min-h-dvh bg-[var(--bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 sm:px-6">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--primary)] text-sm font-semibold text-white"
        >
          E
        </span>
        <span className="text-[length:var(--fs-base)] font-semibold text-[var(--text-primary)]">
          Época KPI
        </span>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-[length:var(--fs-apoio)] text-[var(--text-secondary)] sm:inline">
            {usuario.nomeGuerra}
          </span>
          <BotaoSair />
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8 flex flex-col gap-2">
          <h1 className="text-[length:var(--fs-titulo)] font-semibold text-[var(--text-primary)]">
            Olá, {primeiroNome}
          </h1>
          <p className="text-[length:var(--fs-base)] text-[var(--text-secondary)]">
            {/* O número de filiais é a informação que mais importa aqui: é o recorte que a
                pessoa vai apurar, e vê-lo antes de abrir a rotina evita a descoberta no
                meio de uma consulta de dois minutos. */}
            Você tem acesso a {usuario.filiais.length}{" "}
            {usuario.filiais.length === 1 ? "filial" : "filiais"}: {usuario.filiais.join(", ")}.
          </p>
        </div>

        <h2 className="mb-3 text-[length:var(--fs-rotulo)] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase">
          Rotinas
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <CartaoDeRotina
            href="/dre-gerencial"
            codigo="9815"
            nome="DRE Gerencial"
            descricao="Demonstrativo de resultado por filial, com quatro dimensões de análise e detalhamento por duplo clique."
          />

          {/* Uma rotina só, e a grade já é de duas colunas: o espaço vazio ao lado é a
              promessa de que virão outras — e evita reescrever esta tela quando vierem. */}
        </div>
      </div>
    </main>
  );
}

function CartaoDeRotina({
  href,
  codigo,
  nome,
  descricao,
}: {
  href: string;
  codigo: string;
  nome: string;
  descricao: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-5 transition-colors hover:border-[var(--border-focus)] hover:bg-[var(--surface-2)] focus-visible:border-[var(--primary)] focus-visible:outline-none"
    >
      <span className="flex items-center gap-2">
        <span className="rounded-[var(--radius-sm)] bg-[var(--primary-glow)] px-2 py-0.5 text-[length:var(--fs-rotulo)] font-semibold tracking-[0.1em] text-[var(--primary)]">
          {codigo}
        </span>
        <span className="text-[length:var(--fs-base)] font-semibold text-[var(--text-primary)]">
          {nome}
        </span>
        <span
          aria-hidden
          className="ml-auto text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--primary)]"
        >
          →
        </span>
      </span>
      <p className="text-[length:var(--fs-apoio)] leading-relaxed text-[var(--text-secondary)]">
        {descricao}
      </p>
    </Link>
  );
}

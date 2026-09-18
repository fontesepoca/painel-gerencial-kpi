import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NOME_DO_COOKIE, lerSessaoPublica } from "@/lib/servidor/sessoes";
import { MenuDoUsuario } from "@/components/layout/MenuDoUsuario";
import { ControlesDeExibicao } from "@/components/layout/ControlesDeExibicao";

/**
 * A tela inicial: por onde se escolhe a rotina.
 *
 * <b>Aqui a sessão é conferida de verdade.</b> O proxy só olha se o cookie existe — ele roda
 * antes da aplicação e não enxerga a memória onde as sessões vivem. Este componente roda no
 * processo que tem o Map, então um cookie forjado, ou apontando para uma sessão já expirada,
 * cai no `redirect` abaixo em vez de ver a página.
 */
export default async function Home() {
  const cookieStore = await cookies();
  const sessao = lerSessaoPublica(cookieStore.get(NOME_DO_COOKIE)?.value);

  if (!sessao) {
    redirect("/login");
  }

  const { usuario } = sessao;
  const primeiroNome = usuario.nome.trim().split(/\s+/)[0] ?? usuario.nomeGuerra;

  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      <header className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-2.5 sm:px-6">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--primary)] text-sm font-semibold text-white"
        >
          E
        </span>
        <span className="text-[length:var(--fs-base)] font-semibold text-[var(--text-primary)]">
          Época Analytics
        </span>

        <div className="ml-auto flex items-center gap-2">
          <ControlesDeExibicao />

          {/* Separador: o menu do usuário é de outra natureza que os interruptores — um
              controla a sessão, os outros a aparência. */}
          <span aria-hidden className="mx-1 h-6 w-px bg-[var(--border-strong)]" />
          <MenuDoUsuario />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-10 flex flex-col gap-1.5">
          <p className="text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
            {saudacao()}
          </p>
          <h1 className="text-[length:var(--fs-titulo)] font-semibold text-[var(--text-primary)]">
            {primeiroNome}
          </h1>
        </div>

        <h2 className="mb-3 text-[length:var(--fs-rotulo)] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase">
          Rotinas disponíveis
        </h2>

        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <CartaoDeRotina
            href="/dre-gerencial"
            codigo="9815"
            nome="DRE Gerencial"
            descricao="Demonstrativo de resultado por filial e período, em quatro dimensões de análise, com detalhamento por duplo clique e exportação."
          />

          {/* O cartão de acesso ao lado da rotina, e não escondido no menu: a pergunta
              "por que a filial 12 não aparece" nasce aqui, antes de a pessoa abrir o DRE e
              esperar dois minutos por uma apuração que não tem a filial que ela queria. */}
          <aside className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-5">
            <span className="text-[length:var(--fs-rotulo)] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase">
              Seu acesso
            </span>

            <div className="flex flex-wrap gap-1">
              {usuario.filiais.map((filial) => (
                <span
                  key={filial}
                  className="tabular rounded-[var(--radius-sm)] bg-[var(--surface-3)] px-2 py-0.5 text-[length:var(--fs-apoio)] text-[var(--text-secondary)]"
                >
                  {filial}
                </span>
              ))}
            </div>

            <p className="text-[length:var(--fs-apoio)] leading-relaxed text-[var(--text-muted)]">
              {usuario.filiais.length === 1
                ? "Uma filial liberada"
                : `${usuario.filiais.length} filiais liberadas`}{" "}
              no Winthor. O acesso às rotinas é o mesmo de lá — mudanças passam a valer no
              próximo login.
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}

/**
 * Bom dia, boa tarde, boa noite.
 *
 * <b>Calculada no servidor</b>, junto com o resto da página. Se fosse no cliente, o texto
 * mudaria depois da hidratação em qualquer visita perto da virada da hora — e uma saudação
 * que troca sozinha na frente de quem está lendo é exatamente o tipo de detalhe que faz
 * duvidar do resto da tela.
 *
 * O servidor e o usuário estão no mesmo fuso aqui: a API, o banco e as pessoas vivem todos
 * em Goiás.
 */
function saudacao(): string {
  const hora = new Date().getHours();
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
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
      className="group flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-5 transition-colors hover:border-[var(--border-focus)] hover:bg-[var(--surface-2)] focus-visible:border-[var(--primary)] focus-visible:outline-none"
    >
      <span className="flex items-center gap-2">
        <span className="tabular rounded-[var(--radius-sm)] bg-[var(--primary-glow)] px-2 py-0.5 text-[length:var(--fs-rotulo)] font-semibold tracking-[0.1em] text-[var(--primary)]">
          {codigo}
        </span>
        <span className="text-[length:var(--fs-base)] font-semibold text-[var(--text-primary)]">
          {nome}
        </span>
        <span
          aria-hidden
          className="ml-auto text-[var(--text-muted)] transition-transform duration-[var(--dur-fast)] group-hover:translate-x-0.5 group-hover:text-[var(--primary)]"
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

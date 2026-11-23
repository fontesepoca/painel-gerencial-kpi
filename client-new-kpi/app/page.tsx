import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NOME_DO_COOKIE, lerSessaoPublica } from "@/lib/servidor/sessoes";
import { AppShell } from "@/components/layout/AppShell";
import { IconeDaTela } from "@/components/layout/Icones";
import type { IconeDeTela } from "@/lib/navegacao";
import { ROTINA_DRE, podeAbrir } from "@/lib/rotinas";

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
  const temDre = podeAbrir(usuario.rotinas, ROTINA_DRE);

  return (
    // A MESMA CASCA DAS ROTINAS (12/11/2026): a barra de módulos à esquerda é a navegação, e
    // ela tem de estar também aqui, que é de onde se sai para qualquer tela. O `h1` é o da
    // trilha ("Início"); o nome da pessoa é saudação, não título.
    <AppShell trilha={["Época Analytics", "Início"]}>
      <div className="mx-auto w-full max-w-5xl px-1 py-6 sm:px-2 sm:py-10">
        <div className="mb-10 flex flex-col gap-1.5">
          <p className="text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
            {saudacao()}
          </p>
          <p className="text-[length:var(--fs-titulo)] font-semibold text-[var(--text-primary)]">
            {primeiroNome}
          </p>
        </div>

        {temDre ? (
          <>
            <h2 className="mb-3 text-[length:var(--fs-rotulo)] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase">
              Rotinas disponíveis
            </h2>

            <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
              <CartaoDeRotina
                href="/dre-gerencial"
                icone="dre"
                nome="DRE Gerencial"
                descricao="Demonstrativo de resultado por filial e período, em quatro dimensões de análise, com detalhamento por duplo clique e exportação."
              />

              {/* O cartão de acesso ao lado da rotina, e não escondido no menu: a pergunta
                  "por que a filial 12 não aparece" nasce aqui, antes de a pessoa abrir o DRE
                  e esperar dois minutos por uma apuração sem a filial que ela queria. */}
              <SeuAcesso filiais={usuario.filiais} />
            </div>
          </>
        ) : (
          <SemRotinas />
        )}
      </div>
    </AppShell>
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

/**
 * A tela de quem entrou e não tem nada para abrir.
 *
 * <b>Esta pessoa não errou nada.</b> Digitou usuário e senha certos, e o sistema a reconheceu
 * — o que falta é liberação no Winthor. Até 18/09/2026 ela era barrada no login com "Você não
 * tem acesso ao DRE Gerencial", numa tela onde a única ação possível era fechar a aba; o texto
 * soava como senha errada e a pessoa tentava de novo.
 *
 * Por isso o tom não é de erro: sem ícone de alerta, sem cor de aviso.
 *
 * <b>E sem detalhe técnico.</b> A primeira versão listava o que pedir — a guia 4-DRE da 9815,
 * uma filial no PCLIB. Saiu a pedido do Gabriel em 18/09/2026, e ele tem razão: nada disso é
 * acionável por quem lê. Quem precisa desses nomes é o setor de TI, e eles estão no log da
 * API, gravados no momento do login, com qual das condições faltou.
 */
function SemRotinas() {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] px-6 py-12 sm:px-10 sm:py-16">
      <div className="mx-auto flex max-w-md flex-col gap-3 text-center">
        <h2 className="text-[length:var(--fs-secao)] font-semibold text-[var(--text-primary)]">
          Você ainda não tem nada por aqui
        </h2>

        <p className="text-[length:var(--fs-base)] leading-relaxed text-[var(--text-secondary)]">
          Se estiver precisando de alguma rotina, entre em contato com o setor de TI.
        </p>
      </div>
    </div>
  );
}

/**
 * As filiais que a pessoa pode apurar, ao lado da rotina.
 *
 * Só aparece para quem tem o DRE — quem não tem também não tem filial que importe, e o
 * painel viraria uma caixa vazia ao lado de uma explicação.
 */
function SeuAcesso({ filiais }: { filiais: readonly string[] }) {
  return (
    <aside className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-5">
      <span className="text-[length:var(--fs-rotulo)] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase">
        Seu acesso
      </span>

      <div className="flex flex-wrap gap-1">
        {filiais.map((filial) => (
          <span
            key={filial}
            className="tabular rounded-[var(--radius-sm)] bg-[var(--surface-3)] px-2 py-0.5 text-[length:var(--fs-apoio)] text-[var(--text-secondary)]"
          >
            {filial}
          </span>
        ))}
      </div>

      <p className="text-[length:var(--fs-apoio)] leading-relaxed text-[var(--text-muted)]">
        {filiais.length === 1
          ? "Uma filial liberada"
          : `${filiais.length} filiais liberadas`}{" "}
        no Winthor. O acesso às rotinas é o mesmo de lá — mudanças passam a valer no próximo
        login.
      </p>
    </aside>
  );
}

function CartaoDeRotina({
  href,
  icone,
  nome,
  descricao,
}: {
  href: string;
  icone: IconeDeTela;
  nome: string;
  descricao: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-5 transition-colors hover:border-[var(--border-focus)] hover:bg-[var(--surface-2)] focus-visible:border-[var(--primary)] focus-visible:outline-none"
    >
      <span className="flex items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--primary-glow)] text-[var(--primary)]">
          <IconeDaTela icone={icone} className="size-[18px]" />
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

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { destinoSeguro } from "@/lib/destinoSeguro";

/**
 * O formulário de entrada.
 *
 * Fala com `/api/sessao` — a rota do nosso servidor —, nunca com a API .NET direto. É o que
 * mantém o token fora do navegador: aqui nem existe a palavra "token".
 */
export function FormularioDeLogin() {
  const router = useRouter();
  const parametros = useSearchParams();

  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    if (entrando) return;

    setErro(null);
    setEntrando(true);

    try {
      const resposta = await fetch("/api/sessao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, senha }),
      });

      const conteudo = await resposta.json().catch(() => null);

      if (!resposta.ok || !conteudo?.sucesso) {
        setErro(conteudo?.mensagem ?? "Não foi possível entrar.");
        // A senha sai do campo, o usuário fica. Quem errou vai digitar a senha de novo, e
        // deixá-la na tela só atrapalha; o nome de guerra quase nunca é o que estava errado.
        setSenha("");
        return;
      }

      // De volta para onde a pessoa ia antes de ser desviada — validado, porque veio da URL.
      const destino = destinoSeguro(parametros.get("destino"));

      // `refresh` antes do `push`: os componentes de servidor precisam ser renderizados de
      // novo já com o cookie novo, senão a tela de destino aparece como se não houvesse
      // sessão e o proxy manda de volta para o login.
      router.refresh();
      router.push(destino);
    } catch {
      setErro("Não foi possível falar com o servidor. Tente de novo.");
      setSenha("");
    } finally {
      setEntrando(false);
    }
  }

  return (
    <form onSubmit={entrar} className="flex flex-col gap-4">
      <Campo
        id="login"
        rotulo="Usuário"
        dica="O mesmo nome de guerra do Winthor"
        valor={login}
        aoMudar={setLogin}
        autoComplete="username"
        autoFocus
      />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="senha"
          className="text-[length:var(--fs-rotulo)] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase"
        >
          Senha
        </label>
        <div className="relative">
          <input
            id="senha"
            name="senha"
            type={mostrarSenha ? "text" : "password"}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
            className="campo-login pr-12"
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            // O rótulo diz a AÇÃO, não o estado: "mostrar senha" é o que acontece ao clicar.
            aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={mostrarSenha}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-[var(--radius-sm)] p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          >
            <OlhoIcone aberto={mostrarSenha} />
          </button>
        </div>
      </div>

      {/* `role="alert"` para o leitor de tela anunciar o erro assim que ele aparece: sem isso,
          quem não vê a tela aperta Entrar e não recebe resposta nenhuma. */}
      {erro && (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--negative)] bg-[var(--negative-glow)] px-3 py-2.5 text-[length:var(--fs-apoio)] leading-relaxed text-[var(--text-primary)]"
        >
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={entrando}
        className="mt-1 flex h-[var(--altura-controle)] items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] px-5 text-[length:var(--fs-base)] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {entrando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

function Campo({
  id,
  rotulo,
  dica,
  valor,
  aoMudar,
  autoComplete,
  autoFocus,
}: {
  id: string;
  rotulo: string;
  dica?: string;
  valor: string;
  aoMudar: (valor: string) => void;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  const idDica = dica ? `${id}-dica` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[length:var(--fs-rotulo)] font-medium tracking-[0.14em] text-[var(--text-muted)] uppercase"
      >
        {rotulo}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-describedby={idDica}
        required
        className="campo-login"
      />
      {dica && (
        <p id={idDica} className="text-[length:var(--fs-apoio)] text-[var(--text-muted)]">
          {dica}
        </p>
      )}
    </div>
  );
}

/** Ícone próprio, em SVG. O projeto não tem biblioteca de ícones, e não vai ganhar uma por isto. */
function OlhoIcone({ aberto }: { aberto: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[1.125rem]"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {aberto && <path d="m4 20 16-16" />}
    </svg>
  );
}

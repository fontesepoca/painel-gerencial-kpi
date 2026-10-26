"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSessao } from "@/hooks/useSessao";
import { avisarTroca, destinoDaTroca, trocasPermitidas } from "@/lib/trocasDeBase";

/**
 * A TROCA DE BASE NO CABEÇALHO (26/10/2026, pedido do Gabriel).
 *
 * Primeiro ela morava dentro do menu do usuário, e ninguém a acharia sem abrir o menu. Agora é
 * um botão à vista, no mesmo desenho dos interruptores de tema e de leitura — borda, fundo e
 * altura iguais —, com o ícone de setas em sentidos opostos, que é o símbolo de "trocar". O
 * rótulo diz a ação e o destino ("Trocar para Minas Rural"), a pedido do Gabriel: só o nome da
 * base podia ser lido como a base de agora.
 *
 * Só aparece quando há para onde trocar AQUI: com uma rotina aberta, só a base que também a
 * tem (`trocasPermitidas`, R4). Sem troca, não ocupa espaço nenhum no cabeçalho.
 */
export function BotaoTrocaDeBase() {
  const { data: usuario } = useSessao();
  const caminho = usePathname();
  const [trocando, setTrocando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const trocas = trocasPermitidas(usuario?.trocas, caminho);
  if (trocas.length === 0) return null;

  /**
   * Navegação dura, pelo motivo do "Sair": o cache do React Query, os filtros e a tabela de
   * uma base não podem aparecer na outra. Vai para a RAIZ da rotina aberta (`destinoDaTroca`),
   * não para a subrota: o detalhamento mostraria o que foi guardado na base anterior. As
   * outras abas recebem o aviso e recarregam também (`avisarTroca`).
   */
  async function trocar(base: string) {
    if (trocando) return;
    setTrocando(base);
    setErro(null);

    try {
      const resposta = await fetch("/api/sessao/base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base }),
      });

      if (!resposta.ok) {
        const conteudo = await resposta.json().catch(() => null);
        setErro(conteudo?.mensagem ?? "Não foi possível trocar de base.");
        setTrocando(null);
        return;
      }

      avisarTroca(base);
      window.location.replace(destinoDaTroca(window.location.pathname));
    } catch {
      setErro("Não foi possível falar com o servidor. Tente de novo.");
      setTrocando(null);
    }
  }

  return (
    <div className="nao-imprime relative flex items-center gap-2">
      {trocas.map((t) => (
        <button
          key={t.base.id}
          type="button"
          onClick={() => trocar(t.base.id)}
          disabled={trocando !== null}
          aria-label={`Trocar para a base ${t.base.rotulo}`}
          title={`Trocar para a base ${t.base.rotulo}, sem entrar de novo`}
          className="flex shrink-0 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[length:var(--fs-apoio)] text-[var(--text-secondary)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--text-primary)] disabled:cursor-wait disabled:opacity-70"
        >
          <span aria-hidden className="text-[var(--primary)]">
            <SetasDeTroca />
          </span>
          <span className="hidden whitespace-nowrap md:inline">
            {trocando === t.base.id ? "Trocando…" : `Trocar para ${t.base.rotulo}`}
          </span>
        </button>
      ))}

      {/* O erro sai logo abaixo do botão, e não num alerta do navegador: quem clicou está
          olhando para ele. `role="alert"` para o leitor de tela anunciar. */}
      {erro && (
        <p
          role="alert"
          className="absolute top-[calc(100%+0.5rem)] right-0 z-50 w-64 rounded-[var(--radius-md)] border border-[var(--negative)] bg-[var(--surface-1)] px-3 py-2 text-[length:var(--fs-apoio)] text-[var(--text-primary)] shadow-[var(--shadow-card)]"
        >
          {erro}
        </p>
      )}
    </div>
  );
}

/**
 * Duas setas em sentidos opostos — o símbolo de trocar.
 *
 * NÍTIDO DE PROPÓSITO (pedido do Gabriel): desenhado num grid de 18 e mostrado a 18px, um
 * para um — cada unidade do desenho cai num pixel, e as hastes horizontais, com traço de 2
 * em coordenada inteira, ocupam dois pixels cheios em vez de três meio apagados. Com o
 * grid de 24 do sol e da lua, a 14px, o traço saía com 1,17px e borrava.
 */
function SetasDeTroca() {
  return (
    <svg
      viewBox="0 0 18 18"
      className="block size-[1.125rem]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h12M11 2l4 4-4 4" />
      <path d="M15 12H3M7 8l-4 4 4 4" />
    </svg>
  );
}

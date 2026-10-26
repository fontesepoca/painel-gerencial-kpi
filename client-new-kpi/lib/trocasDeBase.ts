import { CAMINHO_DA_ROTINA } from "@/lib/rotinas";

/** Uma base para a qual a sessão pode trocar sem novo login — espelha `TrocaDeBase` do BFF. */
export interface TrocaDeBase {
  base: { id: string; rotulo: string };
  rotinas: string[];
}

/** A rotina aberta, lida do endereço — ou `null` fora de rotina (tela inicial). */
export function rotinaDoCaminho(caminho: string): string | null {
  for (const [codigo, raiz] of Object.entries(CAMINHO_DA_ROTINA)) {
    if (caminho === raiz || caminho.startsWith(`${raiz}/`)) return codigo;
  }
  return null;
}

/**
 * Para onde a página vai depois da troca: a RAIZ da rotina aberta, ou o endereço de agora fora
 * de rotina.
 *
 * Não o endereço exato (revisão final, 26/10/2026): uma subrota como o detalhamento mostra o
 * que foi guardado no navegador na base anterior, e recarregá-la poria números de uma empresa
 * sob a sessão da outra. A raiz da rotina parte do zero.
 */
export function destinoDaTroca(caminho: string): string {
  const rotina = rotinaDoCaminho(caminho);
  return rotina === null ? caminho : (CAMINHO_DA_ROTINA[rotina] ?? "/");
}

/**
 * As trocas que o menu oferece AQUI (R4, pedido do Gabriel em 26/10/2026): com uma rotina
 * aberta, só a base que também a tem — a pessoa não pode trocar e cair numa tela que não
 * abre; fora de rotina, toda base com alguma rotina.
 */
export function trocasPermitidas(
  trocas: readonly TrocaDeBase[] | undefined,
  caminho: string,
): TrocaDeBase[] {
  const rotina = rotinaDoCaminho(caminho);
  return (trocas ?? []).filter((t) =>
    rotina === null ? t.rotinas.length > 0 : t.rotinas.includes(rotina),
  );
}

/**
 * O canal entre as abas do mesmo navegador (revisão final, 26/10/2026).
 *
 * A base ativa é da SESSÃO, não da aba: com duas abas abertas, trocar numa faz a outra chamar
 * a API com o token da nova base enquanto ainda diz a antiga — e o cadastro de fornecedores do
 * Minas Rural ficaria guardado na chave da Época. Quem troca avisa; as outras abas recarregam.
 */
const CANAL_DAS_TROCAS = "epoca-analytics-troca-de-base";

/** Avisa as outras abas que a base desta sessão mudou. Sem `BroadcastChannel`, não faz nada. */
export function avisarTroca(base: string): void {
  if (typeof BroadcastChannel === "undefined") return;
  const canal = new BroadcastChannel(CANAL_DAS_TROCAS);
  canal.postMessage(base);
  canal.close();
}

/** Ouve as trocas feitas em outras abas. Devolve a função que para de ouvir. */
export function ouvirTrocas(aoTrocar: (base: string) => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const canal = new BroadcastChannel(CANAL_DAS_TROCAS);
  canal.onmessage = (evento: MessageEvent) => {
    if (typeof evento.data === "string") aoTrocar(evento.data);
  };
  return () => canal.close();
}

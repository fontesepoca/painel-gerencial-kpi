/**
 * Onde a API .NET está, do ponto de vista DESTE processo (o servidor Next).
 *
 * <b>Não é o endereço que o navegador usa.</b> O navegador não fala mais com a API: tudo
 * passa pelo BFF. Em container, os dois vivem na mesma rede, e `http://api:8080` é direto e
 * não depende de IP ou de o host deixar o container sair e voltar.
 *
 * A ordem dos fallbacks cobre os três ambientes sem ninguém configurar nada a mais:
 * `API_URL_INTERNA` em container, `NEXT_PUBLIC_API_URL` quando só ela existe (como era até a
 * bifurcação de bases), e o localhost do desenvolvimento.
 */
export const URL_DA_API = new URL(
  process.env.API_URL_INTERNA ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5207",
);

/** O endereço completo de um caminho da API, para o `fetch` dos route handlers. */
export function enderecoDaApi(caminho: string): string {
  return new URL(caminho, URL_DA_API).toString();
}

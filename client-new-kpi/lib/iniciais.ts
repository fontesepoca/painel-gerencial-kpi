/**
 * As iniciais que aparecem no avatar do menu do usuário.
 *
 * Primeira e última palavra do nome — `GABRIEL HENRIQUE COELHO FREITAS` vira `GF`. Duas letras
 * porque uma só repete demais num cadastro de 8.393 pessoas, e três começam a parecer sigla.
 *
 * <b>As partículas do meio ficam de fora</b> (`de`, `da`, `dos`, `e`): `MARIA DAS GRAÇAS` com
 * a última palavra crua daria `MG`, mas `JOSE DA SILVA` daria `JS` — e sem filtrar, um nome
 * terminado em partícula produziria iniciais como `JD`.
 */

const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "di", "du", "del", "van", "von"]);

export function iniciais(nome: string, alternativa = "?"): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((parte) => parte.length > 0 && !PARTICULAS.has(parte.toLowerCase()));

  if (partes.length === 0) {
    // Nome vazio ou só partículas: cai no nome de guerra, que sempre existe para quem entrou.
    return alternativa.slice(0, 2).toUpperCase() || "?";
  }

  const primeira = partes[0]![0]!;
  const ultima = partes.length > 1 ? partes[partes.length - 1]![0]! : "";

  return `${primeira}${ultima}`.toUpperCase();
}

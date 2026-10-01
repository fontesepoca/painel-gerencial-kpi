import type { Fornecedor } from "@/types/dre-gerencial";

/**
 * Os fornecedores de uma apuração, por extenso, para o cabeçalho da tela e do papel.
 *
 * <b>Os códigos vêm da APURAÇÃO; os nomes, de quem está selecionado agora.</b> É a mesma
 * divisão de `descreverFiliais`, e pelo mesmo motivo: o que foi apurado é fato consumado, mas
 * o nome é só enfeite de leitura — se a pessoa mexeu no filtro depois de apurar e o nome não
 * está mais à mão, o código sozinho ainda identifica o recorte sem mentir sobre ele.
 *
 * Devolve `null` quando não houve filtro, porque aí não há nada a dizer: o DRE é o inteiro, e
 * uma frase a mais no cabeçalho custaria altura que a tabela quer.
 */
export function descreverFornecedores(
  codigos: readonly number[],
  conhecidos: readonly Fornecedor[],
): string | null {
  if (codigos.length === 0) return null;

  const nomes = codigos.map((codigo) => {
    const achado = conhecidos.find((f) => f.codFornec === codigo);
    return achado ? `${codigo} · ${achado.fornecedor}` : String(codigo);
  });

  return nomes.length === 1
    ? `Fornecedor: ${nomes[0]}`
    : `Fornecedores: ${nomes.join(" · ")}`;
}

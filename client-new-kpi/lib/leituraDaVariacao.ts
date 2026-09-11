/**
 * O que uma variação (`%AH`) significa para o resultado da empresa.
 *
 * **A cor do `%AH` julga o efeito, não o sinal do número.** É o que a 9815 faz, e a leitura
 * só funciona assim: receita que sobe é boa notícia, devolução que sobe é má notícia, e as
 * duas aparecem como número positivo. Colorir pelo sinal — que era o que esta tela fazia —
 * pinta as duas da mesma cor e obriga quem lê a reinterpretar cada linha.
 *
 * O caso que deixa isso evidente é a devolução caindo: `(9,778)`, um número negativo, entre
 * parênteses, e ainda assim a melhor notícia da coluna.
 *
 * Sem React, para a regra poder ser conferida contra a rotina antiga sem montar tela.
 */

/**
 * `neutro` não é "meio bom": é **ausência de juízo**, e existe para dois casos em que
 * qualquer cor mentiria — a variação que não há (primeira coluna, ou base zero) e a linha
 * cujo sentido não dá para saber.
 */
export type LeituraDaVariacao = "favoravel" | "desfavoravel" | "neutro";

/**
 * Julga uma variação.
 *
 * **O sentido da linha sai do sinal do valor dela**, e não de uma lista de contas. No DRE,
 * receita e resultado chegam positivos; dedução, custo e despesa chegam negativos — a
 * própria estrutura já separa o que é bom crescer do que é ruim crescer, e uma lista de
 * nomes envelheceria a cada conta nova no cadastro.
 *
 * Daí a regra caber numa linha: **a variação é favorável quando tem o mesmo sinal do valor
 * da linha**. Receita (+) subindo (+) é boa; despesa (−) subindo (+) é ruim; despesa (−)
 * caindo (−) é boa.
 *
 * Isso se estende ao caso que ninguém quer ver e que precisa ler certo: prejuízo. Um
 * resultado negativo que fica mais negativo tem `%AH` positivo — mesmo sinal do valor —, e
 * a regra o pinta como desfavorável, que é o que ele é.
 *
 * @param percentual A variação sobre a coluna anterior. `null` quando não existe.
 * @param valorDaLinha O **total do período**, não o valor da coluna. O total é o sentido
 *   estável da linha: uma conta que oscila de sinal entre dois meses trocaria de cor no
 *   meio da tabela se cada coluna se julgasse sozinha.
 */
export function lerVariacao(
  percentual: number | null,
  valorDaLinha: number,
): LeituraDaVariacao {
  // Zero é a primeira coluna do período, onde a 9815 escreve `0,00` por não haver mês
  // anterior — ver §13. Não houve variação, então não há notícia; pintá-la de favorável
  // encheria a primeira coluna inteira de verde sem nada ter acontecido.
  if (percentual === null || percentual === 0) return "neutro";

  // Linha que soma zero no período não tem sentido a declarar: não dá para dizer se ela é
  // do lado que deve crescer ou do lado que deve encolher.
  if (valorDaLinha === 0) return "neutro";

  const mesmoSinal = percentual > 0 === valorDaLinha > 0;
  return mesmoSinal ? "favoravel" : "desfavoravel";
}

/**
 * A frase que acompanha a cor, para quem não a distingue — e para quem passa o ponteiro.
 *
 * Cor sozinha não pode carregar a informação: é a regra de acessibilidade que vale aqui, e
 * neste caso ela não é formalidade. O sinal do número mostra a **direção**, nunca o juízo;
 * sem a frase, quem lê em tons de cinza vê `(9,778)` e conclui o oposto do que a célula diz.
 */
export function descreverVariacao(leitura: LeituraDaVariacao): string | undefined {
  if (leitura === "favoravel") return "Efeito favorável ao resultado";
  if (leitura === "desfavoravel") return "Efeito desfavorável ao resultado";
  return undefined;
}

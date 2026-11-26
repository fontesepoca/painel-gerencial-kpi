# Simulador de preço: busca por lista de códigos

**Data:** 25/11/2026. **Pedido de:** Gabriel. **Tamanho:** mudança pequena. O desenho foi
proposto na conversa e aprovado nela.

## O que muda

A barra de busca aceita vários códigos de produto separados por vírgula, por exemplo
`49555,49556,66635`. Um código sozinho, sem vírgula, continua na busca de sempre (código exato ou
trecho da descrição).

## Regra da lista

É uma lista quando o texto tem vírgula e só dígitos, vírgulas e espaços.

- Espaço em volta da vírgula, vírgula no fim e código repetido não dão erro.
- O zero à esquerda é ignorado: `049555` vale o mesmo que `49555`.
- Uma letra no meio, ou um espaço dentro de um código, faz o texto deixar de ser lista. Ele volta
  para a busca de sempre.

A regra existe em dois lugares, com o mesmo comportamento:
- `SimuladorPrecoService.LerListaDeCodigos`, na API, que é quem decide o filtro;
- `lerListaDeCodigos`, em `lib/filtroSimulador.ts`, na tela.

## Como funciona

- **O SQL não muda.** A lista vira o mesmo filtro de códigos do "Ver só os simulados"
  (`:codigos`). A sp5 e a sp15 não mudam.
- **Lista e "Ver só os simulados" ao mesmo tempo:** ficam só os códigos que estão nos dois. Se
  não sobrar nenhum, a API responde uma página vazia sem ir ao banco. No Oracle, um texto vazio é
  nulo, e mandar a lista vazia ao SQL desligaria o filtro em vez de esvaziar o resultado.
- **Limites:** até 500 códigos e 4000 caracteres. A busca por texto continua com 60.
- **O aviso:** quando parte da lista não vem, aparece "Sem resultado para os códigos X, Y nesta
  filial e região". O aviso só aparece com todas as linhas na tela, isto é, na página 1 e com o
  total cabendo nela. Fora disso, ele não aparece, para não acusar um código que só está noutra
  página.
- **Produtos novos simulados:** a lista não os mostra, porque eles não têm código.

## Validação

- A sp17 ganhou 13 conferências, para `lerListaDeCodigos` e `codigosNaoEncontrados`.

## Fora do escopo

- Navegar pela lista de fornecedores com as setas e marcar com o espaço. Fica para depois, por
  pedido do Gabriel.

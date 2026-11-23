# Simulador de preço: alinhamento visual com o DRE (spec curta)

**Data:** 23/11/2026 · **Branch:** `feat/simula-preco` · **Pedido:** Gabriel, revisão com as
skills `frontend-design` e `superpowers` · **Tamanho:** mudança pequena

**Base:** [spec do simulador](2026-11-18-simulador-de-preco-design.md),
[PADROES_DE_TELA.md](../../plataforma/PADROES_DE_TELA.md) e a tabela do DRE
(`components/dre-gerencial/TabelaDre.tsx` com as classes de `app/globals.css`).

## Intenção

O simulador deve **parecer e se comportar como o DRE**, que é a tela-padrão da casa. A
`frontend-design` foi feita para criar identidade visual nova, mas aqui a direção já existe:
os tokens, os dois temas, a Geist e o PADROES. **O padrão do projeto vence.** Da skill, fica o
olhar crítico: estrutura visual que informa, texto claro e o piso de qualidade (celular, foco
de teclado, leitura ampliada).

## Objetivos

1. **A tabela usa as classes do DRE:** `.tabela-rolagem`, `.celula-descricao` com
   `.largura-da-descricao`, e `.col-bloco`/`.col-interna`. Com elas, o simulador herda:
   - o teto de 50vw da coluna fixa no celular (PADROES §5);
   - a costura do cabeçalho fixo, para o texto do corpo não vazar sob ele;
   - os divisores desenhados por dentro da célula.
2. **Uma coluna fixa só.** O código passa para dentro da célula da descrição. Duas colunas
   fixas lado a lado é o defeito documentado no `globals.css`: o navegador não respeita a
   largura pedida, e os valores passam pela fresta.
3. **Os divisores dos grupos** (Compra, Entrada, Custo, Saída e Preço) com `.col-bloco` no
   início de cada grupo e `.col-interna` dentro dele, no lugar da `border-l`. A faixa de cima
   do cabeçalho segue o desenho da faixa dos meses do DRE.
4. **A casca igual à do DRE:**
   - a trilha "Época Analytics / Simulador de Preço";
   - o conteúdo em `mx-auto max-w-[110rem]`, com `gap-3`;
   - o cartão dos filtros com `shadow-[var(--shadow-card)]`.
5. **Foco de teclado visível** em todo botão do simulador (código e descrição que abrem o
   quadro, ↺, ✕ e os botões do quadro). Hoje só os campos de texto mostram foco.
6. **Larguras em `em`** nos controles da tabela, como o campo de preço. Na leitura ampliada a
   fonte vai de 14 para 18px sem mudar o `rem` da raiz, e uma largura em `rem` corta o número.

## Não-objetivos

- **Impressão.** Fica para depois, por decisão do Gabriel em 23/11/2026: filtros fora do papel,
  cabeçalho no papel e ajuste de folha. Nem o `.nao-imprime` entra agora.
- **Mexer no DRE**, no `globals.css` ou em qualquer regra compartilhada: só se **usa** o que
  já existe.
- **Mudar o cálculo, a consulta, a simulação guardada ou o comportamento** (Enter, ↺, quadro,
  produtos novos).
- **Dar ao simulador uma identidade visual própria** (cores, fontes, efeitos).

## Antiobjetivos

- **Qualquer número mudar.** A `sp8` tem de continuar 137.072/137.072, com o JSON da `sp6`.
- **A tabela piorar no celular** ou deixar de rolar dentro do contêiner.

## Restrições

- **Só tokens**, nunca hex. Os dois temas e as duas leituras têm de funcionar (PADROES §1).
- **A ordem do `globals.css` não muda** (PADROES §2): não acrescento CSS lá. Se faltar uma
  regra, isso vira pergunta, não edição.
- **`tsc` e `eslint` limpos** e a `sp8` igual.

## Caminhos considerados

| # | Caminho | Troca | Decisão |
|---|---|---|---|
| 1 | **Usar as classes que o DRE já tem no `globals.css`** | Herda celular, impressão futura e as correções de cabeçalho fixo sem duplicar nada, e o que for consertado no DRE vale aqui. Prende o simulador às mesmas regras. | **Escolhido pelo Gabriel em 23/11/2026** |
| 2 | Extrair um componente de tabela compartilhado | Mais limpo a longo prazo, mas mexe no DRE em homologação | descartado agora |
| 3 | Manter o Tailwind e copiar as regras | Duplica, e as cópias divergem na primeira correção | descartado |

## Decisões que ficam com quem constrói (minhas, a conferir)

- **Na célula fixa:** o código vem antes da descrição, em fonte `tabular` e cor de apoio.
  O NCM e a tributação ficam na linha de baixo, como hoje.
- **O quadro do produto** mantém o desenho atual. Ganha só o foco visível nos botões e o ajuste
  de largura em `em`.
- **A seção "Produtos novos simulados"** usa as mesmas classes, com a altura máxima atual.

## Verificação

- `npx tsc --noEmit` e `npx eslint` limpos.
- `sp8` com o JSON da `sp6`: 137.072/137.072, nenhum número mudou.
- **Capturas da tela**, com login: tema escuro e claro, leitura ampliada e 375px de largura. A
  coluna fixa deve respeitar 50vw, o cabeçalho não deve vazar ao rolar, e o Tab deve mostrar o
  foco nos botões.

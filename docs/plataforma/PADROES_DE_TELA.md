# Padrões de tela

O que vale para **qualquer** tela do Novo KPI. Nasceu da 9815 — foi lá que cada regra apareceu
—, mas nada aqui é do DRE: uma rotina nova herda tudo isto e não deveria redescobrir nenhuma
das armadilhas. Os números medidos e os casos concretos ficam na rotina que os mediu
([9815 — ESPECIFICACAO](../rotinas/9815-dre-gerencial/ESPECIFICACAO.md)).

---

## 1. `<ControlesDeExibicao />` em toda tela, sem exceção

**Tema claro e leitura ampliada vão em todas as páginas, inclusive o login.** Regra do Gabriel
em 16/09/2026. Não são preferência de uma rotina, são preferência de quem está lendo: quem
precisa de fonte grande precisa dela na tela de entrada também, e uma tela sem o controle
obriga a pessoa a atravessá-la no tamanho errado para só então poder ajustar.

O componente está em `components/layout/ControlesDeExibicao.tsx`, e o `AppShell` já o inclui —
uma rotina que use a casca não precisa fazer nada. Tela fora da casca o posiciona por conta
própria, no alto à direita.

**Consequência para qualquer efeito visual: ele tem de existir nos dois temas.** O campo de
estrelas do login mostrou o preço de ignorar isso — no claro ele saía com opacidade média de
23 em 255, invisível. E a correção não foi cor: um círculo de meio pixel é quase todo
antialiasing, e o que sobra desaparece contra o branco. **Meça, não olhe.**

---

## 2. A ordem do `globals.css` é funcional, não estética

Regras que disputam a mesma propriedade com a mesma especificidade — e as de tela estreita
quase sempre disputam — ficam **no fim do arquivo**. Em empate, vence quem vem por último.

Escritas no começo, elas não fazem efeito nenhum **e nada acusa**: nem erro de sintaxe, nem
aviso, nem diferença visível até alguém medir o elemento. Aconteceu três vezes numa sessão só,
com três propriedades diferentes (`min-height`, `display` de dois elementos).

Vale também para `display`: use `revert` em vez de `block` ao religar um elemento escondido.
Um valor fixo tira dele o display que o navegador já dava.

---

## 3. Impressão

### O caminho

`Ctrl+P` e o botão **Imprimir** passam pelo mesmo lugar: quem reconfigura a página é o bloco
`@media print` do `globals.css`, e o botão só chama `window.print()`. Duas entradas, uma
implementação.

| | |
|---|---|
| Altura | a casca prende tudo na janela; no papel volta a fluxo de bloco e o conteúdo transborda para as páginas seguintes |
| Cabeçalho da tabela | deixa de ser `sticky` — e **estático, o navegador o repete no topo de cada página** |
| Tema | forçado a claro no `beforeprint`: impressora descarta fundo, e o escuro sairia texto branco em papel branco |
| Cromo da aplicação | sidebar, trilha, filtros e botões saem via `.nao-imprime` |
| Quebra | `break-inside: avoid` na linha — metade dos valores numa folha é linha lida errado |

### O papel diz o que a tela não precisa dizer

Um relatório impresso circula, é arquivado e é conferido semanas depois, quando ninguém lembra
o que foi marcado no filtro. **O que na tela é contagem, no papel é lista** — com nome e
código, porque é pelo código que se confere contra o Winthor.

**Quem escolhe entre as duas formas é o CSS, não um estado de React.** As duas ficam no DOM e
`@media print` troca qual aparece. `Ctrl+P` não espera re-render — é a mesma razão pela qual
os números com casas decimais diferentes (tela × papel) também vivem os dois no DOM,
alternados por `.so-na-tela` / `.so-no-papel`.

### A escala: medir a tabela, não adivinhar a folha

`hooks/useEscalaDeImpressao.ts`, no `beforeprint`:

1. **mede** a tabela com a fonte base e `width: max-content` — a largura que ela pede quando
   nada a comprime;
2. **escolhe** a menor folha em que ela caiba com pelo menos 13pt: A4 em pé (190mm úteis), A4
   deitada (277mm), A3 deitada (400mm = 1.512px);
3. **calcula** a fonte por regra de três contra essa largura, com 2% de folga, presa entre 7pt
   e 20pt;
4. **aplica** inline com `important`, reescreve a regra `@page`, e desfaz no `afterprint`.

A folha que o React desenha é a **folha segura**: se o ajuste não pegar, sobra papel em vez de
cortar conteúdo.

> **Três tentativas falharam antes desta, e nenhuma falhou de forma visível** — todas
> produziram números plausíveis. Contar colunas supondo ≈16mm cada (coluna de data, de nome e
> de valor de nove dígitos não se parecem) deu A3 com 69% de papel branco. Medir o PDF
> impresso deu 130mm contra ≈316mm reais, por ler o fluxo errado. Medir com conteúdo
> pessimista deu o dobro da folha necessária — e foi o argumento que encerrou a busca por uma
> escala fixa: **nada no CSS sabe se o que vem na consulta é `ARROZ 5KG` ou um nome de 50
> caracteres.**

Do PDF, o que serve como fonte de verdade é o `/MediaBox` (folha que saiu) e a matriz `cm` (a
escala, 0,24 nos PDFs do Chrome). **Largura de conteúdo se mede no navegador.**

A tabela **não estica** para a largura da folha. Com `width: 100%` as colunas se espalham e o
olho atravessa um vão de papel branco para ligar o nome ao número.

### Três armadilhas que dão o mesmo sintoma

A4 em pé com a tabela cortada é o que se vê quando a regra de tamanho é descartada:

1. **`A2` não existe em CSS.** Os nomes param no A3. Nome desconhecido invalida a declaração
   inteira — `@page { size: A2 landscape }` volta como `@page { }`. Por isso o tamanho é
   escrito em **milímetros**, pelo componente, e não por nome.
2. **Páginas nomeadas** (`@page nome` + `page: nome`) têm suporte irregular.
3. **`beforeprint` não conhece o papel.** Ele dispara *antes* de o navegador aplicar a folha,
   então qualquer medida tirada dali sai com as métricas da tela. Medir a TABELA nesse evento
   é legítimo (é medida de tela por construção); medir a FOLHA não.

### Modal não imprime

Conteúdo em `<dialog>` vive na *top layer* do navegador, e **top layer não se fragmenta entre
páginas**: `window.print()` com o modal aberto sai com a primeira folha e o resto cortado — o
pior defeito possível numa lista de milhares de linhas.

O padrão é o botão do modal **abrir a página dedicada em outra aba e imprimir lá**, com
`?imprimir=1` disparando o diálogo uma vez. O que a outra aba precisa saber viaja junto no
objeto do detalhamento, e não é reconstruído lá: a aba nova não tem os cadastros em memória, e
mandá-la buscar abriria a chance de as duas descreverem a mesma coisa com palavras diferentes.

---

## 4. Tela cheia

A seção vira `position: fixed; inset: 0` e cobre sidebar, trilha e filtros. `Esc` também sai.

**Não usa o Fullscreen API do navegador.** O `requestFullscreen` esconde a barra do sistema e a
do navegador — num relatório financeiro isso tira as referências de onde a pessoa está — e sai
com qualquer `Esc`, inclusive o que ela deu para fechar um modal.

O `Esc` da tela cheia **só sai quando não há modal aberto**. Um `<dialog>` já fecha no `Esc`
sozinho; sem a guarda, um `Esc` fecha os dois e quem só queria fechar o detalhe perde a tela
cheia junto.

---

## 5. Celular

Ponto de corte: `max-width: 767px` para o que é questão de **largura**, e
`(hover: none) and (pointer: coarse)` para o que é questão de **dispositivo**. A distinção
importa: num desktop com janela estreita o mouse continua arrastando.

| | |
|---|---|
| Coluna fixa | teto de `50vw`. Uma coluna de 512px numa tela de 375px não é folga, é a tela inteira mais uma vez — e como ela é fixa na rolagem, o que rola passa por baixo dela |
| Altura | `min-height: 65svh`. **`svh`, não `vh`**: a barra do navegador aparece e some, e `vh` toma a janela grande como referência |
| Rolagem | interna, não da página — é ela que mantém o cabeçalho grudado no topo |
| Nome comprido | **medir antes de escolher**: poucos rótulos → quebra livre; lista longa → `line-clamp: 2` com o nome inteiro no `title`. Com quebra livre, um nome de produto virou **sete linhas** numa coluna de 150px |
| Arrastar | o drag-and-drop do HTML **não recebe eventos de dedo**. O punho vira controle morto e a dica manda usar `Alt`+setas num aparelho sem `Alt` — os dois saem em dispositivo de toque |
| Selo | versão curta em tela estreita (`INFORMATIVO` → `INFO`), com **o texto acessível continuando o longo** e o `title` guardando a frase |

---

## 6. Exportar

Um botão **Exportar** no cabeçalho abre um popover com as saídas — `mousedown` fora fecha,
`Esc` fecha, `role="menu"`.

**PDF é a impressão, e isso é decisão.** *Imprimir* e *Exportar PDF* chamam o mesmo
`window.print()`. Um gerador de PDF no navegador seria uma segunda implementação de tudo da
seção 3 — cabeçalho repetido, folha por largura medida, as armadilhas de `@page` — e
divergiria na primeira correção feita em um dos dois lados. Escolhido pelo Gabriel em
09/09/2026, entre este caminho, `jsPDF` e gerar no back-end. Nenhuma API pré-seleciona o
destino "PDF", então o item avisa que ele é escolhido no diálogo: prometer o contrário deixa a
pessoa esperando um download que não vem.

### O Excel

Biblioteca: **SheetJS `xlsx` 0.20.3**, aprovada em 09/09/2026, **instalada da CDN oficial** e
não do npm — o pacote do registro público parou na 0.18.5, de 2022, com CVEs de *prototype
pollution* e ReDoS. Nosso uso é só escrita, mas dependência com alerta conhecido é dívida que
aparece na próxima auditoria.

| Regra | Por quê |
|---|---|
| **Número é número** | a célula recebe `-617283.95` com o *formato* mandando exibir `(617.283,95)`. Texto formatado dá planilha bonita e inútil — e o defeito não aparece na tela: quem descobre é o contador, na frente do cliente |
| **A ordem é a da tela** | as chaves saem do DOM (`tr[data-chave]`), então linhas reordenadas e filtradas valem no arquivo. É o critério da impressão; divergir faria papel e planilha discordarem sobre a mesma apuração |
| **Entra por `import()` dinâmico** | ~400KB que só interessam a quem exporta |
| **Largura de coluna sempre** | sem ela o Excel mostra `#######` na coluna de dinheiro — o primeiro motivo de alguém achar que a exportação veio quebrada |
| **Planilha quer dado tabular** | o que na tela é hierarquia (linha de grupo) vira coluna repetida: uma tabela dinâmica reagrupa sozinha, e o subtotal que a tela desenha o Excel calcula |
| **Código e nome em colunas separadas** | o inverso da tela: quem cruza com outra base precisa do código sozinho |

Sem negrito: estilo de célula é recurso da versão paga do SheetJS.

**Gerar e baixar são funções separadas.** É o que permite validar a exportação de verdade sem
abrir diálogo de salvar na máquina de ninguém — `URL.createObjectURL` e
`HTMLAnchorElement.click` interceptados no navegador.

> **Limpeza de nome de arquivo tem ordem.** Trocar a barra proibida por hífen acontece
> **antes** da remoção de caracteres inválidos. Ao contrário, `Detalhe (-) X · Setembro/2026`
> perde o separador e vira `Setembro2026`.

---

## 7. Validar tela sem navegador

A aritmética e a montagem de qualquer saída (planilha, matriz, recálculo) ficam em módulos
puros de `lib/`, e as validações rodam **os módulos reais** no Node — sem bundler, sem
navegador, sem banco. É o que faz uma delas valer como prova.

```bash
node --experimental-strip-types --import <rotina>/validacao/_alias.mjs <rotina>/validacao/dcNN.mjs
```

O `_alias.mjs` ensina o Node a resolver o `@/` do `tsconfig`. Ele existe porque a alternativa
era trocar os imports do código de produção por caminhos relativos — **mudar o código para o
teste passar**.

Um teste que só olhe "gerou o arquivo" passa com a matriz errada. Gere, **reabra** e confira
célula por célula, inclusive o tipo (`t === "n"`) e o formato.

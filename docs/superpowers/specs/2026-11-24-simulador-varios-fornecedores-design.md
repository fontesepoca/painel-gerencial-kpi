# Simulador de preço — vários fornecedores no filtro

**Data:** 24/11/2026 · **Spec mãe:** `2026-11-18-simulador-de-preco-design.md` · revê a chave
das simulações salvas de `2026-11-23-simulador-salvar-limpar-design.md`.

## Por quê

O comprador cuida de mais de um fornecedor e quer simular todos numa consulta só, sem trocar o
filtro e consultar de novo para cada um.

## O que muda (decidido pelo Gabriel em 24/11/2026)

1. **O campo Fornecedor aceita vários.**
   - Ele funciona como o do DRE: clica no campo, digita `234` e dá Enter, e a Reckitt vira uma
     ficha no próprio campo.
   - Depois digita outro código, e ele entra também, até a pessoa clicar em Consultar.
   - Continua valendo buscar pelo nome e marcar na lista, e tirar uma ficha com o ✕.
   - Sem nenhum fornecedor marcado, a consulta traz todos, como hoje.
2. **A simulação salva acompanha o produto, e não o filtro de fornecedor.**
   - A chave passa de filial + região + fornecedor para **filial + região**.
   - Editar um produto consultando `234` e depois consultar `234 + 500`, ou "todos", mostra a
     mesma edição.

## Como (uma só maneira sensata)

- **Front.** O `FiltrosSimulador` usa o mesmo `SelecaoDeFornecedores` do DRE, hoje travado em um
  (`lista.at(-1)`). O filtro passa a guardar a lista inteira.
- **API.** `SimuladorPrecoFiltroDto.CodFornec` vira `Fornecedores: IReadOnlyList<int>?`. Lista
  vazia ou nula = todos.
- **SQL.** A linha `F.CODFORNEC = DECODE(NVL(:codFornec1,0),0,P.CODFORNEC,:codFornec2)` vira
  `(:fornecedoresNulo IS NULL OR INSTR(',' || :fornecedores || ',', ',' || TO_CHAR(F.CODFORNEC) || ',') > 0)`,
  a mesma técnica do filtro de classes.
  - São dois binds no lugar dos mesmos dois, então o total segue em 37.
  - A linha só escolhe quais produtos entram. Nenhuma conta muda, porque os números usam sempre
    o fornecedor do próprio produto (`F.CODFORNEC = P.CODFORNEC`).
- **Tempo.** Gabriel mede no Oracle um bloco novo no sp14: um fornecedor, três fornecedores e
  todos.

## Minhas decisões (corrigíveis)

- **Até 50 fornecedores por consulta.** Passou disso, a API recusa com "Mais de 50 fornecedores:
  consulte sem filtro de fornecedor." É o mesmo cuidado dos 500 códigos.
- **Códigos válidos.** Só inteiros positivos. Código repetido na lista é ignorado.
- **As simulações já salvas são juntadas sozinhas** na primeira leitura.
  - Cada chave antiga `filial|região|fornecedor` cai em `filial|região`.
  - Se o mesmo produto tiver edição em duas chaves antigas, por exemplo uma em "todos" e outra
    no `234`, vence a do fornecedor específico.
  - Nada se perde além desse caso raro.
- **Mensagem de vazio.** Passa a dizer "com estes fornecedores" quando houver mais de um.
- **Mesmo filtro.** `mesmoFiltro` e o `placeholderData` comparam a lista de fornecedores
  ordenada, então `234,500` e `500,234` são a mesma consulta.

## Fora do escopo

Grupo de fornecedor (o `CODFORNECPRINC`), fornecedor por filial e análise multi filial.

## Verificação

- **sp15:** a nova linha do SQL e a ordem dos binds.
- **sp6:** dois fornecedores trazem a soma dos dois consultados um a um, e 51 fornecedores são
  recusados.
- **Teste novo do front:** a junção das chaves antigas (Node, como o sp13).
- **sp14:** o bloco de tempo, rodado pelo Gabriel.
- **Na tela:** Enter com código, várias fichas, a edição que aparece em outra combinação e F5.

## Revisão final (24/11/2026)

Decidido pelo Gabriel depois da revisão:
- **O "Desfazer todas" vale para a filial e a região inteiras**, de todos os fornecedores. Antes
  de agir, ele pergunta quantos produtos vão voltar ao SQL.
- **O contador diz "N simulados nesta filial e região"**, porque conta as edições de todos os
  fornecedores, e não só as do filtro.

Limitações conhecidas (adiadas):
- **"Ver só os simulados" com fornecedor filtrado:** manda os códigos de todos os fornecedores. O
  SQL cruza com o filtro, e a tela pode dizer que não achou nenhum entre os simulados.
- **Limite de 50 contado antes de tirar repetidos:** a API conta antes do `Distinct`. O front já
  tira os repetidos, então só uma chamada direta à API é afetada.
- **Limite de 50 sem aviso na tela:** colar 60 códigos deixa o Consultar ligado, e o erro só
  aparece na resposta da API.
- **Aba aberta com a versão antiga durante a atualização:** ela ainda grava a chave antiga, e a
  chave nova vence na leitura. Basta recarregar as abas depois de publicar.
- **Comentários do sp14:** ainda citam o `:CODFORNEC` do SQL de referência. É correto, porque os
  blocos 0 a 3 usam a referência sem a A8.

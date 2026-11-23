# Simulador de preço — especificação

**Data:** 18/11/2026 · **Situação:** rascunho, em construção com o Gabriel · **Pedido:** Gabriel ·
**Branch:** `feat/simula-preco`

**SQL de referência:** [docs/rotinas/simulador-preco/referencia/sql-v1.sql](../../rotinas/simulador-preco/referencia/sql-v1.sql), guardado como foi entregue e sem nenhuma edição.

> **O SQL é a versão 1.** Uma v2 vem com correções (o ST fixo em zero e o `CUSTOREP` que nunca
> é alcançado, entre outras) e com leitura mais limpa. Por isso o desenho é feito para **trocar
> de SQL sem reescrever a tela**:
>
> - **A tela não conhece colunas do SQL.** Ela lê um contrato nosso, os DTOs (§3.1). Coluna
>   que entra ou sai na v2 muda o DTO, o repositório e o recálculo, e nada mais.
> - **O recálculo mora num arquivo só**, `lib/simuladorPreco.ts`, com uma função por CTE e o
>   nome da CTE no comentário. Trocar de versão é reescrever esse arquivo olhando o SQL novo,
>   e a dcNN (§3.3) prova que ficou igual.
> - **Cada versão fica guardada ao lado da anterior** (`sql-v1.sql`, `sql-v2.sql`), nunca por cima.
> - **As decisões D7 (VLST = 0) e D13 (preço zero sem última compra) são provisórias**:
>   valem até a v2 e serão revistas com ela.

## 1. O problema

Quem forma preço precisa saber, para cada produto, o que acontece com o custo e com o preço de
venda quando o **preço de compra** muda. O SQL de referência já faz essa conta: parte do preço de compra, aplica os impostos de entrada (IPI, ICMS, PIS, COFINS e frete FOB), desconta
a CBS e divide pelo índice de saída (margem, ICMS de saída, PIS, COFINS e CBS), chegando ao **preço futuro**.

O pedido é uma tela em que a pessoa **digita o preço de compra de cada produto e vê os
impostos, o custo e o preço futuro mudarem na hora**, com cores leves, fácil de usar e no padrão
visual do DRE.

**Só consulta.** Nenhum `INSERT`, `UPDATE` ou `DELETE`, e nada é gravado: a simulação vive na
tela e some quando ela é fechada.

**Não é rotina migrada do Winthor.** É uma tela nova, então não tem `LEVANTAMENTO` nem
`DIVERGENCIAS` ([docs/README.md](../../README.md)). A fidelidade aqui é **ao SQL de referência**:
o número da tela tem de ser o número que o SQL dá.

## 2. As decisões

| # | Decisão | Por quê / quem |
|---|---|---|
| D1 | **O recálculo é feito na tela.** A API roda o SQL uma vez e devolve as linhas com todas as colunas. A cada preço digitado, a tela refaz as contas do SQL sem ir ao banco. | Gabriel, 17/11. Resposta instantânea, e o Oracle de produção não paga por cada tecla. |
| D2 | **Um preço de compra por produto.** Cada linha tem o seu campo. Vazio, vale o preço que o SQL usou. | Gabriel, 17/11. O `:PCOMPRA` do SQL é um valor único, e na tela vira um valor por linha. |
| D3 | **A PCLIB confere a matrícula de quem está logado**, e não a matrícula 1 fixa do SQL. | Gabriel, 17/11. Cada pessoa vê só os fornecedores e departamentos liberados para ela no Winthor. **Diferença deliberada em relação ao SQL de referência** (§4). |
| D4 | **Permissão: a mesma do DRE** (9815, controle 3). O login não muda. | Gabriel, 17/11. |
| D5 | **Filtros iguais ao SQL:** uma filial, uma região e um fornecedor opcional. O filtro de produto continua comentado. | Gabriel, 17/11. |
| D6 | **CBS com NCM repetido:** medir antes de decidir (§7, Q1). Até lá, a tela mostra as linhas exatamente como o SQL devolve. | Gabriel, 17/11. |
| D7 | **VLST = 0, como no SQL.** O % ST aparece só como informação, e a tela diz que ele não entra na conta. | Gabriel, 17/11. |
| D8 | **O SQL é mantido como está**, inclusive as tabelas ligadas e não usadas (PCCONSUM sem condição de ligação, PCPRINCIPATIVO, PCLINHAPROD, PCCATEGORIA, PCSECAO, PCREGIAO, PCTRIBUT). Limpeza só depois, com medição lado a lado. | Gabriel, 17/11. |
| D9 | **Base: a da sessão**, como no DRE. A tela consulta o Oracle da base escolhida no login. | Gabriel, 17/11. Antes de liberar numa base, conferir os privilégios do usuário da aplicação nela (§6). |
| D10 | **Só o preço de compra é editável.** Os percentuais vêm do banco e são só leitura. | Gabriel, 17/11. |
| D11 | **Fica no módulo Gerencial da barra lateral, ao lado do DRE**, com o nome "Simulador de Preço". | Gabriel, 17/11. |
| D12 | **A lista de filiais é a mesma do DRE:** só as filiais liberadas para a pessoa. | Gabriel, 17/11. |
| D13 | **Produto sem última compra entra com preço zero, fiel ao SQL.** O `NVL(VLULTPCOMPRA, CUSTOREP)` nunca chega ao `CUSTOREP`, porque a CTE anterior já fez `NVL(…, 0)`. A linha ganha a marca "sem última compra". | Gabriel, 18/11. |
| D14 | **Região: só as regiões da filial escolhida.** A coluna que liga região a filial vem do banco, via a query `sp3` (§6), e não de suposição. | Gabriel, 18/11. |
| D15 | **Filiais e fornecedores reaproveitam as rotas e os hooks do DRE** (`/api/dre-gerencial/filiais` e `/fornecedores`). Sem SQL novo. Separa-se se um dia a permissão divergir. | Gabriel, 18/11. |
| D16 | **Índice ≤ 0:** a célula do preço futuro mostra "—" com o aviso "impostos + margem ≥ 100%", e o número do SQL fica no `title` da célula. | Gabriel, 18/11. |
| D17 | **Região por campo numérico, por enquanto.** Vira a lista da D14 quando a `PCREGIAO` for liberada e a `sp3` disser a coluna. | Gabriel, 18/11. |
| D18 | **Valores em reais com 3 casas**, como o SQL arredonda. Percentuais de 2 a 4 casas: o ICMS de custo com base reduzida não é arredondado pelo SQL (ex.: `10,9998`). | Gabriel, 18/11. |
| D19 | **Fornecedor pela busca do DRE, um por vez:** escolher outro substitui o anterior, e vazio é "todos". | Gabriel, 18/11. |
| D20 | **Enter no preço vai ao preço da linha de baixo** (Shift+Enter, ao de cima), com o texto selecionado. | Gabriel, 18/11. Feito. |
| D21 | **Clicar no produto abre o quadro dele numa janela no centro (modal)**, com preço **e percentuais** editáveis. Na célula da tabela, continua editável só o preço (D10). | Gabriel, 18/11. §3.6 |
| D22 | ~~"Salvar simulação" e lista de salvas~~. **Revista no mesmo dia: a tela se guarda sozinha** no navegador, por base e matrícula, sem botão Salvar. Nada vai ao banco. | Gabriel, 18/11. §3.6 |
| D23 | **"Simular novo produto"** abre o mesmo quadro **em branco**, para um produto que não existe no cadastro. | Gabriel, 18/11. §3.6 |
| D24 | **Confirmar no quadro leva as alterações para a tabela**, como se tivessem sido feitas nela, com o mesmo ↺ para redefinir. | Gabriel, 18/11. §3.6 |
| D25 | **Na tabela, o percentual alterado pelo quadro fica em azul**, com o valor do SQL no `title`. | Gabriel, 18/11. |
| D26 | **O produto novo confirmado vai para a seção "Produtos novos simulados"**, com as mesmas colunas e o mesmo cálculo. Para editar, clica-se na linha, e o quadro reabre. | Gabriel, 18/11. §3.6 |
| D27 | **O produto novo não mostra variação** do preço futuro: não há valor do SQL com que comparar. | Gabriel, 18/11. |

## 3. Arquitetura

Segue as skills `new-rotina`, `new-query` e `new-page`, com o módulo `SimuladorPreco` e a rota
`simulador-preco`.

### 3.1 API

| Peça | Arquivo |
|---|---|
| Módulo | `Application/Features/SimuladorPreco/SimuladorPrecoModule.cs`, descoberto por reflexão. O `Program.cs` não é tocado. |
| DTOs | `Application/Features/SimuladorPreco/Dtos/SimuladorPrecoDtos.cs` |
| Serviço | `Application/Features/SimuladorPreco/SimuladorPrecoService.cs`. Devolve `Result<T>`. |
| Entidade | `Domain/Entities/ProdutoSimulado.cs`: class com `init`, dinheiro em `decimal`. |
| Repositório | `Domain/Interfaces/ISimuladorPrecoRepository.cs` e `Infrastructure/Persistence/Repositories/SimuladorPrecoRepository.cs` |
| SQL | `Infrastructure/Persistence/Queries/SimuladorPrecoQueries.cs` |
| Controller | `Controllers/SimuladorPrecoController.cs`, com `[Authorize]` e a rota `api/simulador-preco` |

**Rotas:**

- `POST /api/simulador-preco/consulta`, com o corpo `{ codFilial, numRegiao, codFornec? }`. Devolve as linhas.
- `GET /api/simulador-preco/regioes?codFilial=…`: as regiões da filial escolhida (D14). O SQL desta rota depende da `sp3`.
- Filiais e fornecedores: as rotas do DRE (D15).

**O BFF:** `lib/servidor/decidirRepasse.ts` hoje só repassa `dre-gerencial` e `health`. O
simulador acrescenta `simulador-preco` à lista, e a `dc87` passa a cobrir esse caminho.

**A permissão (D4):** o controller recusa quem não tem a rotina `9815` no token. O portão de
tela é um `app/simulador-preco/layout.tsx` igual ao do DRE.

### 3.2 O SQL na API: o que muda e o que não muda

O texto é o da referência, com **só estas** adaptações. Cada uma é mecânica ou foi decidida
acima:

| # | Adaptação | Motivo |
|---|---|---|
| A1 | Cada ocorrência de bind ganha um nome próprio: `:CODFORNEC` (2×), `:CODFILIAL` (2×) e `:PCOMPRA` (8×) | O ODP.NET usa bind **posicional**: cada ocorrência é um parâmetro, adicionado na ordem do texto ([CONVENCOES_ORACLE §1](../../plataforma/CONVENCOES_ORACLE.md)). |
| A2 | `CODFUNC = 1` (2×) vira `CODFUNC = :matricula1` e `:matricula2`, com a matrícula do token | D3 |
| A3 | `:PCOMPRA` recebe `NULL` em todas as 8 posições | Com nulo, o SQL usa o próprio padrão, `NVL(VLULTPCOMPRA, CUSTOREP)`. A primeira tela é a resposta do SQL, sem nenhuma conta nossa (D1). |
| A4 | `;` final removido | O ODP.NET não aceita o terminador. |
| A5 | As duas linhas comentadas `-- AND … CODPROD IN (:CODPROD)` saem do texto | Não mudam o resultado (são comentário), e um `:NOME` dentro de comentário só confunde quem conta os binds na mão. Continuam na referência. |
| A6 | `NCM`, `CODIGO_TRIBUTACAO` e `TIPO_IMPOSTO` passam por `TO_CHAR` no SELECT de fora | O tipo das três no banco não foi conferido. Como texto, servem tanto se forem número quanto se forem texto, e chegam à tela iguais. |
| A7 | O SQL inteiro entra **dentro** de um `SELECT … FROM ( … )` que só renomeia as colunas sem sublinhado (`PERC_BASE_RED_ENT` → `PERCBASEREDENT`) | O Dapper ignora maiúsculas, mas não ignora sublinhado: a coluna chegaria zerada sem erro (armadilha 4 do `DIVERGENCIAS.md` da 9815). Renomear por fora deixa o miolo idêntico à referência. |

**A prova:** a [sp5](../../rotinas/simulador-preco/validacao/sp5_sql_da_api_igual_a_referencia.mjs) aplica
A1, A2, A4 e A5 à referência e compara com o miolo da constante. Em 18/11/2026 o resultado
foi **idêntico**, com os 15 binds na ordem acima.

**A ordem dos 15 binds no texto:** `:numRegiao` · `:codFornec1` · `:codFornec2` ·
`:matricula1` · `:matricula2` · `:codFilial1` · `:codFilial2` · `:pCompra1` … `:pCompra8`.

`commandTimeout`: **300 s, provisório**, até a medição da `sp4` (§7, Q5).

### 3.5 Estado em 18/11/2026

| Peça | Situação |
|---|---|
| API: módulo, SQL, repositório, serviço, controller com a permissão por claim | ✅ compila; **nunca rodou contra o banco** |
| BFF: `simulador-preco` na lista de repasse | ✅ `dc87` 43/43 |
| Rota de regiões | ⬜ depende da `sp3` e da liberação da `PCREGIAO` |
| Recálculo: `lib/decimalExato.ts` (decimal exato, `ROUND` do Oracle) e `lib/simuladorPreco.ts` (uma função por CTE) | ✅ |
| Prova do recálculo: [sp8](../../rotinas/simulador-preco/validacao/sp8_recalculo_reproduz_o_sql.mjs) | ✅ parte 1 (25/25, sem banco); ✅ **parte 2: 9.788 linhas reais, 0 diferenças, 137.057 conferências** (filial 7, região 90, 18/11/2026) |
| Grants e sinônimos (`sp7`) | ✅ executados em 18/11/2026, com aprovação do gestor |
| **SQL v2** (23/11/2026, [spec](2026-11-23-simulador-sql-v2-design.md)): API, recálculo, ST e preço final, classe de venda | ✅ `sp5` idêntica à v2; `sp8` **9.811 linhas reais da v2, 0 diferenças, 147.220 conferências** (filial 7, região 90), com 5.502 linhas com ST; consulta em 8,7 s |
| Paginação (100/página) e produtos novos na mesma tabela ([spec](2026-11-23-simulador-paginacao-design.md)) | ✅ `sp10` 12/12, `sp12` 4/4. A consulta **não** fica mais no sessionStorage (V4) |
| Alinhamento visual com o DRE ([spec](2026-11-23-simulador-alinhamento-visual-design.md)) | ✅ código e revisão; capturas pendentes |
| Quadro do produto, produtos novos e simulação guardada (§3.6): `QuadroSimulacao.tsx`, `useSimulacaoGuardada.ts` | ✅ `tsc` e `eslint` limpos; `sp8` com as funções novas: 137.072/137.072. **Não visto na tela por mim** (precisa de login) |

**A primeira consulta real (sp6, filial 7, região 90, 18/11/2026):**

| | |
|---|---|
| Tempo | **8,8 s** para a filial inteira |
| Linhas / produtos distintos | 9.788 / 9.201: **587 linhas repetidas** por NCM em mais de uma tributação (Q1) |
| Sem última compra (preço zero, D13) | **1.543** linhas, 16% |
| Com `% ST` > 0, mas VLST = 0 (D7) | **1.584** linhas: é o que a v2 vai mudar |
| Sem tributação de CBS para o NCM | 24 |
| Índice ≤ 0 (D16) | nenhuma |
| Coluna sempre nula ou zero | só `vlSt`, que é o esperado (D7). **O mapeamento do Dapper está certo em todas as outras.** |
| Front: tipos, hook, filtros, tabela, página, item no menu, portão da rota | ✅ `tsc` e `eslint` limpos; a tela por dentro **ainda não foi vista** (precisa de login e do banco liberado) |

**Como a tela se comporta (18/11/2026):**

- **Sem preço digitado, a linha mostra o número do SQL**, e não o da nossa conta. Com preço,
  entra o `calcular()`.
- **Linha simulada:** borda azul à esquerda do código e a variação do preço futuro (▲/▼), em
  cor neutra. Preço futuro subir não é bom nem ruim por si.
- **Desfazer:** Esc ou ↺ volta a linha ao preço do SQL, e "Desfazer todas" volta a tabela
  inteira. Uma consulta nova descarta a simulação.
- **Busca local** por código ou descrição, sem banco.
- **Linha repetida por NCM:** a tela avisa quantas são (Q1).
- **"Sem última compra":** aparece quando o SQL entrou com preço zero (D13).

### 3.3 O recálculo na tela

`lib/simuladorPreco.ts` é um módulo puro, sem React, que reproduz as CTEs `CALCULOS_ENTRADA` →
`CALCULOS_CUSTO` → `RESULTADO_CBS` → `RESULTADO_FINAL` → `SELECT` final a partir do preço digitado
e dos percentuais da linha.

**O arredondamento tem de ser o do Oracle.** O `ROUND` do Oracle arredonda o meio para longe do
zero, e cada `ROUND(…, 3)` intermediário do SQL tem de ser reproduzido no mesmo ponto. O
`Math.round` do JavaScript arredonda o meio para cima (−2,5 vira −2) e trabalha em ponto
flutuante, então `1,0005` pode virar `1,000`. A conta é feita em **inteiros escalados**, sem
`toFixed`.

**A prova (dcNN):** um script roda o recálculo sobre as linhas reais de uma consulta, com o
preço que o SQL usou, e confere **todas as colunas calculadas** contra as do SQL, coluna a
coluna. O critério é igualdade exata nas casas que o SQL arredonda. Um segundo
cenário pede ao Gabriel o SQL rodado com um `:PCOMPRA` informado e confere a tela contra ele.

### 3.4 A tela

Proposta para revisão (§7, Q6), no padrão do DRE:

- **Casca:** `AppShell`, com a trilha "Gerencial › Simulador de Preço" e os `<ControlesDeExibicao />`. Tem de funcionar nos dois temas.
- **Filtros, no mesmo desenho dos campos do DRE:**
  - Filial: seleção **única**.
  - Região.
  - Fornecedor: opcional, busca por nome ou código.
  - Botão **Consultar**, com o ícone de play do Apurar.
- **Tabela:**
  - **Colunas fixas à esquerda:** código, descrição e NCM, com a coluna fixa limitada a `50vw` no celular.
  - **Preço de compra:** coluna destacada em cor leve (`--primary-dim`), com o campo editável na própria célula.
  - **Grupos de colunas, separados por divisor de bloco:**
    - **Entrada:** IPI, ICMS, PIS, COFINS e frete, cada um com % e valor.
    - **Custo:** custo antes da CBS, % CBS, base da CBS, valor da CBS e custo calculado.
    - **Saída:** margem, ICMS de saída, PIS, COFINS e índice.
  - **Preço futuro:** a última coluna, em destaque leve (`--positive-glow`).
- **Linha simulada:**
  - **Marca:** quando o preço digitado difere do SQL, a linha ganha uma marca discreta.
  - **Variação:** o preço futuro mostra a diferença para o preço futuro original.
  - **Desfazer:** um botão "desfazer" volta a linha ao preço do SQL.
- **Estados:** inicial, carregando (com aviso de demora), erro e vazio.
- **Números:** classe `tabular` e `formatarMoeda`, com 3 casas onde o SQL usa 3.

### 3.6 O quadro do produto, os produtos novos e a simulação guardada (revisto em 18/11/2026)

**O quadro (D21).** É uma janela no centro (`<dialog>`), aberta ao clicar no código ou na
descrição do produto. O campo de preço da linha não abre o quadro, porque é ali que se digita.

- **Cabeçalho:** código, descrição, NCM e tributação de CBS.
- **Campos editáveis**, cada um com o valor do SQL como padrão e um ↺ para voltar a ele:
  - preço de compra;
  - % IPI, % ICMS de entrada, % redução de base, % PIS, % COFINS e % frete FOB;
  - % CBS;
  - margem e % ICMS de saída.
- **Ao lado, o resultado**, recalculado a cada tecla pelo mesmo `calcular()` da tabela, com o
  preço futuro em destaque.
- **O quadro é um rascunho até o Confirmar.** **Confirmar leva o que foi editado para a
  tabela** (D24): a linha passa a aparecer como simulada, igual a quando se digita o preço na
  própria tabela, e com o mesmo ↺ para redefinir. **Cancelar** e Esc descartam o rascunho.
- **Na tabela, o percentual alterado pelo quadro fica em azul**, com o valor do SQL no `title`
  (D25). O ↺ da linha volta **tudo** ao SQL: preço e percentuais.
- **O IPI:** o `% IPI` que vem do SQL já é o resolvido. A regra "só para indústria" foi
  aplicada antes, no `BASE_TRIBUTACAO`, e o quadro não a refaz.
- **O ST continua fora da conta** (D7): aparece só como informação, até a v2.

**Percentual editado não é divergência do SQL.** É a simulação que a pessoa pediu. Com os
percentuais do SQL, o número continua igual ao do SQL (`sp8`). A diferença só existe onde
alguém digitou outro valor, e a tela marca exatamente esses lugares.

**Produtos novos (D23, D26).** Um botão **Simular novo produto** abre o mesmo quadro **em
branco**:

- **Campos:** descrição livre, preço e todos os percentuais zerados.
- **Dispensa consulta:** funciona antes mesmo de consultar, porque a conta não depende do
  banco.
- **Confirmar o leva a uma seção à parte, "Produtos novos simulados"**, **acima** da tabela
  principal. Abaixo, ela ficaria depois de ~10 mil linhas (sp6), fora de alcance. Ela tem as mesmas colunas e o mesmo cálculo, pelas fórmulas do SQL, sobre o que
  foi digitado.
- **Para editar, clica-se na linha**, e o quadro reabre com os valores dela.
- **Sem variação do preço futuro (D27):** não há valor do SQL com que comparar.
- **Cada um tem um botão para remover.**
- **Marca:** "Produto hipotético: percentuais digitados, sem SQL por trás".

**A tela se guarda sozinha (D22, revisto).** Não há botão Salvar nem lista à parte:

- **O que fica guardado:** o que foi digitado ou confirmado na tabela e os produtos novos.
- **Onde:** no `localStorage` do navegador, por **base e matrícula** (`chavesPorBase`). Uma
  pessoa não vê o que outra simulou, e as simulações da Época não aparecem no Minas Rural.
- **Quando volta:** ao consultar de novo a mesma filial, região e fornecedor.
- **O que se guarda é só o que foi alterado** (o preço e os percentuais mexidos), e não a linha
  inteira. O que não foi mexido segue o banco: se o cadastro mudar amanhã, a linha mostra o
  cadastro novo, com a alteração da pessoa por cima.
- **A identidade da linha é código + tributação de CBS**, e não a posição dela na lista: as
  linhas repetidas por NCM (Q1) são de tributações diferentes.
- **"Desfazer todas"** limpa a simulação da consulta atual, e cada produto novo se remove pelo
  próprio botão.
- **Limites:** fica só neste navegador e neste computador. Com o armazenamento bloqueado
  (janela anônima, política do navegador), a tela funciona igual e só não guarda.
- **Leitura pelo `useSyncExternalStore`**, como a ordem salva do DRE (`useOrdemSalva`): sem
  salto na primeira pintura, e duas abas abertas ficam em sincronia.

## 4. Diferenças deliberadas em relação ao SQL de referência (v1)

| # | Diferença | Decidida em |
|---|---|---|
| 1 | PCLIB pela matrícula da sessão, e não pela matrícula 1 | D3, 17/11/2026 |

Qualquer outra diferença entre o número da tela e o do SQL é **defeito**.

## 5. Fora do escopo desta primeira versão

Exportar para Excel · imprimir · salvar uma simulação · filtro por produto · editar outros
campos além do preço · as rotas da CBS por tributação.

## 6. Antes de ligar: privilégios

O usuário da aplicação tem só `SELECT`, e só no que foi liberado. As tabelas deste SQL que o
DRE **não** usa precisam ser conferidas em cada base, como o usuário da aplicação, pela
[sp1](../../rotinas/simulador-preco/validacao/sp1_acesso_do_usuario.sql), que segue o formato da `mb1`. As demais
perguntas ao banco são a [sp2](../../rotinas/simulador-preco/validacao/sp2_ncm_em_mais_de_uma_tributacao.sql) (Q1),
a [sp3](../../rotinas/simulador-preco/validacao/sp3_ligacao_regiao_filial.sql) (Q3) e a
[sp4](../../rotinas/simulador-preco/validacao/sp4_tamanho_e_tempo.sql) (Q5). Todas são só leitura e o Gabriel executa.

Tabelas a conferir:

`PCTRIBUTACAO` · `PCTRIBUTACAO_FILTRO_NCM` · `PCTABTRIBENT` · `PCFORNECFILIAL` ·
`PCPRODFILIAL` · `PCCONSUM` · `PCEST` · `PCPRINCIPATIVO` · `PCSECAO` · `PCDEPTO` ·
`PCLINHAPROD` · `PCCATEGORIA` · `PCEXPISCOFINSITEM` · `PCREGIAO` · `PCTABPR` · `PCTRIBUT`

**Resultado na Época, 18/11/2026 (sp1 como `EDI`).** A primeira chamada pela API deu
`ORA-00942`. A sp1 explicou: **dez tabelas sem sinônimo** para o `EDI`:

`PCTRIBUTACAO` · `PCTRIBUTACAO_FILTRO_NCM` · `PCEST` · `PCFORNECFILIAL` · `PCCONSUM` ·
`PCREGIAO` · `PCLINHAPROD` · `PCPRINCIPATIVO` · `PCEXPISCOFINSITEM` · `PCTABTRIBENT`

As outras nove saíram com sinônimo para o `EPOCA`. A `PCFILIAL` saiu como "FALTA GRANT", mas
é **falso alarme do dicionário**: o DRE já a lê todo dia. O bloco 2 da sp1, que tenta ler cada
tabela de verdade, é quem dá a palavra final. A liberação está proposta na
[sp7](../../rotinas/simulador-preco/validacao/sp7_grants_e_sinonimos.sql), **para revisão de quem administra o Oracle**.

**O bloco 0 da sp7, como `EDI`, confirmou a causa:** as dez deram `ORA-01031` (privilégios
insuficientes) lendo `EPOCA.<tabela>` pelo nome completo. O dono é `EPOCA` em todas, e falta o
**grant** nas dez, não só o sinônimo. **Aguardando a aprovação do gestor** (18/11/2026).

## 7. Em aberto

| # | Pergunta | Situação |
|---|---|---|
| Q1 | Quantos NCMs têm mais de uma tributação (duplicam linha)? | **medido pela sp6: 587 linhas repetidas em 9.788** (filial 7). A decidir o tratamento |
| Q2 | ~~Preço sem última compra~~ | resolvida: D13 |
| Q3 | Que coluna liga região a filial? | `sp3`, para o Gabriel executar |
| Q4 | ~~Rotas de filiais e fornecedores~~ | resolvida: D15 |
| Q5 | Tempo da consulta para uma filial inteira, e quantas linhas ela devolve | **medido pela sp6: 8,8 s e 9.788 linhas.** O `commandTimeout` de 300 s tem folga de sobra. Falta ver o desenho das ~10 mil linhas na tela |
| Q6 | A tela proposta em §3.4 | a revisar |
| Q7 | ~~Índice ≤ 0~~ | resolvida: D16 |

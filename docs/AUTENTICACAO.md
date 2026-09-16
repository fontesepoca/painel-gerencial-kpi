# Autenticação e permissões

> **Estado:** Fase A (levantamento) quase fechada. Falta a [dc38](validacao/dc38_efeito_das_duas_decisoes.sql).
> Nenhuma linha de código de autenticação escrita ainda — de propósito.

A versão web reaproveita **o cadastro de acesso do Winthor**: as mesmas pessoas, as mesmas
senhas, as mesmas filiais. Ninguém cria conta, ninguém escolhe senha nova, e quem sai da
empresa some dos dois lugares ao mesmo tempo. O preço é herdar as decisões do Winthor, e
algumas delas nós escolhemos **não** herdar — cada uma está registrada abaixo com o motivo.

## O que o banco disse

Levantado nas dc29 a dc31, com o Gabriel executando as consultas. Nunca conectamos no Oracle.

| | |
|---|---|
| Usuário da API | `EDI`, com **58 privilégios, todos `SELECT`** (mais `EXECUTE` no `DECRYPT`) |
| Tabelas de permissão | `PCCONTRO` (rotina), `PCCONTROI` (controle), `PCLIB` (filiais) |
| Como elas chegam | sinônimo no `EDI` sobre a tabela em `EPOCA` — liberadas em 15/09/2026 |
| Verificação de senha | `EPCTI.DECRYPT(SENHABD, USUARIOBD)`, idêntica à `EPOCA.DECRYPT` nas 5.583 senhas |
| Tamanho | `PCCONTRO` 184.739 · `PCCONTROI` 377.190 · **`PCLIB` 8.478.079** |

**A regra que este levantamento cobrou três vezes:** `ALL_OBJECTS` vazio aqui **nunca é
resposta, é pergunta**. Foi falta de privilégio nas três, e cada uma custou um ciclo de ida e
volta. Antes de concluir que um objeto não existe, confirme com quem enxerga o schema.

**A rotina 9995 não é uma tela Delphi.** Ela e as vizinhas (9996–9999) têm `ROTINAWEB = 'S'` e
existem para pendurar permissão dos painéis web da casa — `PAINEL WEB GERENCIAL`,
`VENDAS WEB`, `PAINEL WEB LOGISTICA`, `PAINEL WEB E-COMMERCE`, `PAINEL WEB GRUPO`. Não há
executável que "defina" controles nelas, então o número livre é livre de verdade.

**Descrição de `CODCONTROLE` não existe no banco.** A `PCROTINA` tem 28 colunas e nenhuma
sobre controle; o único registro de que um controle existe é a linha de permissão de alguém em
`PCCONTROI`. O significado de cada número vive na **rotina 530**, na tela — é de lá que tem de
vir o número da guia DRE, e é por isso que este documento registra qual escolhemos e por quê.

## A permissão: a da própria 9815

**Decisão do Gabriel em 16/09/2026.** A web lê a permissão que já existe na rotina **9815,
guia DRE** — a mesma que o Winthor consulta para abrir a tela Delphi. Quem usa a rotina hoje
entra na web sem cadastro nenhum.

O ganho maior não é evitar o cadastro: é que **quem perde o acesso na 9815 perde na web no
mesmo instante**. Acesso que mora em dois lugares é acesso que alguém esquece de revogar em
um deles, e o esquecido é sempre o que ninguém olha.

A regra do login, inteira:

```
PCCONTRO  (9815, ACESSO = 'S')           →  pode abrir a rotina
PCCONTROI (9815, controle 3, ACESSO='S') →  GUIA 4-DRE: pode ver o DRE
PCEMPR    NOME_GUERRA preenchido, SENHABD preenchida, SITUACAO = 'A'
PCLIB     (CODTABELA = 1)                →  as filiais que ele pode apurar
```

O **3** veio da tela da rotina 530 em 16/09/2026 — `GUIA 4-DRE`, entre os 43 controles da
9815. Registrado aqui porque o banco não guarda essa descrição: em `PCCONTROI` ele é só o
número 3.

**Nada é cadastrado por nós.** Some a rotina 530 do caminho, e some junto o risco de escolher
um `CODCONTROLE` que colidisse com outra coisa.

> **O que esta decisão substituiu.** Até 16/09/2026 o plano era criar os controles 2 e 3 na
> rotina 9995 (`PAINEL WEB GERENCIAL`), com o 3 separando o duplo clique do acesso à tela.
> Aquele desenho dependia de a 9995 ser rotina **web**, sem executável que definisse controles
> — o que a dc31 confirmou. Ele continua sendo o plano B se a 9815 não tiver um controle que
> corresponda à guia DRE.

### O controle 46 — a lucratividade

A mesma tela da 530 mostrou um segundo controle com "DRE" no nome:

> **46 — Permite visualizar Lucratividade no DRE**

**Isto é escopo novo, e é o tipo que passa despercebido.** A 9815 esconde alguma coisa de quem
não tem o 46; a nossa tela mostra tudo para todo mundo. Reaproveitar a permissão da 9815 e ao
mesmo tempo exibir mais do que ela exibe é o oposto exato do que a decisão de reaproveitar
queria garantir — e o vazamento não apareceria em teste nenhum, porque quem testa tem acesso a
tudo.

Não há **uma única menção** a "lucratividade" no projeto: nem no levantamento da rotina, nem no
código, nem nas planilhas de conferência. Então uma de três: ela está numa parte do DRE que
migramos sem saber que era controlada; tem outro nome aqui; ou não está na guia 4-DRE e o
controle se refere a outra tela.

Pendente: **o que o 46 esconde**, visto na 9815 com um usuário que não o tenha. A
[dc39](validacao/dc39_permissao_da_9815.sql) §6 mede quantas pessoas têm a guia e não têm a
lucratividade — se der zero, o ponto é teórico hoje, mas continua sendo dívida: basta alguém
tirar o 46 de uma pessoa na 530 para a web divergir do Winthor em silêncio.

### O que ainda não sabemos

**Os outros 41 controles.** O filtro da 530 foi a palavra "DRE", e a 9815 tem 43 controles.
Pode haver outro que afete a guia sem ter "DRE" no nome — algo como "permite visualizar custo"
ou "permite exportar". Vale olhar a lista inteira uma vez, agora, em vez de descobrir um a um
quando alguém reclamar.

**Se o duplo clique tem controle próprio.** A decisão anterior o separava porque ele mostra
cliente, nota e lançamento individual — outro nível de exposição que o total de uma linha — e
custa de segundos a minutos de Oracle por clique. Reaproveitando a 9815, essa separação só
existe se o Winthor já tiver um controle para isso. Se não tiver, **quem abre o DRE detalha**,
e isso fica registrado aqui como consequência aceita, não como esquecimento.

## O que decidimos NÃO herdar do painel antigo

Três comportamentos do `old-verify-client.sql` que reproduzir seria copiar o defeito junto.

### 1. O login identifica só por `NOME_GUERRA`

O painel antigo aceita `NOME_GUERRA` **ou** `NVL(CODBARRA, MATRICULA)`. Isso produz **44 casos
em que o mesmo texto casa duas pessoas diferentes** — `774` é o nome de guerra de uma e a
matrícula de outra, e `1002915` é o espelho exato do mesmo par. Em muitos desses casos as duas
têm senha.

Aceitar só o nome de guerra elimina a colisão na origem, em vez de desempatá-la.

*Custo:* quem não tem `NOME_GUERRA` preenchido perde o caminho de entrada. Medido pela dc38.

### 2. Nada de `ROWNUM = 1` sem `ORDER BY`

O painel antigo resolve o empate pegando a primeira linha que o Oracle devolver — e sem
`ORDER BY` o Oracle não promete ordem nenhuma: a escolha pode mudar entre execuções, com o
plano ou a estatística.

O detalhe que quase passou: **esse `ROWNUM` roda antes da verificação de senha**. Quando duas
linhas casam e só uma tem senha, o sorteio pode devolver a que não tem — e a pessoa certa,
digitando a senha certa, não entra. O defeito é de indisponibilidade, não de invasão.

Se a dc38 confirmar que entre ativos com senha não há `NOME_GUERRA` repetido, o `ROWNUM` sai
do código **sem substituto**: não há empate para desempatar.

### 3. Só entra quem está com `SITUACAO = 'A'`

O painel antigo não filtra nada: a única condição é a senha bater. Hoje **3.072 pessoas
inativas com senha entrariam**. `DTDEMISSAO` não serve de filtro — tem 22 linhas preenchidas na
base inteira.

Quem for barrado vê **"seu cadastro está inativo"**, não "senha incorreta". A distinção não é
gentileza: sem ela a pessoa tenta de novo achando que errou a digitação, e depois liga.

Pelo mesmo motivo, quem não tem senha cadastrada (**2.810 pessoas**, de 8.393) vê *"você não
tem senha cadastrada"*. Sei que isso contraria o conselho de não revelar se o usuário existe;
aqui não vale, porque o sistema é interno, quem digita já é funcionário, e o painel antigo
nunca escondeu isso. O custo de 2.810 pessoas presas numa mensagem que não explica nada é
maior que o de um funcionário descobrir que uma matrícula não tem senha.

## Desenho da sessão

Decidido em 14/09/2026, antes do levantamento, e nada no banco o contradisse:

- **JWT próprio**, emitido pela nossa API sobre a senha do `PCEMPR`. Sem provedor externo.
- **O navegador guarda só um ID opaco**, em cookie `HttpOnly`; o token fica no servidor Next,
  que funciona como BFF. Reiniciar o Next derruba as sessões — aceito pelo Gabriel.
- `Microsoft.AspNetCore.Authentication.JwtBearer` aprovado. Toda outra biblioteca ainda passa
  por aprovação.

**`PCLIB` nunca é lida inteira.** São 8,4 milhões de linhas; a leitura é sempre por `CODFUNC`,
com os índices que já existem. As filiais de cada pessoa saem daí e limitam a apuração — hoje
a tela aceita qualquer filial que o corpo da requisição pedir.

A função `FNC_CONCATENA_LISTA`, que a 9815 usa para montar a lista de filiais, **não** entra: o
`EDI` não tem `EXECUTE` nela, e a API monta a lista em C#.

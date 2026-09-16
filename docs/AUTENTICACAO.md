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
`PCCONTROI`. O significado de cada número é convenção de quem escreveu o painel — por isso a
tabela da próxima seção é a **única** documentação dos nossos.

## As permissões novas

Na rotina **9995**, onde a numeração é contígua a partir de 1 e o controle 1 já está ocupado.

| `CODCONTROLE` | O que libera | Por que é separado |
|---|---|---|
| **2** | Abrir o DRE Gerencial | é o acesso à rotina |
| **3** | Usar o duplo clique (detalhamento) | mostra **cliente, nota e lançamento individual** — outro nível de exposição que o total de uma linha — e custa de segundos a minutos de Oracle por clique |

Exportação e impressão **não** têm controle próprio: quem vê a tela fotografa a tela, e
controlar o botão seria teatro de segurança ao custo de mais uma linha por pessoa na 530.

**O cadastro é do Gabriel, pela rotina 530.** A API nunca escreve em tabela legada — regra do
projeto, e desde 15/09/2026 também garantia do banco, já que o `EDI` só tem `SELECT`.

Quem já tem a 9995 hoje (nove pessoas, todas com acesso `S`): ELIAS, ESDRAS, GABRIELFREITAS,
HAFFES, MARCELOFREITAS, MARCILEY, MARCILEYROBERTO, SERGIOMEDICE e a matrícula 5476. Elas
herdam o painel-pai no dia em que o login subir, mas **não** os controles 2 e 3, que começam
vazios.

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

# AGENTS.md — regras deste repositório

Leia [CLAUDE.md](CLAUDE.md) para o contexto. Aqui estão as regras. São imperativas.

## Proibido

- **Conectar no Oracle.** Nunca execute query, nunca peça credencial, nunca aceite uma
  colada no chat. Precisa inspecionar o banco? Escreva a query, entregue ao Gabriel,
  trabalhe com o resultado que ele colar de volta.
- **Alterar tabela legada do Winthor** (`PC*`). Nada de `INSERT`, `UPDATE`, `DELETE`, DDL ou
  migration. Migration só em tabela nova com prefixo próprio.
- **Commitar credencial.** `appsettings.json` vai com valores vazios; segredo mora em
  `appsettings.{Ambiente}.json` (ignorado) ou variável de ambiente.
- **Logar** senha, token, string de conexão ou dado sensível — inclusive dentro de mensagem
  de exception.
- **Instalar biblioteca sem aprovação.** Proponha com justificativa e alternativa; espere o ok.
- **"Corrigir" número da 9815.** A web tem que bater com o Delphi, defeito incluído. Achou
  algo errado? Documente e pergunte — não conserte por conta.
- **Avançar de fase sem aprovação explícita.** Terminou, mostre o resultado e pare.
- **Desfazer regra já aprovada.** Toda mudança de comportamento do DRE que o Gabriel pediu
  está em [docs/rotinas/9815-dre-gerencial/DIVERGENCIAS.md](docs/rotinas/9815-dre-gerencial/DIVERGENCIAS.md), numerada, com data e com o script
  que a mede. **Uma branch nova não pode revertê-las, nem por descuido de merge.** Antes de
  abrir trabalho novo, traga a `main` para a sua branch; antes de entregar, traga de novo e
  confira a lista do §"As regras que nenhuma branch pode desfazer".

  Aconteceu em 02/10/2026: a branch `feat/filtro-fornecedor` saiu de um ponto anterior a 17
  commits da `main` e, na tela, as duas contas subidas em 25/09 pareciam ter voltado a ser
  informativas. **O filtro não desfez nada — ele nunca teve a regra.** O efeito para quem
  olha é idêntico, e é por isso que a conferência tem de ser por lista, não por impressão.

## Obrigatório

- **Português** em código, comentário, documentação e conversa. Com acentuação correta.
- **Evidência antes de afirmação.** O que se sabe de uma rotina do Winthor vem do fonte Delphi
  (`UBase.pas`) e do trace SQL que ela mandou ao Oracle — para a 9815, em
  `docs/rotinas/9815-dre-gerencial/referencia-oficial/`. Não presuma comportamento: leia o
  fonte, confira no trace, ou marque como lacuna em aberto.
- **Documentação na camada certa.** O que a próxima rotina vai precisar é **plataforma**
  (`docs/plataforma/`); o que some junto com a rotina é da pasta dela
  (`docs/rotinas/<rotina>/`). Ver [docs/README.md](docs/README.md).
- **`Result<T>`** para fluxo de negócio previsível. Exception só para falha de infraestrutura.
- **`ApiResponse<T>`** como envelope de toda resposta HTTP.
- **Dapper** para tabelas legadas e stored procedures. EF Core só para tabelas novas.
- **Uma rotina = um módulo.** Pasta em `Application/Features/`, classe implementando
  `IModuleInstaller`. Nunca registre serviço de rotina no `Program.cs`.
- **Alias UPPERCASE** em toda query, para o Dapper mapear. Ver `docs/plataforma/CONVENCOES_ORACLE.md`.

## Armadilhas do framework

| Armadilha | O que acontece | Como evitar |
|---|---|---|
| **ODP.NET usa bind posicional** | `BindByName = false` é o padrão: a ordem dos parâmetros tem que bater com a ordem dos `:placeholders`. Nome repetido precisa de alias único | `docs/plataforma/CONVENCOES_ORACLE.md` |
| **O banco é 19c, não 11g** | Recursos descartados por engano — o paralelismo ficou 2 meses fora do radar | `OFFSET/FETCH`, `PARALLEL` e planos adaptativos existem. O código atual pagina com `ROWNUM`, que continua válido |
| **`TO_NUMBER` em código hierárquico** | `ORA-01722` com `9701.001.02`, ou colisão silenciosa de chaves | Chave de agrupamento é `VARCHAR2`. Sempre |
| **`COR` do `EPCPARDRE` é `TColor` do Delphi** | BGR, não RGB. Tratar como RGB inverte os canais e o azul vira laranja | Inverter os bytes |
| **`(+)` do Oracle** | Sintaxe legada de outer join; combinada com `IN`/`OR` dá resultado diferente de `LEFT JOIN` | Reproduza o `(+)` como está ao replicar a 9815 |
| **Extensão de navegador quebra hidratação** | LanguageTool e Grammarly injetam atributos no `<html>` | `suppressHydrationWarning` no `<html>` |
| **`QueryClient` em escopo de módulo** | Cache vaza entre requisições no App Router | Criar dentro de `useState` |
| **`next dev` reescreve `client-new-kpi/AGENTS.md`** | Suas edições somem | Regras do projeto ficam neste arquivo, na raiz |

## Antes de entregar

- `dotnet build` sem aviso e `npx tsc --noEmit` limpo.
- Nada de credencial no diff.
- Documentação atualizada junto com a mudança, não depois.

## Skills disponíveis

Em `.claude/skills/{nome}/SKILL.md`.

| Skill | Quando usar |
|---|---|
| **`new-rotina`** | criar uma rotina nova do Winthor, do módulo ao controller, com o front delegado a `new-page` |
| **`new-query`** | acrescentar uma consulta Oracle a uma rotina existente |
| **`new-page`** | criar uma rota do App Router já conectada à API |
| **`conferir-dre`** | validar números contra as planilhas exportadas da 9815 — o ciclo da Fase 4 |

`new-component` fica para quando a tela da 9815 existir e as convenções de componente
estiverem provadas na prática.

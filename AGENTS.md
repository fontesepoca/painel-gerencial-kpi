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

## Obrigatório

- **Português** em código, comentário, documentação e conversa. Com acentuação correta.
- **Evidência antes de afirmação.** Este projeto não tem o fonte Delphi: o que se sabe da 9815
  veio do trace SQL em `docs/Resultado das consultas na rotina oficial/`. Não presuma
  comportamento — verifique no trace, ou marque como lacuna em aberto.
- **`Result<T>`** para fluxo de negócio previsível. Exception só para falha de infraestrutura.
- **`ApiResponse<T>`** como envelope de toda resposta HTTP.
- **Dapper** para tabelas legadas e stored procedures. EF Core só para tabelas novas.
- **Uma rotina = um módulo.** Pasta em `Application/Features/`, classe implementando
  `IModuleInstaller`. Nunca registre serviço de rotina no `Program.cs`.
- **Alias UPPERCASE** em toda query, para o Dapper mapear. Ver `docs/CONVENCOES_ORACLE.md`.

## Armadilhas do framework

| Armadilha | O que acontece | Como evitar |
|---|---|---|
| **ODP.NET usa bind posicional** | `BindByName = false` é o padrão: a ordem dos parâmetros tem que bater com a ordem dos `:placeholders`. Nome repetido precisa de alias único | `docs/CONVENCOES_ORACLE.md` |
| **Oracle 11g não tem `OFFSET/FETCH`** | Erro de sintaxe | Paginação com `ROWNUM` em subconsulta aninhada |
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

# Preferências de tela por usuário

Desde 25/11/2026, o que a pessoa escolhe no menu **Exibição** do DRE fica guardado no banco,
por usuário: a tela abre como ela deixou, em qualquer aba e em qualquer máquina. A estrutura
serve a qualquer tela e a outros assuntos (a ordem das linhas, os filtros) quando forem
decididos.

Design e decisões: [spec de 25/11/2026](../superpowers/specs/2026-11-25-preferencias-por-usuario-design.md).

## A tabela

`TAB_WEB_PREFERENCIA_TELA` — uma linha por (matrícula, tela), as preferências num JSON. DDL,
grant, sinônimo e conferência: [pr0](validacao/pr0_tab_web_preferencia_tela.sql).

| Coluna | |
|---|---|
| `MATRICULA` | `PCEMPR.MATRICULA`, vinda do token. Sem FK, de propósito (como a `TAB_WEB_CENTROC_FORNEC`) |
| `TELA` | a rota da tela: `dre-gerencial` |
| `PREFERENCIAS` | `CLOB` com check `IS JSON` |
| `DTCADASTRO` · `DTALTERACAO` | a primeira gravação e a última |

**É a primeira tabela em que a aplicação grava** — exceção à regra "o piloto é 100% leitura",
registrada no [SCHEMA_BANCO.md](SCHEMA_BANCO.md). O grant é `SELECT, INSERT, UPDATE`, sem
`DELETE`.

| Base | Situação |
|---|---|
| Época | criada em 25/11/2026; `PreferenciasNoBanco: true` |
| Minas Rural | **não criada**; `PreferenciasNoBanco: false` — a tela abre no padrão e não lembra |

## O documento

Uma seção por assunto. Só o que a pessoa mexeu fica gravado; o resto segue o padrão da tela.

```json
{
  "exibicao": { "confirmados": true, "ah": false },
  "ordem":    { },
  "filtros":  { }
}
```

`ordem` e `filtros` estão **reservadas**: nenhum código as lê ou grava ainda.

## A API

| Rota | |
|---|---|
| `GET /api/preferencias/{tela}` | o documento da pessoa, ou `{}` |
| `POST /api/preferencias/{tela}` | junta o corpo ao guardado; responde `{ "salvo": true }`, ou `false` na base desligada |

- **A matrícula vem do token**, nunca da URL nem do corpo.
- `tela` tem de estar em `PreferenciasService.Telas`; o corpo, ser um objeto JSON de até 32 KB.
- A API **não valida o conteúdo das seções** — guardar é dela, interpretar é da tela.
- A gravação é um `MERGE` com `JSON_MERGEPATCH(... RETURNING CLOB)`: só as chaves enviadas
  mudam, então duas abas não apagam uma a outra. Um `null` no trecho apaga a chave.
- `POST`, e não `PATCH`: o BFF só repassa `GET` e `POST` (`lib/servidor/decidirRepasse.ts`).
- Base com `Bases:<Id>:PreferenciasNoBanco` desligada (ou ausente): `GET` devolve `{}` e `POST`
  devolve `salvo: false`, **sem tocar no banco**.

## A tela do DRE

- `lib/preferenciasDaExibicao.ts` — o padrão de cada opção (`PADRAO_DA_EXIBICAO`), a leitura
  defensiva do que vem do banco, e a loja que decide o que gravar. Sem rede: o
  [pr1](validacao/pr1_preferencias_da_exibicao.mjs) roda este módulo.
- `hooks/useExibicao.ts` — a loja com o `POST` em fila, e `useCarregarExibicao()`, que lê uma
  vez por base e matrícula.
- O selo do botão Exibição conta as opções diferentes do **padrão**.
- O Ocultar baixas (`useOcultarBaixas`) é uma das opções: mudar no detalhamento também grava.
  A página dedicada do detalhe não carrega nem grava.
- Falhou a leitura: a tela fica no padrão. Falhou a gravação: a escolha vale até fechar a aba.
  Nenhuma das duas mostra erro.

## Para uma tela nova guardar as suas opções

1. Acrescentar a rota da tela em `PreferenciasService.Telas` (e um caso no pr2).
2. No front, um módulo como o `lib/preferenciasDaExibicao.ts`: os ids, o padrão, a leitura
   defensiva — e uma loja criada com o `gravar` apontando para `/api/preferencias/<tela>`.
3. A tela carrega uma vez (`useCarregar…`) e lê/muda pela loja.

## Para ligar no Minas Rural

1. Rodar o bloco do Minas Rural do [pr0](validacao/pr0_tab_web_preferencia_tela.sql).
2. `appsettings.json` → `Bases:MinasRural:PreferenciasNoBanco: true`, e reiniciar a API (o
   registro de bases é lido na subida).

## Testes

- [pr1](validacao/pr1_preferencias_da_exibicao.mjs) — o front, sem rede.
- [pr2](validacao/pr2_preferencias_na_api.cs) — o serviço, com repositório falso.
- dc87 — o BFF repassa `preferencias` só com sessão.
- **Sem teste automático:** a repetição do `MERGE` no `ORA-00001` (duas primeiras gravações
  simultâneas) — `OracleException` não tem construtor público.

No banco, depois de clicar na tela:

```sql
SELECT MATRICULA, TELA, PREFERENCIAS, DTCADASTRO, DTALTERACAO
  FROM TAB_WEB_PREFERENCIA_TELA
 ORDER BY DTALTERACAO DESC NULLS LAST;
```

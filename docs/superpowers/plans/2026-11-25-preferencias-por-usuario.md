# Preferências de exibição por usuário — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** as 12 opções do menu Exibição do DRE ficam salvas por usuário na
`TAB_WEB_PREFERENCIA_TELA` e a tela abre como a pessoa deixou, em qualquer máquina.

**Architecture:** API ganha o módulo `Preferencias` (GET/POST `/api/preferencias/{tela}`,
Dapper, `MERGE` com `JSON_MERGEPATCH`), ligado por base em `Bases:<Id>:PreferenciasNoBanco`.
O front troca os `useState` das opções por uma loja de módulo (`useSyncExternalStore`) que
grava só o que difere do banco; `useOcultarBaixas` vira vista dela.

**Tech Stack:** .NET 10, Dapper, ODP.NET, Next.js 16, React 19.

**Spec:** [docs/superpowers/specs/2026-11-25-preferencias-por-usuario-design.md](../specs/2026-11-25-preferencias-por-usuario-design.md)

## Global Constraints

- Nenhuma biblioteca nova. Nenhum número do DRE muda.
- Binds posicionais (`BindByName = false`): nome repetido no SQL = parâmetro repetido.
- `PC*` não se escreve; a única escrita é na `TAB_WEB_PREFERENCIA_TELA`.
- **Sem commit**: o trabalho fica no working tree até o Gabriel pedir (regra do projeto).
- `git log --oneline HEAD..main` vazio antes de começar e antes de entregar.
- Comentários e mensagens em português com acentos.

## Review Focus

1. Duas abas: uma grava a Exibição, outra a mesma opção — o `JSON_MERGEPATCH` junta, não sobrescreve.
2. Clique antes do `GET` chegar: vale o clique, e ele é gravado.
3. Sem Total + Só Total: nunca os dois marcados, nem vindos do banco, nem da junção com o clique.
4. Minas Rural (desligada): nenhuma consulta à tabela, nenhum erro na tela.
5. Página dedicada do detalhe: recebe o Ocultar baixas e não grava.

---

### Task 1: API — chave por base e serviço

**Files:** Modify `api-new-kpi/Domain/Entities/BaseConfigurada.cs`,
`Application/Common/Bases/OpcaoDeBase.cs`, `Application/Common/Bases/RegistroDeBases.cs`,
`appsettings.json`. Create `Domain/Interfaces/IPreferenciasRepository.cs`,
`Application/Features/Preferencias/PreferenciasService.cs`,
`Application/Features/Preferencias/Dtos/PreferenciasSalvasDto.cs`. Test:
`docs/plataforma/validacao/pr2_preferencias_na_api.cs`.

**Produces:** `BaseConfigurada.PreferenciasNoBanco` (parâmetro opcional no fim do construtor,
padrão `false`); `IPreferenciasRepository { Task<string?> ObterAsync(int, string, ct); Task
SalvarAsync(int, string, string trecho, ct); }`; `PreferenciasService(IPreferenciasRepository,
IBaseAtual)` com `ObterAsync(int matricula, string tela, ct) → Result<JsonElement>`,
`SalvarAsync(int, string, JsonElement trecho, ct) → Result<PreferenciasSalvasDto>`, `static
int? MatriculaDo(ClaimsPrincipal)`, `Telas = {"dre-gerencial"}`, `TamanhoMaximoEmBytes = 32768`.

- [ ] Escrever o pr2 (cenários A–H: tela fora da lista, corpo não-objeto, limite de 32 KB,
  gravação e leitura, `{}` para nada/estragado, base desligada sem tocar no repositório,
  `MatriculaDo`, configuração real do `appsettings.json`).
- [ ] Rodar — esperado: não compila (`PreferenciasService` inexistente).
- [ ] Implementar a chave por base e o serviço (ordem das regras: tela → forma do corpo →
  tamanho → base desligada → repositório).
- [ ] Rodar `dotnet run docs/plataforma/validacao/pr2_preferencias_na_api.cs -p:BaseOutputPath="$TEMP/pr2/"` — esperado: `✓ pr2 passou`.
- [ ] Rodar tb1 (registro de bases continua igual).

### Task 2: API — repositório, controller e módulo

**Files:** Create `Infrastructure/Persistence/ParametroClob.cs`,
`Infrastructure/Persistence/Queries/PreferenciasQueries.cs`,
`Infrastructure/Persistence/Repositories/PreferenciasRepository.cs`,
`Application/Features/Preferencias/PreferenciasModule.cs`,
`Controllers/PreferenciasController.cs`.

- `ParametroClob : SqlMapper.ICustomQueryParameter` adiciona `OracleParameter(name,
  OracleDbType.Clob)`.
- `Salvar`: o `MERGE` da spec com `:matricula, :tela, :trecho1, :trecho2` (posicional);
  `ORA-00001` → repete uma vez.
- Controller `[Authorize] [Route("api/preferencias")]`: `GET {tela}`, `POST {tela}` com
  `[FromBody] JsonElement` e `[RequestSizeLimit(65536)]`; sem matrícula → 403; falha → 400.

- [ ] Implementar.
- [ ] `dotnet build api-new-kpi -p:BaseOutputPath="$TEMP/build-pr/"` — esperado: 0 erros.
- [ ] pr2 e tb1 de novo.

### Task 3: Front — lógica pura e loja

**Files:** Create `client-new-kpi/lib/preferenciasDaExibicao.ts`. Test:
`docs/plataforma/validacao/pr1_preferencias_da_exibicao.mjs`.

**Produces:** `IDS_DA_EXIBICAO`, `IdDaExibicao`, `Exibicao`, `TrechoDaExibicao`,
`PADRAO_DA_EXIBICAO`, `lerExibicao(unknown)`, `aoCarregar(atual, salvo) → {estado, gravado}`,
`diferencas(atual, gravado)`, `trechoDaExibicao(mudancas)`, `contarForaDoPadrao(opcoes)`,
`criarLojaDaExibicao(gravar) → { ler, inscrever, mudar(parcial), carregar(chave, documento),
jaCarregou(chave) }`.

- [ ] Escrever o pr1 (padrão = estado inicial de hoje; selo em 0; leitura defensiva; junção
  com clique anterior, inclusive o conflito Sem Total/Só Total; loja: nada grava antes de
  carregar, clique anterior vence e é gravado, carga repetida não faz nada, clique igual não
  grava nem troca o objeto, par Sem Total/Só Total num trecho só, `GET` falho = `{}`).
- [ ] Rodar — esperado: falha (módulo inexistente).
- [ ] Implementar.
- [ ] `node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/plataforma/validacao/pr1_preferencias_da_exibicao.mjs` — esperado: `✓ pr1 passou`.

### Task 4: Front — ligar na tela e no BFF

**Files:** Create `client-new-kpi/hooks/useExibicao.ts`. Modify `hooks/useOcultarBaixas.ts`,
`app/dre-gerencial/page.tsx`, `components/dre-gerencial/MenuDeExibicao.tsx`,
`lib/servidor/decidirRepasse.ts`, `docs/rotinas/9815-dre-gerencial/validacao/dc87_proxy_do_bff.mjs`.

- `useExibicao.ts`: instância da loja com `POST` em fila, `useExibicao()`,
  `definirExibicao(parcial)`, `useCarregarExibicao()` (GET uma vez por base:matrícula; falha →
  `{}`).
- `useOcultarBaixas`: vista da loja; `definirOcultarBaixas(v)` = `definirExibicao({"ocultar-baixas": v})`.
- `page.tsx`: os 12 estados viram leituras de `exibicao`; cada `onMudar` chama
  `mudarExibicao({...})`; Sem/Só Total mandam o par num objeto só. Os comentários de data e
  motivo de cada padrão vão para `PADRAO_DA_EXIBICAO`.
- `MenuDeExibicao`: selo por `contarForaDoPadrao`; some a função `padrao()`.
- `decidirRepasse`: `preferencias` em `REPASSADOS`; dc87 ganha os dois casos.

- [ ] dc87 com os casos novos — esperado: falha antes da mudança no `REPASSADOS`.
- [ ] Implementar.
- [ ] dc87, pr1, `npx tsc --noEmit`, `npx eslint` nos arquivos tocados — esperado: limpos.
- [ ] Validações do DRE que leem o Ocultar baixas ou o Excel (dc111, dc112, dc94) continuam passando.

### Task 5: Documentação

- [ ] `docs/plataforma/PREFERENCIAS.md` (novo).
- [ ] `docs/plataforma/validacao/pr0_tab_web_preferencia_tela.sql` (DDL como criado; dono da Época pendente).
- [ ] `SCHEMA_BANCO.md`: exceção ao "100% leitura".
- [ ] `BIFURCACAO_DE_BASES.md`: a chave `PreferenciasNoBanco`.
- [ ] `CLAUDE.md`/`docs/README.md`: link para PREFERENCIAS.md onde couber.

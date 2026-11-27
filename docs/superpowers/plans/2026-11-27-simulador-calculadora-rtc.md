# Simulador de preço × calculadora RTC — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cada linha do simulador mostra o preço novo da Reforma (CBS e IBS) no cenário
escolhido, com as alíquotas da calculadora da Receita, ao lado do preço atual e da diferença.

**Architecture:** a página de produtos chega como hoje. A tela pede depois à nossa API
(`POST /api/simulador-preco/aliquotas-rtc`) as alíquotas e reduções das combinações
NCM + CST + classe da página; a API chama o `/observabilidade/regime-geral` da calculadora
(sempre 2026), guarda em `IMemoryCache` e nunca devolve 500 por falha dela. As fórmulas da
planilha v3 rodam na tela, num arquivo puro (`lib/precoReforma.ts`); os parâmetros dos cenários
estimados ficam nas preferências do comprador.

**Tech Stack:** .NET 10, Dapper, ODP.NET, `HttpClient` e `IMemoryCache` do próprio .NET;
Next.js 16, React 19, React Query v5, `lib/decimalExato.ts`.

**Spec:** [docs/superpowers/specs/2026-11-27-simulador-calculadora-rtc-design.md](../specs/2026-11-27-simulador-calculadora-rtc-design.md)
— e o registro das decisões D1–D17 e dos testes em
[CALCULADORA_RTC.md](../../rotinas/simulador-preco/CALCULADORA_RTC.md).

## Global Constraints

- **Nenhum comando sem o OK do Gabriel** (build, testes, node, dotnet, npm, git). Peça antes de
  cada verificação; ele pode rodar ele mesmo.
- **Sem commit nem push**: o trabalho fica no working tree; quem commita é o Gabriel.
- Nenhuma biblioteca nova. `HttpClient`/`AddHttpClient` e `IMemoryCache`/`AddMemoryCache` já
  vêm no .NET.
- `PC*` não se escreve. Nenhuma tabela nova. O preço novo não é gravado em lugar nenhum.
- Binds posicionais (`BindByName = false`): nome repetido no SQL = parâmetro repetido.
- O navegador nunca chama `10.122.65.45`; só a API.
- Decidir erro da calculadora pelo `code`, nunca pelo texto.
- Conta da tela em decimal exato (`lib/decimalExato.ts`), nunca `number`.
- CBS e IBS por fora: 2 casas. Preço novo e diferenças: 3 casas.
- Toda tela leva `<ControlesDeExibicao />`; todo efeito visual existe nos dois temas.
- Comentários e mensagens em português com acentos.
- `git log --oneline HEAD..main` vazio antes de começar e antes de entregar.

## Review Focus

1. Calculadora fora do ar ou lenta (> 10 s): a página de produtos aparece igual, com a faixa de
   indisponível e "—" nas colunas da reforma; a rota responde 200, nunca 500.
2. Uma linha `INCONSISTENCIA_ENTRADA` no meio da página: só ela fica sem preço novo; as outras
   99 calculam (D5).
3. Produto isento (CST 400/410, alíquota zero na calculadora) num cenário estimado: CBS e IBS
   zerados, e não 11,2% cheios.
4. Comprador muda um percentual ou o preço no quadro: o preço atual e o preço novo andam juntos,
   e a diferença continua medida contra o `prFinal` editado; o `percCbs` não mexe no novo.
5. Minas Rural (sem preferências no banco, sem sp20): o quadro de parâmetros funciona sem
   lembrar, e a rota devolve a mensagem clara de filial sem IBGE, sem quebrar a página.

Cada item tem o seu teste na tarefa dona: 1 e 2 → Task 3 (sp22); 3 → Task 3 (sp22) e Task 5
(sp21); 4 → Task 5 (sp21); 5 → Task 3 (sp22) e Task 6 (sp21, leitura das preferências).

---

### Task 1: Pré-requisitos do Gabriel (sem código)

**Files:** Modify `docs/rotinas/simulador-preco/CALCULADORA_RTC.md`. Create
`docs/rotinas/simulador-preco/referencia/Simulador_Precificacao_Reforma_Tributaria_v3.xlsx`.

- [ ] Pedir ao Gabriel o **Teste 7** no Swagger (`/api/calculadora/observabilidade/regime-geral`,
  corpo do Teste 6) com um produto de CST 400 ou 410 do cadastro. Registrar no CALCULADORA_RTC.md
  como "Teste 7": se veio `gRed` com `pRedAliq` 100 ou `pCBS`/`pIBSUF` zerados. Guardar o JSON da
  resposta: vira caso da sp22.
- [ ] Pedir ao Gabriel para copiar a planilha v3, sem edição, para `referencia/` (a sp21 tira dela
  os valores esperados).
- [ ] Conferir `git log --oneline HEAD..main` vazio (com o OK dele).

### Task 2: API — regime do fornecedor (A10)

**Files:** Modify `api-new-kpi/Infrastructure/Persistence/Queries/SimuladorPrecoQueries.cs`
(`ConsultaPaginada`, junto de `FO.FORNECEDOR AS FORNECEDOR`),
`Domain/Entities/ProdutoSimulado.cs`, `Application/Features/SimuladorPreco/Dtos/SimuladorPrecoDtos.cs`,
`Application/Features/SimuladorPreco/SimuladorPrecoService.cs` (`ParaDto`),
`client-new-kpi/types/simulador-preco.ts`, `client-new-kpi/lib/simuladorPreco.ts`
(`linhaDeProdutoNovo`: `simplesNacional: null`). Test: sp15, sp5.

**Produces:** `ProdutoSimulado.SimplesNacional` (`string?`, `init`), último parâmetro do
`ProdutoSimuladoDto`; no front, `ProdutoSimulado.simplesNacional: string | null` (`"S"`, `"N"`,
nulo).

- [ ] Acrescentar `FO.SIMPLESNACIONAL AS SIMPLESNACIONAL` na `ConsultaPaginada`. **Não** mexer na
  `Consulta` nem no `ROW_NUMBER` (spec, seção 1).
- [ ] Rodar sp5 e sp15 (`node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/simulador-preco/validacao/sp5_sql_da_api_igual_a_referencia.mjs`, idem sp15) — esperado: IDENTICO e sp15 passando como antes.
- [ ] `dotnet build api-new-kpi` — esperado: 0 erros.
- [ ] Pedir ao Gabriel a sp6 no banco — esperado: `simplesNacional` em toda linha.

### Task 3: API — serviço das alíquotas RTC (sem rede)

**Files:** Create `api-new-kpi/Domain/Interfaces/ICalculadoraRtc.cs`,
`Domain/Entities/MunicipioDaFilial.cs`,
`Application/Features/SimuladorPreco/AliquotasRtcService.cs`,
`Application/Features/SimuladorPreco/Dtos/AliquotasRtcDtos.cs`. Modify
`Domain/Interfaces/ISimuladorPrecoRepository.cs`. Test:
`docs/rotinas/simulador-preco/validacao/sp22_aliquotas_rtc_na_api.cs` (padrão do pr2:
`#:project`, repositório e calculadora falsos).

**Produces:**
- `ICalculadoraRtc { Task<RespostaDaCalculadora> RegimeGeralAsync(string corpoJson, CancellationToken ct); }`
  e `record RespostaDaCalculadora(int? Status, string? Corpo)`. `Status` nulo = sem resposta
  (fora do ar, timeout).
- `ISimuladorPrecoRepository.ObterMunicipioDaFilialAsync(string codFilial, CancellationToken ct) → Task<IReadOnlyList<MunicipioDaFilial>>`;
  `MunicipioDaFilial { string? CodIbge; string? Uf }` (class com `init`).
- DTOs (records): `PedidoAliquotasRtcDto(string CodFilial, IReadOnlyList<CombinacaoRtcDto> Combinacoes)`,
  `CombinacaoRtcDto(string Ncm, string Cst, string CClassTrib)`,
  `RespostaAliquotasRtcDto(bool Disponivel, string? Mensagem, IReadOnlyList<AliquotaRtcDto> Itens)`,
  `AliquotaRtcDto(string Ncm, string Cst, string CClassTrib, string Estado, TributoRtcDto? Cbs, TributoRtcDto? IbsUf, TributoRtcDto? IbsMun, string? Fundamento, ErroRtcDto? Erro)`,
  `TributoRtcDto(decimal Aliquota, decimal Reducao)`, `ErroRtcDto(string Codigo, string Mensagem)`.
- `AliquotasRtcService(ISimuladorPrecoRepository, ICalculadoraRtc, IMemoryCache, IBaseAtual, TimeProvider)`
  com `ConsultarAsync(PedidoAliquotasRtcDto pedido, CancellationToken ct) → Task<Result<RespostaAliquotasRtcDto>>`;
  `const int LimiteDeCombinacoes = 100`; `static readonly TimeSpan PrazoDoCache = TimeSpan.FromHours(6)`.

- [ ] Escrever a sp22, com `Conferir(...)` como no pr2:
  - A. filial vazia ou com letra → `Invalido`; 0 ou 101 combinações → `Invalido`.
  - B. NCM com 7 dígitos, CST com 2, classe com 5 → item `INCONSISTENCIA_ENTRADA`, erro nosso,
    e a calculadora falsa **não** recebe esse item.
  - C. a mesma combinação 3 vezes no pedido → um item só no corpo enviado e um só na resposta
    (a tela distribui às linhas).
  - D. resposta do Teste 6 (um item `CALCULADO`, um `INCONSISTENCIA_ENTRADA` com `REG-011`) →
    `Disponivel = true`; o válido com `Cbs.Aliquota = 0.90m`, `IbsUf.Aliquota = 0.10m`,
    `IbsMun.Aliquota = 0m`; o inválido com `Erro.Codigo = "REG-011"` e `Cbs` nulo.
  - E. redução: `gRed.pRedAliq "60.00"` → `Reducao = 60m`; sem `gRed` e alíquota > 0 → `0m`;
    alíquota `"0.00"` → `100m`; e o JSON do Teste 7 da Task 1.
  - F. `Status = null` e `Status = 503` → `Ok` com `Disponivel = false` e
    `Mensagem = "Calculadora da Receita indisponível; preço novo não calculado."`; nenhuma
    exceção.
  - G. `Status = 422` (erro global) → `Disponivel = false`, mensagem com o `detail` dela.
  - H. segunda chamada igual → a calculadora falsa contou 1 chamada; depois de F, a seguinte
    chama de novo (indisponível não fica no cache).
  - I. filial com 0 e com 2 municípios → `Invalido("A filial 99 não tem um código IBGE único no cadastro (PCFILIAL × PCCIDADE).")`.
  - J. o corpo enviado: `versao "0.0.1"`, `tpDoc 55`, `municipio`/`uf` da filial,
    `baseCalculo 100`, `quantidade 1`, `unidade "UN"`; `dhFatoGerador` com a data do
    `TimeProvider` falso — em 15/03/2027 tem de sair 31/12/2026.
- [ ] Rodar `dotnet run docs/rotinas/simulador-preco/validacao/sp22_aliquotas_rtc_na_api.cs -p:BaseOutputPath="$TEMP/sp22/"` — esperado: não compila (`AliquotasRtcService` inexistente).
- [ ] Implementar. Ordem: validar filial e quantidade → separar as fora de formato → município
  (cache por `base.Id + filial`) → cache por combinação → uma chamada com as que faltam →
  ler com `CultureInfo.InvariantCulture` → guardar só se `Disponivel`. Logar falha da
  calculadora sem NCM nem corpo.
- [ ] Rodar de novo — esperado: `✓ sp22 passou`.

### Task 4: API — HTTP, SQL do município, rota e configuração

**Files:** Create `api-new-kpi/Infrastructure/Services/CalculadoraRtcHttp.cs`,
`Configurations/CalculadoraRtcOptions.cs`. Modify
`Infrastructure/Persistence/Queries/SimuladorPrecoQueries.cs` (`MunicipioDaFilial`, o SQL da
spec, seção 1), `Infrastructure/Persistence/Repositories/SimuladorPrecoRepository.cs`,
`Application/Features/SimuladorPreco/SimuladorPrecoModule.cs`,
`Controllers/SimuladorPrecoController.cs`, `appsettings.json`, `appsettings.example.json`,
`Application/Features/Preferencias/PreferenciasService.cs` (`Telas` + `"simulador-preco"`).
Test: pr2 (caso novo: `simulador-preco` aceita), sp22, build.

**Consumes:** Task 3.

- `CalculadoraRtcOptions { string UrlBase; int TimeoutSegundos = 10 }`, seção `CalculadoraRtc`,
  fora de `Bases`; valores da spec.
- `CalculadoraRtcHttp : ICalculadoraRtc` via `services.AddHttpClient<ICalculadoraRtc, CalculadoraRtcHttp>`,
  `Timeout` das opções; `POST {UrlBase}/calculadora/observabilidade/regime-geral`;
  `HttpRequestException` e `TaskCanceledException` (sem o `ct` do pedido cancelado) →
  `RespostaDaCalculadora(null, null)`.
- Módulo: `AddMemoryCache()`, `AddSingleton(TimeProvider.System)` se ainda não houver,
  `AddScoped<AliquotasRtcService>()`.
- Controller: `[HttpPost("aliquotas-rtc")]` com `[FromBody] PedidoAliquotasRtcDto`, mesmo envelope
  e mesma checagem de sessão do `consulta`; `Invalido` → 400.

- [ ] Acrescentar o caso no pr2; rodar — esperado: falha (tela desconhecida).
- [ ] Implementar.
- [ ] `dotnet build api-new-kpi`, pr2 e sp22 — esperado: 0 erros, `✓ pr2 passou`, `✓ sp22 passou`.
- [ ] Pedir ao Gabriel: com a API no ar, no Scalar, `aliquotas-rtc` para a filial 1 com o NCM do
  Teste 3 → `estado` e redução 100 na classe 200013; filial 99 → a mensagem de IBGE.

### Task 5: Front — as fórmulas (`lib/precoReforma.ts`)

**Files:** Create `client-new-kpi/lib/precoReforma.ts`,
`docs/rotinas/simulador-preco/validacao/sp21_preco_reforma.mjs`. Modify
`client-new-kpi/types/simulador-preco.ts`.

**Consumes:** `calcular`, `LinhaCalculada`, `PercentuaisDaLinha` de `lib/simuladorPreco.ts`.

**Produces** (em `types/simulador-preco.ts`):
- `type EstadoRtc = "CALCULADO" | "CALCULO_SIMULADO" | "INCONSISTENCIA_ENTRADA"`;
  `interface TributoRtc { aliquota: number; reducao: number }`;
  `interface AliquotaRtc { ncm; cst; cClassTrib: string; estado: EstadoRtc; cbs, ibsUf, ibsMun: TributoRtc | null; fundamento: string | null; erro: { codigo: string; mensagem: string } | null }`;
  `interface RespostaAliquotasRtc { disponivel: boolean; mensagem: string | null; itens: AliquotaRtc[] }`.
- `interface CamposDaReforma { qtdComprada?: number; qtdBonificada?: number; bonifGeraCredito?: boolean; verbaPct?: number; verbaFixa?: number; baseVerba?: "NET" | "GROSS" }`;
  `AjusteDaLinha.reforma?: CamposDaReforma`.
- `interface ParametrosDoCenario { cbs: number; ibsUf: number; ibsMun: number; pisCofinsAtivo: boolean; fatorIcmsSt: number }` (alíquotas em %).

Em `lib/precoReforma.ts`:
- `CST_IBS_CBS: Readonly<Record<string, { geraCredito: boolean; tributaSaida: boolean }>>` — a
  tabela da spec; ausente = `{ true, true }`.
- `interface EntradaReforma { linha: LinhaCalculada; percentuais: PercentuaisDaLinha; st: number; campos: CamposDaReforma; simplesNacional: string | null; cst: string | null; aliquota: AliquotaRtc; cenario: ParametrosDoCenario; creditoSimples: number }`.
- `interface ResultadoReforma` com, em `number` (ou `null` onde o índice ≤ 0): `rateio`,
  `precoMedio`, `creditoIcms`, `creditoPisCofins`, `baseEntrada`, `creditoCbs`, `creditoIbs`,
  `custoNet`, `verba`, `custoLiquido`, `indice`, `precoBase`, `baseSaida`, `cbs`, `ibs`,
  `precoNovo`, `efetivaCbs`, `efetivaIbs`, e `regimeNaoInformado: boolean`.
- `calcularReforma(e: EntradaReforma): ResultadoReforma` — a tabela de passos da spec, seção 3,
  na ordem; `efetiva = nominal × (1 − reducao/100)`; IBS = UF + Mun.
- `diferencas(precoNovo: number | null, prFinal: number | null): { reais: number | null; pct: number | null }`.

- [ ] Escrever a sp21 (casos à mão, sem banco):
  - **Linha base, cenário 2027 (11,2 / 0,05 / 0,05, PIS/COFINS não, fator 1):** preço 10,
    comprada 100, bonificada 0, ICMS ent. 12 sem redução, IPI/frete/PIS/COFINS 0, CST `000`,
    redução 0, regime `N`, verba 0, margem 21,5, ICMS saída 12, ST 0 →
    `creditoIcms = 1.2`, `baseEntrada = 8.8`, `creditoCbs = 0.9856`, `creditoIbs = 0.0088`,
    `custoNet = 7.8056`, `indice = 0.665`, `cbs = 1.16`, `ibs = 0.01`, `precoNovo = 12.908`.
  - **D16:** mesma linha com bonificada 20 → `creditoIcms = 1.00` (NÃO) e `1.20` (SIM).
  - **Simples (`S`):** `creditoIcms = 0`, `creditoCbs` = 20% do Regular; **nulo:** igual ao
    Regular e `regimeNaoInformado = true`.
  - **NET × GROSS:** verba 5%, fixa 0 → NET `verba = custoNet × 0.05`, GROSS `= precoMedio × 0.05`;
    a `baseEntrada` não muda.
  - **Isento num estimado:** redução 100 → `cbs = 0`, `ibs = 0`, `creditoCbs = 0`.
  - **CST 410:** `creditoCbs = 0` e `cbs = 0`, mesmo com redução 0.
  - **2026 contra a calculadora:** base 100, CBS 0,9 / IBS UF 0,1 → `cbs = 0.90`, `ibs = 0.10`;
    a redução 100 do Teste 3 → 0.
  - **Índice ≤ 0** (margem 90): `precoBase`, `precoNovo` e diferenças `null`.
  - **Edição no quadro:** com `calcular()` de outro preço, `creditoIcms` acompanha o
    `vlIcmsEnt` novo; trocar `percentuais.percCbs` não muda `precoNovo`.
  - **Planilha v3:** as linhas de `Simulador_Precificacao` com Q, S e T zerados, nos cenários
    2027 e 2033, com os valores que o Excel mostra em AR — iguais ao centavo.
- [ ] Rodar `node --experimental-strip-types --import ./docs/rotinas/9815-dre-gerencial/validacao/_alias.mjs docs/rotinas/simulador-preco/validacao/sp21_preco_reforma.mjs` — esperado: falha (módulo inexistente).
- [ ] Implementar `precoReforma.ts`.
- [ ] Rodar de novo — esperado: `✓ sp21 passou`. Rodar sp8 — esperado: passa como antes.

### Task 6: Front — cenários e preferências

**Files:** Create `client-new-kpi/lib/cenariosReforma.ts`, `client-new-kpi/hooks/useCenariosReforma.ts`.
Modify `sp21_preco_reforma.mjs` (casos da leitura).

**Consumes:** `ParametrosDoCenario`, `AliquotaRtc` (Task 5); o padrão de
`lib/preferenciasDaExibicao.ts` / `hooks/useExibicao.ts` (loja com `POST` em fila).

**Produces:**
- `type IdCenario = "2026" | "2027" | "2029" | "2033" | "personalizado"`;
  `CENARIOS: ReadonlyArray<{ id: IdCenario; rotulo: string; oficial: boolean; padrao: ParametrosDoCenario | null }>`
  com os rótulos "2026 Oficial RFB", "2027 Ref. TCU", "2029 Transição", "2033 Pleno",
  "Personalizado" e os valores da tabela da spec (2026 com `padrao: null`);
  `CREDITO_SIMPLES_PADRAO = 20`; `CENARIO_PADRAO: IdCenario = "2026"`.
- `lerCenarios(documento: unknown): MudancasDosCenarios` — defensiva: chave desconhecida, número
  negativo ou maior que 100, fator fora de 0–1 → ignorado (volta ao padrão).
- `parametrosDoCenario(id: IdCenario, mudancas: MudancasDosCenarios, aliquota: AliquotaRtc): ParametrosDoCenario`
  — no 2026, as alíquotas da própria `aliquota`, `pisCofinsAtivo: true`, `fatorIcmsSt: 1`.
- `trechoDosCenarios(mudancas): { cenarios: … }` — só o que difere do padrão; `null` apaga.
- Hook `useCenariosReforma(): { cenario: IdCenario; escolher(id): void; mudancas; alterar(id, parcial): void; voltarAoPadrao(id | "creditoSimples"): void; creditoSimples: number }`,
  gravando em `/api/preferencias/simulador-preco`. O cenário escolhido **não** é gravado: a tela
  abre sempre no 2026.

- [ ] Casos na sp21: documento vazio → padrões; `{"cenarios":{"2027":{"cbs":-1}}}` → 11,2;
  `{"cenarios":{"creditoSimples":35}}` → 35; mudar e voltar ao padrão → trecho com `null`.
- [ ] Rodar — esperado: falha. Implementar. Rodar — esperado: `✓ sp21 passou`.

### Task 7: Front — busca das alíquotas e campos da linha

**Files:** Modify `client-new-kpi/hooks/useSimuladorPreco.ts`, `client-new-kpi/lib/simuladorPreco.ts`
(`ajusteVazio`, `linhaSimulada`), `sp8_recalculo_reproduz_o_sql.mjs` (casos).

**Consumes:** `RespostaAliquotasRtc`, `CamposDaReforma` (Task 5).

**Produces:**
- `useAliquotasRtc(codFilial: string | null, linhas: ProdutoSimulado[]): { porChave: Map<string, AliquotaRtc>; disponivel: boolean; mensagem: string | null; carregando: boolean }`
  — combinações distintas das linhas com NCM, CST e classe preenchidos; nenhuma → não chama;
  `queryKey` com filial + combinações ordenadas; `staleTime` de 1 h.
- `chaveRtc(ncm: string, cst: string, cClassTrib: string): string`.
- `ajusteVazio` e `linhaSimulada` passam a considerar `reforma`: um campo presente e diferente do
  padrão (quantidades 0, NÃO, verba 0, NET) torna a linha simulada.

- [ ] Casos na sp8: ajuste só com `reforma: { qtdBonificada: 10 }` → não vazio e simulado;
  `reforma: { baseVerba: "NET" }` → não simulado.
- [ ] Rodar sp8 — esperado: falha. Implementar. Rodar — esperado: passa.

### Task 8: Tela

**Files:** Create `client-new-kpi/components/simulador-preco/SeletorDeCenario.tsx`,
`QuadroDeCenarios.tsx`, `MemoriaReforma.tsx`. Modify `app/simulador-preco/page.tsx`,
`components/simulador-preco/TabelaSimulador.tsx`, `QuadroSimulacao.tsx`.

**Consumes:** Tasks 5–7.

- **Topo (`SeletorDeCenario`):** seletor dos 5 cenários junto dos filtros; selo "Oficial RFB"
  no 2026; nos outros, faixa fixa **"Estimativa — não usar para tributação"**; botão
  "Parâmetros". Faixa "Calculadora da Receita indisponível; preço novo não calculado" quando
  `disponivel` for falso.
- **`QuadroDeCenarios`:** a tabela da spec; 2026 só leitura, com as alíquotas que vieram da
  calculadora; os outros editáveis; o % do Simples; "Voltar ao padrão" por cenário e no Simples;
  aviso de que não lembra quando a base não grava preferências.
- **Grade:** grupo **"Reforma — <rótulo do cenário>"** depois de "Preço", com "Situação RFB",
  "CBS (R$)", "IBS (R$)", "Preço novo", "Dif. (R$)", "Dif. (%)"; `COLUNAS_DEPOIS_DO_PRODUTO`
  sobe 6. Os casos da linha seguem a tabela da spec (calculado, simulado, inconsistência com a
  mensagem da Receita no ícone, sem tributação RTC, indisponível, carregando, produto novo "—").
  Regime nulo: ícone de aviso na linha com o texto da D12.
- **`QuadroSimulacao`:** os 6 campos da reforma (padrões da spec) e, embaixo do campo CBS, "Só
  vale para o preço atual; o novo usa a CBS da Receita ou do cenário". **`MemoriaReforma`:** o
  passo a passo de `ResultadoReforma` no cenário escolhido, com o `fundamento`.

- [ ] Implementar.
- [ ] `npx tsc --noEmit` e `npm run lint` em `client-new-kpi` — esperado: 0 erros.
- [ ] Com o OK do Gabriel, subir API e front e conferir no navegador: uma página da Época; trocar
  os 5 cenários; abrir o quadro de uma linha e conferir à mão contra a planilha; parar a
  calculadora (URL errada no `appsettings.Development.json`) e ver a faixa; tema claro e escuro;
  `<ControlesDeExibicao />` presente.

### Task 9: Registro

**Files:** Modify `docs/rotinas/simulador-preco/CALCULADORA_RTC.md` (cabeçalho: "há código";
"Em aberto" atualizado), `docs/plataforma/PREFERENCIAS.md` (tela `simulador-preco`, seção
`cenarios`).

- [ ] Atualizar os dois documentos.
- [ ] Revisão final do branch (fresh reviewer) e entrega ao Gabriel, sem commit.

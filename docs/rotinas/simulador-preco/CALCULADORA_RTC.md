# Simulador de preço × calculadora da Receita (RTC)

Registro das decisões e dos testes da integração do simulador com a calculadora oficial da
Reforma Tributária. **Ainda não há código**: este documento antecede a spec.

- Calculadora: [calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular)
- Instância do Dev: `http://10.122.65.45:8080/api` (Swagger em `/api/swagger-ui/index.html`,
  OpenAPI em `/api/api-docs`). Versão vista nos testes: app `1.7.2`, banco `V0073`.
- Modelo: planilha **`Simulador_Precificacao_Reforma_Tributaria_v3.xlsx`**, que é a versão
  correta (o Gabriel a enviou em 26/11/2026). A `..._CST_Bonif_Verbas.xlsx`, lida antes, era a
  versão errada e não vale mais. Análise completa em "Planilha v3 × calculadora", abaixo.

## Decisões (26/11/2026)

| # | Decisão | Quem |
|---|---|---|
| D1 | A tela mostra **os dois preços**: o **atual** (legado), que é o `PRECOFINAL` do SQL v3, e o **novo**, que segue as fórmulas da planilha com CBS/IBS da calculadora. Mostra também a diferença em R$ e em %. | Gabriel |
| D2 | A planilha é o **modelo das fórmulas**, e não fonte de dados. Os dados vêm do banco. | Gabriel |
| D3 | Bonificação e verbas seguem a planilha **por enquanto**. O cálculo das verbas será revisto depois. | Gabriel |
| D4 | **Opção A**: só a **nossa API** fala com a calculadora, uma vez por página. A tela faz a conta (base × alíquota efetiva) na hora, sem esperar a rede a cada edição. O navegador nunca acessa o servidor do Dev. | Gabriel, nos testes |
| D5 | **Um produto inválido não derruba os outros** (ver "Tratamento de erro"). | Gabriel |
| D7 | **Bonificação e verbas são digitadas na tela.** | Gabriel |
| D8 | **Substitui a D6.** 2027 já entra na primeira entrega. A partir de 2027, os parâmetros que a calculadora não tem (no mínimo as alíquotas nominais de CBS, IBS estadual e IBS municipal) são **informados por nós**, "na medida do possível". O preço de 2027 em diante é estimativa, e a tela avisa isso. O "switch 2026/2027" virou o seletor de cenários da D10. | Gabriel, 26/11/2026 |
| D9 | **Cada comprador digita na tela** os parâmetros dos cenários estimados. Proposta: guardar por usuário na tabela de preferências (banco), e nunca no navegador. Imposto Seletivo fica fora da primeira entrega. ~~Os padrões de PIS e COFINS zerados e IPI mantido aguardam confirmação.~~ **Respondido pela planilha v3**: cada cenário traz "PIS/COFINS ativo?" e "Fator ICMS/ST", e o IPI não muda. O parâmetro "IPI manter ou zerar" **sai**. | Gabriel, 26/11/2026 |
| D10 | **Seletor com os 5 cenários** da planilha v3 (2026 Oficial RFB, 2027 Ref. TCU, 2029 Transição, 2033 Pleno, Personalizado), no papel da célula D6 do painel. A grade inteira se recalcula para o cenário escolhido. **O 2026 não é editável** (as alíquotas vêm da calculadora). Os outros 4 são editáveis por comprador (D9), com os valores do painel da v3 como ponto de partida, e cada um tem alíquotas, "PIS/COFINS ativo?" e "Fator ICMS/ST". A visão lado a lado da `Comparativo_Transicao` fica para depois. Substitui o "switch 2026/2027" da D8. | Gabriel, 26/11/2026 |
| D11 | **Destino = o município da filial consultada.** O código IBGE vem do cadastro da filial (tabela e coluna a confirmar no banco). | Gabriel, 26/11/2026 |
| D12 | **Regime do fornecedor vem do Winthor**, pela coluna `PCFORNEC.SIMPLESNACIONAL` (`VARCHAR2(1)`), encontrada pelo Gabriel em 26/11/2026. Valores na base da Época: `N` = 10.086, `S` = 3.420, nulo = 4. `S` = Simples (crédito de CBS/IBS × % aproveitável, crédito de ICMS zerado), `N` = Regime Regular. **Nulo: a tela avisa na linha** ("regime do fornecedor não informado no cadastro"), porque a categoria pode crescer (Gabriel, 26/11/2026). Proposta para o cálculo dessa linha: tratar como Regime Regular, e o aviso diz isso. O fornecedor considerado é o do produto (`CODFORNEC` do SQL v3). | Gabriel, 26/11/2026 |
| D13 | **Base da verba NET / GROSS**: seletor no modal de edição, junto com o % e o valor fixo da verba, por produto, com **NET como padrão** (coluna Z da planilha v3). | Proposta, Gabriel entendeu a regra |
| ~~D6~~ | ~~**Só 2026 por enquanto.**~~ Substituída pela D8. | Gabriel |

## Testes feitos pelo Gabriel no Swagger (26/11/2026)

Os Testes 0 a 5 foram feitos em `POST /calculadora/regime-geral`, e o Teste 6 em
`POST /calculadora/observabilidade/regime-geral`.

### Teste 0: o exemplo do Swagger sem alterar → 400

O próprio exemplo traz `gCompraGov.tpEnteGov = 0`, e a calculadora só aceita de 1 a 6.

**Lição:** o corpo do exemplo tem blocos que não servem para nós e devem ficar **fora** da
requisição: `gCompraGov` (venda a órgão público), `impostoSeletivo` (só a partir de 2027),
`tributacaoRegular`, `gComponentesBC` (mandamos a base pronta), `aliquotasNominais` (em 2026 a
calculadora usa as dela) e `nbs` (código de serviço).

### Teste 1: corpo mínimo → 200, em 488 ms

```json
{
  "id": "teste-1", "versao": "0.0.1", "dhFatoGerador": "2026-11-26T10:00:00-03:00",
  "municipio": 4314902, "uf": "RS", "tpDoc": 55,
  "itens": [{ "numero": 1, "ncm": "24021000", "cst": "000", "cClassTrib": "000001",
              "baseCalculo": 200, "quantidade": 1, "unidade": "UN" }]
}
```

| | Esperado (planilha) | Calculadora |
|---|---|---|
| CBS | 0,9% de 200 = 1,80 | `pCBS 0.90`, `vCBS 1.80` |
| IBS estadual | 0,1% de 200 = 0,20 | `pIBSUF 0.10`, `vIBSUF 0.20` |
| IBS municipal | zero em 2026 | `pIBSMun 0.00`, `vIBSMun 0.00` |

`calculoSimulado: false`: as alíquotas usadas estão na lei, e não são valores de exemplo.

**Lições:**
- A regra de 2026 da calculadora é igual à da planilha.
- Os valores voltam como **texto** (`"1.80"`); a nossa API converte para número.
- `itens` é uma lista: cabe uma página inteira numa só chamada.
- Cada chamada levou cerca de meio segundo, o que confirma a D4.

### Teste 2: produto real e caso com redução → 422

Município 3144805 (MG). Item 1: NCM `33051000`, CST `000`, classe `000001`. Item 2: mesmo NCM,
CST `200`, classe `200003`.

```
"NCM de código 33051000 não vinculada à Classificação Tributária de código 200003 (CBS e IBS)"
```

**Lições:**
1. **A calculadora confere se a classe tributária combina com o NCM.** A redução depende da
   classe, e cada classe vale só para uma lista de NCMs definida em lei.
2. **A tabela fixa da planilha (`Tabela_CST_Reforma`: "CST 200 = 30%") é uma simplificação.**
   O percentual de redução deve vir da **calculadora** (`gRed.pRedAliq` / `gRed.pAliqEfet`), e
   não da tabela da planilha.
3. **Um item inválido derruba a requisição inteira**: o item 1, que estava certo, também ficou
   sem resposta.
4. Isso também serve para conferir o cadastro: uma classe da `PCTRIBUTACAO` incompatível com o
   NCM do produto aparece aqui.

### Teste 3: redução válida, com produto do nosso cadastro → 200, em 138 ms

Item 1 igual ao do Teste 2. Item 2 é o produto **41057** (ABS ALWAYS BAS PRO 1X8UN), NCM
`96190000`, CST `200`, classe `200013`. No nosso cadastro ele aparece como "Aliquota reduzida a
100% Tampões higiênicos".

| | Item 1 (000 / 000001) | Item 2 (200 / 200013) |
|---|---|---|
| CBS | `pCBS 0.90`, `vCBS 1.80` | `pCBS 0.90`, `gRed.pRedAliq 100.00`, `pAliqEfet 0.00`, `vCBS 0.00` |
| IBS estadual | `pIBSUF 0.10`, `vIBSUF 0.20` | `pIBSUF 0.10`, `pRedAliq 100.00`, `pAliqEfet 0.00`, `vIBSUF 0.00` |
| IBS municipal | `0.00` | `0.00` |
| Fundamento | "Tributação integral", LC 214/2025 | "Alíquota zero", Art. 147 |

**Lições:**
1. **A calculadora concorda com o nosso cadastro**: a classe 200013 reduz 100%.
2. **Prova que a redução vem da classe, e não do CST.** Este produto e a linha "CST 200 = 30%"
   da `Tabela_CST_Reforma` têm o **mesmo CST 200**, mas reduções diferentes. A planilha daria
   CBS de 0,63%, e a lei dá **zero**. Por isso, o novo preço usa a **alíquota efetiva** que a
   calculadora devolve (`pAliqEfet`), e nunca o percentual da tabela da planilha.
3. O bloco `gRed` **só aparece quando há redução**. Sem ele, a alíquota efetiva é a cheia
   (`pCBS`, `pIBSUF`, `pIBSMun`).
4. Ler a alíquota cheia e a efetiva separadamente permite mostrar ao comprador "0,90% com redução
   de 100% = 0,00%", sem fazer conta de redução do nosso lado.
5. A `memoriaCalculo` traz o fundamento legal ("Art. 147"). Pode virar a explicação da linha na
   tela.

### Teste 4: o destino

- **4a, UF trocada sem trocar o município** (`3144805` com `SP`) → **422**: "Município de
  código 3144805 não pertence à UF de sigla SP". **A calculadora confere se o município pertence
  à UF.**
- **4b, sem município e sem UF** → **400**: "[municipio: não deve ser nulo]". **O município é
  obrigatório.** A mensagem não citou a `uf`, então ela parece opcional quando falta, mas, se
  vier, precisa ser coerente com o município.
- **4a refeito** (`3550308` / `SP`) → **200**, em 143 ms. **Resultado idêntico ao do Teste 3**
  (Nova Lima/MG): item 1 com CBS 1,80 e IBS 0,20, item 2 zerado.

**Lição:** **em 2026, o destino não muda o valor.** As alíquotas são as mesmas em todo o país
(CBS 0,9%, IBS estadual 0,1%, IBS municipal 0%). O município é exigido pela calculadora, mas
só passa a pesar quando estados e municípios tiverem alíquotas próprias.

### Teste 5: o ano

- **5a, `dhFatoGerador` em 2027-01-15** → **422**: "As alíquotas nominais (os três campos cbs,
  ibsEstadual e ibsMunicipal) devem ser informadas para operações com fato gerador a partir de
  01/01/2027".
- **5b, sem data**: ainda não feito.

**Lições:**
1. **A calculadora não tem as alíquotas de 2027 em diante.** Para essas datas, quem chama tem de
   informar `aliquotasNominais` (`cbs`, `ibsEstadual`, `ibsMunicipal`).
2. **Antes de 2027 é o contrário**: a calculadora usa as alíquotas dela e não aceita
   `aliquotasNominais`.
3. Um cenário de 2027 em diante só é possível com **alíquotas digitadas por nós** (estimativas).
   A calculadora continua fazendo a conta, as reduções por classe e a validação de NCM, mas o
   percentual cheio é suposição nossa. A tela tem de deixar isso explícito.

### Teste 6: endpoint de observabilidade → 200, em 126 ms

O endereço real é **`POST /api/calculadora/observabilidade/regime-geral`** (fica dentro de
`calculadora/`, e não na raiz como a planilha escreveu). O corpo é o mesmo do Teste 2.

| Item | `estadoItem` | Resultado |
|---|---|---|
| 1 (000 / 000001) | `CALCULADO` | CBS 1,80 e IBS 0,20, iguais aos do `/regime-geral` |
| 2 (200 / 200003, xampu) | `INCONSISTENCIA_ENTRADA` | `erros[]` com `code: "REG-011"`, `title: "NCM não vinculada"`, `pointer: "#/itens/1/ncm"` e o `detail` da Receita |

**Lições:**
1. **Ele resolve a D5 direto na calculadora**: o item inválido não derruba o válido.
2. O erro vem com **código estável** (`REG-011`) e com o **caminho do campo** (`pointer`). A tela
   pode decidir pelo código, sem depender da redação da mensagem.
3. Os **erros globais** (UF, município, data do fato gerador) continuam devolvendo **422** para o
   lote inteiro. A nossa API valida esses três campos antes de chamar.
4. Os estados possíveis, pela planilha v3: `CALCULADO`, `CALCULO_SIMULADO` e
   `INCONSISTENCIA_ENTRADA`.

## Planilha v3 × calculadora

### O que a v3 tem

| Aba | O que faz | Uso no simulador |
|---|---|---|
| `Painel_Aliquotas_e_Resumo` | **5 cenários** com CBS, IBS estadual, IBS municipal, "PIS/COFINS ativo?", "Fator ICMS/ST" e status; um "cenário ativo" (célula D6); "% crédito aproveitável do fornecedor Simples" (20%) | o seletor de cenário (D10) e os parâmetros (D9) |
| `Simulador_Precificacao` | a grade, colunas A–AU, com **um único conjunto de colunas** calculado para o cenário ativo | a tela principal |
| `Simulador_Individual` | memória de cálculo de **um** produto, passo a passo | modelo para o **modal de edição** |
| `Comparativo_Transicao` | o preço final de cada produto nos 5 cenários, um cenário por coluna | possível visão de comparação, depois |
| `Auditoria_Apuracao_CBS` | crédito projetado × crédito "extinto" pela RFB | **fora do escopo**: depende da API de apuração assistida (OAuth, DARF), e os valores são de exemplo (fatores fixos 1,0, 0,85, 0,0) |
| `Tabelas_CST_e_Dev_API` | tabela de CST IBS/CBS, de CST ICMS e o mapa de integração para o programador | referência |

Na planilha, editar o painel (trocar o cenário ativo, ou mudar os números do cenário ativo)
recalcula a grade inteira, porque as fórmulas buscam o cenário por `VLOOKUP(Painel!$D$6; …)`.

**Cenários do painel:**

| Cenário | CBS | IBS UF | IBS Mun | PIS/COFINS | Fator ICMS/ST |
|---|---|---|---|---|---|
| 2026 Oficial RFB | 0,9% | 0,05% | 0,05% | sim | 1 |
| 2027 Ref. TCU | **11,2%** | 0,05% | 0,05% | **não** | 1 |
| 2029 Transição | 11,2% | 1,4% | 0,4% | não | **0,9** |
| 2033 Pleno (est.) | 8,8% | 14% | 3,7% | não | **0** |
| Personalizado | 12,5% | 1% | 0,5% | não | 1 |

O "Fator ICMS/ST" multiplica o ICMS de entrada, o ICMS de saída e a ST, e modela a extinção
gradual do ICMS. **A v3 responde às regras fiscais que estavam em aberto:** PIS e COFINS saem a
partir de 2027, e o IPI não muda em nenhum cenário.

### Fórmulas da grade (linha 6)

Mantidas da versão anterior: bonificação (M, N), base RTC de entrada (V), custo, índice (AI),
preço base (AJ), base de saída (AK), CBS e IBS por fora (AL–AO), preço final (AR).

**Novidades da v3:**
1. **Regime do fornecedor** (H): "Regime Regular" ou Simples. No Simples, o crédito de CBS e IBS
   é multiplicado pelo "% crédito aproveitável" (20%), e o crédito de ICMS zera.
2. **Bonificação gera crédito?** (I): com "SIM", os créditos não são rateados pela quantidade
   comprada.
3. **Verba NET / GROSS** (Z): `GROSS: N·%verba + fixa` (sobre o preço médio pós-bonificação) e
   `NET: Y·%verba + fixa` (sobre o custo NET antes da verba). A verba nunca altera a base de
   crédito.
4. **Fator ICMS/ST** e **PIS/COFINS ativo** do cenário entram em R, V, AI, AK e AR.
5. **Status RFB** (AQ): "CALCULADO" ou "CALCULO_SIMULADO", que corresponde ao `calculoSimulado`
   da calculadora.

### Onde a v3 diverge da calculadora (os testes mandam)

| # | Planilha v3 | Calculadora (testes) | Decisão proposta |
|---|---|---|---|
| P1 | **Redução pela tabela de CST** (200 = 30%) e cClassTrib "padrão" do CST | redução pela **classe tributária real**; a 200013 reduz **100%** (Teste 3); classe e NCM são conferidos (Teste 2) | usar a **cClassTrib do cadastro** (`PCTRIBUTACAO`) e a **`pAliqEfet` da calculadora**. A tabela da planilha só serve de documentação. |
| P2 | 2026: IBS **0,05% UF + 0,05% Mun** | 2026: IBS **0,10% UF + 0,00% Mun** (Testes 1, 3 e 4) | usar a da calculadora. O **total é igual (0,1%)**, então o preço não muda; só a divisão entre estado e município. |
| P3 | 2027 em diante: alíquotas do painel | a calculadora **exige** as alíquotas nominais a partir de 2027 (Teste 5) | **compatível**: mandamos as alíquotas do cenário em `aliquotasNominais`, e a calculadora aplica a redução da classe |
| P4 | valores sem arredondamento | a calculadora arredonda cada valor a 2 casas | a diferença é de centavos; registrar na comparação |
| P5 | "Preço Atual (App)" (AS) é uma fórmula aproximada com CBS fixa de 0,009 | não se aplica | **D1 continua**: o preço atual é o `PRECOFINAL` do SQL v3 |

A base de saída da planilha (AK: preço base − ICMS − PIS/COFINS) **bate com a regra de base da
calculadora** para 2026 (`vProd − vICMS − vPIS − vCOFINS …`). Em 2027, o PIS e a COFINS saem dos
dois lados.

### O mapa de integração da v3

O item 3 (`/observabilidade/regime-geral`, cálculo em lote sem abortar no primeiro erro) foi
confirmado no **Teste 6**.

Os outros itens do mapa (sincronizar os dados abertos no banco, calculadora do Simples Nacional,
validação de XML da NF-e, apuração assistida e DARF) ficam **fora da primeira entrega**.

## De onde vem cada dado (proposta, 26/11/2026)

Cenário 2026 Oficial RFB como padrão. Nos cenários estimados, só mudam as alíquotas (que passam a
ser digitadas) e os fatores do cenário.

Tudo o que vem do **banco** é lido pela consulta do simulador (o SQL v3), que junta as tabelas
abaixo. A coluna "Já vem?" diz se o dado já está no SQL v3 de hoje ou se é preciso
acrescentar.

| Dado | Fonte | Tabela de origem | Já vem? |
|---|---|---|---|
| Produto, fornecedor, NCM | **Banco** | `PCPRODUT`, `PCFORNEC` | sim |
| CST IBS/CBS e classe tributária | **Banco** | `PCTRIBUTACAO` | sim |
| Preço de compra | **Banco** (ou digitado) | `PCEST.VLULTPCOMPRA`, editável na tela como hoje | sim |
| IPI, PIS e COFINS de entrada | **Banco** | `PCTABTRIBENT`, `PCEXPISCOFINSITEM`, `PCPRODUT` | sim |
| ICMS de entrada, redução de base, ICMS de saída | **Banco** | `PCPRODFILIAL` | sim |
| Frete FOB | **Banco** | `PCFORNECFILIAL`, `PCTABTRIBENT` | sim |
| ST | **Banco** | `PCTABPR.VLST` | sim |
| Margem | **Banco** (ou digitada) | como na tela atual | sim |
| **Preço atual (legado)** | **Banco** | `PRECOFINAL` (D1) | sim |
| Regime do fornecedor | **Banco** | `PCFORNEC.SIMPLESNACIONAL` (D12) | **não**: a `PCFORNEC` já está no SQL, falta trazer a coluna |
| Município e UF de destino | **Banco** | `PCFILIAL.CIDADE` + `UF` → `PCCIDADE.CODIBGE` (D11, sp20) | **não**: consulta pequena à parte, uma vez por filial, como a da região |
| Qtd comprada e qtd bonificada | **Digitado** | D7 |
| Bonificação gera crédito? | **Digitado** | a decidir; proposta: padrão NÃO, como na v3 |
| Verba (%), verba fixa (R$/un), base NET/GROSS | **Digitado** | D7, D13 |
| Alíquotas dos cenários estimados | **Digitado** | por comprador (D9), com os valores da v3 como ponto de partida |
| Alíquota cheia de CBS, IBS UF e IBS Mun (2026) | **Calculadora** | `pCBS`, `pIBSUF`, `pIBSMun` |
| Redução e alíquota efetiva | **Calculadora** | `gRed.pRedAliq`, `gRed.pAliqEfet` (Teste 3) |
| Estado do item e erro de cadastro | **Calculadora** | `estadoItem`, `erros[].code` (Teste 6) |
| Fundamento legal | **Calculadora** | `memoriaCalculo` |
| Fórmulas (rateio, créditos, custo, verba, índice, preço base, base de saída, CBS/IBS por fora, preço final, diferença) | **Planilha v3** | implementadas no nosso código |
| % crédito aproveitável do Simples (20%) | **Planilha v3** | parâmetro do painel |
| Fatores dos cenários ("PIS/COFINS ativo?", "Fator ICMS/ST") | **Planilha v3** | do painel; editáveis nos cenários estimados |

## Onde cada cálculo acontece (proposta, 26/11/2026)

Quatro lugares: o **banco** (o SQL v3), a **calculadora** da Receita, a **nossa API** (.NET) e a
**tela** (o navegador). Pela D4, a conta do preço novo é feita na tela, para responder na hora a
cada edição.

| Cálculo | Onde | Por quê |
|---|---|---|
| Preço atual (legado): custo antes da CBS, base e valor da CBS legados, `PRECOFINAL` | **Banco** (SQL v3) | é a conta da rotina atual, que não muda (D1) |
| Alíquota cheia, redução e **alíquota efetiva** de CBS e IBS de cada combinação NCM + CST + classe | **Calculadora** | é a regra oficial (Testes 1, 3 e 6) |
| Conferir se a classe combina com o NCM | **Calculadora** | erro `REG-011` (Teste 6) |
| Juntar as combinações distintas da página, chamar a calculadora, guardar as respostas em memória | **Nossa API** | o navegador nunca fala com a calculadora (D4, D5) |
| Validar município, UF e data antes de chamar | **Nossa API** | esses erros derrubam o lote inteiro (Teste 6) |
| Converter os valores da calculadora (texto → número) e traduzir os erros | **Nossa API** | Teste 1 |
| Montar os parâmetros do cenário (2026 da calculadora; os estimados, das preferências do comprador) | **Nossa API** | D9, D10 |
| Rateio da bonificação e preço médio pós-bonificação (colunas M, N da v3) | **Tela** | muda a cada edição |
| Crédito de ICMS, PIS e COFINS de entrada e base RTC de entrada (R, V) | **Tela** | idem |
| Crédito de CBS e IBS de entrada, com regime do fornecedor (W, X) | **Tela** | base × alíquota efetiva que a API trouxe |
| Custo NET, verba NET/GROSS, custo líquido (Y–AD) | **Tela** | idem |
| Índice de markup, preço base, base RTC de saída (AI–AK) | **Tela** | idem |
| CBS e IBS por fora (AL–AO) | **Tela** | base de saída × alíquota efetiva, com o **mesmo arredondamento da Receita** (2 casas) |
| Preço final novo, diferença em R$ e em % (AR, AT, AU) | **Tela** | idem |
| Recalcular tudo ao trocar de cenário | **Tela** | sem nova consulta ao banco; a API só é chamada se faltarem alíquotas do cenário |

**Garantias propostas:**
1. As fórmulas da tela ficam **num único arquivo**, sem tela misturada, testado de duas formas:
   contra os valores das linhas da planilha v3 (o mesmo produto tem de dar o mesmo preço) e
   contra a calculadora (base × alíquota efetiva tem de dar o `vCBS` que ela devolve).
2. O preço novo **não é gravado** em lugar nenhum: é simulação. Nada sai da tela para a NF-e.

**Não usados da planilha** (substituídos por fonte melhor): a tabela de CST IBS/CBS (a redução vem
da calculadora), a tabela de CST ICMS (os percentuais vêm do cadastro) e o "Preço Atual (App)"
(vem do SQL v3).

## Tratamento de erro (D5)

> **Atualizado após o Teste 6:** a API usa o **`/calculadora/observabilidade/regime-geral`**.
> O item 2 abaixo (refazer combinação por combinação) **deixa de ser necessário**. Os itens 1
> (perguntar por combinação) e 4 (memória no servidor) continuam valendo, e a regra 3 passa a ser
> "decidir pelo `code` do erro, e nunca pelo texto".

Equivale ao `FORALL ... SAVE EXCEPTIONS`: os itens válidos seguem, e os inválidos ficam
anotados.

1. **Perguntar por combinação, e não por produto.** A alíquota e a redução dependem de
   **NCM + CST + classe tributária**. A API manda à calculadora só as combinações distintas da
   página, com base 100, e recebe o percentual de cada uma.
2. ~~**Se o lote for recusado** (422), a API refaz a pergunta **uma combinação por vez**, poucas
   em paralelo. As válidas voltam normalmente, e a inválida fica marcada com a mensagem da
   Receita.~~ Desnecessário após o Teste 6.
3. **Não ler o texto do erro** para descobrir o culpado, porque a redação pode mudar numa versão
   nova da calculadora. Decidir pelo `code` (por exemplo, `REG-011`).
4. **Memória no servidor.** Cada resposta, válida ou inválida, fica guardada na memória da nossa
   API por algumas horas. Nada vai para o navegador, conforme a orientação do Dev.

**O que o comprador vê:**
- **Produto válido:** preço atual, preço novo, CBS, IBS e diferença.
- **Produto inválido:** o preço atual e, no lugar do novo, um aviso como "Classe Trib. 200003 não
  vale para o NCM 33051000", com o texto da Receita.
- **Calculadora fora do ar:** a tela mostra tudo do legado e um aviso no topo, "Calculadora da
  Receita indisponível; preço novo não calculado". A consulta não trava.

## Em aberto

- [x] **Teste 3:** caso de redução válido, feito com o produto 41057 (ver acima).
- [x] **Bonificação e verbas são digitadas na tela** (D7).
- [x] **Teste 6:** o endpoint existe em `/api/calculadora/observabilidade/regime-geral` e devolve
      status por item (ver acima).
- [x] Seletor dos 5 cenários (D10).
- [x] Branch criada pelo Gabriel em 26/11/2026: `feat/calculadora-preco-rtc`, a partir da
      `feat/simula-preco`.
- [ ] A **"gera crédito"** da entrada também depende da classe, e não só do CST? A planilha usa
      a tabela de CST para isso (colunas W e X da v3). Confirmar com o fiscal antes da spec.
- [ ] De onde vem o **CST de ICMS**. Proposta (26/11/2026): **não usar a tabela de CST ICMS da
      planilha**. O SQL v3 já traz o que ela decide, direto do cadastro e como a rotina atual:
      ICMS de entrada (`PCPRODFILIAL.PERCICMS_ENT`), redução de base (`PERC_BASE_RED`), ICMS de
      saída (`PERCICMS_SAID`) e o valor da ST (`PCTABPR.VLST`). O crédito de ICMS (coluna R da
      v3) sai desses percentuais, e o "Fator ICMS/ST" do cenário multiplica cada um.
- [x] Destino: o município da filial (D11).
- [ ] **Origem do código IBGE da filial.** A `PCFILIAL` só tem `CIDADE` (nome, `VARCHAR2(30)`) e
      `UF`. A `PCCIDADE` não aparece para o usuário consultado. As colunas de IBGE visíveis nas
      `PC*` são `PCEMPR.CODIBGE`, `PCNFENT.CODIBGE`, `PCNFSAID.CODIBGE` e
      `PCCONSUM.CLIIBGEOBRG`, e nenhuma é da filial (26/11/2026). Com o usuário **EPCTI**, a
      `PCCIDADE` aparece (`CODCIDADE`, `CODIBGE`, `NOMECIDADE`, `UF`), mas a `PCFILIAL` não tem
      código de cidade, só o nome: a ligação teria de ser por **nome + UF**. Com o **usuário da
      API**, a `PCCIDADE` dá **ORA-00942** (sem permissão). **Decisão do Gabriel: dar o grant.**
      Script: `validacao/sp20_grant_pccidade.sql`. **Feito em 26/11/2026**: o EDI lê a
      `PCCIDADE` (5566 linhas), e todas as filiais acham a sua cidade por nome + UF, uma só cada
      (Contagem 3118601, Serra/ES 3205002, Rio de Janeiro 3304557, Uberlândia 3170206), **exceto
      a filial 99**, que não tem cidade nem UF na `PCFILIAL`.
- [x] **Filial 99:** não é usada (Gabriel, 26/11/2026). Por segurança, se alguma filial ficar
      sem código IBGE, a API devolve uma mensagem clara dizendo qual, em vez de chamar a
      calculadora.
- [ ] Rodar a sp20 na Minas Rural.
- [x] Regime do fornecedor: `PCFORNEC.SIMPLESNACIONAL` (D12). Falta conferir os valores.
- [x] Base da verba: seletor NET / GROSS no modal, NET como padrão (D13).
- [x] Nulo na `SIMPLESNACIONAL`: aviso na tela (D12).
- [ ] Spec completa, para aprovação.

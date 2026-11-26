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
- [ ] De onde vem o **CST de ICMS** (provavelmente `PCTABTRIBENT.SITTRIBUT`, como na rotina atual).
- [ ] Qual **município e UF** de destino a API manda à calculadora. **Não pode ser fixo em
      3144805/MG (Nova Lima)**: há vários cenários de destino (Gabriel, 26/11/2026). Em 2026 o
      destino não muda o valor (Teste 4). Proposta: a cidade da filial como padrão, com troca
      opcional na tela.
- [ ] De onde vem o **regime do fornecedor** (Regular ou Simples): do cadastro do Winthor ou
      digitado?
- [ ] De onde vem a **base da verba (NET ou GROSS)** por produto: digitada, como o % da verba?
- [ ] Spec completa, para aprovação.

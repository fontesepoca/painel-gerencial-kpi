# Simulador de preço × calculadora da Receita (RTC)

Registro das decisões e dos testes da integração do simulador com a calculadora oficial da
Reforma Tributária. **Ainda não há código**: este documento antecede a spec.

- Calculadora: [calculadora-rtc-regime-regular](https://github.com/ReceitaFederal/calculadora-rtc-regime-regular)
- Instância do Dev: `http://10.122.65.45:8080/api` (Swagger em `/api/swagger-ui/index.html`,
  OpenAPI em `/api/api-docs`). Versão vista nos testes: app `1.7.2`, banco `V0073`.
- Modelo de apresentação: planilha `Simulador_Precificacao_Reforma_CST_Bonif_Verbas.xlsx`, aba
  `Simulador_Precificacao`.

## Decisões (26/11/2026)

| # | Decisão | Quem |
|---|---|---|
| D1 | A tela mostra **os dois preços**: o **atual** (legado), que é o `PRECOFINAL` do SQL v3, e o **novo**, que segue as fórmulas da planilha com CBS/IBS da calculadora. Mostra também a diferença em R$ e em %. | Gabriel |
| D2 | A planilha é o **modelo das fórmulas**, e não fonte de dados. Os dados vêm do banco. | Gabriel |
| D3 | Bonificação e verbas seguem a planilha **por enquanto**. O cálculo das verbas será revisto depois. | Gabriel |
| D4 | **Opção A**: só a **nossa API** fala com a calculadora, uma vez por página. A tela faz a conta (base × alíquota efetiva) na hora, sem esperar a rede a cada edição. O navegador nunca acessa o servidor do Dev. | Gabriel, nos testes |
| D5 | **Um produto inválido não derruba os outros** (ver "Tratamento de erro"). | Gabriel |

## Testes feitos pelo Gabriel no Swagger (26/11/2026)

Todos em `POST /calculadora/regime-geral`.

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

## Tratamento de erro (D5)

Equivale ao `FORALL ... SAVE EXCEPTIONS`: os itens válidos seguem, e os inválidos ficam
anotados.

1. **Perguntar por combinação, e não por produto.** A alíquota e a redução dependem de
   **NCM + CST + classe tributária**. A API manda à calculadora só as combinações distintas da
   página, com base 100, e recebe o percentual de cada uma.
2. **Se o lote for recusado** (422), a API refaz a pergunta **uma combinação por vez**, poucas
   em paralelo. As válidas voltam normalmente, e a inválida fica marcada com a mensagem da
   Receita.
3. **Não ler o texto do erro** para descobrir o culpado, porque a redação pode mudar numa versão
   nova da calculadora. Refazer uma combinação por vez funciona qualquer que seja a mensagem.
4. **Memória no servidor.** Cada resposta, válida ou inválida, fica guardada na memória da nossa
   API por algumas horas. Nada vai para o navegador, conforme a orientação do Dev.

**O que o comprador vê:**
- **Produto válido:** preço atual, preço novo, CBS, IBS e diferença.
- **Produto inválido:** o preço atual e, no lugar do novo, um aviso como "Classe Trib. 200003 não
  vale para o NCM 33051000", com o texto da Receita.
- **Calculadora fora do ar:** a tela mostra tudo do legado e um aviso no topo, "Calculadora da
  Receita indisponível; preço novo não calculado". A consulta não trava.

## Em aberto

- [ ] **Teste 3:** um caso de redução válido, usando um produto do nosso cadastro com CST 200
      (NCM e classe reais), para comparar `pRedAliq` / `pAliqEfet` com a planilha.
- [ ] De onde vêm a **bonificação e as verbas**: digitadas na tela (recomendação) ou do Winthor.
- [ ] De onde vem o **CST de ICMS** (provavelmente `PCTABTRIBENT.SITTRIBUT`, como na rotina atual)
      e as regras de "gera crédito".
- [ ] Qual **município e UF** de destino a API manda à calculadora (no teste foi usado 3144805/MG).
- [ ] Spec completa, para aprovação.
- [ ] **Antes de qualquer código: criar a branch nova**, por exemplo `feat/simula-preco-rtc` a
      partir da `feat/simula-preco`.

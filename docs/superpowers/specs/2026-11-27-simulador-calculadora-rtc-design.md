# Simulador de preço: preço novo da Reforma Tributária, com a calculadora da Receita

**Data:** 27/11/2026. **Pedido de:** Gabriel. **Tamanho:** projeto. **Branch:**
`feat/calculadora-preco-rtc`.

**Registro das decisões e dos testes:** [CALCULADORA_RTC.md](../../rotinas/simulador-preco/CALCULADORA_RTC.md)
(D1 a D17 e Testes 0 a 6). Esta spec não repete o porquê de cada decisão; cita o número.

## Por quê

O comprador precisa ver quanto o preço de venda de cada produto muda com a Reforma Tributária
(CBS e IBS), e não só em 2026: também nos anos da transição. Hoje o simulador mostra só o preço
da rotina atual. A planilha `Simulador_Precificacao_Reforma_Tributaria_v3.xlsx` já faz a conta à
mão para 10 produtos; o simulador passa a fazer a mesma conta para todos, com as alíquotas
oficiais da calculadora da Receita.

**Sucesso:** para cada linha da consulta, a tela mostra o preço atual, o preço novo do cenário
escolhido e a diferença, e o comprador sabe se pode confiar no número (selo "Oficial RFB" ou
aviso de estimativa, e o estado do produto na calculadora).

## Objetivos e não objetivos

**Objetivos**
1. Preço novo por linha, com as fórmulas da planilha v3 (D2), para os 5 cenários (D10).
2. Alíquota e redução de CBS e IBS **da calculadora** para cada NCM + CST + classe (D4, P1).
3. Um produto inválido não derruba os outros (D5).
4. Bonificação, verbas e "bonificação gera crédito" digitadas por linha (D7, D13, D16).
5. Parâmetros dos 4 cenários estimados editáveis e guardados por comprador (D9).

**Não objetivos (fora desta entrega)**
- A visão lado a lado dos 5 cenários (aba `Comparativo_Transicao`).
- Auditoria de créditos, apuração assistida, DARF, validação de XML da NF-e.
- Imposto Seletivo.
- Preço novo para **produto novo** (digitado, sem NCM nem classe): as colunas da reforma mostram
  "—".
- Tirar as simulações do navegador: continua a pendência já registrada; esta entrega usa o
  mesmo armazenamento das edições de hoje.

**Anti-objetivos (falharia mesmo funcionando)**
- O simulador **gravar** o preço novo em qualquer lugar ou alimentar a NF-e (D17).
- Um cenário estimado parecer oficial.
- A consulta travar ou ficar lenta porque a calculadora caiu.
- O navegador falar direto com o servidor da calculadora (D4).

## Abordagens consideradas

| | Como | Prós | Contras |
|---|---|---|---|
| **A. Rota própria para as alíquotas** *(escolhida)* | A página de produtos chega como hoje. Em seguida, a tela pede à nossa API as alíquotas das combinações daquela página, numa rota separada. | A consulta não fica mais lenta nem depende da calculadora; se ela cair, a tela mostra o legado e um aviso. Trocar de cenário não chama a rede. | Duas chamadas por página. |
| B. Alíquotas junto da página | A consulta de produtos já devolve a alíquota de cada linha. | Uma chamada só. | A página espera a calculadora; uma calculadora lenta deixa a consulta lenta; misturar as duas falhas complica o tratamento. |
| C. Copiar as tabelas da Receita para o nosso banco | Baixar classificações e alíquotas (`/dados-abertos`) e calcular sem a calculadora. | Sem dependência em tempo real. | Reescreve a regra da Receita em nosso código, que é o que a calculadora existe para evitar; tabela nova no banco. |

**Uma chamada por combinação, valendo para todos os cenários.** A API pergunta à calculadora
sempre pelo **cenário 2026** e guarda, para cada tributo, o **percentual de redução** da classe
(`gRed.pRedAliq`; sem `gRed`, redução zero). A alíquota efetiva de qualquer cenário é
`alíquota nominal do cenário × (1 − redução)`. No 2026, a nominal é a que a própria calculadora
devolve (`pCBS`, `pIBSUF`, `pIBSMun`), e a conta dá a `pAliqEfet` dela. Nos estimados, a nominal é
a do cenário (D9).
- **Por quê:** trocar de cenário não chama a rede; o cache serve aos 5 cenários; não mandamos à
  calculadora datas de 2027 em diante com alíquotas nossas, que ela trataria como simulação.
- **Custo, se estiver errado:** se a redução de alguma classe mudar de um ano para outro, o
  cenário estimado erra nessa classe. Esses cenários já são estimativa (D17).

## Como fica

### 1. Banco (SQL v3)

- **Adaptação A10:** a `ConsultaPaginada` traz `FO.SIMPLESNACIONAL` do `LEFT JOIN PCFORNEC FO`
  que já liga o fornecedor (o mesmo de `CODFORNEC` e `FORNECEDOR`). A `Consulta` (o miolo da v3)
  não muda: a sp5 continua dando IDENTICO. Como o código e o nome do fornecedor, a coluna não
  entra no `ROW_NUMBER`, que numera só as colunas da `Consulta`. Entidade e DTO:
  `SimplesNacional` (`string?`); no JSON, `simplesNacional` (`"S"`, `"N"` ou nulo).
- **Município da filial (D11):** consulta nova, uma por filial, pela ligação nome + UF da sp20:

  ```sql
  SELECT C.CODIBGE, F.UF
    FROM PCFILIAL F
    JOIN PCCIDADE C
      ON UPPER(TRIM(C.NOMECIDADE)) = UPPER(TRIM(F.CIDADE))
     AND C.UF = F.UF
   WHERE F.CODIGO = :codFilial
  ```

  Nenhuma linha ou mais de uma: a rota das alíquotas responde inválido com
  "A filial X não tem um código IBGE único no cadastro (PCFILIAL × PCCIDADE)". Na Minas Rural, o
  erro aparece até a sp20 rodar lá.

### 2. Nossa API

**Rota nova:** `POST /api/simulador-preco/aliquotas-rtc`, com sessão, como as outras do
simulador.

Pedido:
```json
{ "codFilial": "1", "combinacoes": [ { "ncm": "33051000", "cst": "000", "cClassTrib": "000001" } ] }
```

Resposta (no envelope `ApiResponse` de sempre):
```json
{
  "disponivel": true,
  "mensagem": null,
  "itens": [
    {
      "ncm": "33051000", "cst": "000", "cClassTrib": "000001",
      "estado": "CALCULADO",
      "cbs":    { "aliquota": 0.90, "reducao": 0 },
      "ibsUf":  { "aliquota": 0.10, "reducao": 0 },
      "ibsMun": { "aliquota": 0.00, "reducao": 0 },
      "fundamento": "LC 214/2025, art. …",
      "erro": null
    }
  ]
}
```

- **Validação, antes de chamar a calculadora:** filial só com dígitos; de 1 a 100 combinações
  (o tamanho da página); NCM com 8 dígitos, CST com 3, classe com 6. Combinação fora do formato
  volta com `estado: "INCONSISTENCIA_ENTRADA"` e erro nosso, sem ir à calculadora. Combinações
  repetidas são perguntadas uma vez só.
- **A chamada:** `POST {UrlBase}/calculadora/observabilidade/regime-geral` (Teste 6), com o corpo
  mínimo do Teste 1: `versao "0.0.1"`, `dhFatoGerador` igual à data de hoje limitada a
  31/12/2026, município e UF da filial, `tpDoc 55`, e um item por combinação com
  `baseCalculo 100`, `quantidade 1`, `unidade "UN"`. O `numero` do item liga a resposta à
  combinação.
- **A resposta da calculadora:** os valores vêm como texto (`"1.80"`) e são lidos com cultura
  invariante. Cada item vira um `estado` (o `estadoItem` dela) e, nos erros, o `code` e o
  `detail` em `erro: { codigo, mensagem }`. **A decisão é sempre pelo `code`, nunca pelo texto**
  (D5). O `fundamento` é o texto da `memoriaCalculo` do item, um por combinação, nulo quando
  ela não vier; entra no cache junto com o resto.
- **A redução de cada tributo** (`reducao`, de 0 a 100):
  - com `gRed`, é o `pRedAliq`;
  - sem `gRed` e com alíquota maior que zero, é 0;
  - **com alíquota zero** (o item não paga aquele tributo, ex.: isenção), é **100**, para que a
    conta "nominal do cenário × (1 − redução)" também dê zero nos cenários estimados.
  O Teste 7 confirma qual dos casos a isenção usa; a regra cobre os dois.
- Um 422 da chamada inteira (erro global: data, UF, município) vira `disponivel: false`
  com a mensagem, e fica no log.
- **Calculadora fora do ar, lenta (mais de 10 s) ou com erro 5xx:** a rota responde **200** com
  `disponivel: false` e "Calculadora da Receita indisponível; preço novo não calculado". Nunca
  500: a falha é dela, não do pedido.
- **Cache (D5, item 4):** `IMemoryCache` do próprio ASP.NET, por (data, município, NCM, CST,
  classe), por 6 horas, válidos **e** inválidos. `disponivel: false` não entra no cache. O cache
  do IBGE da filial é por (base, filial), pelo mesmo prazo.
- **Configuração:** seção nova no `appsettings.json`, **fora** de `Bases`, porque a calculadora
  é nacional e a mesma para as duas bases:
  ```json
  "CalculadoraRtc": { "UrlBase": "http://10.122.65.45:8080/api", "TimeoutSegundos": 10 }
  ```
  O cliente HTTP é o `HttpClient` do .NET (`AddHttpClient`), sem biblioteca nova.
- **O que sai da nossa rede para a calculadora:** só NCM, CST, classe, município e UF da filial,
  e a base fictícia 100. Nenhum preço, cliente ou fornecedor.
- **Preferências:** `simulador-preco` entra em `PreferenciasService.Telas`.

### 3. Tela

**As fórmulas: um arquivo só, `client-new-kpi/lib/precoReforma.ts`**, sem React, em decimal
exato (`lib/decimalExato.ts`), como o `simuladorPreco.ts`. Entrada: a linha calculada de hoje
(`calcular()`), os campos digitados da linha, o regime do fornecedor, as alíquotas da combinação
e o cenário. As letras são as colunas da aba `Simulador_Precificacao` da v3.

**As edições de hoje valem para o preço novo.** A entrada é o resultado de `calcular()` **com**
os ajustes da linha (preço digitado, percentuais trocados, ST digitado): é a mesma linha que o
comprador vê, e o preço atual (`prFinal`) contra o qual a diferença é medida sai da mesma conta.
A D15 quer dizer "os percentuais do cadastro, e não a tabela de CST ICMS da planilha"; se o
comprador trocou um percentual no quadro, vale o dele, como já vale hoje. **Única exceção: o
`percCbs`** (a CBS da conta atual) não entra no preço novo, que usa a CBS da calculadora ou do
cenário. O quadro diz isso embaixo do campo.

| Passo | Conta | Observação |
|---|---|---|
| Rateio (M) | `bonificada ÷ (comprada + bonificada)`; zero sem quantidades | |
| Preço médio (N) | `preço × comprada ÷ (comprada + bonificada)`; sem quantidades, o preço | |
| Fator de crédito da bonificação | 1 se "gera crédito" (D16) = SIM; senão `comprada ÷ máx(1, comprada + bonificada)` | |
| Crédito de ICMS (R) | `vlIcmsEnt × fator ICMS/ST × fator da bonificação`; zero se Simples | **D15:** o valor de hoje, do cadastro |
| Crédito de PIS e COFINS | `(vlPisEnt + vlCofinsEnt) × PIS/COFINS ativo × fator da bonificação` | valores de hoje (ver "Minhas decisões") |
| Base RTC de entrada (V) | `N × (1 + IPI% + frete%) − R − PIS/COFINS` | |
| Crédito de CBS (W) e de IBS (X) | `V × efetiva`, se o CST gera crédito; × % do Simples se `S` | efetiva do cenário |
| Custo NET (Y) | `V − W − X` | |
| Verba (AC) | NET: `Y × verba% + fixa`; GROSS: `N × verba% + fixa` (D13) | nunca muda a base de crédito |
| Custo líquido (AD) | `Y − AC` | |
| Índice (AI) | `1 − margem − ICMS saída × fator − (PIS + COFINS) × ativo` | sem a CBS: ela vai por fora |
| Preço base (AJ) | `AD ÷ AI`; índice ≤ 0 dá "—" | |
| Base de saída (AK) | `AJ × (1 − ICMS saída × fator − (PIS + COFINS) × ativo)` | bate com a base da Receita em 2026 |
| CBS (AM) e IBS (AO) por fora | `AK × efetiva`, se o CST tributa a saída; 2 casas, como a Receita | IBS = UF + Mun |
| **Preço novo (AR)** | `AJ + AM + AO + ST × fator ICMS/ST`; 3 casas | |
| Diferença (AT, AU) | contra o **`prFinal` da linha** (o preço atual, D1, já com as edições) | |

- **Efetiva** de cada tributo = nominal do cenário × (1 − redução da combinação).
- **"Gera crédito" e "tributa saída" por CST:** uma tabela constante no mesmo arquivo, copiada da
  `Tabelas_CST_e_Dev_API` (colunas E e F), com a nota de que espera o fiscal. A **redução** nunca
  vem dela: vem da calculadora (P1).

  | CST | Descrição | Gera crédito na entrada | Tributa a saída |
  |---|---|---|---|
  | 000 | Tributação integral | sim | sim |
  | 200 | Alíquota reduzida | sim | sim |
  | 400 | Isenção / alíquota zero | não | não |
  | 410 | Imunidade / não incidência | não | não |
  | 510 | Diferimento | não | não |
  | 620 | Tributação monofásica | não | não |
  | outro ou nulo | — | sim | sim |

  "Outro ou nulo" segue a calculadora: se ela devolver alíquota zero, a redução de 100% já zera
  crédito e destaque.
- **Regime (D12):** `S` = Simples; `N` = Regime Regular; nulo = Regime Regular **com aviso** na
  linha: "regime do fornecedor não informado no cadastro; calculado como Regime Regular".

**Os cenários (D10):** um seletor no topo, junto dos filtros, com os 5 cenários; o padrão é
**2026 Oficial RFB**. Um botão "Parâmetros" abre um quadro com os 5:

| Cenário | CBS | IBS UF | IBS Mun | PIS/COFINS ativo | Fator ICMS/ST | Editável |
|---|---|---|---|---|---|---|
| 2026 Oficial RFB | da calculadora | da calculadora | da calculadora | sim | 1 | não |
| 2027 Ref. TCU | 11,2% | 0,05% | 0,05% | não | 1 | sim |
| 2029 Transição | 11,2% | 1,4% | 0,4% | não | 0,9 | sim |
| 2033 Pleno | 8,8% | 14% | 3,7% | não | 0 | sim |
| Personalizado | 12,5% | 1% | 0,5% | não | 1 | sim |

- O **% de crédito do fornecedor do Simples** é **um valor só**, que vale para os 5 cenários:
  20%, editável a qualquer momento, inclusive com o 2026 escolhido (não é alíquota da Receita;
  é uma estimativa nossa, como na planilha).
- Os valores da tabela são o padrão (os do painel da v3). O que o comprador muda é guardado nas
  preferências (D9), tela `simulador-preco`, e só o que difere do padrão. Um botão
  "Voltar ao padrão" por cenário e um para o % do Simples. Formato:
  ```json
  {
    "cenarios": {
      "2027": { "cbs": 11.2, "ibsUf": 0.05, "ibsMun": 0.05, "pisCofinsAtivo": false, "fatorIcmsSt": 1 },
      "creditoSimples": 20
    }
  }
  ```
  Chaves: `2027`, `2029`, `2033`, `personalizado`, `creditoSimples`. Alíquotas em %, como a
  calculadora. A leitura é defensiva, como a `preferenciasDaExibicao.ts`: valor fora do formato
  volta ao padrão.
- Na base com `PreferenciasNoBanco: false` (hoje, a Minas Rural), o quadro funciona, mas não
  lembra; uma linha no quadro avisa.
- Trocar de cenário ou de parâmetro recalcula a grade na hora, sem rede.

**A conformidade (D17):**
- Com o 2026 escolhido, o selo **"Oficial RFB"** ao lado do seletor.
- Com qualquer outro, a faixa **"Estimativa — não usar para tributação"**, sempre visível
  enquanto ele estiver escolhido.

**Na grade:** um grupo novo de colunas, **"Reforma — <cenário>"**, depois das colunas de hoje:
"Situação RFB", "CBS (R$)", "IBS (R$)", "Preço novo", "Dif. (R$)" e "Dif. (%)". As demais
contas aparecem no quadro do produto (abaixo). As colunas de hoje não mudam.

| Caso da linha | O que as colunas da reforma mostram |
|---|---|
| Calculada | os valores; "Situação RFB" = "Calculado" |
| `CALCULO_SIMULADO` | os valores; "Situação RFB" = "Simulado" |
| `INCONSISTENCIA_ENTRADA` | "—" nos valores; na situação, o ícone de aviso com a mensagem da Receita, ex.: "Classe Trib. 200003 não vale para o NCM 33051000" |
| Sem NCM, CST ou classe no cadastro | "—"; "Sem tributação RTC no cadastro" |
| Calculadora indisponível | "—" em todas, e uma faixa no topo com a mensagem |
| Alíquotas ainda chegando | um indicador discreto na coluna; o legado já está na tela |
| Produto novo | "—" (fora do escopo) |

**No quadro do produto (o modal de edição):**
- **Campos novos**, por linha: quantidade comprada, quantidade bonificada,
  "Bonificação gera crédito?" (padrão NÃO), verba %, verba fixa (R$/un), base da verba
  NET/GROSS (padrão NET).
- **A memória de cálculo** do cenário escolhido, passo a passo, como a aba
  `Simulador_Individual`, com o fundamento legal da calculadora quando houver.
- Os campos novos entram no `AjusteDaLinha`, e seguem o mesmo caminho das edições de hoje:
  rascunho, "Salvar simulação", "Limpar". Uma linha com um deles diferente do padrão conta como
  simulada.

## Minhas decisões (corrigíveis)

1. **A abordagem A e a redução derivada** (seção "Abordagens consideradas").
2. **Créditos de PIS e COFINS de entrada pelo valor de hoje** (`vlPisEnt`, `vlCofinsEnt`), e
   não pela conta da planilha (`preço × (PIS% + COFINS%)`). O valor de hoje já exclui o ICMS da
   base, como o cadastro e a rotina atual fazem; é a mesma lógica da D15. Custo, se estiver
   errado: centavos de diferença contra a planilha nas linhas com PIS/COFINS.
3. **O 2026 usa a data de hoje, limitada a 31/12/2026.** Em 2027 o cenário "oficial" passa a
   ser outro, e isso será uma decisão nova.
4. **Arredondamento:** CBS e IBS a 2 casas (como a Receita, P4); preço novo e diferenças a 3
   casas, como o preço de hoje.
5. **Colunas da grade:** só as 6 do resultado; o passo a passo fica no quadro, para não dobrar
   uma tabela que já é larga.
6. **Teste 7, na primeira tarefa do plano:** rodar no Swagger um produto de CST de isenção
   (400 ou 410), para ver se a calculadora devolve `gRed` com 100% ou a alíquota zerada. A regra
   da redução (seção 2) cobre os dois casos; o teste só confirma, e o resultado entra no
   CALCULADORA_RTC.md e vira um caso da sp22.
7. **A planilha v3 entra no repositório**, sem edição, em
   `docs/rotinas/simulador-preco/referencia/Simulador_Precificacao_Reforma_Tributaria_v3.xlsx`,
   como o `sql-v3.sql`: é de lá que a sp21 tira os valores esperados, abrindo-a com o Excel.

## Casos de borda

- **Página sem nenhuma combinação válida:** a rota não é chamada.
- **A mesma combinação em várias linhas:** perguntada uma vez; as linhas compartilham a
  resposta.
- **Comprada e bonificada zeradas ou vazias:** sem rateio; o preço médio é o preço de compra.
- **Índice zero ou negativo:** preço novo "—", como o preço de hoje.
- **Trocar de filial:** município novo, chave de cache nova.
- **Duas abas:** o cache é do servidor; as preferências usam o `MERGE` que já trata isso.
- **A calculadora volta depois de cair:** a próxima página (ou "Consultar" de novo) tenta outra
  vez, porque `disponivel: false` não fica no cache.

## Validação

- **sp21 (`validacao/sp21_preco_reforma.mjs`), sem rede:** roda o `precoReforma.ts`.
  - Reproduz as linhas da planilha v3 nos cenários 2027 e 2033, com redução de base e PIS/COFINS
    zerados (onde as duas formas de crédito são iguais), ao centavo.
  - No 2026, com as respostas dos Testes 1 e 3: base × efetiva = o `vCBS` e o `vIBSUF` da
    calculadora.
  - Bonificação SIM × NÃO com o exemplo da D16 (R$ 1,00 × R$ 1,20 de crédito de ICMS por
    unidade); Simples × Regular; NET × GROSS; índice zero.
- **sp22 (`validacao/sp22_aliquotas_rtc_na_api.cs`), sem rede, no padrão do pr2:** o serviço
  com uma calculadora falsa.
  - Lê a resposta do Teste 6 (um item válido, um `REG-011`).
  - Calculadora fora do ar e lenta: `disponivel: false`, sem exceção.
  - 422 global; validação de formato; combinações repetidas; segunda chamada vem do cache;
    filial sem IBGE e com dois.
- **sp5 e sp15:** com a A10, continuam passando sem mudança de regra (a coluna nova está fora da
  `Consulta`).
- **No banco, pelo Gabriel:** sp6 com `simplesNacional` em toda linha; a consulta do IBGE da
  filial devolvendo uma linha para cada filial usada.
- **Na tela:** uma página da Época com a calculadora do Dev, conferindo uma linha à mão contra a
  planilha.

## Em aberto (não trava a implementação)

- Confirmar com o fiscal: a regra de "gera crédito" depende também da classe? A bonificação na
  nota fica sem CBS/IBS? A tabela de CST no `precoReforma.ts` é o único lugar a mudar.
- A CBS de 11,2% em 2027 e 2029 e de 8,8% em 2033, vindas da planilha: perguntar a quem a montou.
- sp20 e sp19 na Minas Rural.

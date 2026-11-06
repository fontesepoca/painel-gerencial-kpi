# Exportação do detalhamento em lote — design

**Data:** 06/11/2026 · **Pedido:** Gabriel · **Rotina:** 9815 — DRE Gerencial

## Problema

A exportação das linhas selecionadas (e o botão direito de uma linha) faz **uma requisição por
linha × coluna**, uma atrás da outra. Cada requisição de despesa roda `DreDetalheQueries.Lancamentos`,
que varre a PCLANC. Com 15 linhas em 10 meses são 150 varreduras — a apuração dos mesmos 10
meses faz uma.

Medido em 06/11/2026, filial 7, jan–out/2025, competência: **104.330 lançamentos** de despesa
(≈ 10 mil por mês, 16 a 19 grupos por mês). Isso descarta uma resposta única (≈ 80 MB de JSON
em memória na API e no navegador).

E a exportação não pode morrer por **timeout** em nenhuma camada.

## Decisões (do Gabriel, nesta conversa)

1. **Endpoint de lote** na API, e não uma requisição por linha nem zip montado na API.
2. **Entrega em fluxo NDJSON**: o front gera cada Excel assim que a parte dele chega.
3. **Falha parcial gera zip parcial + aviso**: o que deu certo é baixado, com um arquivo
   listando o que faltou; a tela também avisa.

## O que NÃO muda

- O conteúdo de cada planilha: o `dados` de cada parte é o mesmo `DetalhamentoDto` de hoje, e o
  front continua usando `planilhaDoDetalhe`.
- Os caminhos no zip (`caminhosNoZip`) e o nome do zip (`nomeDoZipDaSelecao`).
- Os totalizadores: composição no navegador, sem consulta (`composicaoDoTotal.ts`).
- O checkbox "Ocultar baixas estornadas e da rotina 737": aplicado no front, como hoje.
- O duplo clique na célula (`POST /detalhe`) — fica como está.
- `DreGerencialQueries.cs` não é tocado (o dc86 não muda) e nenhum número muda (sem entrada no
  `DIVERGENCIAS.md`).
- Fora do escopo: provisionado e Total R + P na exportação (já não estão nela hoje) e otimizar
  as consultas de receita, devolução e impostos.

## Arquitetura

### Unidade de trabalho: bloco × coluna

A API não consulta o período inteiro de uma vez. Ela quebra o lote em **unidades**, e cada
unidade é **uma** consulta do tamanho de um detalhamento de um mês — o que já roda hoje:

| Linhas | Unidade | Consulta |
|---|---|---|
| Lançamentos sem sobra | (bloco, coluna) | `Lancamentos` com `{3} IN (:chaves)` — todas as linhas do bloco de uma vez |
| Lançamentos com sobra (contas subidas) | (linha, coluna) | `Lancamentos` como hoje — cada uma tem a sua sobra |
| Receita por cliente, devolução por motivo, imposto por produto | (tipo + bloco + chave, coluna) | a consulta de hoje, sem mudança. RECEITA BRUTA e RECEITAS LIQUIDAS abrem a mesma consulta: ela roda uma vez e serve às duas |

Exemplo: 15 linhas de despesa em 3 blocos × 10 meses = **30 consultas** (hoje 150), e o número
não cresce com as linhas.

**O filtro de datas de cada unidade é exatamente o da consulta mensal de hoje** (`dataInicio` e
`dataFim` da coluna). Não existe "separar por mês" depois — então não existe lançamento caindo
no mês errado, e o comparativo (colunas não vizinhas) funciona sem caso especial.

As unidades rodam **uma de cada vez**, como a exportação de hoje: não disputar o Oracle com a
operação. A ordem é a do zip — coluna por coluna dentro de cada bloco.

### API

**`POST /api/dre-gerencial/detalhe/lote`**

Requisição:

```json
{
  "filiais": ["7"], "regime": "competencia", "analise": "grupo-contas",
  "fornecedores": null,
  "colunas": [ { "dataInicio": "2025-01-01", "dataFim": "2025-01-31" }, ... ],
  "linhas":  [ { "id": 0, "tipo": "lancamentos", "bloco": "operacional", "chave": "310", "sobra": null }, ... ]
}
```

Validação, antes de abrir o fluxo (erro aqui é um 400 comum, com `ApiResponse`):

- 1 a 300 linhas, 1 a 24 colunas; cada coluna com `dataInicio <= dataFim`.
- cada linha passa pela mesma validação de `ObterDetalheAsync` (tipo conhecido, bloco em lista
  fechada, chave e sobra no formato de hoje). A validação é extraída para um método comum, e
  o `/detalhe` passa a usá-lo também — uma regra só.
- `id` único no lote.

Resposta: `200`, `Content-Type: application/x-ndjson`, `Cache-Control: no-store, no-transform`.
Uma linha de JSON por pacote:

```
{"t":"inicio","partes":150}
{"t":"aguarde"}                                          ← batimento
{"t":"parte","linha":0,"coluna":3,"dados":{...DetalhamentoDto...}}
{"t":"falha","linhas":[0,4,7],"coluna":3,"mensagem":"..."}
{"t":"fim"}
```

- `partes` = linhas de consulta × colunas (o front soma os totalizadores à parte).
- `falha` cobre todas as linhas da unidade que falhou, depois da segunda tentativa.
- Uma exceção fora de unidade (bug) vira `{"t":"erro","mensagem":...}` e encerra o fluxo; sem
  `fim`, o front trata como interrompido.

**SQL do lote.** Derivado do texto de `DreDetalheQueries.Lancamentos` por transformação, no
padrão de `ConsultasEmAberto.TrocarUmaVez` (cada âncora tem de aparecer exatamente uma vez, ou
lança): `WHERE {3} = :chave` vira `WHERE {3} IN (:chave0, ...)`, e o `SELECT` externo ganha
`{3} AS CHAVELOTE`. Compõe com as transformações de competência que já existem. Um detalhe e o
lote não têm como divergir no critério.

**Participação por fornecedor.** Quando há filtro, ela é calculada por coluna com a mesma chamada
de hoje (`ObterFaturamentoPorMesAsync` no intervalo da coluna), uma vez por coluna e reaproveitada
por todas as unidades daquela coluna.

**Montagem.** A conversão `DetalheLancamentoDre → DetalheLancamentoDto` e o `DetalhamentoDto`
saem de um método comum ao `/detalhe` e ao lote.

### Proteções contra timeout

| Camada | Proteção |
|---|---|
| Oracle | `commandTimeout` de cada unidade do lote: 600 s (hoje 300 s no detalhe; o `IN` lê mais). |
| Erro transitório | ORA-01013 (timeout), queda de conexão (ORA-03113, ORA-03135, ORA-12170, ORA-12541) e afins: **uma** nova tentativa da unidade. Cancelamento pedido pelo usuário não é tentado de novo. |
| Cabeçalhos | O `inicio` sai e é descarregado (`FlushAsync`) antes da primeira consulta. |
| Silêncio | Enquanto uma unidade roda, `{"t":"aguarde"}` a cada **15 s**, com `FlushAsync`. |
| Compressão | `no-transform` na resposta; o tipo `application/x-ndjson` entra na compressão da API com flush por pacote. O BFF já repassa em fluxo e sem teto (`repassarParaApi`, dc87). |
| Navegador | **Vigia**: 90 s sem nenhum pacote (nem batimento) = conexão perdida → aborta a requisição (o que cancela o comando no Oracle pelo `CancellationToken`) e trata como interrompido. |
| Usuário | Botão **Cancelar** no aviso da exportação, pelo mesmo `AbortController`. |

### Front

- `exportarDetalhesDasLinhas` passa a: separar as linhas em "com consulta" e "totalizador";
  abrir o fluxo do lote para as primeiras; ler com `response.body.getReader()` e um leitor de
  NDJSON que junta pedaços partidos no meio da linha; a cada `parte`, gerar o `.xlsx` daquela
  linha × coluna e descartar os dados; gerar as composições no navegador.
- `exportarDetalhesDaLinha` (botão direito) usa o mesmo caminho, com um lote de 1 linha.
- Progresso: "Consultando o banco…" até a primeira parte; depois "COMBUSTÍVEL · Março/2025 —
  23 de 150". Cada `falha` também conta como feita.
- **Ao fim:**
  - `fim` sem falhas → baixa o zip, como hoje.
  - `fim` com falhas → baixa o zip com `LEIA - arquivos que faltaram.txt` na raiz (linha, coluna
    e motivo de cada uma) e a tela mostra "Exportado com N arquivos faltando — veja o LEIA no zip".
  - Interrompido (`erro`, fluxo cortado, vigia) → mesma regra do zip parcial, com o motivo da
    interrupção no LEIA e as partes não recebidas listadas como faltando. Se nada chegou, só o
    erro na tela, sem zip.
  - Cancelado pelo usuário → nada é baixado.
- Os pedidos passam pelo BFF como hoje (mesma sessão, mesma checagem de base).

## Testes

Sem banco (rodam aqui):

- **dc105 (C#)** — a transformação do SQL do lote: as duas âncoras trocadas uma vez, a coluna
  `CHAVELOTE`, os binds do `IN` na ordem, e a composição com as variantes de competência.
  Também o agrupamento das linhas em unidades (bloco, sobra, receita deduplicada) e a validação
  do lote (limites, id repetido, chave fora do formato).
- **dc106 (mjs)** — o leitor de NDJSON (pacote partido entre dois pedaços, várias linhas num
  pedaço, fluxo sem `fim`), o vigia, e o LEIA do zip parcial.

Contra o Oracle (o Gabriel roda; o Claude não conecta):

- **dc107 (C#, roda localmente com o `appsettings.Development.json`)** — o mesmo recorte pelas
  duas vias: as consultas mensais de hoje, linha a linha, e as unidades do lote. Compara
  RECNUM e VPAGO de cada lançamento, por linha e coluna. Tem de dar zero diferença.
- Uma exportação real de 10 meses com muitas linhas, cronometrada, antes e depois.

## Documentação

- `docs/rotinas/9815-dre-gerencial/` — a exportação em lote e as proteções contra timeout.
- Comentários de cabeçalho em `exportarDetalhesDaLinha.ts` e na consulta do lote, no padrão do
  projeto.

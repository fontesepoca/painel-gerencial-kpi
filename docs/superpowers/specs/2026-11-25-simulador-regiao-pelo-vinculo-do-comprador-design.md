# Simulador de preço: a região vem do vínculo do comprador

**Data:** 25/11/2026. **Pedido de:** Gabriel. **Tamanho:** projeto pequeno (back, front e validação).

## Intenção

Na rotina em operação, o comprador não informa a região: ela sai do vínculo de **matrícula e
filial** na `TAB_REG_PR_FILIAL`. O simulador passa a fazer o mesmo. O comprador escolhe só a
filial, e a tela mostra qual região está valendo.

## O vínculo, como a rotina em operação faz

Este é o único trecho da consulta da rotina atual que interessa aqui. O resto dela, como as abas
de preço com regiões fixas (83, 1, 40, 36) e a oferta, fica de fora.

```sql
FROM ... TAB_REG_PR_FILIAL RPF, PCTABPR TPR, PCREGIAO REG ...
   AND TPR.NUMREGIAO = REG.NUMREGIAO
   AND RPF.codfilial = EST.CODFILIAL
   AND TPR.NUMREGIAO = rpf.numregiao
   and rpf.matricula = <matrícula de quem está logado>
```

A rotina **não filtra** a coluna `MARCADO`. Nós também não, pela regra de produzir os mesmos
números da rotina atual.

## O que o Gabriel conferiu no banco (25/11/2026)

- A tabela é do schema `EPCTI`, com as colunas `MATRICULA` (NUMBER, obrigatória), `CODFILIAL`
  (VARCHAR2, obrigatória), `NUMREGIAO` (NUMBER, opcional) e `MARCADO` (CHAR, opcional).
- Nenhuma matrícula tem **mais de uma linha** para a mesma filial: a consulta de duplicados veio
  vazia.
- Com o usuário do Gabriel, a tabela é lida (2871 linhas). Com o **EDI**, o usuário da API, dava
  **ORA-00942**. A sp19 resolveu na Época: ver "Pendente".
- A matrícula 5476 tem a região 1 nas filiais 7, 12, 24, 25, 27 e 34.

## Abordagens

1. **Descobrir a região antes, com uma consulta pequena, e passá-la ao SQL v2 como hoje**
   (escolhida pelo Gabriel).
   - O SQL v2 não muda: a sp5 continua IDENTICO e os 37 binds ficam iguais.
   - A região fica disponível para a tela mostrar.
   - Sem vínculo, a resposta diz o motivo, sem rodar a consulta pesada.
2. **Fazer o join dentro do SQL v2, igual à rotina.** Descartada:
   - seria a adaptação A9 no texto de referência, e a ordem dos binds mudaria;
   - a tela ainda precisaria de outra consulta para mostrar a região;
   - sem vínculo, voltaria só uma lista vazia, sem explicação.

As duas dão os mesmos números. A rotina liga `RPF.CODFILIAL = EST.CODFILIAL`, e o nosso SQL já
filtra uma filial só (`E.CODFILIAL IN (:codFilial)`). Com no máximo uma região por matrícula e
filial, buscar a região antes equivale ao join.

## Como fica

### Back-end

- **Nova consulta `SimuladorPrecoQueries.RegiaoDoComprador`.** Binds, nesta ordem: `:matricula` e
  `:codFilial`.
  ```sql
  SELECT NUMREGIAO FROM TAB_REG_PR_FILIAL
   WHERE MATRICULA = :matricula AND CODFILIAL = :codFilial
  ```
- **Nova consulta `SimuladorPrecoQueries.FiliaisDoComprador`.** Traz as filiais da tabela
  `FILIAIS`, com o mesmo formato do DRE, só onde a matrícula tem vínculo com `NUMREGIAO` não nula.
  Ordena como o DRE: código como número, e o `LPAD` do `DreGerencialQueries.Filiais`.
- **Repositório:**
  - `ObterRegioesDoCompradorAsync(int matricula, string codFilial)` devolve uma lista com as
    regiões **não nulas**;
  - `ObterFiliaisDoCompradorAsync(int matricula)`.
- **Serviço, antes da consulta paginada:**
  - nenhuma região: recusa com "Você não tem região vinculada na filial {codFilial}. O vínculo
    é feito na TAB_REG_PR_FILIAL.";
  - mais de uma região: recusa com "Mais de uma região vinculada na filial {codFilial}. Corrija
    o vínculo na TAB_REG_PR_FILIAL.". Hoje não acontece, mas a tabela não impede, e duplicar
    produtos em silêncio seria pior;
  - uma região: segue com ela, como o `numRegiao` de hoje.
- **O filtro perde o campo `NumRegiao`.** A validação "Escolha uma região." sai.
- **A resposta ganha o campo `NumRegiao`**, a região usada.
- **Novo endpoint `GET api/simulador-preco/filiais`**, com o mesmo formato de `FilialDto` do DRE.

### Front-end

- **Filtros:**
  - o campo Região sai;
  - a lista de filiais passa a vir do endpoint novo, só com as filiais em que o comprador tem
    vínculo;
  - o `FiltroSimulador` perde o `numRegiao`.
- **Ao lado do "Consultado às":** "Região {n} (vínculo do comprador)".
- **A mensagem de recusa da API** (sem vínculo, ou região duplicada) aparece no lugar da tabela,
  como os outros erros.
- **A chave da simulação guardada continua `filial|região`**, agora com a região que veio na
  resposta. As simulações já salvas, como `12|1`, continuam valendo. Sem resposta não há tabela,
  então também não há o que editar: a chave só é necessária depois que os dados chegam.

### Validação

- **sp5 e sp15:** sem mudança. Têm de continuar IDENTICO e 21/21.
- **sp6** (pela API, com banco):
  - consulta sem região;
  - confere que a resposta traz `numRegiao`;
  - confere que uma filial sem vínculo é recusada com a mensagem.
- **sp1 e sp7:** a `TAB_REG_PR_FILIAL` entra nas listas de objetos que o usuário da API precisa
  ler.

## Pendente antes de implementar

- **Base Época: resolvido em 25/11/2026.** Na sp19, o bloco 0 deu ORA-01031: a tabela existe e
  faltava o grant. Os blocos 1 e 2 deram certo (grant e sinônimo). No bloco 3, o EDI lê as 2871
  linhas e as seis filiais da matrícula 5476.
- **Base Minas Rural: a tabela existe.** Ela está no `EPCTI` de lá, com as mesmas 4 colunas
  (Gabriel, 25/11/2026). **Falta:** rodar a sp19 no Minas Rural, com o usuário que a API usa
  naquela base (bloco 0 e, se precisar, os blocos 1 a 3). Sem isso, a consulta do Minas Rural dá
  ORA-00942. Como a tabela e as colunas são as mesmas, não há regra diferente por base: nada vai
  para a configuração `Bases`.

## Como foi implementado (25/11/2026)

Quatro escolhas de quem implementou, dentro do que a spec aprovada pede:

- **Uma consulta só para as duas coisas.** `SimuladorPrecoQueries.VinculosDeRegiao` traz todos
  os vínculos da matrícula, sem os de região nula, e tem um bind só (`:matricula`).
  - A **consulta** separa a filial pedida no serviço. Nenhuma região dá a mensagem de recusa;
    mais de uma também recusa.
  - O **filtro de filiais** usa a mesma consulta, pelo `GET api/simulador-preco/vinculos`.
- **As filiais não ganharam um SQL próprio.** A tela cruza a lista do DRE, já recortada pelo
  PCLIB da sessão, com os vínculos (`useFiliaisDoSimulador`). Assim, os rótulos e as exclusões da
  lista do DRE (DBLEPCTI, 20/31/91) continuam valendo. Cada opção mostra a própria região:
  "12 — EPC-MAT · região 1".
- **A comparação de códigos de filial é numérica** quando os dois lados são números, dos dois
  lados (`MesmaFilial` na API, `normalizarCodigo` na tela). Assim, "07" e "7" não passam por
  "sem vínculo".
- **A sp7 não mudou.** Ela é das tabelas do EPOCA, e o grant desta tabela está na sp19. A sp1
  ganhou a `TAB_REG_PR_FILIAL` nas duas listas.

## Fora do escopo

- O comprador escolher outra região que não a do vínculo.
- Filtrar pela coluna `MARCADO`.
- Qualquer coisa da consulta da rotina atual além do vínculo: abas, oferta, giro e estoque.

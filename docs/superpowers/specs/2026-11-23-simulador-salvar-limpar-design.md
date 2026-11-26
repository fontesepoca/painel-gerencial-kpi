# Simulador de preço — Salvar, Limpar e títulos dos grupos

**Data:** 23/11/2026 · **Spec mãe:** `2026-11-18-simulador-de-preco-design.md` (revê a D22,
"a tela se guarda sozinha", só para as edições da tabela).

## Por quê

O comprador precisa decidir **quando** a simulação dos produtos da consulta fica guardada, e
poder limpar o que guardou. Os dois grupos da tabela ("Produtos novos simulados" e "Produtos
da consulta") hoje se confundem.

## O que muda (decidido pelo Gabriel em 23/11/2026)

1. **Edições da tabela (grid) só são guardadas no clique em "Salvar simulação"** (e, desde 24/11, os produtos novos também — ver abaixo).
   - Até lá, ficam na memória da aba (estado React), por consulta, como rascunho.
   - **Produtos novos continuam se guardando sozinhos**, como hoje.
2. **"Limpar simulações"** abre um quadro com dois quadradinhos: "Edições dos produtos da
   consulta" e "Produtos novos simulados".
   - Depois vem a confirmação ("Tem certeza? Não dá para desfazer").
   - Limpa **tudo do localStorage** deste usuário nesta base, de todas as filiais, regiões e
     fornecedores, e não só da consulta da tela.
3. **Títulos dos grupos centralizados na área visível da tabela**, acompanhando a rolagem
   lateral, com um espaço entre os dois grupos.

## Minhas decisões (corrigíveis)

- **Rascunho e salvo.** A tela mostra o rascunho, que nasce do que estava salvo.
  - "Salvar" grava os rascunhos de todas as consultas editadas nesta aba.
  - O ↺ e as edições do quadro também alteram só o rascunho.
- **Aviso de edições pendentes.**
  - Ao lado do botão aparece "N alterações não salvas".
  - O botão fica desabilitado quando não há nada pendente.
  - Ao recarregar ou fechar com pendências, o navegador pergunta antes de sair
    (`beforeunload`).
- **Trocar a consulta não perde o rascunho**, porque ele fica guardado por consulta na memória.
- **Limpar edições também descarta os rascunhos** que ainda não foram salvos.
  - Os dois quadradinhos começam marcados.
  - Com nenhum marcado, o botão "Limpar" fica desabilitado.
- **Uma aba em sincronia com a outra.** Para o que está salvo, isso continua funcionando como
  hoje. O rascunho é de cada aba.

## Mudança de 24/11/2026: os produtos novos também esperam o Salvar

Decisão do Gabriel, depois de testar na tela: ter um comportamento para a tabela e outro para os
produtos novos confundia. Agora tudo passa pelo **"Salvar simulação"**:
- **Rascunho próprio.** Criar, editar ou remover um produto novo mexe num rascunho na memória
  da aba.
- **Contador.** O rascunho entra no "N alterações não salvas" e no aviso ao sair.
- **Botão.** O "Salvar simulação" aparece também sem consulta, quando há produto novo.
- **Limpar.** "Limpar simulações" com "Produtos novos" marcado também descarta esse rascunho.
- **Teste.** O sp13 confere a contagem com `contarPendenciasDeNovos`: produto criado, removido
  ou editado conta 1, e um rascunho igual ao salvo conta 0.

## Revisão final (24/11/2026)

Corrigido:
- **Confirmação protegida.** Um Enter repetido ou um duplo clique em "Limpar" não confirma
  mais sozinho. Os botões ganharam `key`, o foco vai para "Voltar" e "Sim, limpar" só aceita
  clique depois de 0,6 s.
- **Aviso ao trocar de tela.** Ir a outra tela pela barra lateral com edições não salvas agora
  pede confirmação, já que o `beforeunload` não cobre a navegação do Next.
- **Contraste.** O texto do "Sim, limpar" usa o token `--sobre-negative`, escuro no tema escuro
  e branco no claro.

Limitações conhecidas (adiadas):
- **Duas abas na mesma consulta:** a última que salvar vence.
- **Sessão expirada:** se ela expirar no meio, Salvar descarta o rascunho sem gravar.
- **Edições escondidas:** com pendências de outra consulta e a consulta atual vazia, o botão
  Salvar não aparece.
- **Desempenho:** salvar um produto novo redesenha as 100 linhas da página.
- **Leitor de tela:** o título do grupo usa `scope="colgroup"`.

## Fora do escopo

Guardar no banco; lista de simulações nomeadas; desfazer a limpeza.

## Verificação

- Script `sp13` (Node, como sp10/sp12) cobrindo a lógica pura: rascunho × salvo, contagem de
  pendências, a limpeza por tipo.
- Conferência na tela pelo navegador do painel.

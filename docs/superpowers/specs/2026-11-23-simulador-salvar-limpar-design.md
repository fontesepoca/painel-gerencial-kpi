# Simulador de preço — Salvar, Limpar e títulos dos grupos

**Data:** 23/11/2026 · **Spec mãe:** `2026-11-18-simulador-de-preco-design.md` (revê a D22,
"a tela se guarda sozinha", só para as edições da tabela).

## Por quê

O comprador precisa decidir **quando** a simulação dos produtos da consulta fica guardada, e
poder limpar o que guardou. Os dois grupos da tabela ("Produtos novos simulados" e "Produtos
da consulta") hoje se confundem.

## O que muda (decidido pelo Gabriel em 23/11/2026)

1. **Edições da tabela (grid) só são guardadas no clique em "Salvar simulação".**
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

## Fora do escopo

Guardar no banco; lista de simulações nomeadas; desfazer a limpeza.

## Verificação

- Script `sp13` (Node, como sp10/sp12) cobrindo a lógica pura: rascunho × salvo, contagem de
  pendências, a limpeza por tipo.
- Conferência na tela pelo navegador do painel.

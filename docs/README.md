# Documentação do Novo KPI

Duas camadas, e a separação é a regra que mantém isto legível quando a terceira rotina
chegar:

| | |
|---|---|
| **[plataforma/](plataforma/)** | vale para **qualquer** rotina — arquitetura, banco, login, tela, infraestrutura |
| **[rotinas/](rotinas/)** | uma pasta por rotina do Winthor, com tudo o que é só dela |

**Onde escrever o que é novo:** se a próxima rotina vai precisar daquilo, é plataforma. Se
some junto com a rotina, é da pasta dela. Na dúvida, começa na rotina e sobe para a
plataforma quando a segunda rotina precisar — subir depois é barato, descobrir que a regra
geral estava enterrada na 9815 não é.

---

## Plataforma

| Documento | Quando ler |
|---|---|
| [ARQUITETURA.md](plataforma/ARQUITETURA.md) | antes de adicionar uma rotina — módulos, descoberta por reflexão, o passo a passo |
| [CONVENCOES_ORACLE.md](plataforma/CONVENCOES_ORACLE.md) | antes da primeira query — ODP.NET, Dapper, e as armadilhas que já custaram caro |
| [SCHEMA_BANCO.md](plataforma/SCHEMA_BANCO.md) | tabelas do Winthor, o que é leitura e o que é escrita |
| [PADROES_DE_TELA.md](plataforma/PADROES_DE_TELA.md) | ao construir qualquer tela — impressão, exportação, tela cheia, celular, controles de exibição |
| [AUTENTICACAO.md](plataforma/AUTENTICACAO.md) | login, sessão, permissão por rotina do Winthor |
| [DEPLOY_DOCKER.md](plataforma/DEPLOY_DOCKER.md) · [COMPRESSAO.md](plataforma/COMPRESSAO.md) · [PARALELISMO.md](plataforma/PARALELISMO.md) | infraestrutura e desempenho |

## Rotinas

| Rotina | Situação | Pasta |
|---|---|---|
| **9815 — GERENCIAL / DRE** | implementada; homologação em aberto | [rotinas/9815-dre-gerencial/](rotinas/9815-dre-gerencial/) |

A 9815 é o **molde**: ela foi a primeira e é onde os padrões apareceram. Uma rotina nova
copia a estrutura de pastas dela, não o conteúdo.

### A estrutura de uma pasta de rotina

```
rotinas/<numero>-<nome>/
  README.md             o que é, como está, e o índice da rotina
  LEVANTAMENTO.md       o que a rotina É HOJE no Winthor — lido do fonte Delphi
  ESPECIFICACAO.md      o que a versão web faz
  DIVERGENCIAS.md       toda diferença numérica entre as duas, medida e decidida
  HOMOLOGACAO.md        a matriz de cenários a conferir
  validacao/            os scripts que provam cada número (dcNN)
  referencia-oficial/   o que a rotina antiga exportou, para comparar
```

Nem toda rotina precisa das sete. Uma tela nova, que não existe no Winthor, não tem
`LEVANTAMENTO` nem `DIVERGENCIAS` — não há com o que divergir.

---

## As regras que valem para toda a documentação

**Divergência numérica é documentada ou é defeito.** Quando a tela web mostra um número
diferente do que a rotina antiga mostra, isso vai para o `DIVERGENCIAS.md` da rotina — com a
medida, o motivo e a aprovação. O que não estiver lá é defeito, não escolha.

**Mudança aprovada não se desfaz sozinha.** A lista de divergências de uma rotina só cresce,
e uma branch nova herda todas. Antes de abrir trabalho e antes de entregar,
`git log --oneline HEAD..main` tem de vir vazio: branch atrasada e regra revertida produzem a
MESMA tela, e só o histórico distingue uma da outra.

**O porquê fica, o passo a passo sai.** Esta documentação registra decisões e as armadilhas
que custaram tempo — não repete o que o código já diz. Quando um trecho descreve o que a
função faz, ele envelhece na primeira refatoração; quando descreve por que ela faz assim, ele
continua valendo.

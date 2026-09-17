# Compressão de resposta da API

Ligada em 17/09/2026. Antes disso a API devolvia todo JSON cru, mesmo para quem pedia gzip.

**Se você veio aqui para desligar, vá direto para [Como reverter](#como-reverter).** É uma
linha no appsettings e um reinício, e não precisa de mais nada deste documento.

---

## O que foi ligado

| | |
|---|---|
| Onde | [api-new-kpi/Configurations/CompressaoConfiguration.cs](../api-new-kpi/Configurations/CompressaoConfiguration.cs) |
| Registro | `AddCompressaoDeResposta` no [Program.cs](../api-new-kpi/Program.cs) |
| Pipeline | `UseCompressaoDeResposta`, logo depois do `GlobalExceptionMiddleware` |
| Algoritmos | Brotli, e gzip para quem não aceitar Brotli — nível `Optimal` nos dois |
| Configuração | seção `Compressao` do appsettings |

A negociação é do cliente: quem manda `Accept-Encoding` recebe comprimido, quem não manda
recebe o texto de sempre. Nada quebra para um cliente antigo.

## Por que

A apuração de três meses com todas as filiais devolve **122,7 KB**, e os mesmos dados
comprimidos ocupam **15,7 KB** — oito vezes menos. O ganho é grande porque o JSON do DRE é
muito repetitivo: os mesmos nomes de campo em cada uma das 198 linhas, em cada coluna.

Medido na [dc41](validacao/dc41_tres_meses_todas_as_filiais.mjs) e detalhado em
[DIVERGENCIAS.md](DIVERGENCIAS.md#custo-de-três-meses-com-todas-as-filiais--17092026).

Vale muito mais para quem abre o DRE de fora do escritório do que para quem está na rede
local. Na LAN, 122 KB e 15 KB chegam praticamente no mesmo instante.

## O nível é `Optimal`, e isso foi medido

`Fastest` parece a escolha óbvia num JSON repetitivo, e está errada aqui.

O middleware comprime em **blocos**, com flush a cada um, e isso custa taxa. Um corpo de
apuração de 50 KB que comprime 9,2× em memória saiu com 6,6× no `Fastest` pela rede. No
Brotli foi pior: `Fastest` é quality 1, que rendeu 4,8× — **menos que o gzip** —, e como o
Brotli é o preferido na negociação, seria ele que o navegador receberia.

Medido em 17/09/2026 sobre a mesma apuração de 50.205 bytes:

| | `Fastest` | `Optimal` |
|---|---|---|
| gzip | 7.594 B (6,6×) | **5.587 B (9,0×)** |
| brotli | 10.435 B (4,8×) | **5.393 B (9,3×)** |

E o custo de CPU não apareceu: com o cache do Oracle aquecido, `identity`, `gzip` e `br`
responderam em 0,49 s, dentro do ruído umas das outras. Nesta escala de corpo, `Optimal` é
de graça.

## Respostas curtas

O `ResponseCompression` do ASP.NET Core **não tem limiar mínimo**: ou comprime o tipo de
conteúdo, ou não comprime. Num corpo pequeno o cabeçalho do algoritmo pode custar mais do
que há para economizar, e foi o que aconteceu no `Fastest` — o `/api/health`, de 212 bytes,
saía com 225.

No `Optimal`, que é o nível em uso, ele encolhe para **191**. Não há nada a fazer aqui, mas
vale saber: se um dia uma resposta curta começar a sair maior que a crua, o nível mudou.
A [dc42](validacao/dc42_compressao.mjs) trava esse comportamento.

## As três chaves

```json
"Compressao": {
  "Habilitada": true,
  "HabilitarEmHttps": false,
  "RotasIsentas": [ "/api/auth" ]
}
```

**`Habilitada`** — a chave geral. Com `false`, o middleware nem entra no pipeline: não é
"comprimir com nível zero", é o pipeline exatamente como era antes de 17/09.

**`HabilitarEmHttps`** — falso de propósito, e é o padrão do próprio ASP.NET Core. **Não
ligue sem ler a seção abaixo.**

**`RotasIsentas`** — prefixos que nunca são comprimidos. Nasce com a autenticação dentro.

## Por que a autenticação fica de fora

Existe um ataque chamado **BREACH** que precisa de três coisas ao mesmo tempo:

1. a resposta é comprimida **e** cifrada por TLS;
2. o corpo carrega um **segredo**;
3. o corpo também reflete **texto que o atacante controla**.

Juntos os três, o atacante varia o texto refletido e observa o *tamanho* da resposta cifrada.
Quando o palpite dele coincide com um pedaço do segredo, o compressor encontra a repetição e a
resposta encolhe alguns bytes. Repetindo, o segredo sai caractere a caractere — sem que
ninguém decifre nada.

**Nós temos os ingredientes, só que separados.** A resposta do login carrega o JWT no corpo:
é o segredo. As respostas de apuração devolvem o filtro que o cliente mandou (`Filiais`,
`DataInicio`, `Regime`) dentro do `ApuracaoDto`: é o reflexo. Mantendo a autenticação fora da
compressão, os dois nunca aparecem na mesma resposta comprimida.

O terceiro ingrediente — TLS — hoje não existe: a API fala HTTP em rede interna. Ali o BREACH
não faz sentido, porque quem está no caminho lê o token direto e não precisa de ataque nenhum.

> **Nesta branch a rota `/api/auth` ainda não existe** — ela vem da `feat/autenticacao`. A
> isenção está configurada desde já, de propósito: quando as duas se encontrarem, a proteção
> já está no lugar, em vez de depender de alguém lembrar no dia. Enquanto isso ela não faz
> nada, e a [dc42](validacao/dc42_compressao.mjs) avisa em vez de falhar.

**No dia em que houver HTTPS**, `HabilitarEmHttps: true` só é seguro depois de conferir que
`RotasIsentas` cobre toda rota que devolva segredo no corpo. Se estiver em dúvida, deixe
desligado: a compressão sobre TLS é uma otimização, e o risco não é.

---

## Como reverter

### Desligar tudo

No `appsettings.Development.json` (ou no `appsettings.json` do ambiente):

```json
"Compressao": {
  "Habilitada": false
}
```

E reinicie a API. Se estiver com `dotnet watch run`, `Ctrl+C` e suba de novo — **o `watch` não
recarrega isto sozinho**, porque a configuração é lida uma vez, na construção do pipeline.

**Em produção é outro caminho**, porque no container não existe `appsettings.Development.json`.
Lá a configuração vem de variável de ambiente, no `.env` ao lado do `docker-compose.yml`:

```bash
nano .env                      # COMPRESSAO_HABILITADA=false
docker compose up -d api       # recria o container, sem rebuild
```

Ver [DEPLOY_DOCKER.md](DEPLOY_DOCKER.md#mudar-uma-configuração-da-api-em-produção).

Pronto. Não há migration, não há cache a limpar, não há nada no front a mudar.

### Conferir que voltou mesmo

```bash
curl -s -H "Accept-Encoding: gzip" -o /dev/null -w "%{size_download} bytes\n" http://localhost:5207/api/dre-gerencial/filiais
```

Com a compressão **desligada**, 1.192 bytes. **Ligada**, 353. Se o número não mudar depois
de reiniciar, a API está lendo outro appsettings — confira qual ambiente ela subiu (o
`/api/health` diz).

A [dc42](validacao/dc42_compressao.mjs) faz essa conferência inteira, e mais a que importa:
que a rota do token continua **fora** da compressão.

### Desligar só uma rota

Acrescente o prefixo a `RotasIsentas`. Ele casa por segmento, então `/api/dre-gerencial`
cobre tudo abaixo dela:

```json
"RotasIsentas": [ "/api/auth", "/api/dre-gerencial/apuracao" ]
```

### Arrancar de vez

Se um dia a decisão for tirar o recurso, e não só desligá-lo:

1. apague `Configurations/CompressaoConfiguration.cs`;
2. tire as duas chamadas do `Program.cs` — `AddCompressaoDeResposta` e
   `UseCompressaoDeResposta`;
3. tire a seção `Compressao` dos dois appsettings;
4. apague `validacao/dc42_compressao.mjs` e esta página.

Nada mais depende disso. A compressão não toca em regra de negócio, não muda um centavo de
nenhuma apuração e não altera o contrato da API — o cliente que não pede compressão nunca
soube que ela existia.

## Quando desconfiar dela

Três sintomas que apontariam para cá antes de qualquer outra coisa:

**Resposta truncada ou ilegível no navegador.** Quase sempre é um intermediário repassando o
corpo já descomprimido com o cabeçalho `Content-Encoding` ainda colado nele. Quando o BFF
existir, é o erro mais provável: o `fetch` do Node descomprime sozinho e **não** remove o
cabeçalho, então o proxy precisa descartar `Content-Encoding` e `Content-Length` ao repassar.

**CPU alta na API sem carga de banco correspondente.** Improvável no nível `Fastest`, mas
mediria em primeiro lugar se alguém tivesse trocado para `Optimal`.

**Uma ferramenta que lê a API e passou a falhar.** Cliente HTTP antigo que manda
`Accept-Encoding: gzip` sem saber descomprimir existe. Desligue e confirme antes de procurar
em outro lugar.

Em todos os três, desligar leva um minuto e é a forma mais rápida de descartar a hipótese.

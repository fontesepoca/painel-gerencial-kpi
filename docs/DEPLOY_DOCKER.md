# Deploy com Docker

Este roteiro sobe a API .NET 10 e o front Next.js 16 em uma VM Linux de teste.

## Arquivos

- `api-new-kpi/Dockerfile`: publica a API em Release e executa em `:8080` dentro do container.
- `client-new-kpi/Dockerfile`: gera build standalone do Next e executa em `:3000`.
- `docker-compose.yml`: sobe os dois serviços.
- `.env.docker.example`: modelo das variáveis de ambiente da VM, sem credenciais reais.

## Preparar a VM

Na VM, instale Docker Engine e Docker Compose Plugin. Depois envie o projeto para uma pasta do servidor.

No diretório raiz do projeto na VM:

```bash
cp .env.docker.example .env
nano .env
```

Preencha:

- `NEXT_PUBLIC_API_URL`: URL pública da API vista pelo navegador, por exemplo `http://192.168.0.227:5207`.
- `FRONTEND_ORIGIN`: URL pública do front, por exemplo `http://192.168.0.227:3000`.
- `ORACLE_EPOCA`: string de conexão do Oracle. Não commitar este valor.
- `JWT_CHAVE`: a chave que assina os tokens de login. **Obrigatória — sem ela a API não**
  **sobe.** Gere uma sua na VM e guarde só lá:

  ```bash
  openssl rand -base64 48
  ```

  Mínimo 32 caracteres; a API recusa menos que isso no boot. **Trocar a chave derruba todas
  as sessões abertas** — quem estiver logado precisa entrar de novo.

  Ela não tem valor padrão no `docker-compose.yml`, e isso é de propósito: uma chave de
  assinatura com fallback no compose seria uma chave versionada, e qualquer um que lesse o
  repositório poderia forjar um token.

Opcionais, com padrão já definido — só mexa se precisar:

- `GRAU_DE_PARALELISMO` (padrão `4`): processos que o Oracle usa na consulta de faturamento
  do DRE. `0` desliga. Ver [PARALELISMO.md](PARALELISMO.md).
- `COMPRESSAO_HABILITADA` (padrão `true`): compressão das respostas da API. Ver
  [COMPRESSAO.md](COMPRESSAO.md).

## Subir

```bash
docker compose up -d --build
```

Conferir logs:

```bash
docker compose logs -f api
docker compose logs -f client
```

Se o build do front falhar no `npm ci`, rode com saída completa:

```bash
docker compose build client --no-cache --progress=plain
```

### `npm ci` acusando lock fora de sincronia

```
npm error `npm ci` can only install packages when your package.json and
npm error package-lock.json are in sync.
npm error Missing: @emnapi/runtime@1.11.3 from lock file
```

**Instalar dependência no Windows poda o lock.** O `npm install` remove as entradas de
dependência opcional que não se aplicam à plataforma onde ele roda — foi o que aconteceu em
10/09/2026 ao instalar o `xlsx`, e as duas entradas de `@emnapi` saíram. No Windows nada
acusa: o `npm ci` local resolve a árvore sem elas. No Linux do Docker, onde
`@img/sharp-wasm32` as exige, ele recusa o lock.

**Como conferir antes de commitar** — a saída do próprio `npm install` avisa, e é a linha que
merece atenção:

```
added 2 packages, removed 2 packages, and audited 365 packages
```

Um `removed` que você não pediu é sinal de poda. Compare com o que estava no lock:

```bash
git diff client-new-kpi/package-lock.json | grep "^-.*node_modules/"
```

**Como validar de verdade.** Reproduzir com `--os=linux --cpu=x64` no npm do Windows **não
serve** — o teste passa com o lock quebrado. Só o Linux acusa:

```bash
docker run --rm -v "C:/caminho/para/client-new-kpi:/app" -w /app node:22-alpine npm ci --no-audit --no-fund
```

No Git Bash, `/app` é convertido para caminho Windows e o Docker recusa; rode isso no
PowerShell, ou com `MSYS_NO_PATHCONV=1`.

**Como corrigir** sem reinstalar tudo: devolver ao lock as entradas podadas, com o conteúdo
idêntico ao do último commit em que ele estava íntegro. É operação aditiva — nada de
sobrescrever o que o npm acrescentou.

Testar a API sem tocar no banco:

```bash
curl http://localhost:5207/api/health
```

Testar a conexão Oracle somente quando a string estiver configurada:

```bash
curl http://localhost:5207/api/health/oracle
```

Abrir o front:

```text
http://SEU_IP_OU_DOMINIO:3000
```

## Atualizar uma nova versão

```bash
git pull
docker compose up -d --build
docker compose logs -f --tail=100
```

## Mudar uma configuração da API em produção

**No container não se edita `appsettings`.** As páginas de [PARALELISMO](PARALELISMO.md) e
[COMPRESSAO](COMPRESSAO.md) explicam a reversão pelo arquivo, que é o caminho em
desenvolvimento; aqui o caminho é o `.env`.

O ASP.NET Core lê configuração em camadas, e variável de ambiente sobrepõe o
`appsettings.json` que está dentro da imagem. O separador de seção é **duplo sublinhado**:
`Oracle__GrauDeParalelismo` corresponde a `"Oracle": { "GrauDeParalelismo": ... }`.

Para desligar o paralelismo, por exemplo:

```bash
nano .env                      # GRAU_DE_PARALELISMO=0
docker compose up -d api       # recria o container da API com a variável nova
```

**Não precisa rebuild** — a imagem não muda, só o ambiente do container. E não precisa
derrubar o front.

Para conferir o que a API está usando de verdade:

```bash
docker compose exec api printenv | grep -E 'Oracle__|Compressao__'
```

Uma variável que não aparece aí não está valendo, e o container está rodando com o padrão
da imagem — que é o erro mais comum ao mexer nisso: editar o `.env` e esquecer o
`docker compose up -d`.

## Dois endereços para a mesma API

Isto confunde, e vale ler antes de mexer em URL.

| Variável | Quem usa | O que é |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | o **navegador** | endereço público, ex. `http://192.168.0.227:5207` |
| `API_URL_INTERNA` | o **servidor Next** | `http://api:8080`, o nome do serviço no compose |

As chamadas do DRE saem do navegador direto para a API, e para elas vale o endereço público.
Mas **o login não**: ele passa pelo BFF — o navegador manda usuário e senha para o Next, e é
o Next, de dentro do container, que chama a API. Esse caminho não deve sair para a rede do
host e voltar; os dois containers estão na mesma rede do compose, e `api` resolve direto.

`API_URL_INTERNA` já vem com `http://api:8080` no compose e não precisa entrar no `.env`.
Só mexa se a API deixar de ser um serviço deste mesmo compose.

## Observações

- `NEXT_PUBLIC_API_URL` entra no build do Next. Se trocar IP, domínio ou porta da API, rode `docker compose up -d --build client`.
- `appsettings.Development.json`, `appsettings.Production.json` e `.env*` não entram nas imagens.
- Em produção real, prefira colocar um proxy reverso com HTTPS na frente e não expor a API diretamente.

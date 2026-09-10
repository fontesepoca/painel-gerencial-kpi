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

## Observações

- `NEXT_PUBLIC_API_URL` entra no build do Next. Se trocar IP, domínio ou porta da API, rode `docker compose up -d --build client`.
- `appsettings.Development.json`, `appsettings.Production.json` e `.env*` não entram nas imagens.
- Em produção real, prefira colocar um proxy reverso com HTTPS na frente e não expor a API diretamente.

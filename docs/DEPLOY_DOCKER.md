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

# Troca de base sem novo login — especificação

**Data:** 26/10/2026 · **Pedido:** Gabriel · **Situação:** desenho aprovado em conversa; aguardando
revisão desta especificação.

## O pedido

> "Quando o usuário logar em determinado banco é necessário conferir se há o mesmo login e senha
> no outro (...) deve habilitar uma opção do lado do usuário da direita superior onde é possível
> trocar o banco sem que precise logar novamente."

Decisões do Gabriel na conversa:

- **Abordagem A**: as outras bases são conferidas no próprio login, com a senha que a pessoa acabou
  de digitar. Nada de rota que emite acesso sem senha.
- **A opção só aparece** se o mesmo usuário e a mesma senha valem na outra base **e** ela dá acesso
  à rotina que está aberta. Fora de rotina (tela inicial), basta ter acesso a ao menos uma rotina
  na outra base.

## O que existe hoje

- A API (`AutenticacaoService.EntrarAsync`) confere a senha **só na base escolhida**
  (`VerificarCredenciaisAsync`), lê as filiais (`ObterFiliaisDoUsuarioAsync`), decide as rotinas
  (`RotinasDe`) e emite um JWT dessa base (`GeradorDeToken.Emitir`).
- O BFF (`/api/sessao`, `lib/servidor/sessoes.ts`) guarda o token na memória do Next; o navegador
  recebe só um cookie opaco `HttpOnly`.
- **A base faz parte da identidade**: a matrícula 144 da Época e a 144 do Minas Rural podem ser
  pessoas diferentes. Cada base tem a sua matrícula, as suas filiais e as suas rotinas.

## Regras

| # | Regra |
|---|---|
| R1 | Uma base entra na lista de trocas se, **nela**, a senha confere, o cadastro está ativo e há ao menos uma rotina. |
| R2 | A base escolhida no login continua seguindo as regras de hoje — inclusive entrar sem rotina nenhuma (decisão de 18/09/2026). R1 vale só para as **outras** bases. |
| R3 | Qualquer falha numa outra base — fora do ar, demora, erro — tira ela da lista e nunca derruba o login da base escolhida. |
| R4 | Com uma rotina aberta, o item "Trocar para X" só aparece se a base X tem **aquela** rotina. Na tela inicial, aparece para toda base da lista (R1 já exige uma rotina). |
| R5 | A troca não chama a API nem pede senha: o BFF só passa a usar um token que já guardou. Base que não está guardada na sessão é recusada. |
| R6 | Todos os tokens nascem no login e expiram juntos (8h). A troca não estende a sessão. |
| R7 | "Sair" apaga a sessão inteira, com todas as bases. |
| R8 | A senha nunca é guardada nem logada; o token nunca sai do servidor. |
| R9 | Mudança de permissão no Winthor só aparece no próximo login — a mesma contrapartida de hoje. |

## API

### `AutenticacaoService.EntrarAsync`

Depois de aprovar a base escolhida (fluxo atual, sem mudança), confere as **outras** bases de
`RegistroDeBases.Disponiveis`, **em paralelo**:

1. `VerificarCredenciaisAsync(base, login, senha)` — a mesma consulta de hoje.
2. Se `SenhaCorreta && PossuiSenha && EstaAtivo`: `ObterFiliaisDoUsuarioAsync(base, matricula)` e
   `RotinasDe(...)`.
3. Se houver ao menos uma rotina (R1): monta o `UsuarioDto` daquela base e emite o token.

Cada conferência tem **teto de tempo próprio** (5 s) e roda dentro de `try/catch`: exceção ou
estouro tiram a base da lista (R3), com `LogWarning` contendo só o id da base e o tipo do erro —
nunca login, senha ou string de conexão (R8).

O log de sucesso passa a dizer em quais outras bases o login valeu:
`"Login concluído para a matrícula {Matricula} na base {Base} (...). Também vale em: {Outras}."`.

### Contrato

```csharp
public sealed record SessaoDeBase(string Token, DateTimeOffset ExpiraEm, UsuarioDto Usuario);

public sealed record LoginResponse(
    string Token,
    DateTimeOffset ExpiraEm,
    UsuarioDto Usuario,
    IReadOnlyList<SessaoDeBase> OutrasBases);   // novo; vazia quando não há
```

`/api/auth/eu` não muda: ele descreve o token que recebeu, que é de uma base só.

## BFF

### `lib/servidor/sessoes.ts`

A sessão passa a guardar um token por base e qual está ativa:

```ts
interface Sessao {
  readonly porBase: ReadonlyMap<string, { token: string; usuario: UsuarioDaSessao }>;
  baseAtiva: string;
  readonly expiraEm: number;   // o menor dos tokens (R6)
  readonly criadaEm: number;
}
```

- `lerSessao(id)` devolve o token e o usuário **da base ativa** — quem repassa à API
  (`repassarParaApi`) não muda.
- `trocarBase(id, base): boolean` — muda `baseAtiva` só se `porBase.has(base)` (R5).
- `lerSessaoPublica(id)` devolve o usuário ativo mais `trocas: { base, rotinas }[]` — as outras
  bases guardadas, **sem token**.

### Rotas

| Rota | Mudança |
|---|---|
| `POST /api/sessao` | guarda também `outrasBases` (que já chegam filtradas por R1) |
| `GET /api/sessao` | devolve `trocas` junto do usuário |
| `POST /api/sessao/base` | **nova.** Corpo `{ base }`. 200 se trocou; 400 se a base não está na sessão; 401 sem sessão |
| `DELETE /api/sessao` | sem mudança — já apaga a sessão inteira (R7) |

## Tela — `MenuDoUsuario`

- Mostra a base atual (já mostra) e, para cada troca permitida por R4, o item
  **"Trocar para {rótulo}"**.
- A rotina aberta sai do endereço atual por `CAMINHO_DA_ROTINA` (`lib/rotinas.ts`); fora de rotina,
  toda troca da lista vale.
- Ao clicar: `POST /api/sessao/base` e, se der certo, **navegação dura no mesmo endereço**
  (`window.location.replace`) — o mesmo motivo do login e do "Sair": o cache do React Query, os
  filtros e a tabela de uma base não podem aparecer na outra.
- Enquanto troca, o item mostra "Trocando…" e fica desabilitado; falha mostra mensagem no próprio
  menu.

## Testes

Sem biblioteca de teste nova: o projeto prova regra com programas C# de arquivo único que
referenciam a API (`#:project`, como `docs/plataforma/validacao/verificar_regras.cs`) e com
scripts `.mjs` na mesma pasta. Os novos ficam em `docs/plataforma/validacao/` com o prefixo `tb`.

| O quê | Como |
|---|---|
| R1–R3 no serviço: senha errada, inativo, sem rotina, base com exceção e base que estoura o tempo ficam fora; base válida entra; login da base escolhida nunca falha por causa delas | `tb1_outras_bases_no_login.cs` — `AutenticacaoService` com um `IAutenticacaoRepository` falso, sem banco |
| R5 no BFF: base guardada troca; base não guardada recusa; sem sessão 401; token nunca aparece na resposta pública | `tb2_troca_no_bff.mjs` sobre `sessoes.ts` |
| R4 na tela: item aparece/some conforme a rotina aberta | `tb3_trocas_na_tela.mjs` sobre a função que decide as trocas (`lib/trocasDeBase.ts`) |
| Ponta a ponta com as duas bases | o Gabriel entra; eu testo a troca no navegador. Eu não digito senha. |

## Documentação

- `docs/plataforma/AUTENTICACAO.md` — conferência das outras bases no login, a troca e as regras R1–R9.
- `docs/plataforma/BIFURCACAO_DE_BASES.md` — a troca como consequência da base fazer parte da identidade.

## Fora do escopo

- Trocar para uma base em que a senha é diferente (exigiria novo login — é o fluxo de hoje).
- Renovar ou estender a sessão na troca.
- Guardar a preferência de base: o login continua lembrando a última base escolhida, como hoje.

---
description: Criar uma página do App Router já conectada à API — tipos espelhando os DTOs, hook de React Query, componentes da rota e a página em si.
---

# new-page — página conectada à API

Cria uma rota do Next.js que consome um endpoint existente. Página sem dado não existe neste
projeto, então a conexão com a API faz parte da skill.
Referência: `client-new-kpi/app/dre-gerencial/page.tsx`, `client-new-kpi/hooks/useHealth.ts`
e `client-new-kpi/services/apiClient.ts`.

Placeholders: `{Rotina}` = `ExtratoCliente`, `{rotina}` = `extrato-cliente`.

## 1. Tipos — `client-new-kpi/types/{rotina}.ts`

Espelham os DTOs do back-end. O `apiClient` já desembrulha o envelope `ApiResponse<T>`, então
tipe **só o conteúdo de `dados`**, nunca o envelope.

```typescript
export interface {Rotina}Filtro {
  filiais: number[];
  /** ISO yyyy-MM-dd — o back recebe DateOnly. */
  dataInicio: string;
  dataFim: string;
}

export interface {Rotina}Linha {
  chave: string;
  descricao: string;
  valor: number;
}
```

O JSON chega em **camelCase**: o ASP.NET serializa `Chave` como `chave`. Tipar em PascalCase
faz tudo virar `undefined` em tempo de execução, sem erro de compilação.

## 2. Hook — `client-new-kpi/hooks/use{Rotina}.ts`

Consulta cara disparada por botão é `useMutation`. `useQuery` refaria a chamada sozinho a cada
mudança de chave — com uma apuração de minutos, isso é inaceitável.

```typescript
"use client";

import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/services/apiClient";
import type { {Rotina}Filtro, {Rotina}Linha } from "@/types/{rotina}";

export function use{Rotina}() {
  return useMutation({
    mutationFn: (filtro: {Rotina}Filtro) =>
      apiClient.post<{Rotina}Linha[]>("/api/{rotina}/consulta", filtro),
  });
}
```

Para dado de apoio que carrega sozinho — lista de filiais, por exemplo — aí sim `useQuery`:

```typescript
export function useFiliais() {
  return useQuery({
    queryKey: ["filiais"],
    queryFn: () => apiClient.get<Filial[]>("/api/dre-gerencial/filiais"),
    staleTime: 30 * 60 * 1000, // cadastro muda raramente
  });
}
```

## 3. Componentes da rota — `client-new-kpi/components/{rotina}/`

Componente usado só por esta rota mora aqui. O que for reutilizável sobe para
`components/ui/`. Cores sempre por token, nunca hex.

```tsx
import { cn } from "@/lib/cn";

export function {Rotina}Tabela({ linhas }: { linhas: {Rotina}Linha[] }) {
  if (linhas.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-[var(--text-muted)]">
        Nenhum registro no período selecionado.
      </p>
    );
  }

  return (
    // overflow-x-auto: tabela larga rola dentro do contêiner, sem empurrar a página
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)]">
      <table className="w-full text-sm">
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.chave} className="border-t border-[var(--border)]">
              <td className="px-4 py-2">{linha.descricao}</td>
              <td
                className={cn(
                  "tabular px-4 py-2 text-right",
                  linha.valor < 0 && "text-[var(--negative)]",
                )}
              >
                {formatarMoeda(linha.valor)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

A classe `tabular` está em `globals.css`: fonte monoespaçada com `font-variant-numeric:
tabular-nums`, para os dígitos terem largura igual e as colunas alinharem na vírgula. Sem ela,
uma coluna de valores fica ilegível.

## 4. Formatação — `client-new-kpi/lib/formato.ts`

Um formatador para todo o projeto. Espalhar `toLocaleString` pelos componentes garante que dois
lugares vão divergir.

```typescript
const MOEDA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

export function formatarMoeda(valor: number): string {
  return MOEDA.format(valor);
}

export function formatarPercentual(valor: number | null): string {
  return valor === null ? "—" : `${valor.toFixed(1).replace(".", ",")}%`;
}
```

`Intl.NumberFormat` é criado **fora** da função: instanciar a cada linha da tabela é lento e
aparece em tabela grande.

## 5. Página — `client-new-kpi/app/{rotina}/page.tsx`

Precisa de `"use client"` por usar hook. Os quatro estados são obrigatórios: inicial, carregando,
erro e vazio.

```tsx
"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { {Rotina}Tabela } from "@/components/{rotina}/{Rotina}Tabela";
import { use{Rotina} } from "@/hooks/use{Rotina}";
import type { {Rotina}Filtro } from "@/types/{rotina}";

export default function {Rotina}Page() {
  const [filtro, setFiltro] = useState<{Rotina}Filtro>({
    filiais: [],
    dataInicio: "",
    dataFim: "",
  });
  const consulta = use{Rotina}();

  return (
    <AppShell trilha={["Época Analytics", "{Rotina}"]}>
      <header className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          {Rotina}
        </h1>
      </header>

      <button
        type="button"
        onClick={() => consulta.mutate(filtro)}
        disabled={consulta.isPending || filtro.filiais.length === 0}
        className="rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2 text-sm text-white disabled:opacity-40"
      >
        {consulta.isPending ? "Apurando…" : "Aplicar"}
      </button>

      {consulta.isPending && (
        <p className="mt-4 text-sm text-[var(--text-muted)]">
          A apuração percorre todo o período e pode levar alguns minutos.
        </p>
      )}

      {consulta.isError && (
        <p className="mt-4 text-sm text-[var(--negative)]">
          {consulta.error instanceof Error
            ? consulta.error.message
            : "Falha ao consultar a API."}
        </p>
      )}

      {consulta.data && <div className="mt-6"><{Rotina}Tabela linhas={consulta.data} /></div>}
    </AppShell>
  );
}
```

O aviso de demora não é enfeite: sem ele o usuário acha que travou e recarrega a página,
disparando uma segunda apuração de minutos.

## 6. Navegação — `client-new-kpi/components/layout/AppShell.tsx`

Acrescente o item ao menu quando houver mais de uma rotina. Enquanto for uma só, a raiz
redireciona direto (`app/page.tsx`).

## Regras / Armadilhas

| Problema | Causa | Solução |
|---|---|---|
| Todos os campos chegam `undefined` | Tipos em PascalCase; o ASP.NET serializa em camelCase | Tipar em camelCase |
| `dados` sempre `null` no componente | Tipou o envelope `ApiResponse<T>` em vez do conteúdo | O `apiClient` já desembrulha — tipe só `dados` |
| Erro de hidratação no `<html>` | Extensão de navegador (LanguageTool, Grammarly) injeta atributos | Já resolvido com `suppressHydrationWarning` no layout raiz |
| Cache do React Query vazando entre usuários | `QueryClient` criado em escopo de módulo | Já resolvido: criado dentro de `useState` no `QueryProvider` |
| Apuração dispara sozinha ao mexer no filtro | Usou `useQuery` para consulta cara | `useMutation`, disparada por botão |
| `useState`/`useQuery` quebrando o build | Faltou `"use client"` no topo | Toda página com hook é client component |
| Colunas de valor desalinhadas | Fonte proporcional | Classe `tabular` |
| Tabela estourando a largura em telas menores | Falta contêiner com rolagem | `overflow-x-auto` no wrapper |
| Instalou `clsx` ou `tailwind-merge` | Não viu que já existe helper local | Use `cn` de `@/lib/cn`. Biblioteca nova precisa de aprovação |
| Cor escrita em hex no componente | Ignorou os tokens | `var(--surface-1)`, `var(--negative)` etc. |

## Checklist final

- [ ] Tipos em camelCase, espelhando os DTOs, sem o envelope
- [ ] `"use client"` na página e nos hooks
- [ ] `useMutation` para consulta cara; `useQuery` só para dado de apoio
- [ ] Os quatro estados tratados: inicial, carregando, erro e vazio
- [ ] Aviso de demora em apuração longa
- [ ] Cores por token, nunca hex
- [ ] Valores com a classe `tabular` e `formatarMoeda`
- [ ] Tabela larga dentro de `overflow-x-auto`
- [ ] Nenhuma biblioteca nova instalada sem aprovação
- [ ] `npx tsc --noEmit` limpo e `npx eslint .` sem erro

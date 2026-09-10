/**
 * Ensina o Node a resolver o `@/` do front — o alias que o `tsconfig` do Next define e que
 * nenhum runtime conhece.
 *
 * Uso:
 *
 *   node --experimental-strip-types --import ./docs/validacao/_alias.mjs docs/validacao/dcNN.mjs
 *
 * **Por que isto existe.** As validações rodam os módulos REAIS do front, sem bundler e sem
 * navegador — é o que faz uma delas valer como prova. Sem o alias, um módulo de `lib/` que
 * importa outro por `@/lib/...` derruba o teste, e a alternativa era trocar os imports do
 * código de produção por caminhos relativos: mudar o código para o teste passar, que é
 * exatamente o que não se deve fazer.
 *
 * `registerHooks` é síncrono e no mesmo thread — sem `--loader`, sem processo à parte.
 */
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const front = path.resolve(fileURLToPath(import.meta.url), "../../../client-new-kpi");

/** Tenta as extensões do projeto, na ordem em que o bundler tentaria. */
function achar(base) {
  for (const tentativa of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
    base,
  ]) {
    if (existsSync(tentativa)) return tentativa;
  }
  return null;
}

registerHooks({
  resolve(especificador, contexto, proximo) {
    if (!especificador.startsWith("@/")) return proximo(especificador, contexto);

    const alvo = achar(path.join(front, especificador.slice(2)));
    if (!alvo) return proximo(especificador, contexto);

    return { url: pathToFileURL(alvo).href, shortCircuit: true };
  },
});

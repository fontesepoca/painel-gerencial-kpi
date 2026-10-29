"use client";

import type { ComponentProps, ReactNode } from "react";
import { TabelaDre } from "@/components/dre-gerencial/TabelaDre";
import { faixasDoPapel, trimestreDaFaixa } from "@/lib/faixasDaImpressao";

/**
 * A tabela da tela e, com mais de três meses — ou com 2 e 3 meses e a coluna Total, desde
 * 29/10/2026 —, as FAIXAS do papel (23/10/2026).
 *
 * Com doze meses a tabela inteira numa folha saía ilegível (números a 7pt). Pedido do
 * Gabriel: imprimir "como se estivesse apurando de 3 em 3 meses, só que juntos num arquivo",
 * com o Total numa faixa própria nas últimas páginas. Ver `lib/faixasDaImpressao.ts`.
 *
 * **A tela não muda.** A tabela de sempre continua sendo a da tela, e as faixas existem só no
 * DOM do papel (`so-no-papel`): cada uma é a mesma `TabelaDre`, com as mesmas linhas, a
 * mesma ordem (o `useOrdemSalva` é compartilhado) e os mesmos números, mostrando só os meses
 * dela. No papel a tabela da tela some (`so-na-tela`), e as faixas aparecem uma por página.
 *
 * Com "Só o Total" ligado não há meses para dividir, e a impressão é a tabela de sempre. Com
 * "Sem a coluna Total", a faixa do Total não existe.
 */
export function TabelaEFaixas({
  propsDaTabela,
  variacaoNoFim,
  cabecalhoNoPapel,
}: {
  propsDaTabela: ComponentProps<typeof TabelaDre>;
  variacaoNoFim: boolean;
  /**
   * A identificação da apuração (período, regime, filiais, avisos), repetida no alto de
   * CADA parte. Não é enfeite: sem ela a primeira folha da parte 1 teria menos linhas que a
   * primeira das outras, e as folhas deixariam de se encaixar lado a lado. No papel, a
   * identificação da tela some quando há faixas (`cabecalho-da-apuracao`, globals.css).
   */
  cabecalhoNoPapel?: ReactNode;
}) {
  const { periodos } = propsDaTabela;
  const comTotal = propsDaTabela.mostrarTotal !== false;
  // Com 2 e 3 meses também, quando há Total: os meses numa parte, o Total nas últimas
  // páginas (29/10/2026). Ver `faixasDoPapel`.
  const faixas = propsDaTabela.soTotal ? null : faixasDoPapel(periodos.length, comTotal);
  if (faixas === null) return <TabelaDre {...propsDaTabela} />;

  const partes = faixas.length + (comTotal ? 1 : 0);
  // O trecho do calendário de cada faixa, e o do Total — usados no título, no fim, no
  // "a seguir" da faixa anterior e na margem de cada folha.
  const trecho = (f: { inicio: number; fim: number }) =>
    f.fim - f.inicio > 1
      ? `${periodos[f.inicio]?.rotulo} a ${periodos[f.fim - 1]?.rotulo}`
      : (periodos[f.inicio]?.rotulo ?? "");
  const trechoDoTotal = variacaoNoFim ? "Variação do período" : "Total do período";
  /**
   * A ORDEM DE MONTAGEM NA MESA (23/10/2026, pedido do Gabriel): as partes são colunas, lado a
   * lado da esquerda para a direita. O título e a marca de fim dizem onde cada parte começa e
   * acaba; a margem de cada folha, a posição dela (ver `paginas`).
   */
  const proxima = (k: number) =>
    k + 1 < faixas.length ? trecho(faixas[k + 1]!) : comTotal ? trechoDoTotal : null;

  /**
   * A POSIÇÃO EM CADA FOLHA (23/10/2026, pedido do Gabriel). O título só sai na primeira folha
   * de cada parte, e uma parte ocupa várias. Na margem de cima de TODA folha vai onde ela fica
   * na mesa — "Coluna 2 · Folha 3": a coluna é a parte, da esquerda para a direita, e a folha
   * conta de cima para baixo dentro da parte. Na margem de baixo, a página do arquivo.
   *
   * Fica na MARGEM da página (`@page` com caixas de margem), e não na tabela: não ocupa linha
   * nenhuma nem muda tamanho — a primeira tentativa, com etiqueta dentro da tabela, foi
   * desfeita por isso. Cada parte é uma página nomeada com contador próprio, porque o `page`
   * do navegador não recomeça por parte. O `body` começa na parte 1: sem isso a troca de
   * página nomeada abriria uma folha em branco antes dela.
   */
  const rotulos = [...faixas.map(trecho), ...(comTotal ? [trechoDoTotal] : [])];
  /**
   * O TRIMESTRE NO CENTRO DE CADA FOLHA (29/10/2026, pedido do Gabriel): na margem de cima, no
   * mesmo corpo e peso de "Coluna · Folha" — é o outro dado que quem monta a mesa procura.
   * Do calendário, ver `trimestreDaFaixa`. A parte do Total não tem trimestre: fica sem.
   */
  const trimestres = [
    ...faixas.map((f) => trimestreDaFaixa(periodos.slice(f.inicio, f.fim).map((p) => p.mesAno))),
    ...(comTotal ? [null] : []),
  ];
  const aspas = (t: string) => `"${t.replace(/["\\]/g, "")}"`;
  const destacada = "font: 700 11pt Arial, sans-serif; color: #0f172a;";
  // Os rótulos encostam na TABELA, e não na borda do papel: `vertical-align` empurra os de
  // cima para baixo e os de baixo para cima, longe da faixa que a impressora não imprime.
  const discreta = "font: 600 9pt Arial, sans-serif; color: #475569;";
  const emCima = "vertical-align: bottom; padding-bottom: 1.5mm;";
  const embaixo = "vertical-align: top; padding-top: 1.5mm;";
  const paginas = [
    "@media print { body { page: parte-1; } }",
    ...rotulos.map(
      (r, k) =>
        `.faixa-de-impressao[data-parte="${k + 1}"] { page: parte-${k + 1}; }\n` +
        `@page parte-${k + 1} { counter-increment: folha-${k + 1};` +
        ` @top-left { content: ${aspas(`DRE Gerencial · Parte ${k + 1} de ${partes} · ${r}`)}; ${discreta} ${emCima} }` +
        (trimestres[k]
          ? ` @top-center { content: ${aspas(trimestres[k]!)}; ${destacada} ${emCima} }`
          : "") +
        ` @top-right { content: ${aspas(`Coluna ${k + 1} · Folha `)} counter(folha-${k + 1}); ${destacada} ${emCima} }` +
        ` @bottom-right { content: "Página " counter(page) " de " counter(pages); ${discreta} ${embaixo} } }`,
    ),
  ].join("\n");

  return (
    <>
      <style>{paginas}</style>

      {/* `contents`: o invólucro não vira caixa, e a tabela da tela continua ocupando a
          altura da seção como sempre. */}
      <div className="so-na-tela contents">
        <TabelaDre {...propsDaTabela} />
      </div>

      <div className="so-no-papel faixas-de-impressao">
        {faixas.map((faixa, k) => (
          <div key={faixa.inicio} className="faixa-de-impressao" data-parte={k + 1}>
            {cabecalhoNoPapel}
            <p className="titulo-da-faixa">
              Parte {k + 1} de {partes} · {trecho(faixa)}
              <span className="parte-da-faixa"> · {k + 1}ª coluna, da esquerda para a direita</span>
            </p>
            <TabelaDre
              {...propsDaTabela}
              soPapel
              faixa={faixa}
              mostrarTotal={false}
              // O aviso de totais reordenados sai em TODA parte: só na primeira, a folha 1
              // dela teria menos linhas que a das outras, e as colunas desencaixariam.
              avisoNoPapel
            />
            {/* O FIM DA FAIXA (23/10/2026, pedido do Gabriel): uma faixa pode ocupar duas
                folhas, e sem marca nenhuma a página seguinte parecia continuar o mesmo
                trecho. A linha tracejada diz onde o período acaba. */}
            <p className="fim-da-faixa">
              Fim da parte {k + 1} de {partes}
              {proxima(k) && ` · a seguir, parte ${k + 2}: ${proxima(k)}`}
            </p>
          </div>
        ))}

        {comTotal && (
          <div className="faixa-de-impressao" data-parte={partes} data-total="1">
            {cabecalhoNoPapel}
            <p className="titulo-da-faixa">
              Parte {partes} de {partes} · {trechoDoTotal}
              <span className="parte-da-faixa"> · {partes}ª coluna, a última à direita</span>
            </p>
            <TabelaDre {...propsDaTabela} soPapel soTotal avisoNoPapel />
            <p className="fim-da-faixa">Fim da parte {partes} de {partes} · fim do relatório</p>
          </div>
        )}
      </div>
    </>
  );
}

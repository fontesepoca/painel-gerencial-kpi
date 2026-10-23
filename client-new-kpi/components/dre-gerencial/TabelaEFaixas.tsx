"use client";

import type { ComponentProps } from "react";
import { TabelaDre } from "@/components/dre-gerencial/TabelaDre";
import { faixasDaImpressao } from "@/lib/faixasDaImpressao";

/**
 * A tabela da tela e, com mais de três meses, as FAIXAS do papel (23/10/2026).
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
}: {
  propsDaTabela: ComponentProps<typeof TabelaDre>;
  variacaoNoFim: boolean;
}) {
  const { periodos } = propsDaTabela;
  const faixas = propsDaTabela.soTotal ? null : faixasDaImpressao(periodos.length);
  if (faixas === null) return <TabelaDre {...propsDaTabela} />;

  const comTotal = propsDaTabela.mostrarTotal !== false;
  const partes = faixas.length + (comTotal ? 1 : 0);

  return (
    <>
      {/* `contents`: o invólucro não vira caixa, e a tabela da tela continua ocupando a
          altura da seção como sempre. */}
      <div className="so-na-tela contents">
        <TabelaDre {...propsDaTabela} />
      </div>

      <div className="so-no-papel faixas-de-impressao">
        {faixas.map((faixa, k) => (
          <div key={faixa.inicio} className="faixa-de-impressao">
            <p className="titulo-da-faixa">
              {periodos[faixa.inicio]?.rotulo}
              {faixa.fim - faixa.inicio > 1 && ` a ${periodos[faixa.fim - 1]?.rotulo}`}
              <span className="parte-da-faixa"> · parte {k + 1} de {partes}</span>
            </p>
            <TabelaDre
              {...propsDaTabela}
              soPapel
              faixa={faixa}
              mostrarTotal={false}
              // O aviso de totais reordenados sai uma vez, no começo do relatório.
              avisoNoPapel={k === 0}
            />
          </div>
        ))}

        {comTotal && (
          <div className="faixa-de-impressao">
            <p className="titulo-da-faixa">
              {variacaoNoFim ? "Variação do período" : "Total do período"}
              <span className="parte-da-faixa"> · parte {partes} de {partes}</span>
            </p>
            <TabelaDre {...propsDaTabela} soPapel soTotal avisoNoPapel={false} />
          </div>
        )}
      </div>
    </>
  );
}

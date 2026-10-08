"use client";

import { useCallback, useState } from "react";
import {
  exportarDetalhe,
  type DetalheParaExportar,
} from "@/lib/exportarExcelDetalhe";
import { useOcultarBaixas } from "@/hooks/useOcultarBaixas";

/**
 * Exportar o detalhamento para Excel, com o estado que a interface precisa mostrar.
 *
 * Um hook porque as **duas** telas do detalhamento exportam — o modal e a página dedicada —
 * e o que elas compartilham não é só a chamada: é o "gerando…" no item do menu e o erro
 * visível. Duplicar isso deixaria uma das duas sem o aviso na primeira pressa.
 *
 * **O erro aparece.** O `import()` do `xlsx` passa pela rede na primeira vez, e um clique
 * que não faz nada faz a pessoa clicar de novo — três vezes, e então reclamar que a
 * exportação não funciona.
 */
export function useExportarDetalhe() {
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // O checkbox de baixas estornadas, aqui e não em cada chamador: as duas telas exportam
  // por este hook, e assim nenhuma esquece de mandar a escolha que a pessoa vê na tela.
  const [ocultarBaixas] = useOcultarBaixas();

  const exportar = useCallback(async (detalhe: DetalheParaExportar) => {
    setExportando(true);
    setErro(null);
    try {
      await exportarDetalhe({ ocultarBaixas, ...detalhe });
    } catch (e) {
      setErro(
        e instanceof Error
          ? `Não foi possível gerar o Excel: ${e.message}`
          : "Não foi possível gerar o Excel.",
      );
    } finally {
      setExportando(false);
    }
  }, [ocultarBaixas]);

  return { exportar, exportando, erro };
}

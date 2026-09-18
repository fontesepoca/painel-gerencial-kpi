/**
 * As rotinas do Winthor que este sistema oferece, e quem pode abrir cada uma.
 *
 * Os códigos são os mesmos do ERP — `9815` é a GERENCIAL / DRE —, e espelham
 * `RotinasDoWinthor` na API. Uma constante de cada lado não impede ninguém de digitar a
 * string solta no meio de um componente, mas tira o motivo para fazê-lo.
 *
 * <b>Permissão não é mais condição para entrar.</b> Até 18/09/2026 quem não tinha a 9815 era
 * recusado no login e lia "Você não tem acesso ao DRE Gerencial" numa tela onde não havia nada
 * a fazer. Agora entra, e é aqui que se decide o que ela encontra depois.
 */

export const ROTINA_DRE = "9815";

/** Onde cada rotina vive, para o bloqueio e o atalho não divergirem. */
export const CAMINHO_DA_ROTINA: Readonly<Record<string, string>> = {
  [ROTINA_DRE]: "/dre-gerencial",
};

export function podeAbrir(
  rotinas: readonly string[] | undefined,
  codigo: string,
): boolean {
  return rotinas?.includes(codigo) ?? false;
}

/**
 * Um `.zip` mínimo, só GUARDANDO os arquivos (método 0, sem compressão) — 16/10/2026.
 *
 * Existe para o "exportar todo o detalhamento" do botão direito: um Excel por mês, num pacote
 * só. **Sem biblioteca nova**, porque não precisa: o `.xlsx` já é um zip comprimido por dentro,
 * e comprimir de novo não ganha nada. O que sobra do formato é cabeçalho, CRC-32 e o índice
 * central — menos de cem linhas, conferidas pela dc98 contra um leitor independente.
 *
 * Nomes em UTF-8 (bit 11 do flag): `Março` sai `Março` no Windows, e não `MarÃ§o`.
 * Sem ZIP64: o limite é 4GB e 65 mil arquivos, longe do que um DRE exporta.
 */

export interface ArquivoDoZip {
  nome: string;
  dados: Uint8Array;
}

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Data e hora no formato do DOS, que é o que o zip guarda. */
function dataDos(d: Date): { hora: number; data: number } {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    data: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function criarZip(arquivos: readonly ArquivoDoZip[], agora = new Date()): Blob {
  const utf8 = new TextEncoder();
  const { hora, data } = dataDos(agora);
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let posicao = 0;

  for (const a of arquivos) {
    const nome = utf8.encode(a.nome);
    const crc = crc32(a.dados);
    const tamanho = a.dados.length;

    // Cabeçalho local: assinatura, versão 2.0, flag UTF-8, método 0 (guardado).
    const local = new Uint8Array(30 + nome.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x0800, true);
    l.setUint16(8, 0, true);
    l.setUint16(10, hora, true);
    l.setUint16(12, data, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, tamanho, true);
    l.setUint32(22, tamanho, true);
    l.setUint16(26, nome.length, true);
    l.setUint16(28, 0, true);
    local.set(nome, 30);

    // A entrada do índice central aponta para onde o cabeçalho local começa.
    const c = new Uint8Array(46 + nome.length);
    const v = new DataView(c.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 20, true);
    v.setUint16(8, 0x0800, true);
    v.setUint16(10, 0, true);
    v.setUint16(12, hora, true);
    v.setUint16(14, data, true);
    v.setUint32(16, crc, true);
    v.setUint32(20, tamanho, true);
    v.setUint32(24, tamanho, true);
    v.setUint16(28, nome.length, true);
    v.setUint32(42, posicao, true);
    c.set(nome, 46);

    partes.push(local, a.dados);
    central.push(c);
    posicao += local.length + tamanho;
  }

  const tamanhoCentral = central.reduce((s, c) => s + c.length, 0);
  const fim = new Uint8Array(22);
  const f = new DataView(fim.buffer);
  f.setUint32(0, 0x06054b50, true);
  f.setUint16(8, arquivos.length, true);
  f.setUint16(10, arquivos.length, true);
  f.setUint32(12, tamanhoCentral, true);
  f.setUint32(16, posicao, true);

  return new Blob([...partes, ...central, fim] as BlobPart[], { type: "application/zip" });
}

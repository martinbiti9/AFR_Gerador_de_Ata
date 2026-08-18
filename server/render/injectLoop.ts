/**
 * Localiza blocos de topo <w:X>...</w:X> respeitando aninhamento
 * (tabela dentro de célula, parágrafo dentro de célula, etc).
 * Regex simples falha aqui; o controle de profundidade é obrigatório.
 */
export function findBlocks(xml: string, tag: string): Array<{ start: number; end: number }> {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>|<\\/${tag}>`, 'g');
  const out: Array<{ start: number; end: number }> = [];
  let depth = 0, start = -1, m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (m[0].startsWith('</')) {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push({ start, end: m.index + m[0].length });
        start = -1;
      }
    } else {
      if (depth === 0) start = m.index;
      depth++;
    }
  }
  return out;
}

const slice = (xml: string, b: { start: number; end: number }) => xml.slice(b.start, b.end);

/**
 * Substitui todo o conteúdo de uma célula por um único parágrafo com o texto informado,
 * preservando <w:pPr> do parágrafo e <w:rPr> do primeiro run.
 * A formatação vem SEMPRE do template, nunca dos dados.
 */
export function setCellToTag(tcXml: string, text: string): string {
  const ps = findBlocks(tcXml, 'w:p');
  if (!ps.length) return tcXml;
  let p = slice(tcXml, ps[0]);
  const rs = findBlocks(p, 'w:r');
  if (rs.length) {
    const r = slice(p, rs[0]);
    const rpr = (r.match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
    const novoR = `<w:r>${rpr}<w:t xml:space="preserve">${text}</w:t></w:r>`;
    p = p.slice(0, rs[0].start) + novoR + p.slice(rs[rs.length - 1].end);
  } else {
    p = p.replace(/<\/w:p>$/, `<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`);
  }
  return tcXml.slice(0, ps[0].start) + p + tcXml.slice(ps[ps.length - 1].end);
}

export interface LoopSpec {
  tableIndex: number; // índice da <w:tbl> em document.xml
  prototypeRowIndex: number; // índice da <w:tr> usada como modelo
  loopKey: string; // 'itens', 'pendencias', ...
  columns: Array<{ cellIndex: number; key: string }>;
  removeOtherRows: boolean; // true: mantém só o cabeçalho + a linha de loop
}

/**
 * Insere {#loopKey} na primeira célula mapeada e {/loopKey} na última,
 * dentro da MESMA <w:tr>, e troca o conteúdo das células pelas tags das colunas.
 * Com paragraphLoop: true, o docxtemplater passa a repetir a linha inteira.
 */
export function injectLoop(docXml: string, spec: LoopSpec): string {
  if (!spec.columns || spec.columns.length === 0) return docXml;

  const tbls = findBlocks(docXml, 'w:tbl');
  const tbl = tbls[spec.tableIndex];
  if (!tbl) {
    throw new Error(`Tabela de índice ${spec.tableIndex} não existe no template (total: ${tbls.length}).`);
  }

  const tblXml = slice(docXml, tbl);
  const trs = findBlocks(tblXml, 'w:tr');
  const protoBlock = trs[spec.prototypeRowIndex];
  if (!protoBlock) {
    throw new Error(`Linha-protótipo ${spec.prototypeRowIndex} não existe na tabela ${spec.tableIndex} (total linhas: ${trs.length}).`);
  }

  const proto = slice(tblXml, protoBlock);
  const tcs = findBlocks(proto, 'w:tc');
  const primeira = spec.columns[0].cellIndex;
  const ultima = spec.columns[spec.columns.length - 1].cellIndex;

  let nova = '', cursor = 0;
  for (let i = 0; i < tcs.length; i++) {
    const col = spec.columns.find(c => c.cellIndex === i);
    let tc = slice(proto, tcs[i]);
    if (col) {
      let txt = `{${col.key}}`;
      if (i === primeira) txt = `{#${spec.loopKey}}` + txt;
      if (i === ultima) txt = txt + `{/${spec.loopKey}}`;
      tc = setCellToTag(tc, txt);
    }
    nova += proto.slice(cursor, tcs[i].start) + tc;
    cursor = tcs[i].end;
  }
  nova += proto.slice(cursor);

  const novaTbl = spec.removeOtherRows
    ? tblXml.slice(0, trs[0].end) + nova + tblXml.slice(trs[trs.length - 1].end)
    : tblXml.slice(0, protoBlock.start) + nova + tblXml.slice(protoBlock.end);

  return docXml.slice(0, tbl.start) + novaTbl + docXml.slice(tbl.end);
}

/**
 * Extrai formatação base (<w:pPr> e <w:rPr>) de uma célula específica
 */
export function extractCellFormatting(tcXml: string): { basePPr: string; baseRPr: string } {
  const basePPr = (tcXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
  const allRPr = tcXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/g) || [];
  const baseRPr = allRPr.find(x => x.includes('Arial')) || allRPr[0] || '';
  return { basePPr, baseRPr };
}

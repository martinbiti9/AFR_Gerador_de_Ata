import { Bloco, Run, Estilo } from '../types/template';

export const esc = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const ESTILOS: Record<string, string> = {
  normal: '',
  forte: '<w:b/>',
  alerta: '<w:b/><w:color w:val="C00000"/>',
  ressalva: '<w:b/><w:i/><w:color w:val="C00000"/>',
  nota: '<w:i/><w:color w:val="808080"/>',
};

/**
 * Extrai dinamicamente o numId de lista com marcador (bullet) a partir do word/numbering.xml.
 * Retorna null caso o documento não possua definição de numbering com bullet.
 */
export function extrairBulletNumId(numberingXml?: string): number | null {
  if (!numberingXml) return null;

  try {
    // 1. Identifica abstractNumIds com formato "bullet"
    const abstractBulletIds = new Set<string>();
    const abstractMatches = numberingXml.match(/<w:abstractNum[\s\S]*?<\/w:abstractNum>/g) || [];
    for (const absXml of abstractMatches) {
      const idMatch = absXml.match(/w:abstractNumId="(\d+)"/);
      if (idMatch && (absXml.includes('w:val="bullet"') || absXml.includes('w:val="Bullet"'))) {
        abstractBulletIds.add(idMatch[1]);
      }
    }

    // 2. Procura <w:num w:numId="X"> referenciando um dos abstractBulletIds
    const numMatches = numberingXml.match(/<w:num[\s\S]*?<\/w:num>/g) || [];
    for (const numXml of numMatches) {
      const numIdMatch = numXml.match(/w:numId="(\d+)"/);
      const absRefMatch = numXml.match(/<w:abstractNumId\s+w:val="(\d+)"/);
      if (numIdMatch && absRefMatch && abstractBulletIds.has(absRefMatch[1])) {
        return parseInt(numIdMatch[1], 10);
      }
    }

    // 3. Fallback se existirem abstractNums com bullet mas sem match direto
    if (abstractBulletIds.size > 0 && numMatches.length > 0) {
      const firstNumId = numMatches[0].match(/w:numId="(\d+)"/);
      if (firstNumId) return parseInt(firstNumId[1], 10);
    }
  } catch {
    // Falha silenciosa -> fallback sem numId
  }

  return null;
}

export function montarRPr(baseRPr: string, estilo?: string): string {
  // o realce amarelo sai SEMPRE; fonte, tamanho e idioma do template permanecem
  const limpo = (baseRPr || '').replace(/<w:highlight[^>]*\/>/g, '');
  const extra = ESTILOS[estilo || 'normal'] || '';
  if (!limpo) return extra ? `<w:rPr>${extra}</w:rPr>` : '';
  if (limpo.includes('</w:rPr>')) {
    return limpo.replace('</w:rPr>', extra + '</w:rPr>');
  }
  return `<w:rPr>${limpo}${extra}</w:rPr>`;
}

export function blocosParaOoxml(
  blocos: Bloco[],
  basePPr: string = '',
  baseRPr: string = '',
  bulletNumId: number | null = null
): string {
  // Lista vazia deve retornar '<w:p/>' para garantir que a célula nunca fique sem parágrafo
  if (!blocos || blocos.length === 0) {
    return '<w:p/>';
  }
  
  const pprLimpo = (basePPr || '').replace(/<w:numPr>[\s\S]*?<\/w:numPr>/g, '');
  return blocos.map(b => {
    const estiloPadrao = b.tipo === 'titulo' ? 'forte' : undefined;
    const runs = (b.runs || [])
      .map(r => `<w:r>${montarRPr(baseRPr, r.estilo ?? estiloPadrao)}` +
                `<w:t xml:space="preserve">${esc(r.t)}</w:t></w:r>`)
      .join('');

    if (b.tipo === 'bullet') {
      if (typeof bulletNumId === 'number' && bulletNumId > 0) {
        const nivel = Math.min(b.nivel ?? 0, 2);
        const numPr = `<w:numPr><w:ilvl w:val="${nivel}"/><w:numId w:val="${bulletNumId}"/></w:numPr>`;
        const ppr = pprLimpo
          ? (pprLimpo.includes('</w:pPr>') ? pprLimpo.replace('</w:pPr>', numPr + '</w:pPr>') : `<w:pPr>${pprLimpo}${numPr}</w:pPr>`)
          : `<w:pPr>${numPr}</w:pPr>`;
        return `<w:p>${ppr}${runs}</w:p>`;
      } else {
        // Fallback: sem numbering válido, renderiza como parágrafo com prefixo "• "
        const bulletPrefixRun = `<w:r>${montarRPr(baseRPr, 'forte')}<w:t xml:space="preserve">${'  '.repeat(b.nivel || 0)}• </w:t></w:r>`;
        return `<w:p>${pprLimpo}${bulletPrefixRun}${runs}</w:p>`;
      }
    }
    return `<w:p>${pprLimpo}${runs}</w:p>`;
  }).join('');
}

/**
 * Divide o texto destacando [A DEFINIR NA REUNIÃO] e [A DEFINIR] com estilo 'alerta' (C00000),
 * mantendo o restante no estilo base.
 */
export function formatarTextoComMarcadoresAlerta(texto: string, estiloBase: string = 'normal'): Run[] {
  if (!texto) return [];

  const pattern = /(\[A DEFINIR NA REUNIÃO\]|\[A DEFINIR\])/gi;
  const parts = texto.split(pattern);
  const runs: Run[] = [];

  for (const part of parts) {
    if (!part) continue;
    const upper = part.toUpperCase();
    if (upper === '[A DEFINIR NA REUNIÃO]' || upper === '[A DEFINIR]') {
      runs.push({ t: part, estilo: 'alerta' });
    } else {
      runs.push({ t: part, estilo: estiloBase as Estilo });
    }
  }

  return runs.length > 0 ? runs : [{ t: texto, estilo: estiloBase as Estilo }];
}

/**
 * Converte um TopicoEstado (ou tópico estruturado) em uma lista de Blocos OOXML,
 * respeitando as regras de formatação por situação:
 * - PENDENTE: todos os runs com estilo 'alerta' (C00000), prefixando 'PENDENTE: ' no primeiro run.
 * - Marcadores [A DEFINIR NA REUNIÃO] e [A DEFINIR]: sempre em estilo 'alerta'.
 * - MANTIDO_PADRAO: recebe run final '(condição padrão do modelo mantida)' em estilo 'nota'.
 */
export function topicoParaBlocos(
  topico: {
    topicoId?: string;
    titulo?: string;
    situacao?: string;
    textoAta?: string;
    descricao?: string;
    camposADefinir?: string[];
    responsavel?: string | null;
    prazo?: string | null;
    blocos?: Bloco[];
  }
): Bloco[] {
  const situacao = (topico.situacao || 'ACORDADO').toUpperCase();
  const titulo = (topico.titulo || '').trim();
  const texto = (topico.textoAta || topico.descricao || '').trim();
  const blocos: Bloco[] = [];

  if (situacao === 'PENDENTE') {
    // Todos os runs do tópico com estilo 'alerta' (C00000), título incluído, prefixando 'PENDENTE: ' no primeiro run.
    if (titulo) {
      blocos.push({
        tipo: 'titulo',
        runs: [
          { t: `PENDENTE: ${titulo}`, estilo: 'alerta' }
        ]
      });
    }

    if (texto) {
      const prefix = titulo ? '' : 'PENDENTE: ';
      blocos.push({
        tipo: 'paragrafo',
        runs: [
          { t: `${prefix}${texto}`, estilo: 'alerta' }
        ]
      });
    }

    return blocos.length > 0 ? blocos : [{ tipo: 'paragrafo', runs: [{ t: 'PENDENTE: [A DEFINIR NA REUNIÃO]', estilo: 'alerta' }] }];
  }

  // Tópicos não PENDENTE (ACORDADO, ATUALIZADO, MANTIDO_PADRAO, NAO_APLICAVEL, etc.)
  if (titulo) {
    blocos.push({
      tipo: 'titulo',
      runs: [{ t: titulo, estilo: 'forte' }]
    });
  }

  if (texto) {
    const runs = formatarTextoComMarcadoresAlerta(texto, 'normal');
    blocos.push({
      tipo: 'paragrafo',
      runs
    });
  }

  if (situacao === 'MANTIDO_PADRAO') {
    // MANTIDO_PADRAO recebe run final '(condição padrão do modelo mantida)' em estilo normal itálico / nota
    blocos.push({
      tipo: 'paragrafo',
      runs: [
        { t: '(condição padrão do modelo mantida)', estilo: 'nota' }
      ]
    });
  }

  return blocos.length > 0 ? blocos : [{ tipo: 'paragrafo', runs: [{ t: '', estilo: 'normal' }] }];
}

/**
 * Converte item textual estruturado (com possíveis títulos, deliberações e ressalvas)
 * em uma lista padrão de Blocos semânticos para renderização OOXML.
 */
export function itemParaBlocos(
  titulo: string = '',
  descricao: string = '',
  detalhes?: {
    regra?: string;
    excecao?: string;
    atencao?: string;
    pergunta?: string;
    responsavel?: string;
    prazo?: string;
  }
): Bloco[] {
  const blocos: Bloco[] = [];

  // 1. Título
  if (titulo.trim()) {
    blocos.push({
      tipo: 'titulo',
      runs: [{ t: titulo.trim(), estilo: 'forte' }]
    });
  }

  // 2. Parágrafo descritivo (com marcadores [A DEFINIR] em alerta)
  if (descricao.trim()) {
    blocos.push({
      tipo: 'paragrafo',
      runs: formatarTextoComMarcadoresAlerta(descricao.trim(), 'normal')
    });
  }

  // 3. Bullets de regra / exceção se presentes
  if (detalhes?.regra && detalhes.regra !== 'N/A') {
    blocos.push({
      tipo: 'bullet',
      nivel: 0,
      runs: [
        { t: 'Regra da Obra: ', estilo: 'forte' },
        ...formatarTextoComMarcadoresAlerta(detalhes.regra, 'normal')
      ]
    });
  }

  if (detalhes?.excecao && detalhes.excecao !== 'N/A') {
    blocos.push({
      tipo: 'bullet',
      nivel: 1,
      runs: [
        { t: 'Exceção admitida: ', estilo: 'forte' },
        ...formatarTextoComMarcadoresAlerta(detalhes.excecao, 'normal')
      ]
    });
  }

  // 4. Ponto de Atenção / Ressalva em vermelho (alerta)
  if (detalhes?.atencao && !['Nenhum', 'N/A', 'Não identificado'].includes(detalhes.atencao.trim())) {
    blocos.push({
      tipo: 'paragrafo',
      runs: [
        { t: 'PONTO DE ATENÇÃO: ', estilo: 'alerta' },
        { t: detalhes.atencao.trim(), estilo: 'alerta' }
      ]
    });
  }

  return blocos;
}

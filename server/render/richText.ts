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
};

/** numId de lista com marcador que JÁ existe no template. Não crie numbering novo. */
const NUMID_BULLET = 7;

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

export function blocosParaOoxml(blocos: Bloco[], basePPr: string = '', baseRPr: string = ''): string {
  if (!blocos || blocos.length === 0) return '';
  
  const pprLimpo = (basePPr || '').replace(/<w:numPr>[\s\S]*?<\/w:numPr>/g, '');
  return blocos.map(b => {
    const estiloPadrao = b.tipo === 'titulo' ? 'forte' : undefined;
    const runs = (b.runs || [])
      .map(r => `<w:r>${montarRPr(baseRPr, r.estilo ?? estiloPadrao)}` +
                `<w:t xml:space="preserve">${esc(r.t)}</w:t></w:r>`)
      .join('');

    if (b.tipo === 'bullet') {
      const nivel = Math.min(b.nivel ?? 0, 2);
      const numPr = `<w:numPr><w:ilvl w:val="${nivel}"/><w:numId w:val="${NUMID_BULLET}"/></w:numPr>`;
      const ppr = pprLimpo
        ? (pprLimpo.includes('</w:pPr>') ? pprLimpo.replace('</w:pPr>', numPr + '</w:pPr>') : `<w:pPr>${pprLimpo}${numPr}</w:pPr>`)
        : `<w:pPr>${numPr}</w:pPr>`;
      return `<w:p>${ppr}${runs}</w:p>`;
    }
    return `<w:p>${pprLimpo}${runs}</w:p>`;
  }).join('');
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

  // 2. Parágrafo descritivo
  if (descricao.trim()) {
    blocos.push({
      tipo: 'paragrafo',
      runs: [{ t: descricao.trim(), estilo: 'normal' }]
    });
  }

  // 3. Bullets de regra / exceção se presentes
  if (detalhes?.regra && detalhes.regra !== 'N/A') {
    blocos.push({
      tipo: 'bullet',
      nivel: 0,
      runs: [
        { t: 'Regra da Obra: ', estilo: 'forte' },
        { t: detalhes.regra, estilo: 'normal' }
      ]
    });
  }

  if (detalhes?.excecao && detalhes.excecao !== 'N/A') {
    blocos.push({
      tipo: 'bullet',
      nivel: 1,
      runs: [
        { t: 'Exceção admitida: ', estilo: 'forte' },
        { t: detalhes.excecao, estilo: 'normal' }
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

import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import mammoth from 'mammoth';
import { getActiveTemplate, TemplateConfig } from './configStore';
import { addLog } from './logger';

// ================= XML ESCAPING & UTILITIES =================

/**
 * Escapes XML special characters to prevent Word document corruption.
 */
export function escapeXml(unsafe: string | null | undefined): string {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Normalizes fractured XML text runs inside a WordprocessingML XML string.
 * Microsoft Word frequently splits text runs across multiple <w:r><w:t> tags
 * (e.g. due to spellcheck <w:proofErr/>, language tags, formatting revisions),
 * which breaks placeholder matching like {obraCodigo} or [FORNECEDOR].
 */
export function normalizeWordXmlRuns(xml: string): string {
  if (!xml || typeof xml !== 'string') return xml;

  // 1. Remove proofing error tags and spell checking markers that split runs
  let cleanXml = xml
    .replace(/<w:proofErr[^>]*\/>/gi, '')
    .replace(/<w:noProof[^>]*\/>/gi, '')
    .replace(/<w:lang[^>]*\/>/gi, '');

  // 2. Normalize bracket placeholders [TAG] and angle bracket <<TAG>> into {TAG}
  // to support diverse user template styles while preserving docxtemplater loop tags {#tag}
  cleanXml = cleanXml.replace(/\[([A-Za-z0-9_.-]+)\]/g, (_match, tag) => {
    return `{${tag}}`;
  });
  cleanXml = cleanXml.replace(/&lt;&lt;([A-Za-z0-9_.-]+)&gt;&gt;/g, '{$1}');
  cleanXml = cleanXml.replace(/<<([A-Za-z0-9_.-]+)>>/g, '{$1}');

  // 3. Merge fractured runs within paragraphs that contain opening '{' and closing '}'
  cleanXml = cleanXml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/gi, (pXml) => {
    if (!pXml.includes('{') || !pXml.includes('}')) {
      return pXml;
    }

    const fullText = pXml.replace(/<[^>]+>/g, '');
    const placeholderRegex = /\{[#^/]?[\w.\-_]+\}/g;
    const matches = fullText.match(placeholderRegex);
    if (!matches || matches.length === 0) {
      return pXml;
    }

    let modifiedP = pXml;
    for (const tag of matches) {
      const escapedTagForRegex = tag.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const directMatchRegex = new RegExp(`<w:t[^>]*>[^<]*${escapedTagForRegex}[^<]*<\\/w:t>`, 'i');
      
      if (!directMatchRegex.test(modifiedP)) {
        const parts = tag.split('');
        let searchPattern = '';
        for (let i = 0; i < parts.length; i++) {
          const char = parts[i].replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
          searchPattern += (i === 0) ? `(${char})` : `(?:<[^>]+>)*(${char})`;
        }
        try {
          const regex = new RegExp(searchPattern, 'gi');
          modifiedP = modifiedP.replace(regex, tag);
        } catch {
          // Keep original on regex compilation failure
        }
      }
    }

    return modifiedP;
  });

  return cleanXml;
}

// ================= DOCX XML INSPECTION & STRUCTURE EXTRACTION =================

export interface DocxTemplateInspection {
  detectedPlaceholders: string[];
  paragraphsCount: number;
  tablesCount: number;
  structureSummary: string;
  hasLoopTags: boolean;
  tableHeaders: string[];
  rawTextPreview: string;
}

/**
 * Inspects an uploaded .docx file using XML parsing (PizZip) and Mammoth to discover
 * placeholders, XML structure, tables, paragraphs, and raw text preview.
 */
export async function parseDocxTemplate(buffer: Buffer): Promise<DocxTemplateInspection> {
  try {
    const zip = new PizZip(buffer);
    
    // Read document.xml and headers/footers
    const xmlFiles = Object.keys(zip.files).filter(filename => 
      filename.startsWith('word/') && filename.endsWith('.xml')
    );

    let combinedXml = '';
    for (const filename of xmlFiles) {
      try {
        const content = zip.files[filename].asText();
        combinedXml += ' ' + content;
      } catch {
        // ignore individual file read errors
      }
    }

    // Extract tags matching {tag}, {/tag}, {#tag}, {^tag}, [TAG], <<TAG>>
    const foundTags = new Set<string>();

    const curlyTagRegex = /\{([#^/]?[\w.\-_]+)\}/g;
    let match;
    while ((match = curlyTagRegex.exec(combinedXml)) !== null) {
      const cleanTag = match[1].replace(/^[#^/]/, '').trim();
      if (cleanTag && cleanTag.length < 60) {
        foundTags.add(cleanTag);
      }
    }

    const bracketTagRegex = /\[([A-Za-z0-9_.-]{2,50})\]/g;
    while ((match = bracketTagRegex.exec(combinedXml)) !== null) {
      const cleanTag = match[1].trim();
      if (cleanTag) {
        foundTags.add(cleanTag);
      }
    }

    // Extract raw text via Mammoth to verify human-readable content
    let rawText = '';
    try {
      const mammothResult = await mammoth.extractRawText({ buffer });
      rawText = (mammothResult.value || '').trim();
    } catch {
      // ignore mammoth error
    }

    // Count paragraphs and tables in document.xml
    const docXml = zip.files['word/document.xml']?.asText() || '';
    const paragraphsCount = (docXml.match(/<w:p[\s>]/g) || []).length;
    const tablesCount = (docXml.match(/<w:tbl[\s>]/g) || []).length;

    // Detect table headers if any table exists
    const tableHeaders: string[] = [];
    const tblHeaderRegex = /<w:tbl[\s\S]*?<w:tr[\s\S]*?<\/w:tr>/gi;
    const firstTableMatch = docXml.match(tblHeaderRegex);
    if (firstTableMatch && firstTableMatch[0]) {
      const cellsText = firstTableMatch[0].match(/<w:t[^>]*>([^<]+)<\/w:t>/gi) || [];
      cellsText.forEach(c => {
        const t = c.replace(/<[^>]+>/g, '').trim();
        if (t && t.length < 40 && !tableHeaders.includes(t)) {
          tableHeaders.push(t);
        }
      });
    }

    const detectedPlaceholders = Array.from(foundTags);
    const hasLoopTags = detectedPlaceholders.some(t => 
      ['topics', 'divergences', 'agreeditems', 'pendingitems', 'itens', 'divergencias', 'acordos', 'pendencias', 'participantes'].includes(t.toLowerCase())
    );

    const summary = `DOCX carregado: ${paragraphsCount} parágrafos, ${tablesCount} tabela(s) e ${detectedPlaceholders.length} variáveis identificadas (${detectedPlaceholders.slice(0, 8).join(', ')}${detectedPlaceholders.length > 8 ? '...' : ''}).`;

    addLog('INFO', 'DOCX', `Template DOCX inspecionado com sucesso: ${detectedPlaceholders.length} tags encontradas`, {
      detectedPlaceholders,
      paragraphsCount,
      tablesCount,
      tableHeaders
    });

    return {
      detectedPlaceholders,
      paragraphsCount,
      tablesCount,
      structureSummary: summary,
      hasLoopTags,
      tableHeaders,
      rawTextPreview: rawText.substring(0, 1000)
    };
  } catch (err: any) {
    addLog('WARN', 'DOCX', `Erro ao inspecionar XML do DOCX: ${err.message}`);
    return {
      detectedPlaceholders: [],
      paragraphsCount: 0,
      tablesCount: 0,
      structureSummary: 'Documento DOCX carregado.',
      hasLoopTags: false,
      tableHeaders: [],
      rawTextPreview: ''
    };
  }
}

// ================= UNIFIED DATA DICTIONARY BUILDER =================

/**
 * Builds a comprehensive, case-insensitive and alias-rich data dictionary
 * for Docxtemplater, ensuring no field is missing regardless of how the user
 * authored the template tags (camelCase, snake_case, UPPERCASE, Portuguese aliases).
 */
export function buildTemplateDataDictionary(
  template: TemplateConfig | null,
  abertura: any,
  analysisResult: any,
  divergences: any[],
  finalData: any | null,
  isPreAta: boolean
) {
  const dataReuniao = new Date().toLocaleDateString('pt-BR');
  const horaAtual = '10:30h';
  const localReuniao = 'Online - Teams';
  const anoAtual = new Date().getFullYear().toString();
  const mesAtual = (new Date().getMonth() + 1).toString().padStart(2, '0');
  const diaAtual = new Date().getDate().toString().padStart(2, '0');
  const fornecedorNome = abertura?.fornecedor || 'Fornecedor';

  // Format topics / checklist items
  const formattedTopics = (analysisResult?.topics || []).map((t: any, idx: number) => {
    const numStr = String(idx + 1).padStart(2, '0');
    const isAtt = Boolean(t.pontoAtencao && t.pontoAtencao !== 'N/A' && t.pontoAtencao !== 'Nenhum' && t.pontoAtencao !== 'Não identificado');
    return {
      index: idx + 1,
      num: numStr,
      item: numStr,
      numero: numStr,
      title: t.title || `Item ${idx + 1}`,
      titulo: t.title || `Item ${idx + 1}`,
      assunto: t.title || `Item ${idx + 1}`,
      regraObra: t.regraObra || 'N/A',
      regra: t.regraObra || 'N/A',
      excecaoAdmitida: t.excecaoAdmitida || 'N/A',
      excecao: t.excecaoAdmitida || 'N/A',
      pontoAtencao: t.pontoAtencao || 'Nenhum',
      atencao: t.pontoAtencao || 'Nenhum',
      alerta: t.pontoAtencao || 'Nenhum',
      perguntaFornecedor: t.perguntaFornecedor || 'N/A',
      pergunta: t.perguntaFornecedor || 'N/A',
      orientacao: t.perguntaFornecedor || 'N/A',
      source: t.source || 'Check List',
      origem: t.source || 'Check List',
      isAttention: isAtt,
      temAtencao: isAtt,
      responsavel: 'Informativo',
      prazo: 'Na reunião'
    };
  });

  // Format divergences
  const formattedDivergences = (divergences || []).map((d: any, idx: number) => {
    const numStr = String(idx + 1).padStart(2, '0');
    const sev = (d.severity || 'MEDIA').toUpperCase();
    const isAlta = sev === 'ALTA';
    return {
      index: idx + 1,
      num: numStr,
      item: numStr,
      numero: numStr,
      severity: sev,
      severidade: sev,
      nivel: sev,
      description: d.description || '',
      descricao: d.description || '',
      texto: d.description || '',
      source: d.source || 'Proposta Comercial',
      origem: d.source || 'Proposta Comercial',
      isAlta: isAlta,
      isMedia: sev === 'MEDIA',
      isBaixa: sev === 'BAIXA',
      responsavel: 'Fornecedor / Engenharia',
      prazo: 'Na reunião'
    };
  });

  // Format agreed & pending items
  const rawAgreed = finalData?.agreedItems || [];
  const formattedAgreed = rawAgreed.map((it: any, idx: number) => {
    const numStr = String(idx + 1).padStart(2, '0');
    const textVal = typeof it === 'string' ? it : (it.text || it.title || it.descricao || '');
    return {
      index: idx + 1,
      num: numStr,
      item: numStr,
      numero: numStr,
      text: textVal,
      texto: textVal,
      descricao: textVal,
      title: textVal,
      responsavel: 'Informativo',
      prazo: 'Conforme cronograma'
    };
  });

  const rawPending = finalData?.pendingItems || [];
  const formattedPending = rawPending.map((it: any, idx: number) => {
    const numStr = String(idx + 1).padStart(2, '0');
    const textVal = typeof it === 'string' ? it : (it.text || it.title || it.descricao || '');
    return {
      index: idx + 1,
      num: numStr,
      item: numStr,
      numero: numStr,
      text: textVal,
      texto: textVal,
      descricao: textVal,
      title: textVal,
      responsavel: 'Fornecedor / Engenharia',
      prazo: 'A definir'
    };
  });

  // Action points
  const rawActionPoints = finalData?.actionPoints || [];
  const formattedActionPoints = rawActionPoints.map((ap: any, idx: number) => {
    const numStr = String(idx + 1).padStart(2, '0');
    return {
      index: idx + 1,
      num: numStr,
      item: numStr,
      acao: ap.action || ap.acao || ap.text || '',
      action: ap.action || ap.acao || ap.text || '',
      responsavel: ap.responsible || ap.responsavel || 'A definir',
      responsible: ap.responsible || ap.responsavel || 'A definir',
      prazo: ap.deadline || ap.prazo || 'A definir',
      deadline: ap.deadline || ap.prazo || 'A definir'
    };
  });

  // Default participants
  const formattedParticipantes = [
    { nome: 'Representante Comercial', cargo: 'Comercial', empresa: fornecedorNome, email: 'contato@fornecedor.com.br', visto: '' },
    { nome: 'Engenharia Técnica', cargo: 'Engenheiro', empresa: fornecedorNome, email: 'engenharia@fornecedor.com.br', visto: '' },
    { nome: 'Equipe de Suprimentos', cargo: 'Comprador / Suprimentos', empresa: template?.companyName || 'Departamento de Suprimentos', email: 'suprimentos@empresa.com.br', visto: '' },
    { nome: 'Engenheiro Residente', cargo: 'Engenharia de Obra', empresa: abertura?.obraNome || 'Obra', email: 'obra@empresa.com.br', visto: '' },
  ];

  // Summary and notes
  const resumoTexto = isPreAta
    ? (template?.preAtaIntro || 'Esta Pré-Ata contém a análise de aderência das propostas comerciais frente ao check list de obrigações da obra, identificando as regras acordadas, as exceções admitidas e os pontos de atenção para deliberação na reunião.')
    : (finalData?.notes || 'Reunião de alinhamento e contratação realizada com sucesso.');

  // Formatted plain text string representations for templates with single string markers
  const topicsAsText = formattedTopics.map((t: any) => 
    `• [${t.item}] ${t.title}\n  - Regra da Obra: ${t.regraObra}\n  - Exceção Admitida: ${t.excecaoAdmitida}\n  - Ponto de Atenção: ${t.pontoAtencao}${isPreAta ? `\n  - Orientação de Negociação: ${t.perguntaFornecedor}` : ''}`
  ).join('\n\n');

  const divergencesAsText = formattedDivergences.map((d: any) =>
    `• [${d.severity}] ${d.description} (Origem: ${d.source})`
  ).join('\n');

  const agreedAsText = formattedAgreed.map((a: any) => `• ${a.text}`).join('\n');
  const pendingAsText = formattedPending.map((p: any) => `• [PENDÊNCIA] ${p.text}`).join('\n');
  const actionPointsAsText = formattedActionPoints.map((ap: any) => `• ${ap.acao} | Resp: ${ap.responsavel} | Prazo: ${ap.prazo}`).join('\n');

  const corpoCompleto = isPreAta
    ? `--- ANÁLISE DE ADERÊNCIA E CHECK LIST ---\n${topicsAsText}\n\n--- DIVERGÊNCIAS DA PROPOSTA ---\n${divergencesAsText}`
    : `--- ITENS ACORDADOS NA REUNIÃO ---\n${agreedAsText}\n\n--- PENDÊNCIAS E PONTOS DE ATENÇÃO ---\n${pendingAsText}\n\n--- PONTOS DE AÇÃO ---\n${actionPointsAsText}\n\n--- RESUMO EXECUTIVO ---\n${resumoTexto}`;

  // Complete Universal Data Dictionary
  const dictionary: Record<string, any> = {
    // Obra Identification (All standard aliases & cases)
    obraCodigo: abertura?.obraCodigo || '',
    OBRA_CODIGO: abertura?.obraCodigo || '',
    CODIGO_OBRA: abertura?.obraCodigo || '',
    codigoObra: abertura?.obraCodigo || '',
    cod_obra: abertura?.obraCodigo || '',
    codigo_obra: abertura?.obraCodigo || '',
    obra_codigo: abertura?.obraCodigo || '',
    obra: abertura?.obraCodigo || '',
    OBRA: abertura?.obraCodigo || '',

    obraNome: abertura?.obraNome || 'Obra / Empreendimento',
    OBRA_NOME: abertura?.obraNome || 'Obra / Empreendimento',
    NOME_OBRA: abertura?.obraNome || 'Obra / Empreendimento',
    nomeObra: abertura?.obraNome || 'Obra / Empreendimento',
    obra_nome: abertura?.obraNome || 'Obra / Empreendimento',
    nome_obra: abertura?.obraNome || 'Obra / Empreendimento',
    empreendimento: abertura?.obraNome || 'Obra / Empreendimento',
    EMPREENDIMENTO: abertura?.obraNome || 'Obra / Empreendimento',

    fornecedor: abertura?.fornecedor || 'Fornecedor',
    FORNECEDOR: abertura?.fornecedor || 'Fornecedor',
    fornecedorNome: abertura?.fornecedor || 'Fornecedor',
    razaoSocial: abertura?.fornecedor || 'Fornecedor',
    empresa: abertura?.fornecedor || 'Fornecedor',
    EMPRESA: abertura?.fornecedor || 'Fornecedor',
    RAZAO_SOCIAL: abertura?.fornecedor || 'Fornecedor',

    assunto: abertura?.assunto || 'Reunião de Contratação e Alinhamento Técnico',
    ASSUNTO: abertura?.assunto || 'Reunião de Contratação e Alinhamento Técnico',
    tema: abertura?.assunto || 'Reunião de Contratação e Alinhamento Técnico',
    TEMA: abertura?.assunto || 'Reunião de Contratação e Alinhamento Técnico',
    titulo: abertura?.assunto || 'Reunião de Contratação e Alinhamento Técnico',
    TITULO: abertura?.assunto || 'Reunião de Contratação e Alinhamento Técnico',

    servico: abertura?.servico || 'Serviço / Escopo Contratado',
    SERVICO: abertura?.servico || 'Serviço / Escopo Contratado',
    escopo: abertura?.servico || 'Serviço / Escopo Contratado',
    ESCOPO: abertura?.servico || 'Serviço / Escopo Contratado',
    pacote: abertura?.servico || 'Serviço / Escopo Contratado',
    PACOTE: abertura?.servico || 'Serviço / Escopo Contratado',

    rm: abertura?.rm || '',
    RM: abertura?.rm || '',
    numRM: abertura?.rm || '',
    requisicao: abertura?.rm || '',
    REQUISICAO: abertura?.rm || '',

    cot: abertura?.cot || '',
    COT: abertura?.cot || '',
    numCOT: abertura?.cot || '',
    cotacao: abertura?.cot || '',
    COTACAO: abertura?.cot || '',
    mapa: abertura?.cot || '',
    MAPA: abertura?.cot || '',

    // Dates & Times
    dataReuniao: dataReuniao,
    DATA_REUNIAO: dataReuniao,
    data: dataReuniao,
    DATA: dataReuniao,
    data_reuniao: dataReuniao,
    dataExtenso: `${diaAtual}/${mesAtual}/${anoAtual}`,
    DATA_EXTENSO: `${diaAtual}/${mesAtual}/${anoAtual}`,
    horario: horaAtual,
    HORARIO: horaAtual,
    hora: horaAtual,
    HORA: horaAtual,
    local: localReuniao,
    LOCAL: localReuniao,
    ano: anoAtual,
    ANO: anoAtual,
    mes: mesAtual,
    MES: mesAtual,
    dia: diaAtual,
    DIA: diaAtual,

    // Header & Corporate Identity
    companyName: template?.companyName || 'DEPARTAMENTO DE SUPRIMENTOS',
    EMPRESA_RESPONSAVEL: template?.companyName || 'DEPARTAMENTO DE SUPRIMENTOS',
    departamento: template?.companyName || 'DEPARTAMENTO DE SUPRIMENTOS',
    DEPARTAMENTO: template?.companyName || 'DEPARTAMENTO DE SUPRIMENTOS',
    version: String(template?.version || '1'),
    versao: String(template?.version || '1'),

    // Signatures and Clauses
    signatures: template?.signatures || 'Gerência de Suprimentos / Engenheiro da Obra / Representante do Fornecedor',
    ASSINATURAS: template?.signatures || 'Gerência de Suprimentos / Engenheiro da Obra / Representante do Fornecedor',
    vistos: template?.signatures || 'Gerência de Suprimentos / Engenheiro da Obra / Representante do Fornecedor',
    VISTOS: template?.signatures || 'Gerência de Suprimentos / Engenheiro da Obra / Representante do Fornecedor',
    standardClauses: template?.standardClauses || '',
    CLAUSULAS_PADRAO: template?.standardClauses || '',
    clausulas: template?.standardClauses || '',
    CLAUSULAS: template?.standardClauses || '',

    // Summaries
    resumo: resumoTexto,
    RESUMO: resumoTexto,
    resumoExecutivo: resumoTexto,
    RESUMO_EXECUTIVO: resumoTexto,
    notas: resumoTexto,
    NOTAS: resumoTexto,
    preAtaIntro: template?.preAtaIntro || '',
    PRE_ATA_INTRO: template?.preAtaIntro || '',
    introducao: template?.preAtaIntro || '',
    INTRODUCAO: template?.preAtaIntro || '',

    // Loop Lists for dynamic tables
    topics: formattedTopics,
    itens: formattedTopics,
    checklist: formattedTopics,
    analiseAderencia: formattedTopics,
    itensChecklist: formattedTopics,

    divergences: formattedDivergences,
    divergencias: formattedDivergences,
    pontosAtencao: formattedDivergences,
    desvios: formattedDivergences,

    agreedItems: formattedAgreed,
    itensAcordados: formattedAgreed,
    acordos: formattedAgreed,
    deliberacoes: formattedAgreed,

    pendingItems: formattedPending,
    pendencias: formattedPending,
    itensPendentes: formattedPending,
    acoesPendentes: formattedPending,

    actionPoints: formattedActionPoints,
    pontosAcao: formattedActionPoints,
    acoes: formattedActionPoints,

    participantes: formattedParticipantes,
    listaParticipantes: formattedParticipantes,

    // Plain Text Blocks
    topicsText: topicsAsText,
    divergencesText: divergencesAsText,
    agreedText: agreedAsText,
    pendingText: pendingAsText,
    actionPointsText: actionPointsAsText,
    itensTexto: isPreAta ? `${topicsAsText}\n\n${divergencesAsText}` : `${agreedAsText}\n\n${pendingAsText}`,
    tabelaTexto: isPreAta ? topicsAsText : agreedAsText,
    corpoAta: corpoCompleto,
    CORPO_ATA: corpoCompleto,
    conteudo: corpoCompleto,
    CONTEUDO: corpoCompleto,
  };

  return dictionary;
}

// ================= DYNAMIC DOCX FILLING ENGINE =================

/**
 * Fills an uploaded DOCX template using docxtemplater and XML run normalization.
 * Injects existing fields and complements with information from the received documents
 * without distorting or breaking the template layout.
 */
export async function fillUploadedDocxTemplate(
  templateBuffer: Buffer,
  abertura: any,
  analysisResult: any,
  divergences: any[],
  finalData: any | null,
  isPreAta: boolean
): Promise<Buffer> {
  const template = getActiveTemplate();
  const templateData = buildTemplateDataDictionary(
    template,
    abertura,
    analysisResult,
    divergences,
    finalData,
    isPreAta
  );

  const zip = new PizZip(templateBuffer);

  // Pre-process and normalize XML runs across document, headers, and footers
  const xmlFiles = Object.keys(zip.files).filter(filename => 
    filename.startsWith('word/') && filename.endsWith('.xml')
  );

  for (const filename of xmlFiles) {
    try {
      const rawContent = zip.files[filename].asText();
      const normalizedContent = normalizeWordXmlRuns(rawContent);
      if (rawContent !== normalizedContent) {
        zip.file(filename, normalizedContent);
      }
    } catch {
      // Skip individual XML normalization on error
    }
  }

  // Configure Docxtemplater with robust custom parser
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    parser: (tag: string) => {
      const cleanTag = tag.trim();
      return {
        get: (scope: any) => {
          if (!scope) return '';
          
          // 1. Direct match in local loop scope
          if (scope[cleanTag] !== undefined && scope[cleanTag] !== null) {
            return scope[cleanTag];
          }

          // 2. Case-insensitive match in current scope
          const lowerTag = cleanTag.toLowerCase();
          const keys = Object.keys(scope);
          for (const key of keys) {
            if (key.toLowerCase() === lowerTag && scope[key] !== undefined && scope[key] !== null) {
              return scope[key];
            }
          }

          // 3. Fallback to global dictionary
          if (templateData[cleanTag] !== undefined) {
            return templateData[cleanTag];
          }

          for (const key of Object.keys(templateData)) {
            if (key.toLowerCase() === lowerTag && templateData[key] !== undefined) {
              return templateData[key];
            }
          }

          // Return empty string to prevent breaking layout
          return '';
        }
      };
    },
    nullGetter: () => ''
  });

  doc.render(templateData);

  const generatedBuffer = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });

  addLog('INFO', 'DOCX', `Documento DOCX gerado com fidelidade ao template do usuário (${generatedBuffer.length} bytes)`, {
    templateName: template?.name || 'Template Dinâmico',
    version: template?.version || 1,
    isPreAta,
    topicsCount: analysisResult?.topics?.length || 0,
    divergencesCount: divergences?.length || 0
  });

  return generatedBuffer;
}

// ================= PUBLIC EXPORTED GENERATOR ENTRYPOINTS =================

export async function generatePreAtaDocx(abertura: any, analysisResult: any, divergences: any[]): Promise<Buffer> {
  const template = getActiveTemplate();
  if (!template || !template.docxBlobBase64) {
    throw new Error('Nenhum arquivo de Template DOCX foi cadastrado no sistema. O template salvo pelo usuário é a fonte única obrigatória para gerar a Pré-Ata. Por favor, cadastre o arquivo de template (.docx) nas Configurações.');
  }

  const buffer = Buffer.from(template.docxBlobBase64, 'base64');
  return await fillUploadedDocxTemplate(buffer, abertura, analysisResult, divergences, null, true);
}

export async function generateFinalAtaDocx(abertura: any, analysisResult: any, divergences: any[], finalData: any): Promise<Buffer> {
  const template = getActiveTemplate();
  if (!template || !template.docxBlobBase64) {
    throw new Error('Nenhum arquivo de Template DOCX foi cadastrado no sistema. O template salvo pelo usuário é a fonte única obrigatória para gerar a Ata Final. Por favor, cadastre o arquivo de template (.docx) nas Configurações.');
  }

  const buffer = Buffer.from(template.docxBlobBase64, 'base64');
  return await fillUploadedDocxTemplate(buffer, abertura, analysisResult, divergences, finalData, false);
}

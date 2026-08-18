import PizZip from 'pizzip';
import mammoth from 'mammoth';
import { addLog } from './logger';
import { renderAtaDocument } from './render/renderAta';
import { buildDefaultSchema } from './templateRepository';
import { TemplateSchema } from './types/template';

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

// ================= DOCX XML INSPECTION & STRUCTURE EXTRACTION =================

export interface DocxTemplateInspection {
  detectedPlaceholders: string[];
  paragraphsCount: number;
  tablesCount: number;
  structureSummary: string;
  hasLoopTags: boolean;
  tableHeaders: string[];
  rawTextPreview: string;
  initialSchema?: TemplateSchema;
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
        // ignore
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

    const bracketTagRegex = /\[([A-Za-z0-9_.\-\s]{2,60})\]/g;
    while ((match = bracketTagRegex.exec(combinedXml)) !== null) {
      const cleanTag = match[1].replace(/<[^>]+>/g, '').trim();
      if (cleanTag && cleanTag.length < 60 && !cleanTag.includes('/')) {
        foundTags.add(cleanTag);
      }
    }

    // Extract raw text via Mammoth to verify human-readable content
    let rawText = '';
    try {
      const mammothResult = await mammoth.extractRawText({ buffer });
      rawText = (mammothResult.value || '').trim();
    } catch {
      // ignore
    }

    // Also look for known brackets in raw text
    const textBracketRegex = /\[([A-Za-z0-9_.\-\s]{2,60})\]/g;
    while ((match = textBracketRegex.exec(rawText)) !== null) {
      const clean = match[1].trim();
      if (clean && clean.length < 60) {
        foundTags.add(clean);
      }
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

    const initialSchema = buildDefaultSchema('template-init', detectedPlaceholders);

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
      rawTextPreview: rawText.substring(0, 1000),
      initialSchema
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

// ================= PUBLIC EXPORTED GENERATOR ENTRYPOINTS =================

export async function generatePreAtaDocx(abertura: any, analysisResult: any, divergences: any[]): Promise<Buffer> {
  const { buffer } = await renderAtaDocument(abertura, analysisResult, divergences, null, '', true);
  return buffer;
}

export async function generateFinalAtaDocx(abertura: any, analysisResult: any, divergences: any[], finalData: any, transcript: string = ''): Promise<Buffer> {
  const { buffer } = await renderAtaDocument(abertura, analysisResult, divergences, finalData, transcript, false);
  return buffer;
}

import PizZip from 'pizzip';
import mammoth from 'mammoth';
import { addLog } from './logger';
import { renderAtaDocument } from './render/renderAta';
import { buildDefaultSchema } from './templateRepository';
import { TemplateSchema, TableInspection, TableInspectionRow } from './types/template';
import { findBlocks, extractCellFormatting } from './render/injectLoop';

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
  tables: TableInspection[];
  placeholderMap: Record<string, string>;
  initialSchema?: TemplateSchema;
}

/**
 * Builds the initial placeholder map discovered in the template.
 */
export function buildInitialPlaceholderMap(detectedPlaceholders: string[]): Record<string, string> {
  const map: Record<string, string> = {
    '[CÓDIGO DA OBRA]': 'obraCodigo',
    '[CODIGO DA OBRA]': 'obraCodigo',
    '[CÓDIGO_DA_OBRA]': 'obraCodigo',
    '[NOME DA OBRA]': 'obraNome',
    '[NOME_DA_OBRA]': 'obraNome',
    '[FORNECEDOR]': 'fornecedor',
    '[ASSUNTO]': 'assunto',
    '[SERVIÇO]': 'servico',
    '[SERVICO]': 'servico',
    '[EXTRAIR DO FIRE FLIES]': 'resumo',
    '[EXTRAIR_DO_FIRE_FLIES]': 'resumo',
    '[caminho da rede]': 'linkReuniao',
    '[caminho_da_rede]': 'linkReuniao',
    'RM XXX COT XXX': 'RM {rm} COT {cot}',
    'RM XXX': 'RM {rm}',
    'COT XXX': 'COT {cot}',
    '<<obraCodigo>>': 'obraCodigo',
    '<<fornecedor>>': 'fornecedor',
    '<<obraNome>>': 'obraNome',
    '<<assunto>>': 'assunto',
    '<<servico>>': 'servico',
  };

  // Add custom detected brackets, IGNORING xx, xxx, xxxx
  for (const ph of detectedPlaceholders) {
    const clean = ph.replace(/[\[\]]/g, '').trim();
    if (!clean) continue;
    if (/^x+$/i.test(clean)) continue; // Never map [xx], [xxx] to tags!

    const fullBracket = `[${clean}]`;
    if (!map[fullBracket]) {
      const camelCaseKey = clean
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
        .replace(/^[^a-zA-Z]+/, '')
        .replace(/^[A-Z]/, c => c.toLowerCase());
      
      if (camelCaseKey && camelCaseKey.length >= 2) {
        map[fullBracket] = camelCaseKey;
      }
    }
  }

  return map;
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

    const curlyTagRegex = /\{([#^/]?[\w.\-_@]+)\}/g;
    let match;
    while ((match = curlyTagRegex.exec(combinedXml)) !== null) {
      const cleanTag = match[1].replace(/^[#^/@]/, '').trim();
      if (cleanTag && cleanTag.length < 60) {
        foundTags.add(cleanTag);
      }
    }

    const bracketTagRegex = /\[([A-Za-z0-9_.\-\sÀ-ÿ]{2,60})\]/g;
    while ((match = bracketTagRegex.exec(combinedXml)) !== null) {
      const cleanTag = match[1].replace(/<[^>]+>/g, '').trim();
      // Ignore generic xx / xxx
      if (cleanTag && cleanTag.length < 60 && !cleanTag.includes('/') && !/^x+$/i.test(cleanTag)) {
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
    const textBracketRegex = /\[([A-Za-z0-9_.\-\sÀ-ÿ]{2,60})\]/g;
    while ((match = textBracketRegex.exec(rawText)) !== null) {
      const clean = match[1].trim();
      if (clean && clean.length < 60 && !/^x+$/i.test(clean)) {
        foundTags.add(clean);
      }
    }

    // Count paragraphs and inspect detailed tables in document.xml
    const docXml = zip.files['word/document.xml']?.asText() || '';
    const paragraphsCount = (docXml.match(/<w:p[\s>]/g) || []).length;
    
    // Find all <w:tbl> blocks with depth tracking
    const tblBlocks = findBlocks(docXml, 'w:tbl');
    const tablesCount = tblBlocks.length;
    const inspectedTables: TableInspection[] = [];
    const tableHeaders: string[] = [];

    for (let tIdx = 0; tIdx < tblBlocks.length; tIdx++) {
      const tblXml = docXml.slice(tblBlocks[tIdx].start, tblBlocks[tIdx].end);
      const trBlocks = findBlocks(tblXml, 'w:tr');
      const rows: TableInspectionRow[] = [];
      let maxCols = 0;

      for (let rIdx = 0; rIdx < trBlocks.length; rIdx++) {
        const trXml = tblXml.slice(trBlocks[rIdx].start, trBlocks[rIdx].end);
        const tcBlocks = findBlocks(trXml, 'w:tc');
        maxCols = Math.max(maxCols, tcBlocks.length);

        const cells: string[] = [];
        for (let cIdx = 0; cIdx < tcBlocks.length; cIdx++) {
          const tcXml = trXml.slice(tcBlocks[cIdx].start, tcBlocks[cIdx].end);
          const cellTexts = tcXml.match(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/gi) || [];
          const text = cellTexts.map(c => c.replace(/<[^>]+>/g, '')).join(' ').trim();
          cells.push(text.length > 80 ? text.substring(0, 77) + '...' : text);
        }

        // Limit inspected rows stored to top 10 rows to save memory
        if (rIdx < 10 || rIdx === trBlocks.length - 1) {
          rows.push({ index: rIdx, cells });
        }

        // First row headers
        if (rIdx === 0 && tIdx === 0) {
          cells.forEach(c => {
            if (c && c.length < 40 && !tableHeaders.includes(c)) {
              tableHeaders.push(c);
            }
          });
        }
      }

      inspectedTables.push({
        index: tIdx,
        rowCount: trBlocks.length,
        columnCount: maxCols,
        rows
      });
    }

    const detectedPlaceholders = Array.from(foundTags);
    const hasLoopTags = detectedPlaceholders.some(t => 
      ['topics', 'divergences', 'agreeditems', 'pendingitems', 'itens', 'divergencias', 'acordos', 'pendencias', 'participantes'].includes(t.toLowerCase())
    );

    const placeholderMap = buildInitialPlaceholderMap(detectedPlaceholders);
    const initialSchema = buildDefaultSchema('template-init', detectedPlaceholders, inspectedTables);

    const summary = `DOCX carregado: ${paragraphsCount} parágrafos, ${tablesCount} tabela(s) e ${detectedPlaceholders.length} variáveis identificadas (${detectedPlaceholders.slice(0, 8).join(', ')}${detectedPlaceholders.length > 8 ? '...' : ''}).`;

    addLog('INFO', 'DOCX', `Template DOCX inspecionado com sucesso: ${detectedPlaceholders.length} tags encontradas, ${tablesCount} tabelas`, {
      detectedPlaceholders,
      paragraphsCount,
      tablesCount,
      tableHeaders,
      inspectedTablesCount: inspectedTables.length
    });

    return {
      detectedPlaceholders,
      paragraphsCount,
      tablesCount,
      structureSummary: summary,
      hasLoopTags,
      tableHeaders,
      rawTextPreview: rawText.substring(0, 1000),
      tables: inspectedTables,
      placeholderMap,
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
      rawTextPreview: '',
      tables: [],
      placeholderMap: buildInitialPlaceholderMap([])
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

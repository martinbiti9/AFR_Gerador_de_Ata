import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { getActiveTemplateFromDb } from '../templateRepository';
import { reconcilePayload } from './reconcile';
import { verifyGeneratedDocx, VerificationReport } from './verify';
import { addLog } from '../logger';

export class RenderValidationError extends Error {
  public statusCode = 422;
  public missingFields: string[];

  constructor(message: string, missingFields: string[]) {
    super(message);
    this.name = 'RenderValidationError';
    this.missingFields = missingFields;
  }
}

/**
 * Normalizes XML runs inside Word document to mend tags fractured across multiple runs.
 */
export function normalizeXmlRunsForDocxtemplater(xml: string): string {
  if (!xml || typeof xml !== 'string') return xml;

  // 1. Remove proofing tags and spell-checking markers that split runs
  let cleanXml = xml
    .replace(/<w:proofErr[^>]*\/>/gi, '')
    .replace(/<w:noProof[^>]*\/>/gi, '')
    .replace(/<w:lang[^>]*\/>/gi, '');

  // 2. Safely consolidate and map text runs in paragraphs
  cleanXml = cleanXml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/gi, (pXml) => {
    const tRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/gi;
    let match;
    let fullPText = '';
    while ((match = tRegex.exec(pXml)) !== null) {
      fullPText += match[1];
    }

    if ((fullPText.includes('[') && fullPText.includes(']')) || fullPText.includes('RM XXX') || fullPText.includes('COT XXX') || fullPText.includes('<<')) {
      let replacedText = fullPText
        .replace(/\[CÓDIGO DA OBRA\]/gi, '{obraCodigo}')
        .replace(/\[CODIGO DA OBRA\]/gi, '{obraCodigo}')
        .replace(/\[CÓDIGO_DA_OBRA\]/gi, '{obraCodigo}')
        .replace(/\[NOME DA OBRA\]/gi, '{obraNome}')
        .replace(/\[NOME_DA_OBRA\]/gi, '{obraNome}')
        .replace(/\[ASSUNTO\]/gi, '{assunto}')
        .replace(/\[SERVIÇO\]/gi, '{servico}')
        .replace(/\[SERVICO\]/gi, '{servico}')
        .replace(/\[FORNECEDOR\]/gi, '{fornecedor}')
        .replace(/\[EXTRAIR DO FIRE FLIES\]/gi, '{resumo}')
        .replace(/\[EXTRAIR_DO_FIRE_FLIES\]/gi, '{resumo}')
        .replace(/\[caminho da rede\]/gi, '{linkReuniao}')
        .replace(/\[caminho_da_rede\]/gi, '{linkReuniao}')
        .replace(/RM\s*XXX\s*COT\s*XXX/gi, 'RM {rm} COT {cot}')
        .replace(/RM\s*XXX/gi, 'RM {rm}')
        .replace(/COT\s*XXX/gi, 'COT {cot}')
        .replace(/&lt;&lt;([A-Za-z0-9_.-]+)&gt;&gt;/g, '{$1}')
        .replace(/<<([A-Za-z0-9_.-]+)>>/g, '{$1}')
        .replace(/\[([A-Za-z0-9_.-]+)\]/g, '{$1}');

      if (replacedText !== fullPText) {
        let count = 0;
        return pXml.replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/gi, () => {
          count++;
          if (count === 1) {
            return `<w:t xml:space="preserve">${replacedText}</w:t>`;
          } else {
            return `<w:t></w:t>`;
          }
        });
      }
    }

    return pXml;
  });

  return cleanXml;
}

/**
 * Deterministically renders a DOCX document using the active Firestore template.
 */
export async function renderAtaDocument(
  abertura: any,
  analysisResult: any,
  divergences: any[],
  finalData: any | null,
  transcript: string = '',
  isPreAta: boolean = false
): Promise<{ buffer: Buffer; report: VerificationReport }> {
  // 1. Fetch template from Firestore
  const template = await getActiveTemplateFromDb();
  if (!template || !template.docxBlobBase64) {
    throw new Error(
      'Nenhum Template DOCX foi cadastrado no banco de dados. O template armazenado é a fonte obrigatória para gerar o documento. Por favor, faça o upload de um template no Painel Admin.'
    );
  }

  // 2. Reconcile payload
  const reconciled = reconcilePayload(
    template.schema || null,
    abertura,
    analysisResult,
    divergences,
    finalData,
    transcript,
    isPreAta,
    template.preAtaIntro || ''
  );

  // 3. Log warnings if any
  if (reconciled.warnings && reconciled.warnings.length > 0) {
    addLog('INFO', 'DOCX', `Avisos na preparação do documento: ${reconciled.warnings.join('; ')}`);
  }

  // 4. Load DOCX zip and normalize XML
  const templateBuffer = Buffer.from(template.docxBlobBase64, 'base64');
  const zip = new PizZip(templateBuffer);

  const xmlFiles = Object.keys(zip.files).filter(filename =>
    filename.startsWith('word/') && filename.endsWith('.xml')
  );

  for (const filename of xmlFiles) {
    try {
      const raw = zip.files[filename].asText();
      const normalized = normalizeXmlRunsForDocxtemplater(raw);
      if (raw !== normalized) {
        zip.file(filename, normalized);
      }
    } catch {
      // ignore
    }
  }

  // 5. Configure Docxtemplater
  const payload = reconciled.payload;
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    parser: (tag: string) => {
      const clean = tag.trim();
      return {
        get: (scope: any) => {
          if (!scope) return '';
          if (scope[clean] !== undefined && scope[clean] !== null) return scope[clean];
          
          const lower = clean.toLowerCase();
          for (const key of Object.keys(scope)) {
            if (key.toLowerCase() === lower && scope[key] !== undefined && scope[key] !== null) {
              return scope[key];
            }
          }

          if (payload[clean] !== undefined) return payload[clean];
          for (const key of Object.keys(payload)) {
            if (key.toLowerCase() === lower && payload[key] !== undefined) {
              return payload[key];
            }
          }

          return '';
        }
      };
    },
    nullGetter: () => ''
  });

  doc.render(payload);

  const outputBuffer = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE'
  });

  // 6. Round-trip verification
  const report = await verifyGeneratedDocx(outputBuffer, {
    obraCodigo: payload.obraCodigo,
    fornecedor: payload.fornecedor
  });

  addLog('INFO', 'DOCX', `Documento ${isPreAta ? 'Pré-Ata' : 'Ata Final'} gerado com sucesso (${outputBuffer.length} bytes)`, {
    templateId: template.id,
    templateVersion: template.version,
    isPreAta,
    isVerified: report.isVerified,
    obraCodigo: payload.obraCodigo,
    fornecedor: payload.fornecedor
  });

  return {
    buffer: outputBuffer,
    report
  };
}

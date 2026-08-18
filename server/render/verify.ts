import mammoth from 'mammoth';
import PizZip from 'pizzip';
import { addLog } from '../logger';

export interface VerificationReport {
  isVerified: boolean;
  fileSizeBytes: number;
  foundFields: string[];
  missingFields: string[];
  unresolvedPlaceholders: string[];
  extractedTextSnippet: string;
}

/**
 * Performs a round-trip verification on a newly generated DOCX buffer.
 * Ensures that inserted data actually exists in the output binary and flags
 * any lingering placeholder tokens or corrupt XML.
 */
export async function verifyGeneratedDocx(
  buffer: Buffer,
  expectedValues: Record<string, string>
): Promise<VerificationReport> {
  const foundFields: string[] = [];
  const missingFields: string[] = [];
  const unresolvedPlaceholders: string[] = [];

  let rawText = '';
  try {
    const res = await mammoth.extractRawText({ buffer });
    rawText = (res.value || '').trim();
  } catch (err: any) {
    addLog('WARN', 'DOCX', `Erro na verificação Mammoth: ${err.message}`);
  }

  // Also check document.xml text directly
  let xmlText = '';
  try {
    const zip = new PizZip(buffer);
    const docXml = zip.files['word/document.xml']?.asText() || '';
    xmlText = docXml.replace(/<[^>]+>/g, ' ');
  } catch {
    // ignore
  }

  const combinedText = `${rawText} ${xmlText}`;

  // Check expected key values
  for (const [key, expectedVal] of Object.entries(expectedValues)) {
    if (!expectedVal || expectedVal.trim() === '') continue;
    const cleanExpected = expectedVal.trim().toLowerCase();
    
    if (combinedText.toLowerCase().includes(cleanExpected)) {
      foundFields.push(key);
    } else {
      missingFields.push(key);
    }
  }

  // Detect leftover template tokens like [CÓDIGO DA OBRA] or {obraCodigo}
  const leftoverBracketRegex = /\[(CÓDIGO DA OBRA|NOME DA OBRA|FORNECEDOR|ASSUNTO|SERVIÇO|EXTRAIR DO FIRE FLIES)\]/gi;
  let match;
  while ((match = leftoverBracketRegex.exec(combinedText)) !== null) {
    if (!unresolvedPlaceholders.includes(match[0])) {
      unresolvedPlaceholders.push(match[0]);
    }
  }

  const leftoverCurlyRegex = /\{(obraCodigo|fornecedor|obraNome|assunto|servico|resumo)\}/gi;
  while ((match = leftoverCurlyRegex.exec(combinedText)) !== null) {
    if (!unresolvedPlaceholders.includes(match[0])) {
      unresolvedPlaceholders.push(match[0]);
    }
  }

  const isVerified = missingFields.length === 0 && unresolvedPlaceholders.length === 0;

  addLog(
    isVerified ? 'INFO' : 'WARN',
    'DOCX',
    `Verificação round-trip do DOCX: ${isVerified ? 'SUCESSO' : 'AVISO'} (${buffer.length} bytes)`,
    {
      foundFields,
      missingFields,
      unresolvedPlaceholders,
      fileSizeBytes: buffer.length
    }
  );

  return {
    isVerified,
    fileSizeBytes: buffer.length,
    foundFields,
    missingFields,
    unresolvedPlaceholders,
    extractedTextSnippet: rawText.slice(0, 500)
  };
}

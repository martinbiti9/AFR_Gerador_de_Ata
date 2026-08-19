import mammoth from 'mammoth';
import PizZip from 'pizzip';
import { addLog } from '../logger';
import { appendDebugMd } from '../debugMd';

export interface VerificationReport {
  isVerified: boolean;
  fileSizeBytes: number;
  foundFields: string[];
  missingFields: string[];
  unresolvedPlaceholders: string[];
  structuralErrors: string[];
  extractedTextSnippet: string;
  loopVerification?: {
    expectedRows: number;
    foundRows: number;
    verified: boolean;
  };
}

export class VerificationError extends Error {
  public statusCode = 422;
  public report: VerificationReport;

  constructor(message: string, report: VerificationReport) {
    super(message);
    this.name = 'VerificationError';
    this.report = report;
  }
}

/**
 * Validação estrutural de integridade OpenXML:
 * 1. Verifica se todos os XMLs de word/ podem ser lidos e se tags básicas estão balanceadas.
 * 2. Verifica se toda célula <w:tc> possui ao menos um parágrafo <w:p>.
 */
function verificarEstruturaDocx(buffer: Buffer): string[] {
  const erros: string[] = [];

  try {
    const zip = new PizZip(buffer);
    const xmlTargetPattern = /^word\/.*\.xml$/i;

    for (const fileName in zip.files) {
      if (xmlTargetPattern.test(fileName)) {
        const fileObj = zip.file(fileName);
        if (!fileObj) continue;

        const xmlContent = fileObj.asText();
        if (!xmlContent || xmlContent.trim().length === 0) {
          erros.push(`Arquivo ${fileName} está vazio`);
          continue;
        }

        // 1. Verificação de balanceamento de tags principais
        const openBodyCount = (xmlContent.match(/<w:body\b/g) || []).length;
        const closeBodyCount = (xmlContent.match(/<\/w:body>/g) || []).length;
        if (openBodyCount !== closeBodyCount) {
          erros.push(`Inconsistência de tags <w:body> em ${fileName} (abertos: ${openBodyCount}, fechados: ${closeBodyCount})`);
        }

        // 2. Verificação de células sem parágrafo: <w:tc> sem <w:p>
        const tcRegex = /<w:tc\b[\s\S]*?<\/w:tc>/gi;
        let tcMatch;
        while ((tcMatch = tcRegex.exec(xmlContent)) !== null) {
          const tcXml = tcMatch[0];
          if (!/<w:p[\s\/>]/i.test(tcXml)) {
            erros.push(`Célula de tabela <w:tc> sem parágrafo filho <w:p> encontrada em ${fileName}`);
            break; // Reporta uma vez por arquivo
          }
        }
      }
    }
  } catch (zipErr: any) {
    erros.push(`Falha ao descompactar pacote DOCX: ${zipErr.message}`);
  }

  return erros;
}

/**
 * Realiza uma verificação completa e determinística de qualidade sobre o binário DOCX gerado.
 * Garante que dados inseridos realmente constem na saída, detecta resíduos genéricos de template,
 * valida a integridade estrutural do OpenXML e a amostragem de loops.
 */
export async function verifyGeneratedDocx(
  buffer: Buffer,
  expectedValues: Record<string, string>,
  sampleLoopTexts: string[] = [],
  ataState?: any
): Promise<VerificationReport> {
  const foundFields: string[] = [];
  const missingFields: string[] = [];
  const unresolvedPlaceholders: string[] = [];

  let rawText = '';
  try {
    const res = await mammoth.extractRawText({ buffer });
    rawText = (res.value || '').trim();
  } catch (err: any) {
    addLog('WARN', 'VALIDATOR', `Erro na verificação Mammoth: ${err.message}`);
  }

  // Extrai texto dos XMLs internos diretamente
  let xmlText = '';
  try {
    const zip = new PizZip(buffer);
    for (const fileName in zip.files) {
      if (/^word\/(document|header\d+|footer\d+)\.xml$/i.test(fileName)) {
        const docXml = zip.file(fileName)?.asText() || '';
        xmlText += ' ' + docXml.replace(/<[^>]+>/g, ' ');
      }
    }
  } catch {
    // ignore
  }

  const combinedText = `${rawText} ${xmlText}`;

  // 1. Verificação de campos escalares obrigatórios
  for (const [key, expectedVal] of Object.entries(expectedValues)) {
    if (!expectedVal || expectedVal.trim() === '') continue;
    const cleanExpected = expectedVal.trim().toLowerCase();
    
    if (combinedText.toLowerCase().includes(cleanExpected)) {
      foundFields.push(key);
    } else {
      missingFields.push(key);
    }
  }

  // 2. Amostragem de loops e itens do AtaState
  const samplesToCheck = [...sampleLoopTexts];
  if (samplesToCheck.length === 0 && ataState) {
    if (Array.isArray(ataState.topicos)) {
      for (const t of ataState.topicos.slice(0, 3)) {
        if (t.titulo) samplesToCheck.push(t.titulo);
      }
    } else if (Array.isArray(ataState.agreedItems)) {
      for (const it of ataState.agreedItems.slice(0, 3)) {
        const title = typeof it === 'object' ? (it.titulo || it.descricao) : it;
        if (title) samplesToCheck.push(String(title));
      }
    }
  }

  let foundLoopCount = 0;
  for (const sample of samplesToCheck) {
    if (!sample || sample.trim() === '') continue;
    if (combinedText.toLowerCase().includes(sample.trim().toLowerCase())) {
      foundLoopCount++;
    }
  }

  const loopVerified = samplesToCheck.length === 0 || foundLoopCount > 0;

  // 3. Detecção de Resíduos Genéricos
  const residuePatterns: { name: string; regex: RegExp }[] = [
    { name: 'Tag docxtemplater não resolvida', regex: /\{[#\/^@]?[\w.\-]+\}/g },
    { name: 'Marcador [A INFORMAR]', regex: /\[A INFORMAR\]/gi },
    { name: 'Resíduo XXX', regex: /\bX{3,}\b/g },
    { name: 'Resíduo [xx]', regex: /\[x{2,}\]/gi },
    { name: 'Resíduo R$ XXX', regex: /R\$\s*X+/gi },
    { name: 'Tag de cabeçalho residual', regex: /\[(CÓDIGO DA OBRA|NOME DA OBRA|FORNECEDOR|ASSUNTO|SERVIÇO|EXTRAIR DO FIRE FLIES|caminho da rede)\]/gi }
  ];

  for (const { regex } of residuePatterns) {
    let match;
    while ((match = regex.exec(combinedText)) !== null) {
      const token = match[0];
      if (!unresolvedPlaceholders.includes(token)) {
        unresolvedPlaceholders.push(token);
      }
    }
  }

  // Validação do marcador [A DEFINIR NA REUNIÃO] e [A DEFINIR]:
  // Permitido somente quando há tópicos PENDENTE no AtaState
  const temTopicoPendente = Array.isArray(ataState?.topicos)
    ? ataState.topicos.some((t: any) => t.situacao === 'PENDENTE')
    : (Array.isArray(ataState?.pendingItems) && ataState.pendingItems.length > 0);

  if (!temTopicoPendente) {
    if (/\[A DEFINIR NA REUNIÃO\]/i.test(combinedText)) {
      unresolvedPlaceholders.push('[A DEFINIR NA REUNIÃO] (presente em ata sem tópicos pendentes)');
    }
    if (/\[A DEFINIR\]/i.test(combinedText)) {
      unresolvedPlaceholders.push('[A DEFINIR] (presente em ata sem tópicos pendentes)');
    }
  }

  // 4. Verificação Estrutural OpenXML (<w:tc> sem <w:p> e integridade de arquivos)
  const structuralErrors = verificarEstruturaDocx(buffer);

  // Decisão de Qualidade
  const isVerified = missingFields.length === 0 &&
                     unresolvedPlaceholders.length === 0 &&
                     structuralErrors.length === 0 &&
                     loopVerified;

  const report: VerificationReport = {
    isVerified,
    fileSizeBytes: buffer.length,
    foundFields,
    missingFields,
    unresolvedPlaceholders,
    structuralErrors,
    extractedTextSnippet: rawText.slice(0, 600),
    loopVerification: {
      expectedRows: samplesToCheck.length,
      foundRows: foundLoopCount,
      verified: loopVerified
    }
  };

  // 5. Gravação no Logger Central e em debug/runtime/verificacoes.md
  addLog(
    isVerified ? 'INFO' : 'WARN',
    'VALIDATOR',
    `Relatório de Verificação de Qualidade DOCX: ${isVerified ? 'APROVADO' : 'REPROVADO'} (${buffer.length} bytes)`,
    {
      isVerified,
      foundFields,
      missingFields,
      unresolvedPlaceholders,
      structuralErrors,
      sampleLoopTextsChecked: samplesToCheck.length,
      foundLoopCount
    }
  );

  appendDebugMd('verificacoes.md', `Relatório de Verificação de Qualidade DOCX (${isVerified ? 'APROVADO' : 'REPROVADO'})`, {
    isVerified,
    fileSizeBytes: buffer.length,
    foundFields,
    missingFields,
    unresolvedPlaceholders,
    structuralErrors,
    loopVerification: report.loopVerification,
    timestamp: new Date().toISOString()
  });

  return report;
}

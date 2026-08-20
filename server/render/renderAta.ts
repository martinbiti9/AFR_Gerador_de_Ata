import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { TemplateDocument, TemplateSchema } from '../types/template';
import { getActiveTemplateFromDb } from '../templateRepository';
import { reconcilePayload } from './reconcile';
import { verifyGeneratedDocx, VerificationReport } from './verify';
import { injectLoop } from './injectLoop';
import { extrairBulletNumId } from './richText';
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

export class DocxRenderError extends Error {
  public statusCode = 500;
  public details: any[];

  constructor(message: string, details: any[] = []) {
    super(message);
    this.name = 'DocxRenderError';
    this.details = details;
  }
}

const ARQUIVOS_PERMITIDOS = /^word\/(document|header\d*|footer\d*)\.xml$/;

const norm = (r?: string) => (r || '').replace(/\s+/g, ' ').trim();
const PAR = /<w:r(?:\s[^>]*)?>(<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t><\/w:r>\s*<w:r(?:\s[^>]*)?>(<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t><\/w:r>/g;

/**
 * Passo 1: mescla runs adjacentes com <w:rPr> idêntico, para reunir placeholder fragmentado,
 * sem apagar informações de estilo do documento.
 */
export function mergeAdjacentRuns(xml: string): string {
  if (!xml || typeof xml !== 'string') return xml;

  let out = xml
    .replace(/<w:proofErr(?:\s[^>]*)?\/>/gi, '')
    .replace(/<w:noProof(?:\s[^>]*)?\/>/gi, '')
    .replace(/<w:lastRenderedPageBreak(?:\s[^>]*)?\/>/gi, '')
    .replace(/<w:bookmarkStart(?:\s[^>]*)?\/>/gi, '')
    .replace(/<w:bookmarkEnd(?:\s[^>]*)?\/>/gi, '');

  let antes = '';
  while (antes !== out) {
    antes = out;
    out = out.replace(PAR, (m, r1, t1, r2, t2) =>
      norm(r1) === norm(r2)
        ? `<w:r>${r1 || ''}<w:t xml:space="preserve">${t1}${t2}</w:t></w:r>`
        : m
    );
  }

  return out;
}

/**
 * @deprecated Use aplicarPlaceholderMapEmTextos. Mantida para compatibilidade de importações legadas.
 */
export function aplicarPlaceholderMap(xml: string, mapa: Record<string, string>): string {
  return aplicarPlaceholderMapEmTextos(xml, mapa);
}

/**
 * Passo 2: aplica o mapa de placeholders estritamente dentro de nós <w:t>,
 * preservando tags e atributos OOXML.
 */
export function aplicarPlaceholderMapEmTextos(xml: string, mapa: Record<string, string>): string {
  if (!xml) return xml;
  const defaultMappings: Record<string, string> = {
    '[CÓDIGO DA OBRA]': 'obraCodigo',
    '[CODIGO DA OBRA]': 'obraCodigo',
    '[CÓDIGO_DA_OBRA]': 'obraCodigo',
    '[CODIGO_DA_OBRA]': 'obraCodigo',
    '[NOME DA OBRA]': 'obraNome',
    '[NOME_DA_OBRA]': 'obraNome',
    '[FORNECEDOR]': 'fornecedor',
    '[ASSUNTO]': 'assunto',
    '[SERVIÇO]': 'servico',
    '[SERVICO]': 'servico',
    '[EXTRAIR DO FIRE FLIES]': 'resumo',
    '[EXTRAIR_DO_FIRE_FLIES]': 'resumo',
    '[caminho da rede]': 'linkReuniao',
    '[CAMINHO DA REDE]': 'linkReuniao',
    '[caminho_da_rede]': 'linkReuniao',
    '[CAMINHO_DA_REDE]': 'linkReuniao',
    '<<obraCodigo>>': 'obraCodigo',
    '<<fornecedor>>': 'fornecedor',
    '<<obraNome>>': 'obraNome',
    '<<assunto>>': 'assunto',
    '<<servico>>': 'servico',
  };
  const combinedMap = { ...defaultMappings, ...(mapa || {}) };
  const entries = Object.entries(combinedMap).filter(([k, v]) => Boolean(k && v));

  return xml.replace(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g, (_match, openTag, textContent, closeTag) => {
    let modified = textContent;
    for (const [bruto, chave] of entries) {
      if (!bruto || !chave) continue;
      const tagFormatada = chave.includes('{') ? chave : `{${chave}}`;
      modified = modified.split(bruto).join(tagFormatada);
    }

    // 1. Tratar padrões compostos no texto de cada <w:t> após aplicar o mapa
    modified = modified
      .replace(/RM\s+XXX\b/g, 'RM {rm}')
      .replace(/COT\s+XXX\b/g, 'COT {cot}')
      .replace(/RM\s*:\s*XXX\b/g, 'RM: {rm}')
      .replace(/COT\s*:\s*XXX\b/g, 'COT: {cot}')
      .replace(/\[x+\]/gi, '[A DEFINIR NA REUNIÃO]')
      .replace(/R\$\s*X+/gi, 'R$ [A DEFINIR NA REUNIÃO]')
      .replace(/\bX{3,}\b/g, '[A DEFINIR NA REUNIÃO]');

    return `${openTag}${modified}${closeTag}`;
  });
}

const escXml = (s: unknown) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

/**
 * Converte qualquer placeholder residual, pendência não preenchida ou marcador genérico
 * em runs estilizados em VERMELHO ALERTA (<w:color w:val="C00000"/>).
 */
export function converterPlaceholdersParaRunsVermelhos(xml: string): string {
  if (!xml || typeof xml !== 'string') return xml;

  return xml.replace(/<w:r\b([\s\S]*?)<\/w:r>/gi, (fullRun, runInner) => {
    // Se o run já possui cor de alerta vermelha, mantém como está
    if (/<w:color\b[^>]*w:val="(c00000|ff0000)"/i.test(fullRun)) {
      return fullRun;
    }

    // Extrai w:rPr se existir
    const rPrMatch = runInner.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/i);
    const baseRPr = rPrMatch ? rPrMatch[0] : '';

    // Extrai texto dos nós <w:t>
    const tMatch = runInner.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/i);
    if (!tMatch) {
      return fullRun;
    }

    const originalText = tMatch[1];
    const placeholderPattern = /(\[A INFORMAR\]|\[caminho[\s_]+da[\s_]+rede\]|\[EXTRAIR[\s_]+DO[\s_]+FIRE[\s_]+FLIES\]|\[(?:CÓDIGO|CODIGO|NOME)[\s_]+DA[\s_]+OBRA\]|\[FORNECEDOR\]|\[ASSUNTO\]|\[SERVI[ÇC]O\]|R\$\s*X+|\[x{2,}\]|\bX{3,}\b|\[A DEFINIR NA REUNIÃO\]|\[A DEFINIR\]|\[PENDÊNCIA[^\]]*\])/gi;

    if (!placeholderPattern.test(originalText)) {
      return fullRun;
    }

    const parts = originalText.split(placeholderPattern);
    let resultRuns = '';

    for (const part of parts) {
      if (!part) continue;

      if (placeholderPattern.test(part)) {
        let label = part;
        if (/\[A INFORMAR\]/i.test(part)) {
          label = '[PENDÊNCIA: A informar]';
        } else if (/\[caminho[\s_]+da[\s_]+rede\]/i.test(part)) {
          label = '[PENDÊNCIA: Caminho da rede a informar]';
        } else if (/\[EXTRAIR[\s_]+DO[\s_]+FIRE[\s_]+FLIES\]/i.test(part)) {
          label = '[PENDÊNCIA: Resumo da reunião a informar]';
        } else if (/\[(?:CÓDIGO|CODIGO)[\s_]+DA[\s_]+OBRA\]/i.test(part)) {
          label = '[PENDÊNCIA: Código da obra a informar]';
        } else if (/\[NOME[\s_]+DA[\s_]+OBRA\]/i.test(part)) {
          label = '[PENDÊNCIA: Nome da obra a informar]';
        } else if (/\[FORNECEDOR\]/i.test(part)) {
          label = '[PENDÊNCIA: Fornecedor a informar]';
        } else if (/\[ASSUNTO\]/i.test(part)) {
          label = '[PENDÊNCIA: Assunto a informar]';
        } else if (/\[SERVI[ÇC]O\]/i.test(part)) {
          label = '[PENDÊNCIA: Serviço a informar]';
        } else if (/R\$\s*X+/i.test(part)) {
          label = 'R$ [PENDÊNCIA: A definir]';
        } else if (/\[x{2,}\]|\bX{3,}\b/i.test(part)) {
          label = '[PENDÊNCIA: A definir]';
        } else if (/\[A DEFINIR NA REUNIÃO\]/i.test(part)) {
          label = '[A DEFINIR NA REUNIÃO]';
        } else if (/\[A DEFINIR\]/i.test(part)) {
          label = '[A DEFINIR]';
        }

        const redRPr = baseRPr
          ? (baseRPr.includes('</w:rPr>')
              ? baseRPr.replace('</w:rPr>', '<w:b/><w:color w:val="C00000"/></w:rPr>')
              : `<w:rPr><w:b/><w:color w:val="C00000"/></w:rPr>`)
          : '<w:rPr><w:b/><w:color w:val="C00000"/></w:rPr>';

        resultRuns += `<w:r>${redRPr}<w:t xml:space="preserve">${escXml(label)}</w:t></w:r>`;
      } else {
        resultRuns += `<w:r>${baseRPr}<w:t xml:space="preserve">${part}</w:t></w:r>`;
      }
    }

    return resultRuns || fullRun;
  });
}

/**
 * Renders a DOCX document directly with a provided TemplateDocument and its schema (independent of Firestore).
 */
export async function renderAtaDocumentWithTemplate(
  template: TemplateDocument,
  abertura: any,
  analysisResult: any,
  divergences: any[],
  finalData: any | null,
  transcript: string = '',
  isPreAta: boolean = false
): Promise<{ buffer: Buffer; report: VerificationReport; naoResolvidas?: string[] }> {
  if (!template || !template.docxBlobBase64) {
    throw new Error('Template inválido ou sem conteúdo binário base64.');
  }

  // 1. Load DOCX zip
  const templateBuffer = Buffer.from(template.docxBlobBase64, 'base64');
  const zip = new PizZip(templateBuffer);

  // Detect bulletNumId from numbering.xml if not explicitly defined in schema
  const numberingXml = zip.files['word/numbering.xml']?.asText();
  const detectedBulletNumId = extrairBulletNumId(numberingXml);

  const effectiveSchema: TemplateSchema | undefined = template.schema ? {
    ...template.schema,
    bulletNumId: template.schema.bulletNumId ?? detectedBulletNumId
  } : undefined;

  // 2. Reconcile payload
  const reconciled = reconcilePayload(
    effectiveSchema || null,
    abertura,
    analysisResult,
    divergences,
    finalData,
    transcript,
    isPreAta,
    template.preAtaIntro || ''
  );

  // Check required fields before render
  if (reconciled.missingRequiredFields && reconciled.missingRequiredFields.length > 0) {
    throw new RenderValidationError(
      `Campos obrigatórios não preenchidos: ${reconciled.missingRequiredFields.join(', ')}`,
      reconciled.missingRequiredFields
    );
  }

  // 3. Log warnings if any
  if (reconciled.warnings && reconciled.warnings.length > 0) {
    addLog('INFO', 'DOCX', `Avisos na preparação do documento: ${reconciled.warnings.join('; ')}`);
  }

  const placeholderMap = effectiveSchema?.placeholderMap || {};
  const removerRealceAmarelo = effectiveSchema?.removerRealceAmarelo ?? true;

  const xmlFilenames = Object.keys(zip.files).filter(filename => ARQUIVOS_PERMITIDOS.test(filename));

  for (const filename of xmlFilenames) {
    try {
      let raw = zip.files[filename].asText();
      
      // Step A: Merge adjacent runs with identical rPr
      raw = mergeAdjacentRuns(raw);
      
      // Step B: Apply placeholder map strictly via split/join on <w:t> text nodes
      raw = aplicarPlaceholderMapEmTextos(raw, placeholderMap);
      
      // Step C: Remove yellow highlight only if enabled
      if (removerRealceAmarelo) {
        raw = raw.replace(/<w:highlight w:val="yellow"\s*\/>/g, '');
      }

      zip.file(filename, raw);
    } catch (err: any) {
      addLog('WARN', 'DOCX', `Aviso ao processar XML ${filename}: ${err.message}`);
    }
  }

  // 4. Inject Table Loops into word/document.xml
  let docXml = zip.files['word/document.xml']?.asText() || '';
  if (template.schema?.loops && template.schema.loops.length > 0) {
    const tableIndicesUsed = new Map<number, string>();

    for (const loop of template.schema.loops) {
      if (
        loop.tableIndex !== undefined &&
        loop.prototypeRowIndex !== undefined &&
        loop.columns &&
        loop.columns.length > 0
      ) {
        // Validação de colisão de índices de tabela: cada loop deve apontar para uma tabela distinta
        if (tableIndicesUsed.has(loop.tableIndex)) {
          const outroLoopTag = tableIndicesUsed.get(loop.tableIndex);
          throw new DocxRenderError(
            `Colisão detectada na injeção de loops: o loop "${loop.tag}" e o loop "${outroLoopTag}" apontam para a mesma tabela (índice ${loop.tableIndex}). Cada loop deve apontar para uma tabela distinta.`,
            [{ tag: loop.tag, outroLoop: outroLoopTag, tableIndex: loop.tableIndex }]
          );
        }
        tableIndicesUsed.set(loop.tableIndex, loop.tag);

        try {
          docXml = injectLoop(docXml, {
            tableIndex: loop.tableIndex,
            prototypeRowIndex: loop.prototypeRowIndex,
            loopKey: loop.tag,
            columns: loop.columns,
            removeOtherRows: loop.removeOtherRows ?? false,
          });
        } catch (injectErr: any) {
          addLog('WARN', 'DOCX', `Aviso ao injetar loop "${loop.tag}": ${injectErr.message}`);
          throw new DocxRenderError(`Falha ao injetar loop "${loop.tag}" na tabela ${loop.tableIndex}: ${injectErr.message}`);
        }
      }
    }
    zip.file('word/document.xml', docXml);
  }

  // 5. Configure Docxtemplater without silent swallows
  const payload = reconciled.payload;
  const naoResolvidas = new Set<string>();

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter(part: any) {
      if (part.module) return ''; // Seção ou loop vazio
      naoResolvidas.add(part.value);
      return `[PENDÊNCIA: ${part.value || 'campo'} a informar]`; // NUNCA string vazia para auditoria clara
    },
  });

  try {
    doc.render(payload);
  } catch (e: any) {
    const detalhe = e.properties?.errors?.map((x: any) => ({
      id: x.properties?.id,
      explanation: x.properties?.explanation,
      context: x.properties?.context,
      file: x.properties?.file,
    })) ?? [{ message: e.message }];
    addLog('ERROR', 'DOCX', 'Falha no render do template', { detalhe });
    throw new DocxRenderError('Falha ao renderizar o template', detalhe);
  }

  // Pós-processamento: Converte qualquer pendência residual de placeholder em runs com destaque vermelho (<w:color w:val="C00000"/>)
  const renderedZip = doc.getZip();
  for (const filename of xmlFilenames) {
    try {
      const renderedXml = renderedZip.files[filename]?.asText();
      if (renderedXml) {
        const postProcessedXml = converterPlaceholdersParaRunsVermelhos(renderedXml);
        if (postProcessedXml !== renderedXml) {
          renderedZip.file(filename, postProcessedXml);
        }
      }
    } catch (err: any) {
      addLog('WARN', 'DOCX', `Aviso ao pós-processar XML ${filename} para pendências em vermelho: ${err.message}`);
    }
  }

  // Verify missing required fields from unresolved tags
  if (template.schema?.fields) {
    const obrigatoriasFaltando = template.schema.fields
      .filter(f => f.required && naoResolvidas.has(f.name))
      .map(f => f.name);

    if (obrigatoriasFaltando.length) {
      throw new RenderValidationError(
        `Campos obrigatórios não preenchidos: ${obrigatoriasFaltando.join(', ')}`,
        obrigatoriasFaltando
      );
    }
  }

  const outputBuffer = renderedZip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE'
  });

  // 6. Round-trip verification
  const sampleLoopTexts: string[] = [];
  if (Array.isArray(payload.itens) && payload.itens.length > 0) {
    const firstItem = payload.itens[0];
    if (firstItem.titulo) sampleLoopTexts.push(firstItem.titulo);
    if (firstItem.descricao) sampleLoopTexts.push(firstItem.descricao.slice(0, 30));
  }

  const expectedScalars: Record<string, string> = {};
  if (payload.obraCodigo) expectedScalars.obraCodigo = String(payload.obraCodigo);
  if (payload.fornecedor) expectedScalars.fornecedor = String(payload.fornecedor);

  const report = await verifyGeneratedDocx(outputBuffer, expectedScalars, sampleLoopTexts, finalData || payload);

  addLog('INFO', 'DOCX', `Documento ${isPreAta ? 'Pré-Ata' : 'Ata Final'} gerado com sucesso (${outputBuffer.length} bytes)`, {
    templateId: template.id,
    templateVersion: template.version,
    isPreAta,
    isVerified: report.isVerified,
    obraCodigo: payload.obraCodigo,
    fornecedor: payload.fornecedor,
    naoResolvidas: Array.from(naoResolvidas)
  });

  return {
    buffer: outputBuffer,
    report,
    naoResolvidas: Array.from(naoResolvidas)
  };
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
): Promise<{ buffer: Buffer; report: VerificationReport; naoResolvidas?: string[] }> {
  const template = await getActiveTemplateFromDb();
  if (!template || !template.docxBlobBase64) {
    throw new Error(
      'Nenhum Template DOCX foi cadastrado no banco de dados. O template armazenado é a fonte obrigatória para gerar o documento. Por favor, faça o upload de um template no Painel Admin.'
    );
  }

  return renderAtaDocumentWithTemplate(
    template,
    abertura,
    analysisResult,
    divergences,
    finalData,
    transcript,
    isPreAta
  );
}

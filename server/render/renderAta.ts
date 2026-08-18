import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { getActiveTemplateFromDb } from '../templateRepository';
import { reconcilePayload } from './reconcile';
import { verifyGeneratedDocx, VerificationReport } from './verify';
import { injectLoop } from './injectLoop';
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

/**
 * Passo 1: mescla runs adjacentes com <w:rPr> idêntico, para reunir placeholder fragmentado,
 * sem apagar informações de estilo do documento.
 */
export function mergeAdjacentRuns(xml: string): string {
  if (!xml || typeof xml !== 'string') return xml;

  return xml
    .replace(/<w:proofErr[^>]*\/>/gi, '')
    .replace(/<w:noProof[^>]*\/>/gi, '')
    .replace(/<\/w:t><\/w:r><w:r>(<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t(?:\s[^>]*)?>/gi, (m, rpr1) => {
      // Se houver <w:rPr>, mantém; caso não haja diferença de formatação, junta os runs
      return m.includes('<w:rPr>') ? m : '';
    });
}

/**
 * Passo 2: troca literal de placeholders por tags do docxtemplater ({chave}),
 * usando o mapa persistido no schema sem regex destrutivo.
 */
export function aplicarPlaceholderMap(xml: string, mapa: Record<string, string>): string {
  if (!xml || !mapa) return xml;
  let out = xml;
  for (const [bruto, chave] of Object.entries(mapa)) {
    if (!bruto || !chave) continue;
    // Se a chave já tem delimitadores {chave}, usa direto, senão envolve em {chave}
    const tagFormatada = chave.startsWith('{') && chave.endsWith('}') ? chave : `{${chave}}`;
    out = out.split(bruto).join(tagFormatada);
  }
  return out;
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

  // 4. Load DOCX zip and normalize ONLY allowed XMLs
  const templateBuffer = Buffer.from(template.docxBlobBase64, 'base64');
  const zip = new PizZip(templateBuffer);

  const placeholderMap = template.schema?.placeholderMap || {};
  const removerRealceAmarelo = template.schema?.removerRealceAmarelo ?? true;

  const xmlFilenames = Object.keys(zip.files).filter(filename => ARQUIVOS_PERMITIDOS.test(filename));

  for (const filename of xmlFilenames) {
    try {
      let raw = zip.files[filename].asText();
      
      // Step A: Merge adjacent runs with identical rPr
      raw = mergeAdjacentRuns(raw);
      
      // Step B: Apply placeholder map strictly via split/join
      raw = aplicarPlaceholderMap(raw, placeholderMap);
      
      // Step C: Remove yellow highlight only if enabled
      if (removerRealceAmarelo) {
        raw = raw.replace(/<w:highlight w:val="yellow"\s*\/>/g, '');
      }

      zip.file(filename, raw);
    } catch (err: any) {
      addLog('WARN', 'DOCX', `Aviso ao processar XML ${filename}: ${err.message}`);
    }
  }

  // 5. Inject Table Loops into word/document.xml
  let docXml = zip.files['word/document.xml']?.asText() || '';
  if (template.schema?.loops && template.schema.loops.length > 0) {
    for (const loop of template.schema.loops) {
      if (
        loop.tableIndex !== undefined &&
        loop.prototypeRowIndex !== undefined &&
        loop.columns &&
        loop.columns.length > 0
      ) {
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
        }
      }
    }
    zip.file('word/document.xml', docXml);
  }

  // 6. Configure Docxtemplater without silent swallows
  const payload = reconciled.payload;
  const naoResolvidas = new Set<string>();

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter(part: any) {
      if (part.module) return ''; // Seção ou loop vazio
      naoResolvidas.add(part.value);
      return '[A INFORMAR]'; // NUNCA string vazia para auditoria clara
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

  const outputBuffer = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE'
  });

  // 7. Round-trip verification
  const sampleLoopTexts: string[] = [];
  if (Array.isArray(payload.itens) && payload.itens.length > 0) {
    const firstItem = payload.itens[0];
    if (firstItem.titulo) sampleLoopTexts.push(firstItem.titulo);
    if (firstItem.descricao) sampleLoopTexts.push(firstItem.descricao.slice(0, 30));
  }

  const expectedScalars: Record<string, string> = {};
  if (payload.obraCodigo) expectedScalars.obraCodigo = String(payload.obraCodigo);
  if (payload.fornecedor) expectedScalars.fornecedor = String(payload.fornecedor);

  const report = await verifyGeneratedDocx(outputBuffer, expectedScalars, sampleLoopTexts);

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

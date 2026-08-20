import fs from 'fs';
import path from 'path';
import { TemplateDocument, TemplateSchema, TemplateField, TemplateLoop, TableInspection, TableInspectionRow, VariavelExemplo } from './types/template';
import { addLog } from './logger';
import { initFirebaseAdmin } from './auth';

function getFirestoreInstance() {
  try {
    const { adminDb } = initFirebaseAdmin();
    return adminDb;
  } catch (err) {
    console.warn('Firebase Admin não inicializado para templateRepository:', err);
    return null;
  }
}

const TEMPLATES_COLLECTION = 'templates';
const SYSTEM_CONFIG_COLLECTION = 'config';
const ACTIVE_TEMPLATE_DOC = 'activeTemplate';
const CHUNKS_SUBCOLLECTION = 'chunks';
const CHUNK_SIZE = 350 * 1024; // 350 KB per chunk document (well under Firestore's 1MB doc limit)

// Local fallback file path
const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch {
      // ignore
    }
  }
}

/**
 * Localiza a tabela de corpo principal de 4 colunas com cabeçalho "Item" e "Descrição / Deliberação".
 * Nunca seleciona a tabela de cabeçalho (índice 0).
 */
export function encontrarTabelaCorpo(tables: TableInspection[]): TableInspection | null {
  if (!tables || tables.length === 0) return null;

  const normalize = (s: string) =>
    (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  // 1. Procurar tabela cujo cabeçalho (row 0) tenha 4 colunas e células 0 e 1 iniciando com "item" e "descri"
  for (const tbl of tables) {
    if (tbl.columnCount === 4 && tbl.rows && tbl.rows.length >= 2) {
      const headerCells = tbl.rows[0]?.cells || [];
      const cell0 = normalize(headerCells[0]);
      const cell1 = normalize(headerCells[1]);
      if (cell0.startsWith('item') && cell1.startsWith('descri')) {
        return tbl;
      }
    }
  }

  // 2. Fallback: tabela de 4 colunas com MAIOR rowCount (e rowCount >= 3). NUNCA a tabela 0 por posição.
  const candidatas4Col = tables
    .filter(t => t.index !== 0 && t.columnCount === 4 && t.rowCount >= 3)
    .sort((a, b) => b.rowCount - a.rowCount);

  if (candidatas4Col.length > 0) {
    return candidatas4Col[0];
  }

  // 3. Fallback adicional: qualquer tabela (exceto índice 0) com 4 colunas e ao menos 2 linhas
  const fallback4Col = tables
    .filter(t => t.index !== 0 && t.columnCount === 4 && t.rowCount >= 2)
    .sort((a, b) => b.rowCount - a.rowCount);

  return fallback4Col[0] || null;
}

/**
 * Localiza a tabela de participantes (4 ou 6 colunas cujo cabeçalho contenha "participante").
 */
export function encontrarTabelaParticipantes(tables: TableInspection[]): TableInspection | null {
  if (!tables || tables.length === 0) return null;

  const normalize = (s: string) =>
    (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  // 1. Procurar tabela cujo cabeçalho (row 0) contenha a palavra "participante" (exceto tabela 0)
  for (const tbl of tables) {
    if (tbl.index !== 0 && tbl.rows && tbl.rows.length >= 2) {
      const headerCells = tbl.rows[0]?.cells || [];
      const hasPart = headerCells.some(c => normalize(c).includes('participante'));
      if (hasPart) {
        return tbl;
      }
    }
  }

  // 2. Fallback: qualquer tabela com 6 colunas
  const sixCol = tables.find(t => t.columnCount === 6 && t.rowCount >= 2);
  return sixCol || null;
}

/**
 * Estrutura para os textos padrão extraídos das linhas do template.
 */
export interface TextoPadraoTemplate {
  num: string;
  titulo?: string;
  descricao: string;
  responsavel?: string;
  prazo?: string;
  variaveisExemplo: VariavelExemplo[];
}

const RE_PLACEHOLDER = /\[x+\]|R\$\s*X+|\bX{3,}\b|\bxx\s+dias\b|\[xxx\]/gi;
const RE_BASELINE = /\b\d{1,3}(?:,\d+)?\s*%|\b\d{2,3}\s*dias\b|R\$\s*[\d.,]+\b|\bdias\s+\d{1,2},\s*\d{1,2}\s+ou\s+\d{1,2}\b/g;

function slugCamel(rotulo: string): string {
  return rotulo
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^[^a-zA-Z]+/, '')
    .replace(/^[A-Z]/, c => c.toLowerCase())
    .slice(0, 48);
}

function extrairVariaveisExemplo(texto: string): VariavelExemplo[] {
  const vars: VariavelExemplo[] = [];
  for (const linha of texto.split(/\n|;/)) {
    const rotulo = (linha.split(':')[0] || '').trim().slice(0, 80);
    for (const m of linha.matchAll(RE_PLACEHOLDER)) {
      vars.push({ token: m[0], rotulo, nome: slugCamel(rotulo || m[0]), tipo: 'placeholder' });
    }
    for (const m of linha.matchAll(RE_BASELINE)) {
      vars.push({ token: m[0], rotulo, nome: slugCamel(rotulo || m[0]), tipo: 'baseline' });
    }
  }
  return vars;
}

export function extrairTextosPadraoDoTemplate(
  tabelaCorpo: TableInspection | { rows?: TableInspectionRow[] } | null
): TextoPadraoTemplate[] {
  if (!tabelaCorpo?.rows || tabelaCorpo.rows.length <= 1) return [];

  const resultados: TextoPadraoTemplate[] = [];
  let atual: TextoPadraoTemplate | null = null;

  for (let i = 1; i < tabelaCorpo.rows.length; i++) {
    const cells = tabelaCorpo.rows[i].cells || [];
    const num = (cells[0] || '').trim();
    const conteudo = (cells[1] || '').trim();
    const responsavel = (cells[2] || '').trim() || undefined;
    const prazo = (cells[3] || '').trim() || undefined;
    if (!num && !conteudo && !responsavel && !prazo) continue;

    if (num !== '') {
      if (atual) resultados.push(atual);
      atual = { num, titulo: conteudo, descricao: '', responsavel, prazo, variaveisExemplo: [] };
    } else if (atual) {
      atual.descricao = atual.descricao ? `${atual.descricao}\n${conteudo}` : conteudo;
      atual.responsavel = atual.responsavel || responsavel;
      atual.prazo = atual.prazo || prazo;
    } else {
      atual = { num: '00', titulo: 'Introdução', descricao: conteudo, responsavel, prazo, variaveisExemplo: [] };
    }
  }
  if (atual) resultados.push(atual);

  for (const r of resultados) {
    r.variaveisExemplo = extrairVariaveisExemplo(`${r.titulo || ''}\n${r.descricao}`);
  }
  return resultados;
}

/**
 * Creates a default standard TemplateSchema when a template is uploaded.
 */
export function buildDefaultSchema(
  templateId: string,
  placeholders: string[] = [],
  tables: TableInspection[] = [],
  bulletNumId: number | null = null
): TemplateSchema {
  const standardFields: TemplateField[] = [
    { name: 'obraCodigo', path: 'abertura.obraCodigo', type: 'string', required: true, description: 'Código identificador da obra' },
    { name: 'obraNome', path: 'abertura.obraNome', type: 'string', required: false, description: 'Nome do empreendimento ou condomínio' },
    { name: 'fornecedor', path: 'abertura.fornecedor', type: 'string', required: true, description: 'Razão social ou nome fantasia da contratada' },
    { name: 'assunto', path: 'abertura.assunto', type: 'string', required: false, description: 'Assunto ou tema da negociação' },
    { name: 'servico', path: 'abertura.servico', type: 'string', required: false, description: 'Pacote ou escopo de fornecimento' },
    { name: 'rm', path: 'abertura.rm', type: 'string', required: false, description: 'Número da Requisição de Material (RM)' },
    { name: 'cot', path: 'abertura.cot', type: 'string', required: false, description: 'Número do Mapa de Cotação (COT)' },
    { name: 'dataReuniao', path: 'metadata.dataReuniao', type: 'date', required: false, description: 'Data da realização da reunião' },
    { name: 'linkReuniao', path: 'metadata.linkReuniao', type: 'string', required: false, description: 'Link ou gravação da reunião' },
    { name: 'companyName', path: 'template.companyName', type: 'string', required: false, description: 'Nome corporativo da empresa ou departamento' },
    { name: 'standardClauses', path: 'template.standardClauses', type: 'string', required: false, description: 'Cláusulas padrão de contratação' },
    { name: 'signatures', path: 'template.signatures', type: 'string', required: false, description: 'Participantes e vistos finais' },
    { name: 'resumo', path: 'finalAta.notes', type: 'string', required: false, description: 'Resumo executivo ou notas gerais' },
  ];

  const bodyTable = encontrarTabelaCorpo(tables);
  const partTable = encontrarTabelaParticipantes(tables);

  const standardLoops: TemplateLoop[] = [];

  // Loop 1: Corpo da Ata ('itens')
  if (bodyTable) {
    standardLoops.push({
      tag: 'itens',
      description: 'Tabela principal de deliberações, itens acordados e pendências da reunião',
      tableIndex: bodyTable.index,
      prototypeRowIndex: 1,
      basePPr: bodyTable.basePPr,
      baseRPr: bodyTable.baseRPr,
      columns: [
        { cellIndex: 0, key: 'num', label: 'Item / Número' },
        { cellIndex: 1, key: '@corpoXml', label: 'Conteúdo Formatado OOXML' },
        { cellIndex: 2, key: 'responsavel', label: 'Responsável' },
        { cellIndex: 3, key: 'prazo', label: 'Prazo Limite' }
      ],
      removeOtherRows: true,
      allowEmpty: true,
      itemFields: [
        { name: 'num', path: 'item.num', type: 'string', required: false, description: 'Número do item' },
        { name: 'corpoXml', path: 'item.corpoXml', type: 'string', required: false, description: 'XML formatado de título, deliberação e ressalva' },
        { name: 'titulo', path: 'item.titulo', type: 'string', required: false, description: 'Título do item' },
        { name: 'descricao', path: 'item.descricao', type: 'string', required: false, description: 'Descrição da deliberação' },
        { name: 'responsavel', path: 'item.responsavel', type: 'string', required: false, description: 'Responsável' },
        { name: 'prazo', path: 'item.prazo', type: 'string', required: false, description: 'Prazo limite' }
      ]
    });
  }

  // Loop 2: Participantes ('participantesPares' para 6 colunas ou 'participantes' para 4 colunas)
  if (partTable) {
    if (partTable.columnCount === 6) {
      standardLoops.push({
        tag: 'participantesPares',
        description: 'Lista de presença com participantes dispostos em pares de colunas (6 colunas)',
        tableIndex: partTable.index,
        prototypeRowIndex: 1,
        columns: [
          { cellIndex: 0, key: 'p1Nome', label: 'Participante 1 - Nome' },
          { cellIndex: 1, key: 'p1EmpresaEmail', label: 'Participante 1 - Empresa / E-mail' },
          { cellIndex: 2, key: 'p1Visto', label: 'Participante 1 - Visto' },
          { cellIndex: 3, key: 'p2Nome', label: 'Participante 2 - Nome' },
          { cellIndex: 4, key: 'p2EmpresaEmail', label: 'Participante 2 - Empresa / E-mail' },
          { cellIndex: 5, key: 'p2Visto', label: 'Participante 2 - Visto' }
        ],
        removeOtherRows: true,
        allowEmpty: true,
        itemFields: [
          { name: 'p1Nome', path: 'item.p1Nome', type: 'string', required: false, description: 'Nome do primeiro participante' },
          { name: 'p1EmpresaEmail', path: 'item.p1EmpresaEmail', type: 'string', required: false, description: 'Empresa e email do primeiro participante' },
          { name: 'p1Visto', path: 'item.p1Visto', type: 'string', required: false, description: 'Visto do primeiro participante' },
          { name: 'p2Nome', path: 'item.p2Nome', type: 'string', required: false, description: 'Nome do segundo participante' },
          { name: 'p2EmpresaEmail', path: 'item.p2EmpresaEmail', type: 'string', required: false, description: 'Empresa e email do segundo participante' },
          { name: 'p2Visto', path: 'item.p2Visto', type: 'string', required: false, description: 'Visto do segundo participante' }
        ]
      });
    } else {
      standardLoops.push({
        tag: 'participantes',
        description: 'Lista de presença dos participantes da reunião',
        tableIndex: partTable.index,
        prototypeRowIndex: 1,
        columns: [
          { cellIndex: 0, key: 'nome', label: 'Participante / Nome' },
          { cellIndex: 1, key: 'cargoDepto', label: 'Empresa / Depto' },
          { cellIndex: 2, key: 'email', label: 'E-mail' },
          { cellIndex: 3, key: 'visto', label: 'Visto' }
        ],
        removeOtherRows: true,
        allowEmpty: true,
        itemFields: [
          { name: 'nome', path: 'item.nome', type: 'string', required: false, description: 'Nome do participante' },
          { name: 'cargoDepto', path: 'item.cargoDepto', type: 'string', required: false, description: 'Empresa / Departamento' },
          { name: 'email', path: 'item.email', type: 'string', required: false, description: 'E-mail de contato' },
          { name: 'visto', path: 'item.visto', type: 'string', required: false, description: 'Visto ou assinatura' }
        ]
      });
    }
  }

  // Add any extra detected placeholders as optional string fields if not already present
  for (const tag of placeholders) {
    const clean = tag.replace(/^[#^/@]/, '').trim();
    if (!clean) continue;
    const isLoop = ['topics', 'divergences', 'agreeditems', 'pendingitems', 'participantes', 'itens'].includes(clean.toLowerCase());
    if (isLoop) continue;
    const exists = standardFields.some(f => f.name.toLowerCase() === clean.toLowerCase());
    if (!exists) {
      standardFields.push({
        name: clean,
        path: `custom.${clean}`,
        type: 'string',
        required: false,
        description: `Variável {${clean}} identificada no template`
      });
    }
  }

  const defaultPlaceholderMap: Record<string, string> = {
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
    '<<servico>>': 'servico'
  };

  const now = new Date().toISOString();
  return {
    version: 1,
    templateId,
    fields: standardFields,
    loops: standardLoops,
    placeholderMap: defaultPlaceholderMap,
    removerRealceAmarelo: true,
    bulletNumId: bulletNumId ?? null,
    createdAt: now,
    updatedAt: now,
    generatedBy: 'system'
  };
}

/**
 * Splits a base64 string into chunks if it exceeds chunk size.
 */
function chunkBase64(base64Str: string): string[] {
  const chunks: string[] = [];
  let offset = 0;
  while (offset < base64Str.length) {
    chunks.push(base64Str.slice(offset, offset + CHUNK_SIZE));
    offset += CHUNK_SIZE;
  }
  return chunks;
}

async function fetchDocxBlobFromFirestore(db: any, templateId: string, docData: any): Promise<string | undefined> {
  // 1. Direct base64 if small and stored inline
  if (docData.docxBlobBase64) {
    return docData.docxBlobBase64;
  }
  
  // 2. Fetch from chunks subcollection (supports any file size)
  try {
    const chunksSnap = await db.collection(TEMPLATES_COLLECTION)
      .doc(templateId)
      .collection(CHUNKS_SUBCOLLECTION)
      .orderBy('index', 'asc')
      .get();
      
    if (!chunksSnap.empty) {
      const parts = chunksSnap.docs.map((d: any) => d.data().data || '');
      return parts.join('');
    }
  } catch (err: any) {
    console.warn(`Erro ao ler chunks do template ${templateId} no Firestore:`, err.message);
  }

  // 3. Fallback for legacy blobChunks array
  if (Array.isArray(docData.blobChunks) && docData.blobChunks.length > 0) {
    return docData.blobChunks.join('');
  }

  return undefined;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 10000): Promise<T> {
  let isSettled = false;
  const safePromise = promise.catch(err => {
    if (!isSettled) throw err;
    return undefined as any;
  }).then(res => {
    isSettled = true;
    return res;
  });

  return Promise.race([
    safePromise,
    new Promise<T>((_, reject) => setTimeout(() => { isSettled = true; reject(new Error('Firestore timeout')); }, timeoutMs))
  ]);
}

// Process cache with 60s TTL for active template
let cachedActiveTemplateDoc: TemplateDocument | null = null;
let lastActiveTemplateFetch = 0;
const TEMPLATE_CACHE_TTL_MS = 60 * 1000;

export function invalidateActiveTemplateCache() {
  cachedActiveTemplateDoc = null;
  lastActiveTemplateFetch = 0;
}

/**
 * Reads the active template from Firestore with 60s process cache and auto-invalidation.
 * Falls back to disk only if Firestore is unavailable.
 */
export async function getActiveTemplateFromDb(forceRefresh: boolean = false): Promise<TemplateDocument | null> {
  const now = Date.now();
  if (!forceRefresh && cachedActiveTemplateDoc && (now - lastActiveTemplateFetch < TEMPLATE_CACHE_TTL_MS)) {
    return cachedActiveTemplateDoc;
  }

  const db = getFirestoreInstance();

  if (db) {
    try {
      // 1. Check pointer document config/activeTemplate
      const configDoc = await withTimeout(db.collection(SYSTEM_CONFIG_COLLECTION).doc(ACTIVE_TEMPLATE_DOC).get(), 10000);
      let activeId = configDoc.exists ? (configDoc.data()?.templateId as string) : null;

      if (activeId) {
        const templateDoc = await withTimeout(db.collection(TEMPLATES_COLLECTION).doc(activeId).get(), 10000);
        if (templateDoc.exists) {
          const rawData = templateDoc.data() as any;
          const fullBase64 = await fetchDocxBlobFromFirestore(db, templateDoc.id, rawData);
          cachedActiveTemplateDoc = {
            ...rawData,
            id: templateDoc.id,
            docxBlobBase64: fullBase64,
            schema: rawData.schema || buildDefaultSchema(templateDoc.id, rawData.detectedPlaceholders, rawData.tables)
          } as TemplateDocument;
          lastActiveTemplateFetch = Date.now();
          return cachedActiveTemplateDoc;
        }
      }

      // 2. Query collection templates for isActive == true or highest version
      const snap = await withTimeout(db.collection(TEMPLATES_COLLECTION).get(), 10000);
      if (!snap.empty) {
        let foundDocs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        foundDocs.sort((a, b) => (b.version || 0) - (a.version || 0));
        const active = foundDocs.find(d => d.isActive === true) || foundDocs[0];
        if (active) {
          const fullBase64 = await fetchDocxBlobFromFirestore(db, active.id, active);
          cachedActiveTemplateDoc = {
            ...active,
            docxBlobBase64: fullBase64,
            schema: active.schema || buildDefaultSchema(active.id, active.detectedPlaceholders, active.tables)
          } as TemplateDocument;
          lastActiveTemplateFetch = Date.now();
          return cachedActiveTemplateDoc;
        }
      }
    } catch (err: any) {
      console.warn('Aviso ao consultar template ativo no Firestore:', err.message);
    }
  }

  // Disk fallback
  cachedActiveTemplateDoc = getActiveTemplateFromDisk();
  lastActiveTemplateFetch = Date.now();
  return cachedActiveTemplateDoc;
}

/**
 * Loads all template versions from Firestore.
 */
export async function getAllTemplateVersionsFromDb(): Promise<{
  versions: TemplateDocument[];
  activeId: string;
  activeTemplate: TemplateDocument | null;
  hasTemplate: boolean;
}> {
  const db = getFirestoreInstance();

  if (db) {
    try {
      const snap = await db.collection(TEMPLATES_COLLECTION).get();
      const configDoc = await db.collection(SYSTEM_CONFIG_COLLECTION).doc(ACTIVE_TEMPLATE_DOC).get();
      const configActiveId = configDoc.exists ? (configDoc.data()?.templateId as string) : '';

      if (!snap.empty) {
        const list: TemplateDocument[] = await Promise.all(snap.docs.map(async d => {
          const raw = d.data() as any;
          const fullBlob = await fetchDocxBlobFromFirestore(db, d.id, raw);
          return {
            ...raw,
            id: d.id,
            docxBlobBase64: fullBlob,
            schema: raw.schema || buildDefaultSchema(d.id, raw.detectedPlaceholders, raw.tables)
          };
        }));

        list.sort((a, b) => b.version - a.version);
        const active = list.find(v => v.id === configActiveId) || list.find(v => v.isActive) || list[0];
        const activeId = active ? active.id : '';

        return {
          versions: list,
          activeId,
          activeTemplate: active || null,
          hasTemplate: Boolean(active && active.docxBlobBase64)
        };
      }
    } catch (err: any) {
      console.warn('Aviso ao carregar versões do Firestore:', err.message);
    }
  }

  // Disk fallback
  const diskData = loadPersistedTemplatesFromDisk();
  const active = diskData.versions.find(v => v.id === diskData.activeId) || diskData.versions[0] || null;
  return {
    versions: diskData.versions,
    activeId: active ? active.id : '',
    activeTemplate: active,
    hasTemplate: Boolean(active && active.docxBlobBase64)
  };
}

export const getTemplateVersionsFromDb = getAllTemplateVersionsFromDb;
export const rollbackTemplateInDb = setActiveTemplateInDb;

/**
 * Saves a new template document in Firestore with automated chunking in subcollections.
 * Supports any file size safely and permanently in Firestore.
 */
export async function saveTemplateDocumentToDb(
  data: Omit<TemplateDocument, 'id' | 'version' | 'createdAt' | 'updatedAt' | 'isActive'>
): Promise<TemplateDocument> {
  const db = getFirestoreInstance();
  const allVersions = await getAllTemplateVersionsFromDb();
  const currentMax = allVersions.versions.length > 0
    ? Math.max(...allVersions.versions.map(v => v.version || 0), 0)
    : 0;
  const newVersion = currentMax + 1;
  const newId = `template-v${newVersion}-${Date.now().toString(36)}`;
  const now = new Date().toISOString();

  const generatedSchema = data.schema || buildDefaultSchema(newId, data.detectedPlaceholders, data.tables);

  const rawDocxBase64 = data.docxBlobBase64 || '';
  const chunks = rawDocxBase64 ? chunkBase64(rawDocxBase64) : [];

  const metadataDoc: any = {
    name: data.name,
    description: data.description || '',
    companyName: data.companyName || 'DEPARTAMENTO DE SUPRIMENTOS',
    primaryColor: data.primaryColor || '1F3864',
    tableHeaderBg: data.tableHeaderBg || 'EEEEEE',
    fontFamily: data.fontFamily || 'Arial',
    preAtaIntro: data.preAtaIntro || '',
    standardClauses: data.standardClauses || '',
    signatures: data.signatures || '',
    originalFileName: data.originalFileName,
    fileSizeBytes: data.fileSizeBytes,
    detectedPlaceholders: data.detectedPlaceholders,
    structureSummary: data.structureSummary,
    tables: data.tables,
    rawTextPreview: data.rawTextPreview,
    rawTextFull: (data as any).rawTextFull || '',
    id: newId,
    version: newVersion,
    schema: generatedSchema,
    createdAt: now,
    updatedAt: now,
    isActive: true,
    totalChunks: chunks.length,
    hasChunks: chunks.length > 0
  };

  // 1. Save to Firestore (Root metadata doc + Chunks subcollection)
  if (db) {
    try {
      // Save root metadata doc (tiny, ~10KB)
      await db.collection(TEMPLATES_COLLECTION).doc(newId).set(metadataDoc);

      // Save binary chunks in subcollection (each chunk ~350KB, well under 1MB limit)
      if (chunks.length > 0) {
        const batch = db.batch();
        for (let i = 0; i < chunks.length; i++) {
          const chunkRef = db.collection(TEMPLATES_COLLECTION).doc(newId).collection(CHUNKS_SUBCOLLECTION).doc(`chunk_${String(i).padStart(3, '0')}`);
          batch.set(chunkRef, {
            index: i,
            totalChunks: chunks.length,
            data: chunks[i],
            createdAt: now
          });
        }
        await batch.commit();
      }

      // Set as active template pointer in config
      await db.collection(SYSTEM_CONFIG_COLLECTION).doc(ACTIVE_TEMPLATE_DOC).set({ templateId: newId, updatedAt: now });

      addLog('INFO', 'ADMIN', `Novo Template salvo com sucesso e persistido no Firestore: v${newVersion} (${metadataDoc.name})`, {
        templateId: newId,
        version: newVersion,
        fileName: metadataDoc.originalFileName,
        fileSizeBytes: metadataDoc.fileSizeBytes,
        chunksCount: chunks.length,
        hasSchema: Boolean(metadataDoc.schema)
      });
    } catch (err: any) {
      console.error('Erro ao salvar template no Firestore:', err);
    }
  }

  // 2. Also persist to local disk fallback
  const fullDocumentForDisk: TemplateDocument = {
    ...metadataDoc,
    docxBlobBase64: rawDocxBase64
  };
  saveToDisk(fullDocumentForDisk, newId);
  invalidateActiveTemplateCache();

  return fullDocumentForDisk;
}

/**
 * Sets a specific template version as active in Firestore and disk.
 */
export async function setActiveTemplateInDb(targetId: string): Promise<TemplateDocument> {
  const db = getFirestoreInstance();

  if (db) {
    try {
      let docSnap = await db.collection(TEMPLATES_COLLECTION).doc(targetId).get();
      let raw: any = null;
      let actualId = targetId;

      if (docSnap.exists) {
        raw = docSnap.data();
      } else {
        // Query by id field or version if not matching doc key directly
        const qSnap = await db.collection(TEMPLATES_COLLECTION).where('id', '==', targetId).get();
        if (!qSnap.empty) {
          docSnap = qSnap.docs[0];
          actualId = docSnap.id;
          raw = docSnap.data();
        } else {
          const num = parseInt(targetId.replace(/^v/i, ''), 10);
          if (!isNaN(num)) {
            const vSnap = await db.collection(TEMPLATES_COLLECTION).where('version', '==', num).get();
            if (!vSnap.empty) {
              docSnap = vSnap.docs[0];
              actualId = docSnap.id;
              raw = docSnap.data();
            }
          }
        }
      }

      if (raw) {
        const now = new Date().toISOString();
        
        // 1. Update active pointer doc
        await db.collection(SYSTEM_CONFIG_COLLECTION).doc(ACTIVE_TEMPLATE_DOC).set({ 
          templateId: actualId, 
          activeId: actualId, 
          updatedAt: now,
          updatedBy: 'admin'
        });

        // 2. Update isActive flags across templates
        try {
          const allDocs = await db.collection(TEMPLATES_COLLECTION).get();
          if (!allDocs.empty) {
            const batch = db.batch();
            allDocs.docs.forEach((d: any) => {
              batch.update(d.ref, { isActive: d.id === actualId, updatedAt: now });
            });
            await batch.commit();
          }
        } catch (e: any) {
          console.warn('Aviso ao sincronizar flags isActive no Firestore:', e.message);
        }

        addLog('INFO', 'ADMIN', `Template ativado com sucesso: v${raw.version} - ${raw.name} (${actualId})`, {
          targetId: actualId,
          version: raw.version
        });

        const fullBlob = await fetchDocxBlobFromFirestore(db, actualId, raw);
        invalidateActiveTemplateCache();

        // 3. Keep disk fallback synchronized
        try {
          rollbackDiskTemplate(actualId);
        } catch {
          // ignore disk errors
        }

        return {
          ...raw,
          id: actualId,
          isActive: true,
          docxBlobBase64: fullBlob,
          schema: raw.schema || buildDefaultSchema(actualId, raw.detectedPlaceholders, raw.tables)
        };
      }
    } catch (err: any) {
      console.warn('Erro ao ativar template no Firestore:', err.message);
    }
  }

  // Disk fallback rollback
  invalidateActiveTemplateCache();
  return rollbackDiskTemplate(targetId);
}

/**
 * Updates the TemplateSchema for an existing template in Firestore.
 */
export async function updateTemplateSchemaInDb(templateId: string, schema: TemplateSchema): Promise<TemplateSchema> {
  const db = getFirestoreInstance();
  const now = new Date().toISOString();
  const updatedSchema: TemplateSchema = {
    ...schema,
    templateId,
    updatedAt: now
  };

  if (db) {
    try {
      await db.collection(TEMPLATES_COLLECTION).doc(templateId).set({ schema: updatedSchema, updatedAt: now }, { merge: true });

      addLog('INFO', 'ADMIN', `Schema do Template ${templateId} atualizado no Firestore pelo Administrador`, {
        templateId,
        fieldsCount: updatedSchema.fields.length,
        loopsCount: updatedSchema.loops.length
      });
    } catch (err: any) {
      console.warn('Erro ao atualizar schema no Firestore:', err.message);
    }
  }

  // Update in disk
  updateDiskSchema(templateId, updatedSchema);
  invalidateActiveTemplateCache();

  return updatedSchema;
}

/**
 * Updates the inspected structure and texts of an existing template in Firestore and disk.
 */
export async function updateTemplateInspectionInDb(templateId: string, inspection: any): Promise<void> {
  const db = getFirestoreInstance();
  const now = new Date().toISOString();
  const updateData = {
    tables: inspection.tables,
    rawTextPreview: inspection.rawTextPreview,
    rawTextFull: inspection.rawTextFull || '',
    detectedPlaceholders: inspection.detectedPlaceholders,
    structureSummary: inspection.structureSummary,
    updatedAt: now
  };

  if (db) {
    try {
      await db.collection(TEMPLATES_COLLECTION).doc(templateId).set(updateData, { merge: true });
    } catch (err: any) {
      console.warn('Erro ao atualizar inspeção no Firestore:', err.message);
    }
  }

  // Update in disk
  try {
    const current = loadPersistedTemplatesFromDisk();
    const idx = current.versions.findIndex(v => v.id === templateId);
    if (idx !== -1) {
      current.versions[idx] = {
        ...current.versions[idx],
        ...updateData
      };
      fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(current, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('Erro ao atualizar inspeção em disco:', err);
  }

  invalidateActiveTemplateCache();
}

/**
 * Deletes a template from Firestore and disk storage.
 */
export async function deleteTemplateFromDb(templateId: string): Promise<{ success: boolean; newActiveId: string; remainingCount: number }> {
  invalidateActiveTemplateCache();
  const db = getFirestoreInstance();
  let remainingList: TemplateDocument[] = [];
  let newActiveId = '';

  if (db) {
    try {
      // 1. Delete chunks subcollection
      const chunksSnap = await db.collection(TEMPLATES_COLLECTION).doc(templateId).collection(CHUNKS_SUBCOLLECTION).get();
      if (!chunksSnap.empty) {
        const batch = db.batch();
        chunksSnap.docs.forEach((doc: any) => batch.delete(doc.ref));
        await batch.commit();
      }

      // 2. Delete template document
      await db.collection(TEMPLATES_COLLECTION).doc(templateId).delete();
      
      // 3. Fetch remaining templates
      const remainingSnap = await db.collection(TEMPLATES_COLLECTION).orderBy('version', 'desc').get();
      remainingList = remainingSnap.docs.map(d => ({ id: d.id, ...d.data() } as TemplateDocument));

      // 4. Check active template reference
      const activeDoc = await db.collection(SYSTEM_CONFIG_COLLECTION).doc(ACTIVE_TEMPLATE_DOC).get();
      const currentActiveId = activeDoc.exists ? (activeDoc.data()?.templateId || activeDoc.data()?.activeId) : '';

      if (currentActiveId === templateId || !currentActiveId) {
        newActiveId = remainingList.length > 0 ? remainingList[0].id : '';
        await db.collection(SYSTEM_CONFIG_COLLECTION).doc(ACTIVE_TEMPLATE_DOC).set({
          templateId: newActiveId,
          activeId: newActiveId,
          updatedAt: new Date().toISOString(),
          updatedBy: 'admin'
        });
      } else {
        newActiveId = currentActiveId;
      }

      addLog('INFO', 'ADMIN', `Template ${templateId} excluído com sucesso do Firestore`, {
        deletedId: templateId,
        remainingCount: remainingList.length,
        newActiveId
      });
    } catch (err: any) {
      console.error('Erro ao excluir template do Firestore:', err);
    }
  }

  // Update disk
  const diskRes = deleteFromDisk(templateId);
  if (!newActiveId) {
    newActiveId = diskRes.activeId;
  }

  return {
    success: true,
    newActiveId,
    remainingCount: remainingList.length || diskRes.remainingCount
  };
}

// ================= DISK SYNCHRONIZATION HELPERS =================

function loadPersistedTemplatesFromDisk(): { versions: TemplateDocument[]; activeId: string } {
  try {
    ensureDataDir();
    if (fs.existsSync(TEMPLATES_FILE)) {
      const raw = fs.readFileSync(TEMPLATES_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.versions) && parsed.versions.length > 0) {
        const versions: TemplateDocument[] = parsed.versions.map((t: any) => ({
          ...t,
          schema: t.schema || buildDefaultSchema(t.id, t.detectedPlaceholders, t.tables)
        }));
        return {
          versions,
          activeId: parsed.activeId || versions[0].id
        };
      }
    }
  } catch (err) {
    console.error('Erro ao ler templates do disco:', err);
  }
  return { versions: [], activeId: '' };
}

function saveToDisk(template: TemplateDocument, activeId: string) {
  try {
    ensureDataDir();
    const current = loadPersistedTemplatesFromDisk();
    const updated = [template, ...current.versions.filter(v => v.id !== template.id)].slice(0, 10);
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify({ versions: updated, activeId }, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao salvar template em disco:', err);
  }
}

function rollbackDiskTemplate(targetId: string): TemplateDocument {
  const current = loadPersistedTemplatesFromDisk();
  const target = current.versions.find(t => t.id === targetId);
  if (!target) {
    throw new Error(`Template com ID ${targetId} não encontrado.`);
  }
  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify({ versions: current.versions, activeId: targetId }, null, 2), 'utf-8');
  return target;
}

function updateDiskSchema(templateId: string, schema: TemplateSchema) {
  try {
    const current = loadPersistedTemplatesFromDisk();
    const idx = current.versions.findIndex(v => v.id === templateId);
    if (idx !== -1) {
      current.versions[idx].schema = schema;
      current.versions[idx].updatedAt = new Date().toISOString();
      fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(current, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('Erro ao atualizar schema em disco:', err);
  }
}

function deleteFromDisk(templateId: string): { remainingCount: number; activeId: string } {
  try {
    const current = loadPersistedTemplatesFromDisk();
    const filtered = current.versions.filter(v => v.id !== templateId);
    let activeId = current.activeId;
    if (activeId === templateId) {
      activeId = filtered.length > 0 ? filtered[0].id : '';
    }
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify({ versions: filtered, activeId }, null, 2), 'utf-8');
    return { remainingCount: filtered.length, activeId };
  } catch (err) {
    console.error('Erro ao excluir template do disco:', err);
    return { remainingCount: 0, activeId: '' };
  }
}

function getActiveTemplateFromDisk(): TemplateDocument | null {
  const data = loadPersistedTemplatesFromDisk();
  const active = data.versions.find(v => v.id === data.activeId);
  if (active) return active;
  if (data.versions.length > 0) return data.versions[0];
  return null;
}

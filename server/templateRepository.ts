import fs from 'fs';
import path from 'path';
import { TemplateDocument, TemplateSchema, TemplateField, TemplateLoop, TableInspection } from './types/template';
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
const CHUNK_SIZE = 600 * 1024; // 600 KB per chunk to stay well under 1MB Firestore limit

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
 * Creates a default standard TemplateSchema when a template is uploaded.
 */
export function buildDefaultSchema(
  templateId: string,
  placeholders: string[] = [],
  tables: TableInspection[] = []
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

  // Identify main body table (usually table with 4 columns and largest row count or table 4)
  let mainTableIndex = 0;
  let mainProtoRow = 1;
  let hasMainTable = false;

  if (tables && tables.length > 0) {
    // Find table with 4 columns (Item | Descrição/Corpo | Responsável | Prazo)
    const fourColTbl = tables.find(t => t.columnCount === 4 && t.rowCount >= 2);
    if (fourColTbl) {
      mainTableIndex = fourColTbl.index;
      mainProtoRow = 1;
      hasMainTable = true;
    } else {
      // Find largest table
      const largestTbl = [...tables].sort((a, b) => b.rowCount - a.rowCount)[0];
      if (largestTbl) {
        mainTableIndex = largestTbl.index;
        mainProtoRow = Math.min(1, largestTbl.rowCount - 1);
        hasMainTable = true;
      }
    }
  }

  const standardLoops: TemplateLoop[] = [
    {
      tag: 'itens',
      description: 'Tabela principal de deliberações, itens acordados e pendências da reunião',
      tableIndex: hasMainTable ? mainTableIndex : 0,
      prototypeRowIndex: mainProtoRow,
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
    },
    {
      tag: 'topics',
      description: 'Tabela ou lista de tópicos da Análise de Aderência do Checklist',
      tableIndex: hasMainTable ? mainTableIndex : 0,
      prototypeRowIndex: mainProtoRow,
      columns: [
        { cellIndex: 0, key: 'num', label: 'Item / Número' },
        { cellIndex: 1, key: '@corpoXml', label: 'Conteúdo Formatado' },
        { cellIndex: 2, key: 'responsavel', label: 'Responsável' },
        { cellIndex: 3, key: 'prazo', label: 'Prazo' }
      ],
      removeOtherRows: true,
      allowEmpty: true,
      itemFields: [
        { name: 'num', path: 'item.num', type: 'string', required: false, description: 'Número sequencial' },
        { name: 'title', path: 'item.title', type: 'string', required: true, description: 'Título da regra' },
        { name: 'regraObra', path: 'item.regraObra', type: 'string', required: false, description: 'Regra técnica da obra' },
        { name: 'excecaoAdmitida', path: 'item.excecaoAdmitida', type: 'string', required: false, description: 'Exceção admitida' },
        { name: 'pontoAtencao', path: 'item.pontoAtencao', type: 'string', required: false, description: 'Ponto de atenção destacado', renderOptions: { highlightColor: 'red' } },
        { name: 'perguntaFornecedor', path: 'item.perguntaFornecedor', type: 'string', required: false, description: 'Pergunta ou alinhamento para a reunião' },
        { name: 'source', path: 'item.source', type: 'string', required: false, description: 'Origem da regra no documento' },
      ]
    },
    {
      tag: 'agreedItems',
      description: 'Lista de itens aprovados e acordados na reunião de negociação',
      tableIndex: hasMainTable ? mainTableIndex : 0,
      prototypeRowIndex: mainProtoRow,
      columns: [
        { cellIndex: 0, key: 'num', label: 'Item' },
        { cellIndex: 1, key: '@corpoXml', label: 'Descrição Acordada' },
        { cellIndex: 2, key: 'responsavel', label: 'Responsável' },
        { cellIndex: 3, key: 'prazo', label: 'Prazo' }
      ],
      removeOtherRows: true,
      allowEmpty: true,
      itemFields: [
        { name: 'num', path: 'item.num', type: 'string', required: false, description: 'Número sequencial' },
        { name: 'text', path: 'item.text', type: 'string', required: true, description: 'Descrição do acordo ou deliberação' },
        { name: 'responsavel', path: 'item.responsavel', type: 'string', required: false, description: 'Responsável pelo item' },
        { name: 'prazo', path: 'item.prazo', type: 'string', required: false, description: 'Prazo limite acordado' },
      ]
    },
    {
      tag: 'pendingItems',
      description: 'Lista de pendências remanescentes com destaque em vermelho',
      tableIndex: hasMainTable ? mainTableIndex : 0,
      prototypeRowIndex: mainProtoRow,
      columns: [
        { cellIndex: 0, key: 'num', label: 'Item' },
        { cellIndex: 1, key: '@corpoXml', label: 'Pendência' },
        { cellIndex: 2, key: 'responsavel', label: 'Responsável' },
        { cellIndex: 3, key: 'prazo', label: 'Prazo' }
      ],
      removeOtherRows: true,
      allowEmpty: true,
      itemFields: [
        { name: 'num', path: 'item.num', type: 'string', required: false, description: 'Número sequencial' },
        { name: 'text', path: 'item.text', type: 'string', required: true, description: 'Descrição da pendência', renderOptions: { highlightColor: 'red' } },
        { name: 'responsavel', path: 'item.responsavel', type: 'string', required: false, description: 'Responsável pela pendência' },
        { name: 'prazo', path: 'item.prazo', type: 'string', required: false, description: 'Prazo de conclusão' },
      ]
    }
  ];

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

/**
 * Reassembles chunked base64 strings into a single string.
 */
function reassembleChunks(docData: any): string | undefined {
  if (docData.docxBlobBase64) {
    return docData.docxBlobBase64;
  }
  if (Array.isArray(docData.blobChunks) && docData.blobChunks.length > 0) {
    return docData.blobChunks.join('');
  }
  return undefined;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 2000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), timeoutMs))
  ]);
}

/**
 * Reads the active template directly from Firestore on every call.
 * Falls back to disk only if Firestore is unavailable.
 */
export async function getActiveTemplateFromDb(): Promise<TemplateDocument | null> {
  const db = getFirestoreInstance();

  if (db) {
    try {
      // 1. Check pointer document config/activeTemplate
      const configDoc = await withTimeout(db.collection(SYSTEM_CONFIG_COLLECTION).doc(ACTIVE_TEMPLATE_DOC).get(), 2000);
      let activeId = configDoc.exists ? (configDoc.data()?.templateId as string) : null;

      if (activeId) {
        const templateDoc = await withTimeout(db.collection(TEMPLATES_COLLECTION).doc(activeId).get(), 2000);
        if (templateDoc.exists) {
          const rawData = templateDoc.data() as any;
          const fullBase64 = reassembleChunks(rawData);
          return {
            ...rawData,
            id: templateDoc.id,
            docxBlobBase64: fullBase64,
            schema: rawData.schema || buildDefaultSchema(templateDoc.id, rawData.detectedPlaceholders, rawData.tables)
          } as TemplateDocument;
        }
      }

      // 2. Query collection templates for isActive == true or highest version
      const snap = await withTimeout(db.collection(TEMPLATES_COLLECTION).get(), 2000);
      if (!snap.empty) {
        let foundDocs = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        foundDocs.sort((a, b) => (b.version || 0) - (a.version || 0));
        const active = foundDocs.find(d => d.isActive === true) || foundDocs[0];
        if (active) {
          const fullBase64 = reassembleChunks(active);
          return {
            ...active,
            docxBlobBase64: fullBase64,
            schema: active.schema || buildDefaultSchema(active.id, active.detectedPlaceholders, active.tables)
          } as TemplateDocument;
        }
      }
    } catch (err: any) {
      console.warn('Aviso ao consultar template ativo no Firestore:', err.message);
    }
  }

  // Disk fallback
  return getActiveTemplateFromDisk();
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
        const list: TemplateDocument[] = snap.docs.map(d => {
          const raw = d.data() as any;
          return {
            ...raw,
            id: d.id,
            docxBlobBase64: reassembleChunks(raw),
            schema: raw.schema || buildDefaultSchema(d.id, raw.detectedPlaceholders, raw.tables)
          };
        });

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
 * Saves a new template document in Firestore with automated chunking for payloads > 600KB.
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

  let docxBlobBase64 = data.docxBlobBase64;
  let blobChunks: string[] | undefined;

  if (docxBlobBase64 && docxBlobBase64.length > CHUNK_SIZE) {
    blobChunks = chunkBase64(docxBlobBase64);
    docxBlobBase64 = undefined; // Avoid storing duplicate giant string
  }

  const newDoc: TemplateDocument = {
    ...data,
    id: newId,
    version: newVersion,
    schema: generatedSchema,
    createdAt: now,
    updatedAt: now,
    isActive: true,
    docxBlobBase64,
    blobChunks,
    companyName: data.companyName || 'DEPARTAMENTO DE SUPRIMENTOS'
  };

  // 1. Save to Firestore
  if (db) {
    try {
      await db.collection(TEMPLATES_COLLECTION).doc(newId).set(newDoc);

      // Set as active template pointer in config
      await db.collection(SYSTEM_CONFIG_COLLECTION).doc(ACTIVE_TEMPLATE_DOC).set({ templateId: newId, updatedAt: now });

      addLog('INFO', 'ADMIN', `Novo Template salvo com sucesso no Firestore: v${newVersion} (${newDoc.name})`, {
        templateId: newId,
        version: newVersion,
        fileName: newDoc.originalFileName,
        fileSizeBytes: newDoc.fileSizeBytes,
        hasSchema: Boolean(newDoc.schema)
      });
    } catch (err: any) {
      console.warn('Erro ao salvar template no Firestore:', err.message);
    }
  }

  // 2. Also persist to local disk fallback
  const fullDocumentForDisk: TemplateDocument = {
    ...newDoc,
    docxBlobBase64: data.docxBlobBase64
  };
  saveToDisk(fullDocumentForDisk, newId);

  return fullDocumentForDisk;
}

/**
 * Sets a specific template version as active in Firestore.
 */
export async function setActiveTemplateInDb(targetId: string): Promise<TemplateDocument> {
  const db = getFirestoreInstance();

  if (db) {
    try {
      const docSnap = await db.collection(TEMPLATES_COLLECTION).doc(targetId).get();
      if (docSnap.exists) {
        const raw = docSnap.data() as any;
        const now = new Date().toISOString();
        
        // Update active pointer
        await db.collection(SYSTEM_CONFIG_COLLECTION).doc(ACTIVE_TEMPLATE_DOC).set({ templateId: targetId, updatedAt: now });

        addLog('WARN', 'ADMIN', `Rollback de template realizado no Firestore para a versão v${raw.version} - ${raw.name}`, {
          targetId,
          version: raw.version
        });

        return {
          ...raw,
          id: targetId,
          docxBlobBase64: reassembleChunks(raw),
          schema: raw.schema || buildDefaultSchema(targetId, raw.detectedPlaceholders, raw.tables)
        };
      }
    } catch (err: any) {
      console.warn('Erro ao ativar template no Firestore:', err.message);
    }
  }

  // Disk fallback rollback
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

  return updatedSchema;
}

/**
 * Deletes a template from Firestore and disk storage.
 */
export async function deleteTemplateFromDb(templateId: string): Promise<{ success: boolean; newActiveId: string; remainingCount: number }> {
  const db = getFirestoreInstance();
  let remainingList: TemplateDocument[] = [];
  let newActiveId = '';

  if (db) {
    try {
      // 1. Delete template document
      await db.collection(TEMPLATES_COLLECTION).doc(templateId).delete();
      
      // 2. Fetch remaining templates
      const remainingSnap = await db.collection(TEMPLATES_COLLECTION).orderBy('version', 'desc').get();
      remainingList = remainingSnap.docs.map(d => ({ id: d.id, ...d.data() } as TemplateDocument));

      // 3. Check active template reference
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

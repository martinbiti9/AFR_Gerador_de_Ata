import fs from 'fs';
import path from 'path';
import { addLog } from './logger';
import { initFirebaseAdmin } from './auth';

export interface ModelStageConfig {
  model: string;
  temperature: number; // 0.0 - 2.0 (Criatividade)
  topP: number; // 0.05 - 1.0 (TOP P)
  maxOutputTokens: number; // 512 - 65536 (Tamanho de resposta)
  thinkingBudget: number; // 0 (Desativado / Automático), ou > 0 (Raciocínio)
}

export interface AIModelsConfig {
  checklistModel: string;
  proposalModel: string;
  preAtaModel: string;
  finalAtaModel: string;
  chatbotModel: string;

  checklistParams: ModelStageConfig;
  proposalParams: ModelStageConfig;
  preAtaParams: ModelStageConfig;
  finalAtaParams: ModelStageConfig;
  chatbotParams: ModelStageConfig;
}

export interface CustomPromptsConfig {
  checklistInstructions: string;
  proposalInstructions: string;
  preAtaInstructions: string;
  finalAtaInstructions: string;
  chatbotInstructions: string;
}

export interface DetectedSection {
  title: string;
  type: string;
  description: string;
  fields?: string[];
}

export interface TableSchema {
  name: string;
  columns: string[];
  sampleRowTags: string[];
}

export interface TemplateConfig {
  id: string;
  version: number;
  name: string;
  description: string;
  companyName: string;
  primaryColor?: string;
  tableHeaderBg?: string;
  fontFamily?: string;
  preAtaIntro?: string;
  standardClauses?: string;
  signatures?: string;
  createdAt: string;
  docxBlobBase64?: string;
  originalFileName?: string;
  fileSizeBytes?: number;
  detectedPlaceholders?: string[];
  structureSummary?: string;
  detectedSections?: DetectedSection[];
  tableSchemas?: TableSchema[];
  templateType?: string;
  rawTextPreview?: string;
}

// Persistent file path for local disk cache fallback (cold start only)
const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const CONFIGS_FILE = path.join(DATA_DIR, 'admin_config.json');

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {
    // silent catch
  }
}

function getFirestoreInstance() {
  try {
    const { adminDb } = initFirebaseAdmin();
    return adminDb;
  } catch {
    return null;
  }
}

function loadLocalDiskCache(): { models?: AIModelsConfig; prompts?: CustomPromptsConfig } {
  try {
    ensureDataDir();
    if (fs.existsSync(CONFIGS_FILE)) {
      const raw = fs.readFileSync(CONFIGS_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {
    // silent catch
  }
  return {};
}

function persistLocalDiskCacheSilently(models: AIModelsConfig, prompts: CustomPromptsConfig) {
  try {
    ensureDataDir();
    fs.writeFileSync(CONFIGS_FILE, JSON.stringify({ models, prompts, updatedAt: new Date().toISOString() }, null, 2), 'utf-8');
  } catch {
    // silent catch
  }
}

// In-Memory active defaults
let activeModels: AIModelsConfig = {
  checklistModel: process.env.AI_CHECKLIST_MODEL || 'gemini-3.1-pro-preview',
  proposalModel: process.env.AI_PROPOSAL_MODEL || 'gemini-3.1-pro-preview',
  preAtaModel: process.env.AI_PRE_ATA_MODEL || 'gemini-3.1-pro-preview',
  finalAtaModel: process.env.AI_FINAL_ATA_MODEL || 'gemini-3.1-pro-preview',
  chatbotModel: process.env.AI_CHATBOT_MODEL || 'gemini-3.5-flash',

  checklistParams: {
    model: process.env.AI_CHECKLIST_MODEL || 'gemini-3.1-pro-preview',
    temperature: 0.2,
    topP: 0.95,
    maxOutputTokens: 65536,
    thinkingBudget: 32768,
  },
  proposalParams: {
    model: process.env.AI_PROPOSAL_MODEL || 'gemini-3.1-pro-preview',
    temperature: 0.2,
    topP: 0.95,
    maxOutputTokens: 65536,
    thinkingBudget: 32768,
  },
  preAtaParams: {
    model: process.env.AI_PRE_ATA_MODEL || 'gemini-3.1-pro-preview',
    temperature: 0.2,
    topP: 0.95,
    maxOutputTokens: 65536,
    thinkingBudget: 32768,
  },
  finalAtaParams: {
    model: process.env.AI_FINAL_ATA_MODEL || 'gemini-3.1-pro-preview',
    temperature: 0.2,
    topP: 0.95,
    maxOutputTokens: 65536,
    thinkingBudget: 32768,
  },
  chatbotParams: {
    model: process.env.AI_CHATBOT_MODEL || 'gemini-3.5-flash',
    temperature: 0.7,
    topP: 0.95,
    maxOutputTokens: 16384,
    thinkingBudget: 8192,
  },
};

let activePrompts: CustomPromptsConfig = {
  checklistInstructions: 'As premissas, exigências e conteúdos do Check List devem ser obrigatoriamente enquadrados e categorizados de acordo com a estrutura, seções e tabelas do Template DOCX ativo. Mapeie todas as regras técnicas, operacionais, critérios de medição, logística de canteiro, segurança do trabalho (EPI/PCMSO/ART), retenções e penalidades em tópicos estruturados.',
  proposalInstructions: 'Verifique com rigor desvios de BDI, impostos inclusos/exclusos, reajustes, validade da proposta e condições de pagamento confrontando com o Check List da Obra. Mapeie divergências com severidade (ALTA/MÉDIA/BAIXA) para a pauta da reunião.',
  preAtaInstructions: 'Destaque pontos de atenção em vermelho e elabore perguntas estratégicas para direcionar a mesa de negociação. Estruture os tópicos de aderência para alimentar com fidelidade as variáveis e tabelas do template oficial DOCX salvo pelo usuário.',
  finalAtaInstructions: 'Estruture acordos e pendências com clareza executiva, identificando responsáveis e prazos estritos. OBRIGATÓRIO NA IDENTIFICAÇÃO DE PARTICIPANTES: Identifique apenas nomes e sobrenomes de pessoas físicas reais no campo "nome" (ex: "Thais Louise Barroso", "Carlos Eduardo Silva"). NUNCA utilize cargos, departamentos ou papéis como nomes (ex: "Coordenação...", "Representante...", "Comprador", "Diretoria", "Engenheiro"). Se não houver nome próprio dito na gravação, não preencha como participante nominal.',
  chatbotInstructions: 'Você é um assistente especialista em suprimentos e atas de reunião de uma construtora. Conhece a estrutura de templates DOCX/XML e auxilia no preenchimento de termos contratuais e consulta a atas anteriores.'
};

// Cache TTL State (60 segundos)
const CACHE_TTL_MS = 60 * 1000;
let lastModelsSyncTime = 0;
let lastPromptsSyncTime = 0;

// Cold-start fallback from disk
const coldCache = loadLocalDiskCache();
if (coldCache.models) {
  activeModels = { ...activeModels, ...coldCache.models };
}
if (coldCache.prompts) {
  activePrompts = { ...activePrompts, ...coldCache.prompts };
}

/**
 * Sincroniza Models do Firestore com validação de TTL de 60 segundos.
 */
export async function syncModelsFromFirestore(force: boolean = false): Promise<AIModelsConfig> {
  const now = Date.now();
  if (!force && (now - lastModelsSyncTime < CACHE_TTL_MS)) {
    return { ...activeModels };
  }

  const db = getFirestoreInstance();
  if (!db) {
    return { ...activeModels };
  }

  try {
    const docSnap = await db.collection('config').doc('ai_models').get();
    if (docSnap.exists) {
      const remote = docSnap.data() as AIModelsConfig;
      activeModels = {
        ...activeModels,
        ...remote,
        checklistParams: { ...activeModels.checklistParams, ...(remote.checklistParams || {}) },
        proposalParams: { ...activeModels.proposalParams, ...(remote.proposalParams || {}) },
        preAtaParams: { ...activeModels.preAtaParams, ...(remote.preAtaParams || {}) },
        finalAtaParams: { ...activeModels.finalAtaParams, ...(remote.finalAtaParams || {}) },
        chatbotParams: { ...activeModels.chatbotParams, ...(remote.chatbotParams || {}) },
      };
      lastModelsSyncTime = Date.now();
      persistLocalDiskCacheSilently(activeModels, activePrompts);
    } else {
      // Criação inicial se não existir
      await db.collection('config').doc('ai_models').set({
        ...activeModels,
        updatedAt: new Date().toISOString(),
      });
      lastModelsSyncTime = Date.now();
    }
  } catch (err: any) {
    console.warn('Aviso ao sincronizar ai_models do Firestore:', err.message);
  }

  return { ...activeModels };
}

/**
 * Sincroniza Prompts do Firestore com validação de TTL de 60 segundos.
 */
export async function syncPromptsFromFirestore(force: boolean = false): Promise<CustomPromptsConfig> {
  const now = Date.now();
  if (!force && (now - lastPromptsSyncTime < CACHE_TTL_MS)) {
    return { ...activePrompts };
  }

  const db = getFirestoreInstance();
  if (!db) {
    return { ...activePrompts };
  }

  try {
    const docSnap = await db.collection('config').doc('custom_prompts').get();
    if (docSnap.exists) {
      const remote = docSnap.data() as CustomPromptsConfig;
      activePrompts = { ...activePrompts, ...remote };
      lastPromptsSyncTime = Date.now();
      persistLocalDiskCacheSilently(activeModels, activePrompts);
    } else {
      await db.collection('config').doc('custom_prompts').set({
        ...activePrompts,
        updatedAt: new Date().toISOString(),
      });
      lastPromptsSyncTime = Date.now();
    }
  } catch (err: any) {
    console.warn('Aviso ao sincronizar custom_prompts do Firestore:', err.message);
  }

  return { ...activePrompts };
}

/**
 * Inicialização no boot do servidor.
 */
export async function initializeAdminConfigFromFirestore(): Promise<void> {
  try {
    await Promise.all([
      syncModelsFromFirestore(true),
      syncPromptsFromFirestore(true)
    ]);
    addLog('INFO', 'ADMIN', 'Configurações de Modelos e Prompts sincronizadas do Firestore com sucesso (TTL 60s ativado).');
  } catch (err: any) {
    addLog('WARN', 'ADMIN', `Aviso na sincronização inicial do Firestore: ${err.message}`);
  }
}

export function getActiveModels(): AIModelsConfig {
  // Dispara refresh em background se TTL expirou
  if (Date.now() - lastModelsSyncTime > CACHE_TTL_MS) {
    syncModelsFromFirestore(false).catch(() => {});
  }
  return { ...activeModels };
}
export const getStoredModelsConfig = getActiveModels;

export async function updateActiveModels(models: Partial<AIModelsConfig>): Promise<AIModelsConfig> {
  const updated = { ...activeModels, ...models };

  if (models.checklistParams) {
    updated.checklistParams = { ...activeModels.checklistParams, ...models.checklistParams };
    updated.checklistModel = updated.checklistParams.model || updated.checklistModel;
  } else if (models.checklistModel) {
    updated.checklistParams = { ...updated.checklistParams, model: models.checklistModel };
  }

  if (models.proposalParams) {
    updated.proposalParams = { ...activeModels.proposalParams, ...models.proposalParams };
    updated.proposalModel = updated.proposalParams.model || updated.proposalModel;
  } else if (models.proposalModel) {
    updated.proposalParams = { ...updated.proposalParams, model: models.proposalModel };
  }

  if (models.preAtaParams) {
    updated.preAtaParams = { ...activeModels.preAtaParams, ...models.preAtaParams };
    updated.preAtaModel = updated.preAtaParams.model || updated.preAtaModel;
  } else if (models.preAtaModel) {
    updated.preAtaParams = { ...updated.preAtaParams, model: models.preAtaModel };
  }

  if (models.finalAtaParams) {
    updated.finalAtaParams = { ...activeModels.finalAtaParams, ...models.finalAtaParams };
    updated.finalAtaModel = updated.finalAtaParams.model || updated.finalAtaModel;
  } else if (models.finalAtaModel) {
    updated.finalAtaParams = { ...updated.finalAtaParams, model: models.finalAtaModel };
  }

  if (models.chatbotParams) {
    updated.chatbotParams = { ...activeModels.chatbotParams, ...models.chatbotParams };
    updated.chatbotModel = updated.chatbotParams.model || updated.chatbotModel;
  } else if (models.chatbotModel) {
    updated.chatbotParams = { ...updated.chatbotParams, model: models.chatbotModel };
  }

  activeModels = updated;
  lastModelsSyncTime = Date.now();

  // Firestore é a fonte primária de verdade
  const db = getFirestoreInstance();
  if (db) {
    await db.collection('config').doc('ai_models').set({
      ...activeModels,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  persistLocalDiskCacheSilently(activeModels, activePrompts);
  addLog('INFO', 'ADMIN', 'Modelos de IA e hiperparâmetros atualizados no Firestore', activeModels);
  return { ...activeModels };
}

export function getActivePrompts(): CustomPromptsConfig {
  if (Date.now() - lastPromptsSyncTime > CACHE_TTL_MS) {
    syncPromptsFromFirestore(false).catch(() => {});
  }
  return { ...activePrompts };
}
export const getStoredPrompts = getActivePrompts;

export async function updateActivePrompts(prompts: Partial<CustomPromptsConfig>): Promise<CustomPromptsConfig> {
  activePrompts = { ...activePrompts, ...prompts };
  lastPromptsSyncTime = Date.now();

  const db = getFirestoreInstance();
  if (db) {
    await db.collection('config').doc('custom_prompts').set({
      ...activePrompts,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }

  persistLocalDiskCacheSilently(activeModels, activePrompts);
  addLog('INFO', 'ADMIN', 'Instruções de prompts customizados atualizadas no Firestore', activePrompts);
  return { ...activePrompts };
}

// Invalidação forçada de caches
export function invalidateConfigCaches() {
  lastModelsSyncTime = 0;
  lastPromptsSyncTime = 0;
}

// Template active helper for meetingStore
let cachedActiveTemplate: TemplateConfig | null = null;
let lastTemplateSyncTime = 0;

export function getActiveTemplate(): TemplateConfig | null {
  return cachedActiveTemplate;
}

export function setActiveTemplateCache(template: TemplateConfig | null) {
  cachedActiveTemplate = template;
  lastTemplateSyncTime = Date.now();
}

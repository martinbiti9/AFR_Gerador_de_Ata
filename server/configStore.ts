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

// Persistent file path for templates and configs fallback database
const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');
const CONFIGS_FILE = path.join(DATA_DIR, 'admin_config.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (err) {
      console.error('Erro ao criar pasta data:', err);
    }
  }
}

function getFirestoreInstance() {
  try {
    const { adminDb } = initFirebaseAdmin();
    return adminDb;
  } catch (err) {
    return null;
  }
}

function loadPersistedTemplates(): { versions: TemplateConfig[]; activeId: string } {
  try {
    ensureDataDir();
    if (fs.existsSync(TEMPLATES_FILE)) {
      const raw = fs.readFileSync(TEMPLATES_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.versions) && parsed.versions.length > 0) {
        return {
          versions: parsed.versions,
          activeId: parsed.activeId || parsed.versions[0].id
        };
      }
    }
  } catch (err) {
    console.error('Erro ao carregar templates persistidos do disco:', err);
  }
  return { versions: [], activeId: '' };
}

function persistTemplates(versions: TemplateConfig[], activeId: string) {
  try {
    ensureDataDir();
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify({ versions, activeId }, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao salvar templates no disco:', err);
  }
}

function loadPersistedAdminConfigs(): { models?: AIModelsConfig; prompts?: CustomPromptsConfig } {
  try {
    ensureDataDir();
    if (fs.existsSync(CONFIGS_FILE)) {
      const raw = fs.readFileSync(CONFIGS_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Erro ao carregar admin configs do disco:', err);
  }
  return {};
}

function persistAdminConfigsLocally(models: AIModelsConfig, prompts: CustomPromptsConfig) {
  try {
    ensureDataDir();
    fs.writeFileSync(CONFIGS_FILE, JSON.stringify({ models, prompts, updatedAt: new Date().toISOString() }, null, 2), 'utf-8');
  } catch (err) {
    console.error('Erro ao salvar admin configs no disco:', err);
  }
}

// In-Memory active stores with full parameter configurations (Maximum Tokens & Reasoning by default)
let activeModels: AIModelsConfig = {
  checklistModel: process.env.AI_CHECKLIST_MODEL || 'gemini-3.1-pro-preview',
  proposalModel: process.env.AI_PROPOSAL_MODEL || 'gemini-3.1-pro-preview',
  preAtaModel: process.env.AI_PRE_ATA_MODEL || 'gemini-3.1-pro-preview',
  finalAtaModel: process.env.AI_FINAL_ATA_MODEL || 'gemini-3.1-pro-preview',
  chatbotModel: process.env.AI_CHATBOT_MODEL || 'gemini-3.5-flash',

  checklistParams: {
    model: process.env.AI_CHECKLIST_MODEL || 'gemini-3.1-pro-preview',
    temperature: 0.1,
    topP: 0.95,
    maxOutputTokens: 65536,
    thinkingBudget: 32768,
  },
  proposalParams: {
    model: process.env.AI_PROPOSAL_MODEL || 'gemini-3.1-pro-preview',
    temperature: 0.1,
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
  finalAtaInstructions: 'Estruture acordos e pendências com clareza executiva, identificando responsáveis e prazos estritos. Formate a saída para preencher com precisão as tabelas e variáveis do template DOCX oficial.',
  chatbotInstructions: 'Você é um assistente especialista em suprimentos e atas de reunião de uma construtora. Conhece a estrutura de templates DOCX/XML e auxilia no preenchimento de termos contratuais e consulta a atas anteriores.'
};

// Initialize from local disk cache first
const localCached = loadPersistedAdminConfigs();
if (localCached.models) {
  activeModels = { ...activeModels, ...localCached.models };
}
if (localCached.prompts) {
  activePrompts = { ...activePrompts, ...localCached.prompts };
}

// Initialize persisted templates from database (NO mock template)
const loadedTemplateData = loadPersistedTemplates();
let templateVersions: TemplateConfig[] = loadedTemplateData.versions;
let activeTemplateId: string = loadedTemplateData.activeId;

/**
 * Persists Models and Prompts directly to Firestore collection `config`
 */
async function saveModelsToFirestore(models: AIModelsConfig) {
  try {
    const db = getFirestoreInstance();
    if (!db) return;
    await db.collection('config').doc('ai_models').set({
      ...models,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (err: any) {
    console.warn('Aviso: Falha ao persistir ai_models no Firestore:', err.message);
  }
}

async function savePromptsToFirestore(prompts: CustomPromptsConfig) {
  try {
    const db = getFirestoreInstance();
    if (!db) return;
    await db.collection('config').doc('custom_prompts').set({
      ...prompts,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (err: any) {
    console.warn('Aviso: Falha ao persistir custom_prompts no Firestore:', err.message);
  }
}

/**
 * Initializes Firestore synchronization for administration settings on server startup.
 * If data does not exist in Firestore, performs the initial persistence seed.
 */
export async function initializeAdminConfigFromFirestore(): Promise<void> {
  try {
    const db = getFirestoreInstance();
    if (!db) {
      addLog('WARN', 'ADMIN', 'Firestore indisponível na inicialização, usando armazenamento local.');
      return;
    }

    // 1. Sync AI Models config
    const modelsDocRef = db.collection('config').doc('ai_models');
    const modelsDocSnap = await modelsDocRef.get();

    if (modelsDocSnap.exists) {
      const remoteModels = modelsDocSnap.data() as AIModelsConfig;
      activeModels = {
        ...activeModels,
        ...remoteModels,
        checklistParams: { ...activeModels.checklistParams, ...(remoteModels.checklistParams || {}) },
        proposalParams: { ...activeModels.proposalParams, ...(remoteModels.proposalParams || {}) },
        preAtaParams: { ...activeModels.preAtaParams, ...(remoteModels.preAtaParams || {}) },
        finalAtaParams: { ...activeModels.finalAtaParams, ...(remoteModels.finalAtaParams || {}) },
        chatbotParams: { ...activeModels.chatbotParams, ...(remoteModels.chatbotParams || {}) },
      };
      addLog('INFO', 'ADMIN', 'Configurações de Modelos de IA e Hiperparâmetros hidratados do Firestore com sucesso.');
    } else {
      // First persistence seed to Firestore
      await modelsDocRef.set({
        ...activeModels,
        updatedAt: new Date().toISOString(),
      });
      addLog('INFO', 'ADMIN', 'Primeira persistência de Modelos de IA (65k Tokens / 32k Raciocínio) gravada no Firestore com sucesso.');
    }

    // 2. Sync Custom Prompts config
    const promptsDocRef = db.collection('config').doc('custom_prompts');
    const promptsDocSnap = await promptsDocRef.get();

    if (promptsDocSnap.exists) {
      const remotePrompts = promptsDocSnap.data() as CustomPromptsConfig;
      activePrompts = { ...activePrompts, ...remotePrompts };
      addLog('INFO', 'ADMIN', 'Instruções de Prompts customizados hidratadas do Firestore com sucesso.');
    } else {
      // First persistence seed to Firestore
      await promptsDocRef.set({
        ...activePrompts,
        updatedAt: new Date().toISOString(),
      });
      addLog('INFO', 'ADMIN', 'Primeira persistência de Prompts customizados gravada no Firestore com sucesso.');
    }

    // Persist to local fallback cache
    persistAdminConfigsLocally(activeModels, activePrompts);

  } catch (err: any) {
    addLog('WARN', 'ADMIN', `Erro ao sincronizar configurações de administração no Firestore: ${err.message}`);
  }
}

export function getActiveModels(): AIModelsConfig {
  return { ...activeModels };
}
export const getStoredModelsConfig = getActiveModels;

export function updateActiveModels(models: Partial<AIModelsConfig>): AIModelsConfig {
  // Sync individual model names and parameter sub-objects
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
  
  // Persist both locally and to Firestore
  persistAdminConfigsLocally(activeModels, activePrompts);
  saveModelsToFirestore(activeModels);

  addLog('INFO', 'ADMIN', 'Configurações e hiperparâmetros de Modelos de IA atualizados e salvos no Firestore', activeModels);
  return { ...activeModels };
}

export function getActivePrompts(): CustomPromptsConfig {
  return { ...activePrompts };
}
export const getStoredPrompts = getActivePrompts;

export function updateActivePrompts(prompts: Partial<CustomPromptsConfig>): CustomPromptsConfig {
  activePrompts = { ...activePrompts, ...prompts };
  
  // Persist both locally and to Firestore
  persistAdminConfigsLocally(activeModels, activePrompts);
  savePromptsToFirestore(activePrompts);

  addLog('INFO', 'ADMIN', 'Instruções de Prompt personalizadas atualizadas e salvas no Firestore', activePrompts);
  return { ...activePrompts };
}

export function getTemplateVersions(): { 
  versions: TemplateConfig[]; 
  activeId: string; 
  activeTemplate: TemplateConfig | null;
  hasTemplate: boolean;
} {
  const active = templateVersions.find(t => t.id === activeTemplateId) || (templateVersions.length > 0 ? templateVersions[0] : null);
  return {
    versions: [...templateVersions].sort((a, b) => b.version - a.version),
    activeId: active ? active.id : '',
    activeTemplate: active,
    hasTemplate: Boolean(active && active.docxBlobBase64)
  };
}

export function getActiveTemplate(): TemplateConfig | null {
  const active = templateVersions.find(t => t.id === activeTemplateId);
  if (active) return active;
  if (templateVersions.length > 0) return templateVersions[0];
  return null;
}

export function createNewTemplateVersion(template: Omit<TemplateConfig, 'id' | 'version' | 'createdAt'>): TemplateConfig {
  const currentMaxVersion = templateVersions.length > 0 
    ? Math.max(...templateVersions.map(t => t.version), 0)
    : 0;
  const newVersion = currentMaxVersion + 1;
  const newId = `template-v${newVersion}-${Date.now().toString(36)}`;

  const newEntry: TemplateConfig = {
    ...template,
    id: newId,
    version: newVersion,
    createdAt: new Date().toISOString()
  };

  templateVersions.unshift(newEntry);
  if (templateVersions.length > 10) {
    templateVersions = templateVersions.slice(0, 10);
  }
  activeTemplateId = newId;

  // Persist to database file
  persistTemplates(templateVersions, activeTemplateId);

  addLog('INFO', 'ADMIN', `Nova versão de template DOCX salva e ativada no banco de dados: v${newVersion} - ${newEntry.name}`, {
    templateId: newId,
    version: newVersion,
    fileName: newEntry.originalFileName,
    fileSizeBytes: newEntry.fileSizeBytes
  });

  return newEntry;
}

export function rollbackTemplate(targetId: string): TemplateConfig {
  const target = templateVersions.find(t => t.id === targetId);
  if (!target) {
    throw new Error(`Template com ID ${targetId} não encontrado no banco de dados de templates.`);
  }
  activeTemplateId = target.id;
  persistTemplates(templateVersions, activeTemplateId);
  addLog('WARN', 'ADMIN', `Rollback de template DOCX realizado para a versão v${target.version} - ${target.name}`, {
    targetId,
    version: target.version
  });
  return target;
}

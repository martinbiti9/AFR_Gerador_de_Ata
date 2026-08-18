import fs from 'fs';
import path from 'path';
import { addLog } from './logger';

export interface ModelStageConfig {
  model: string;
  temperature: number; // 0.0 - 2.0 (Criatividade)
  topP: number; // 0.05 - 1.0 (TOP P)
  maxOutputTokens: number; // 512 - 16384 (Tamanho de resposta)
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

// Persistent file path for templates database
const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const TEMPLATES_FILE = path.join(DATA_DIR, 'templates.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (err) {
      console.error('Erro ao criar pasta data:', err);
    }
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

// In-Memory active stores with full parameter configurations
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
    maxOutputTokens: 8192,
    thinkingBudget: 2048,
  },
  proposalParams: {
    model: process.env.AI_PROPOSAL_MODEL || 'gemini-3.1-pro-preview',
    temperature: 0.1,
    topP: 0.95,
    maxOutputTokens: 8192,
    thinkingBudget: 2048,
  },
  preAtaParams: {
    model: process.env.AI_PRE_ATA_MODEL || 'gemini-3.1-pro-preview',
    temperature: 0.2,
    topP: 0.95,
    maxOutputTokens: 8192,
    thinkingBudget: 2048,
  },
  finalAtaParams: {
    model: process.env.AI_FINAL_ATA_MODEL || 'gemini-3.1-pro-preview',
    temperature: 0.2,
    topP: 0.95,
    maxOutputTokens: 8192,
    thinkingBudget: 4096,
  },
  chatbotParams: {
    model: process.env.AI_CHATBOT_MODEL || 'gemini-3.5-flash',
    temperature: 0.7,
    topP: 0.95,
    maxOutputTokens: 4096,
    thinkingBudget: 0,
  },
};

let activePrompts: CustomPromptsConfig = {
  checklistInstructions: 'As premissas, exigências e conteúdos do Check List devem ser obrigatoriamente enquadrados e categorizados de acordo com a estrutura, seções e tabelas do Template DOCX ativo. Mapeie todas as regras técnicas, operacionais, critérios de medição, logística de canteiro, segurança do trabalho (EPI/PCMSO/ART), retenções e penalidades em tópicos estruturados.',
  proposalInstructions: 'Verifique com rigor desvios de BDI, impostos inclusos/exclusos, reajustes, validade da proposta e condições de pagamento confrontando com o Check List da Obra. Mapeie divergências com severidade (ALTA/MÉDIA/BAIXA) para a pauta da reunião.',
  preAtaInstructions: 'Destaque pontos de atenção em vermelho e elabore perguntas estratégicas para direcionar a mesa de negociação. Estruture os tópicos de aderência para alimentar com fidelidade as variáveis e tabelas do template oficial DOCX salvo pelo usuário.',
  finalAtaInstructions: 'Estruture acordos e pendências com clareza executiva, identificando responsáveis e prazos estritos. Formate a saída para preencher com precisão as tabelas e variáveis do template DOCX oficial.',
  chatbotInstructions: 'Você é um assistente especialista em suprimentos e atas de reunião de uma construtora. Conhece a estrutura de templates DOCX/XML e auxilia no preenchimento de termos contratuais e consulta a atas anteriores.'
};

// Initialize persisted templates from database (NO mock template)
const loadedTemplateData = loadPersistedTemplates();
let templateVersions: TemplateConfig[] = loadedTemplateData.versions;
let activeTemplateId: string = loadedTemplateData.activeId;

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
  addLog('INFO', 'ADMIN', 'Configurações e hiperparâmetros de Modelos de IA atualizados pelo Administrador', activeModels);
  return { ...activeModels };
}

export function getActivePrompts(): CustomPromptsConfig {
  return { ...activePrompts };
}
export const getStoredPrompts = getActivePrompts;

export function updateActivePrompts(prompts: Partial<CustomPromptsConfig>): CustomPromptsConfig {
  activePrompts = { ...activePrompts, ...prompts };
  addLog('INFO', 'ADMIN', 'Instruções de Prompt personalizadas atualizadas pelo Administrador', activePrompts);
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
  // Keep only up to 10 versions in memory and disk, with guaranteed last 3 accessible
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

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'member' | 'admin';
  domain: string;
  provider?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
}

export interface AberturaData {
  obraCodigo: string;
  obraNome: string;
  assunto: string;
  servico: string;
  fornecedor: string;
  rm: string;
  cot: string;
}

export type Estilo = 'normal' | 'forte' | 'alerta' | 'ressalva';

export interface Run {
  t: string;
  estilo?: Estilo;
}

export interface Bloco {
  tipo: 'titulo' | 'paragrafo' | 'bullet';
  nivel?: 0 | 1 | 2;
  runs: Run[];
}

export interface TopicCard {
  id: string;
  title: string;
  regraObra: string;
  excecaoAdmitida: string;
  pontoAtencao: string;
  perguntaFornecedor: string;
  source: string;
  blocos?: Bloco[];
}

export interface AnalysisResult {
  tipoFornecimento: string;
  topics: TopicCard[];
}

export interface Divergence {
  id: string;
  description: string;
  severity: 'BAIXA' | 'MEDIA' | 'ALTA';
  source: string;
}

export interface FinalAtaItem {
  num?: string;
  titulo?: string;
  descricao?: string;
  responsavel?: string;
  prazo?: string;
  blocos?: Bloco[];
}

export interface FinalAtaData {
  agreedItems: (string | FinalAtaItem)[];
  pendingItems: (string | FinalAtaItem)[];
  notes: string;
}

export interface AppState {
  meetingId: string | null;
  step: number;
  abertura: AberturaData | null;
  analysisResult: AnalysisResult | null;
  divergences: Divergence[];
  preAtaGenerated: boolean;
  finalAtaText: string;
  finalAtaData: FinalAtaData | null;
  finalAtaGenerated: boolean;
  sonnetAnalysis?: string;
}

export const INITIAL_STATE: AppState = {
  meetingId: null,
  step: 1,
  abertura: null,
  analysisResult: null,
  divergences: [],
  preAtaGenerated: false,
  finalAtaText: '',
  finalAtaData: null,
  finalAtaGenerated: false,
  sonnetAnalysis: '',
};

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
  sonnetModel?: string;
  
  checklistParams?: ModelStageConfig;
  proposalParams?: ModelStageConfig;
  preAtaParams?: ModelStageConfig;
  finalAtaParams?: ModelStageConfig;
  chatbotParams?: ModelStageConfig;
}

export interface CustomPromptsConfig {
  checklistInstructions: string;
  proposalInstructions: string;
  preAtaInstructions: string;
  finalAtaInstructions: string;
  chatbotInstructions: string;
}

export type TemplateFieldType = 'string' | 'number' | 'date' | 'boolean' | 'enum' | 'table';

export interface TemplateFieldRenderOptions {
  highlightColor?: 'red' | 'yellow' | 'none';
  prefix?: string;
  suffix?: string;
  emptyPlaceholder?: string;
  preserveCase?: boolean;
}

export interface TemplateField {
  name: string;
  path: string;
  type: TemplateFieldType;
  required: boolean;
  description: string;
  enumValues?: string[];
  defaultValue?: string | number | boolean;
  renderOptions?: TemplateFieldRenderOptions;
}

export interface LoopColumn {
  cellIndex: number;
  key: string;
  label: string;
}

export interface TemplateLoop {
  tag: string;
  description: string;
  tableIndex?: number;
  prototypeRowIndex?: number;
  columns?: LoopColumn[];
  removeOtherRows?: boolean;
  basePPr?: string;
  baseRPr?: string;
  itemFields: TemplateField[];
  minItems?: number;
  allowEmpty?: boolean;
}

export interface TemplateSchema {
  version: number;
  templateId: string;
  fields: TemplateField[];
  loops: TemplateLoop[];
  placeholderMap?: Record<string, string>;
  removerRealceAmarelo?: boolean;
  createdAt: string;
  updatedAt: string;
  generatedBy: 'system' | 'ai' | 'admin';
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

export interface TableInspectionRow {
  index: number;
  cells: string[];
}

export interface TableInspection {
  index: number;
  rowCount: number;
  columnCount: number;
  rows: TableInspectionRow[];
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
  updatedAt?: string;
  docxBlobBase64?: string;
  blobChunks?: string[];
  originalFileName?: string;
  fileSizeBytes?: number;
  schema?: TemplateSchema;
  detectedPlaceholders?: string[];
  structureSummary?: string;
  detectedSections?: DetectedSection[];
  tableSchemas?: TableSchema[];
  tables?: TableInspection[];
  templateType?: string;
  rawTextPreview?: string;
  isActive?: boolean;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  category: 'AI' | 'DOCX' | 'CHECKLIST' | 'PROPOSAL' | 'SYSTEM' | 'AUTH' | 'ADMIN';
  message: string;
  actorUid?: string;
  actorEmail?: string;
  actorRole?: 'admin' | 'member';
  details?: any;
}

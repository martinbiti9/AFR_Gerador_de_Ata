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

export interface ParticipanteItem {
  id?: string;
  nome: string;
  cargoDepto?: string;
  empresa: string;
  email: string;
  visto?: string;
}

export interface ValoresComerciais {
  valorTotal?: string;
  valorServicos?: string;
  valorIndustrializacao?: string;
  valorVendaMercantil?: string;
  valorLocacao?: string;
  valorFretes?: string;
  valorGerenciamento?: string;
  valorFaturamentoDireto?: string;
  sinalMobilizacao?: string;
  condicaoPagamento?: string;
  retencaoGarantia?: string;
  riscoSacado?: string;
  reajuste?: string;
}

export interface PrazosCronograma {
  mobilizacao?: string;
  elaboracaoProjeto?: string;
  aprovacaoProjeto?: string;
  entregaMaterial?: string;
  medidasDefinitivas?: string;
  fabricacao?: string;
  execucao?: string;
  comissionamento?: string;
  operacaoAssistida?: string;
}

export interface AberturaData {
  obraCodigo: string;
  obraNome: string;
  assunto: string;
  servico: string;
  fornecedor: string;
  rm: string;
  cot: string;
  ataNumero?: string;
  dataReuniao?: string;
  horario?: string;
  local?: string;
  linkReuniao?: string;
  folha?: string;
  participantes?: ParticipanteItem[];
  valoresComerciais?: ValoresComerciais;
  prazosCronograma?: PrazosCronograma;
  resumoExecutivo?: string;
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
  num?: string;
  title: string;
  regraObra: string;
  excecaoAdmitida: string;
  pontoAtencao: string;
  perguntaFornecedor: string;
  responsavel?: string;
  prazo?: string;
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

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  category: 'AUTH' | 'ADMIN' | 'AI' | 'DOCX' | 'SYSTEM' | 'SECURITY';
  message: string;
  details?: any;
}

export interface TemplateAnalysisSection {
  title: string;
  type: string;
  description: string;
  fields?: string[];
}

export interface TemplateAnalysisTable {
  name: string;
  columns: string[];
  sampleRowTags: string[];
}

export interface TemplateAnalysis {
  placeholders: string[];
  summary: string;
  templateType: string;
  detectedSections: TemplateAnalysisSection[];
  tables: TemplateAnalysisTable[];
  suggestedPrompts: {
    checklist?: string;
    proposal?: string;
    preAta?: string;
    finalAta?: string;
  };
}

export interface TemplateVersion {
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
  originalFileName?: string;
  fileSizeBytes?: number;
  detectedPlaceholders?: string[];
  structureSummary?: string;
  detectedSections?: TemplateAnalysisSection[];
  tableSchemas?: TemplateAnalysisTable[];
  templateType?: string;
  rawTextPreview?: string;
  docxBlobBase64?: string;
}

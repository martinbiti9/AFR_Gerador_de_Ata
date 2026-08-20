import { z } from 'zod';

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
  bulletNumId?: number | null;
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

export interface VariavelExemplo {
  token: string;    // literal no template: "[xx]", "R$ XXXX", "5%"
  rotulo: string;   // rótulo inferido do contexto da linha
  nome: string;     // slug camelCase derivado do rótulo
  tipo: 'placeholder' | 'baseline';
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
  basePPr?: string;
  baseRPr?: string;
}

export interface TemplateDocument {
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
  updatedAt: string;
  originalFileName?: string;
  fileSizeBytes?: number;
  docxBlobBase64?: string;
  blobChunks?: string[];
  blobRef?: string;
  schema: TemplateSchema;
  detectedPlaceholders?: string[];
  structureSummary?: string;
  detectedSections?: DetectedSection[];
  tableSchemas?: TableSchema[];
  tables?: TableInspection[];
  templateType?: string;
  rawTextPreview?: string;
  rawTextFull?: string;
  isActive: boolean;
}

// ================= RICH TEXT BLOCKS =================

export type Estilo = 'normal' | 'forte' | 'alerta' | 'ressalva' | 'nota';

export interface Run {
  t: string;
  estilo?: Estilo;
}

export interface Bloco {
  tipo: 'titulo' | 'paragrafo' | 'bullet';
  nivel?: 0 | 1 | 2;
  runs: Run[];
}

// ================= ZOD RUNTIME VALIDATION SCHEMAS =================

export const RunSchema = z.object({
  t: z.string().refine((val) => !/<[a-zA-Z]/.test(val), {
    message: 'Texto do run não pode conter tags HTML ou XML (< seguido de letra).'
  }),
  estilo: z.enum(['normal', 'forte', 'alerta', 'ressalva', 'nota']).optional().default('normal')
});

export const BlocoSchema = z.object({
  tipo: z.enum(['titulo', 'paragrafo', 'bullet']),
  nivel: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  runs: z.array(RunSchema).min(1, 'Bloco deve ter ao menos um run de texto')
});

export const BlocosListSchema = z.array(BlocoSchema).max(8, 'Máximo de 8 blocos por item');

export const TemplateFieldSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  type: z.enum(['string', 'number', 'date', 'boolean', 'enum', 'table']),
  required: z.boolean().default(false),
  description: z.string().default(''),
  enumValues: z.array(z.string()).optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  renderOptions: z.object({
    highlightColor: z.enum(['red', 'yellow', 'none']).optional(),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
    emptyPlaceholder: z.string().optional(),
    preserveCase: z.boolean().optional()
  }).optional()
});

export const LoopColumnSchema = z.object({
  cellIndex: z.number().int().nonnegative(),
  key: z.string().min(1),
  label: z.string().default('')
});

export const TemplateLoopSchema = z.object({
  tag: z.string().min(1),
  description: z.string().default(''),
  tableIndex: z.number().int().nonnegative().optional(),
  prototypeRowIndex: z.number().int().nonnegative().optional(),
  columns: z.array(LoopColumnSchema).optional(),
  removeOtherRows: z.boolean().optional().default(false),
  basePPr: z.string().optional(),
  baseRPr: z.string().optional(),
  itemFields: z.array(TemplateFieldSchema).default([]),
  minItems: z.number().optional(),
  allowEmpty: z.boolean().default(true)
});

export const TemplateSchemaValidation = z.object({
  version: z.number().int().positive(),
  templateId: z.string().min(1),
  fields: z.array(TemplateFieldSchema),
  loops: z.array(TemplateLoopSchema),
  placeholderMap: z.record(z.string(), z.string()).optional(),
  removerRealceAmarelo: z.boolean().optional().default(true),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  generatedBy: z.enum(['system', 'ai', 'admin']).optional().default('admin')
});

export const TemplateSchemaZod = TemplateSchemaValidation;

export const AberturaValidationSchema = z.object({
  obraCodigo: z.string().min(1, 'Código da obra é obrigatório'),
  obraNome: z.string().default(''),
  assunto: z.string().default(''),
  servico: z.string().default(''),
  fornecedor: z.string().min(1, 'Fornecedor é obrigatório'),
  rm: z.string().default(''),
  cot: z.string().default('')
});

export const TopicItemSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  regraObra: z.string().default('N/A'),
  excecaoAdmitida: z.string().default('N/A'),
  pontoAtencao: z.string().default('Nenhum'),
  perguntaFornecedor: z.string().default('N/A'),
  source: z.string().default('Check List'),
  blocos: BlocosListSchema.optional()
});

export const DivergenceItemSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1),
  severity: z.enum(['BAIXA', 'MEDIA', 'ALTA']).default('MEDIA'),
  source: z.string().default('Proposta')
});

export const ParticipanteItemSchema = z.object({
  id: z.string().optional(),
  nome: z.string().default(''),
  cargoDepto: z.string().optional().default(''),
  empresa: z.string().default(''),
  email: z.string().optional().default(''),
  visto: z.string().optional().default('')
});

export const FinalAtaItemSchema = z.object({
  num: z.string().optional(),
  item: z.string().optional(),
  titulo: z.string().optional(),
  descricao: z.string().optional(),
  responsavel: z.string().optional(),
  prazo: z.string().optional(),
  blocos: BlocosListSchema.optional()
});

export const FinalAtaValidationSchema = z.object({
  participantes: z.array(ParticipanteItemSchema).optional().default([]),
  agreedItems: z.array(z.union([z.string(), FinalAtaItemSchema])).default([]),
  pendingItems: z.array(z.union([z.string(), FinalAtaItemSchema])).default([]),
  notes: z.string().default(''),
  resumo: z.string().optional().default('')
});

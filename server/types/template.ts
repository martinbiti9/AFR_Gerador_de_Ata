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

export interface TemplateLoop {
  tag: string;
  description: string;
  itemFields: TemplateField[];
  minItems?: number;
  allowEmpty?: boolean;
}

export interface TemplateSchema {
  version: number;
  templateId: string;
  fields: TemplateField[];
  loops: TemplateLoop[];
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
  templateType?: string;
  rawTextPreview?: string;
  isActive: boolean;
}

// ================= ZOD RUNTIME VALIDATION SCHEMAS =================

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

export const TemplateLoopSchema = z.object({
  tag: z.string().min(1),
  description: z.string().default(''),
  itemFields: z.array(TemplateFieldSchema),
  minItems: z.number().optional(),
  allowEmpty: z.boolean().default(true)
});

export const TemplateSchemaValidation = z.object({
  version: z.number().int().positive(),
  templateId: z.string().min(1),
  fields: z.array(TemplateFieldSchema),
  loops: z.array(TemplateLoopSchema),
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
  source: z.string().default('Check List')
});

export const DivergenceItemSchema = z.object({
  id: z.string().optional(),
  description: z.string().min(1),
  severity: z.enum(['BAIXA', 'MEDIA', 'ALTA']).default('MEDIA'),
  source: z.string().default('Proposta')
});

export const FinalAtaValidationSchema = z.object({
  agreedItems: z.array(z.string()).default([]),
  pendingItems: z.array(z.string()).default([]),
  notes: z.string().default('')
});

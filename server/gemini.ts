import { GoogleGenAI, Type, Schema, FunctionDeclaration } from '@google/genai';
import { PDFParse } from 'pdf-parse';
import * as xlsx from 'xlsx';
import * as mammoth from 'mammoth';
import { getActiveModels, getActivePrompts, ModelStageConfig } from './configStore';
import { getActiveTemplateFromDb } from './templateRepository';
import { getMeetingsFromStore, getMeetingById, MeetingEntity } from './meetingStore';
import { addLog } from './logger';
import { FinalAtaValidationSchema } from './types/template';

let ai: GoogleGenAI | null = null;
function getAI() {
  if (!ai) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is missing');
    }
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return ai;
}

function buildGenAIConfig(params?: ModelStageConfig, extra: any = {}) {
  const cfg: any = {
    ...extra,
    temperature: params?.temperature !== undefined ? params.temperature : 0.2,
    topP: params?.topP !== undefined ? params.topP : 0.95,
  };

  if (params?.maxOutputTokens) {
    cfg.maxOutputTokens = params.maxOutputTokens;
  }

  if (params?.thinkingBudget !== undefined && params.thinkingBudget > 0) {
    cfg.thinkingConfig = { thinkingBudget: params.thinkingBudget };
  } else if (params?.thinkingBudget === 0) {
    cfg.thinkingConfig = { thinkingBudget: 0 };
  }

  return cfg;
}

export async function extractTextFromFile(file: Express.Multer.File): Promise<string> {
  const filename = file.originalname || 'documento';
  const ext = filename.toLowerCase();

  try {
    // 1. PDF Documents (.pdf)
    if (file.mimetype === 'application/pdf' || ext.endsWith('.pdf')) {
      let parsedText = '';
      try {
        const parser = new PDFParse({ data: file.buffer });
        const data = await parser.getText();
        if (data && data.text && data.text.trim().length > 15) {
          parsedText = data.text.trim();
        }
      } catch (pdfErr: any) {
        addLog('WARN', 'AI', `Parser local de PDF encontrou erro (${pdfErr.message}). Acionando Gemini Multimodal OCR para: ${filename}`);
      }

      // If local PDF text is valid, return it
      if (parsedText) {
        return `[Arquivo PDF: ${filename}]\n\n${parsedText}`;
      }

      // Fallback: Gemini Multimodal Vision / Document OCR for scanned or complex PDFs
      try {
        const aiClient = getAI();
        const base64Data = file.buffer.toString('base64');
        const response = await aiClient.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64Data,
              },
            },
            'Extraia e transcreva com máxima fidelidade todo o conteúdo textual e informações deste documento PDF, preservando a ordem dos tópicos, valores, tabelas e deliberações.',
          ],
        });

        if (response.text && response.text.trim().length > 0) {
          addLog('INFO', 'AI', `Texto extraído via Gemini Multimodal OCR com sucesso para o PDF: ${filename}`);
          return `[Arquivo PDF (OCR): ${filename}]\n\n${response.text.trim()}`;
        }
      } catch (geminiPdfErr: any) {
        addLog('ERROR', 'AI', `Falha na extração com Gemini do PDF ${filename}: ${geminiPdfErr.message}`);
      }

      return `[Arquivo PDF: ${filename}]\n(Documento processado sem texto extraível)`;
    }

    // 2. Excel Spreadsheets (.xlsx, .xls)
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      ext.endsWith('.xlsx') ||
      ext.endsWith('.xls')
    ) {
      const workbook = xlsx.read(file.buffer, { type: 'buffer' });
      let text = `[Arquivo Excel: ${filename}]\n\n`;
      workbook.SheetNames.forEach(sheetName => {
        text += `--- Aba: ${sheetName} ---\n`;
        const sheet = workbook.Sheets[sheetName];
        const json = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        text += json.map((row: any) => row.join(' | ')).join('\n');
        text += '\n\n';
      });
      return text.trim();
    }

    // 3. Word Documents (.docx)
    if (
      file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
      ext.endsWith('.docx')
    ) {
      try {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        return `[Arquivo DOCX: ${filename}]\n\n${result.value || ''}`.trim();
      } catch (docxErr: any) {
        addLog('WARN', 'AI', `Erro ao extrair DOCX ${filename}: ${docxErr.message}`);
      }
    }

    // 4. Plain Text, Markdown, CSV, etc.
    try {
      const raw = file.buffer.toString('utf-8');
      return `[Arquivo: ${filename}]\n\n${raw}`;
    } catch {
      return `[Arquivo: ${filename}]\n(Formato binário sem texto legível)`;
    }
  } catch (err: any) {
    addLog('ERROR', 'AI', `Erro ao extrair texto do arquivo: ${filename}`, { error: err.message });
    return `[Arquivo: ${filename}]\n(Erro ao extrair: ${err.message})`;
  }
}

const checklistSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    tipoFornecimento: {
      type: Type.STRING,
      description: "Classificação do fornecimento: serviço com mão de obra, material com instalação, venda mercantil, industrialização, locação, projeto."
    },
    topics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Título do tópico" },
          regraObra: { type: Type.STRING, description: "Regra da obra extraída do documento" },
          excecaoAdmitida: { type: Type.STRING, description: "Exceção admitida" },
          pontoAtencao: { type: Type.STRING, description: "Ponto de atenção" },
          perguntaFornecedor: { type: Type.STRING, description: "Pergunta a fazer ao fornecedor" },
          source: { type: Type.STRING, description: "Origem da informação (Ex: PDF pág 2, Excel aba X)" }
        },
        required: ["title", "regraObra", "excecaoAdmitida", "pontoAtencao", "perguntaFornecedor", "source"]
      }
    }
  },
  required: ["tipoFornecimento", "topics"]
};

export async function analyzeChecklist(files: Express.Multer.File[], customInstructionsOverride?: string) {
  const models = getActiveModels();
  const prompts = getActivePrompts();
  const params = models.checklistParams || {
    model: models.checklistModel || 'gemini-3.1-pro-preview',
    temperature: 0.1,
    topP: 0.95,
    maxOutputTokens: 8192,
    thinkingBudget: 2048,
  };
  const modelToUse = params.model || models.checklistModel || 'gemini-3.1-pro-preview';
  const customInstructions = customInstructionsOverride || prompts.checklistInstructions || '';

  addLog('INFO', 'CHECKLIST', `Iniciando análise de Checklist com modelo ${modelToUse}`, {
    fileCount: files.length,
    filenames: files.map(f => f.originalname),
    model: modelToUse,
    params: {
      temperature: params.temperature,
      topP: params.topP,
      maxOutputTokens: params.maxOutputTokens,
      thinkingBudget: params.thinkingBudget
    },
    customInstructionsApplied: !!customInstructions
  });

  const contents = await Promise.all(files.map(extractTextFromFile));
  const fullText = contents.join('\n\n====================\n\n');
  const activeTemplate = await getActiveTemplateFromDb();
  const templateName = activeTemplate?.name || 'Ata Padrão de Suprimentos';
  const templateVersion = activeTemplate?.version || 1;
  const templatePlaceholders = activeTemplate?.detectedPlaceholders?.join(', ') || 'obraCodigo, obraNome, fornecedor, servico, assunto, rm, cot, topics, divergences, agreedItems, pendingItems';

  const prompt = `Você é um Agente de Atas de Compras de uma construtora.
Abaixo estão os textos extraídos de arquivos PDF e Excel do Check List da obra.
O documento final utilizará o template DOCX ativo ("${templateName}", v${templateVersion}).
Campos identificados no template de ata: [${templatePlaceholders}].

Sua tarefa é:
1. Classificar o tipo de fornecimento (serviço com mão de obra, material com instalação, venda mercantil, industrialização, locação, projeto).
2. Gerar uma "Análise de Aderência" criando tópicos relevantes para preencher perfeitamente os campos do template DOCX ({topics}, {regraObra}, {excecaoAdmitida}, {pontoAtencao}, {perguntaFornecedor}).
Para cada tópico extraia: Regra da obra, Exceção admitida, Ponto de atenção e Pergunta a fazer ao fornecedor.
Indique sempre a origem da informação (ex: "PDF pág 3", ou "Excel aba Resumo").
IMPORTANTE: Nunca invente valores, prazos, percentuais ou nomes que não estejam nos documentos. Use "[A DEFINIR NA REUNIÃO]" caso a informação não esteja presente.

${customInstructions ? `--- DIRETRIZES PERSONALIZADAS DO ADMINISTRADOR ---\n${customInstructions}\n` : ''}

Documentos Submetidos:
${fullText}
`;

  try {
    const aiClient = getAI();
    const config = buildGenAIConfig(params, {
      responseMimeType: 'application/json',
      responseSchema: checklistSchema,
    });

    const response = await aiClient.models.generateContent({
      model: modelToUse,
      contents: prompt,
      config: config
    });

    const text = response.text || "{}";
    const result = JSON.parse(text);
    
    // Add IDs to topics
    result.topics = (result.topics || []).map((t: any) => ({ ...t, id: Math.random().toString(36).substring(7) }));
    
    addLog('INFO', 'CHECKLIST', `Análise de Checklist finalizada com sucesso. Tópicos gerados: ${result.topics?.length || 0}`, {
      tipoFornecimento: result.tipoFornecimento,
      topicCount: result.topics?.length || 0
    });

    return result;
  } catch (error: any) {
    addLog('ERROR', 'CHECKLIST', `Falha na análise de Checklist: ${error.message}`, { error: error.stack });
    throw error;
  }
}

const proposalSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      description: { type: Type.STRING, description: "Descrição da divergência encontrada" },
      severity: { type: Type.STRING, enum: ["BAIXA", "MEDIA", "ALTA"], description: "Severidade da divergência" },
      source: { type: Type.STRING, description: "Origem (onde na proposta está essa divergência)" }
    },
    required: ["description", "severity", "source"]
  }
};

export async function analyzeProposal(files: Express.Multer.File[], checklist: any, customInstructionsOverride?: string) {
  const models = getActiveModels();
  const prompts = getActivePrompts();
  const params = models.proposalParams || {
    model: models.proposalModel || 'gemini-3.1-pro-preview',
    temperature: 0.1,
    topP: 0.95,
    maxOutputTokens: 8192,
    thinkingBudget: 2048,
  };
  const modelToUse = params.model || models.proposalModel || 'gemini-3.1-pro-preview';
  const customInstructions = customInstructionsOverride || prompts.proposalInstructions || '';

  addLog('INFO', 'PROPOSAL', `Iniciando análise de Proposta Comercial com modelo ${modelToUse}`, {
    fileCount: files.length,
    filenames: files.map(f => f.originalname),
    model: modelToUse,
    params: {
      temperature: params.temperature,
      topP: params.topP,
      maxOutputTokens: params.maxOutputTokens,
      thinkingBudget: params.thinkingBudget
    }
  });

  const contents = await Promise.all(files.map(extractTextFromFile));
  const fullText = contents.join('\n\n====================\n\n');
  const activeTemplate = await getActiveTemplateFromDb();
  const templateName = activeTemplate?.name || 'Ata Padrão de Suprimentos';

  const prompt = `Você é um Agente de Atas de Compras de uma construtora.
Abaixo estão os textos extraídos da proposta do fornecedor e complementos.
Também forneço a "Análise de Aderência" gerada anteriormente no formato JSON.
O objetivo é extrair divergências e condições comerciais para preencher a seção de divergências e pontos de negociação ({divergences}) do template DOCX ativo ("${templateName}").
Sua tarefa é comparar a proposta com a Análise de Aderência e listar todas as divergências.
Para cada divergência, dê a descrição, a severidade (BAIXA, MEDIA, ALTA) e a origem na proposta.
IMPORTANTE: Não invente dados. Seja estrito.

${customInstructions ? `--- DIRETRIZES PERSONALIZADAS DO ADMINISTRADOR ---\n${customInstructions}\n` : ''}

Checklist (Análise de Aderência):
${JSON.stringify(checklist, null, 2)}

Documentos (Proposta e Complementos):
${fullText}
`;

  try {
    const aiClient = getAI();
    const config = buildGenAIConfig(params, {
      responseMimeType: 'application/json',
      responseSchema: proposalSchema,
    });

    const response = await aiClient.models.generateContent({
      model: modelToUse,
      contents: prompt,
      config: config
    });

    const text = response.text || "[]";
    const result = JSON.parse(text);
    const mapped = result.map((r: any) => ({ ...r, id: Math.random().toString(36).substring(7) }));

    addLog('INFO', 'PROPOSAL', `Análise de divergências concluída. Divergências identificadas: ${mapped.length}`, {
      divergencesCount: mapped.length
    });

    return mapped;
  } catch (error: any) {
    addLog('ERROR', 'PROPOSAL', `Falha na análise de proposta: ${error.message}`, { error: error.stack });
    throw error;
  }
}

const finalAtaSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    agreedItems: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Itens que foram acordados na reunião"
    },
    pendingItems: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Itens que ficaram pendentes para definição futura"
    },
    notes: {
      type: Type.STRING,
      description: "Anotações gerais e resumo da reunião"
    }
  },
  required: ["agreedItems", "pendingItems", "notes"]
};

export async function generateFinalAta(abertura: any, analysisResult: any, divergences: any, transcript: string, customInstructionsOverride?: string) {
  const models = getActiveModels();
  const prompts = getActivePrompts();
  const params = models.finalAtaParams || {
    model: models.finalAtaModel || 'gemini-3.1-pro-preview',
    temperature: 0.2,
    topP: 0.95,
    maxOutputTokens: 8192,
    thinkingBudget: 4096,
  };
  const modelToUse = params.model || models.finalAtaModel || 'gemini-3.1-pro-preview';
  const customInstructions = customInstructionsOverride || prompts.finalAtaInstructions || '';

  addLog('INFO', 'AI', `Iniciando geração de Ata Final com modelo ${modelToUse}`, {
    model: modelToUse,
    params: {
      temperature: params.temperature,
      topP: params.topP,
      maxOutputTokens: params.maxOutputTokens,
      thinkingBudget: params.thinkingBudget
    },
    transcriptLength: transcript.length
  });

  const activeTemplate = await getActiveTemplateFromDb();
  const templateName = activeTemplate?.name || 'Ata Padrão de Suprimentos';
  const templateVersion = activeTemplate?.version || 1;
  const templateFields = activeTemplate?.detectedPlaceholders?.join(', ') || 'agreedItems, pendingItems, notes, signatures';

  const prompt = `Você é um Agente Especialista Sênior em Engenharia de Suprimentos e Auditoria Contratual para Construção Civil.
Sua missão é estruturar os dados oficiais para preenchimento da Ata Final de Reunião no template DOCX ("${templateName}", v${templateVersion}).

VOCÊ DEVE OBRIGATORIAMENTE INTEGRAR E CRUZAR TODAS AS FONTES DE DADOS:
1. CONTEXTO DO CHECKLIST (Análise de Aderência Técnica e Normativa do Caderno de Encargos - Etapa 2):
   Verifique quais itens técnicos e exigências contratuais foram validados ou demandavam alinhamento.
2. CONTEXTO DE PROPOSTAS E COMPLEMENTOS (Análise de Divergências Comerciais e Cláusulas - Etapa 3):
   Cruze as divergências comerciais, prazos, formas de pagamento, medições e eventuais complementos com as negociações da reunião.
3. TRANSCRIÇÃO DA REUNIÃO DE NEGOCIAÇÃO (Etapa 5):
   Identifique o desfecho de cada ponto discutido entre a construtora e o fornecedor:
   - O que foi efetivamente ACORDADO e aprovado (valores finais, prazos acordados, escopo assumido, condições de entrega).
   - O que restou PENDENTE (documentos pendentes, amostras para aprovação em obra, ajustes de minuta contratual, prazos para envio de documentação e responsáveis designados).

DIRETRIZES DE FORMATAÇÃO E TRANSPARÊNCIA:
- Os dados extraídos serão inseridos diretamente nos campos e tabelas do template DOCX [${templateFields}].
- agreedItems: Array de strings contendo cada decisão final, condição comercial/técnica consolidada, valores pactuados e responsabilidades claras.
- pendingItems: Array de strings contendo cada pendência remanescente com o respectivo RESPONSÁVEL (ex: "Fornecedor", "Obra", "Suprimentos") e PRAZO limite estipulado.
- notes: Resumo executivo coeso, transparente e altamente profissional sintetizando o objetivo da negociação, as principais concessões e o parecer final do processo de contratação.

${customInstructions ? `--- DIRETRIZES PERSONALIZADAS DA EMPRESA ---\n${customInstructions}\n` : ''}

=== 1. DADOS DA ABERTURA ===
${JSON.stringify(abertura, null, 2)}

=== 2. CHECKLIST DE ADERÊNCIA (ETAPA 2) ===
${JSON.stringify(analysisResult, null, 2)}

=== 3. ANÁLISE DE PROPOSTAS, DIVERGÊNCIAS E COMPLEMENTOS (ETAPA 3) ===
${JSON.stringify(divergences, null, 2)}

=== 4. TRANSCRIÇÃO / REGISTRO DA REUNIÃO (ETAPA 5) ===
${transcript}
`;

  try {
    const aiClient = getAI();
    const config = buildGenAIConfig(params, {
      responseMimeType: 'application/json',
      responseSchema: finalAtaSchema,
    });

    const response = await aiClient.models.generateContent({
      model: modelToUse,
      contents: prompt,
      config: config
    });

    const text = response.text || "{}";
    const rawData = JSON.parse(text);
    const parsedData = FinalAtaValidationSchema.safeParse(rawData);

    const data = parsedData.success ? parsedData.data : {
      agreedItems: Array.isArray(rawData.agreedItems) ? rawData.agreedItems : [],
      pendingItems: Array.isArray(rawData.pendingItems) ? rawData.pendingItems : [],
      notes: typeof rawData.notes === 'string' ? rawData.notes : ''
    };

    addLog('INFO', 'AI', 'Ata Final estruturada com sucesso pela IA', {
      agreedCount: data.agreedItems?.length || 0,
      pendingCount: data.pendingItems?.length || 0
    });

    return data;
  } catch (error: any) {
    addLog('ERROR', 'AI', `Erro ao gerar dados da Ata Final: ${error.message}`, { error: error.stack });
    throw error;
  }
}

const searchMeetingsTool: FunctionDeclaration = {
  name: 'buscar_atas_database',
  description: 'Pesquisa atas e reuniões gravadas no banco de dados por palavra-chave, código da obra, nome do fornecedor ou termos de negociação (divergências, prazos, faturamento, itens acordados).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      termo: {
        type: Type.STRING,
        description: 'Termo de pesquisa livre ou palavra-chave (ex: "Engemix", "concreto", "prazo de pagamento", "faturamento", "divergência").'
      },
      obraCodigo: {
        type: Type.STRING,
        description: 'Código específico da obra (ex: "0048", "1020").'
      },
      fornecedor: {
        type: Type.STRING,
        description: 'Nome do fornecedor para filtrar.'
      }
    }
  }
};

const getMeetingDetailsTool: FunctionDeclaration = {
  name: 'obter_detalhes_ata_completa',
  description: 'Recupera o registro completo e detalhado de uma ata de reunião específica pelo ID da reunião (inclui itens acordados, pendências, divergências e transcrição).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      meetingId: {
        type: Type.STRING,
        description: 'ID da reunião/ata cadastrada no banco.'
      }
    },
    required: ['meetingId']
  }
};

const listAllMeetingsTool: FunctionDeclaration = {
  name: 'listar_todas_atas_cadastradas',
  description: 'Retorna um resumo de todas as atas e reuniões cadastradas no banco de dados com seus metadados principais (Obra, Fornecedor, Serviço, Status e Data).',
  parameters: {
    type: Type.OBJECT,
    properties: {}
  }
};

function executeMeetingTool(name: string, args: any): any {
  if (name === 'listar_todas_atas_cadastradas') {
    const list = getMeetingsFromStore();
    return {
      total: list.length,
      meetings: list.map(m => ({
        id: m.id,
        obraCodigo: m.obraCodigo,
        obraNome: m.obraNome,
        fornecedor: m.fornecedor,
        servico: m.servico,
        assunto: m.assunto,
        status: m.status,
        updatedAt: m.updatedAt,
        hasAgreedItems: !!(m.finalAtaData?.agreedItems?.length),
        divergencesCount: m.aiDivergences?.length || 0
      }))
    };
  }

  if (name === 'buscar_atas_database') {
    const term = (args?.termo || '').toLowerCase().trim();
    const obraCodigo = (args?.obraCodigo || '').toLowerCase().trim();
    const fornecedor = (args?.fornecedor || '').toLowerCase().trim();

    let list = getMeetingsFromStore();

    if (obraCodigo) {
      list = list.filter(m => m.obraCodigo && m.obraCodigo.toLowerCase().includes(obraCodigo));
    }
    if (fornecedor) {
      list = list.filter(m => m.fornecedor && m.fornecedor.toLowerCase().includes(fornecedor));
    }
    if (term) {
      list = list.filter(m => {
        const inHeader = (m.obraCodigo + ' ' + m.obraNome + ' ' + m.fornecedor + ' ' + m.servico + ' ' + m.assunto).toLowerCase().includes(term);
        const inTranscript = m.meetingTranscript && m.meetingTranscript.toLowerCase().includes(term);
        const inNotes = m.finalAtaData?.notes && m.finalAtaData.notes.toLowerCase().includes(term);
        const inAgreed = Array.isArray(m.finalAtaData?.agreedItems) && m.finalAtaData.agreedItems.some((i: string) => i.toLowerCase().includes(term));
        const inPending = Array.isArray(m.finalAtaData?.pendingItems) && m.finalAtaData.pendingItems.some((i: string) => i.toLowerCase().includes(term));
        const inDivergences = Array.isArray(m.aiDivergences) && m.aiDivergences.some((d: any) => JSON.stringify(d).toLowerCase().includes(term));
        return inHeader || inTranscript || inNotes || inAgreed || inPending || inDivergences;
      });
    }

    return {
      query: { term, obraCodigo, fornecedor },
      totalFound: list.length,
      results: list.map(m => ({
        id: m.id,
        obraCodigo: m.obraCodigo,
        obraNome: m.obraNome,
        fornecedor: m.fornecedor,
        servico: m.servico,
        status: m.status,
        updatedAt: m.updatedAt,
        agreedItems: m.finalAtaData?.agreedItems || [],
        pendingItems: m.finalAtaData?.pendingItems || [],
        resumoExecutivo: m.finalAtaData?.notes || '',
        divergencesSummary: (m.aiDivergences || []).map((d: any) => ({
          description: d.description,
          severity: d.severity,
          source: d.source
        }))
      }))
    };
  }

  if (name === 'obter_detalhes_ata_completa') {
    const meeting = getMeetingById(args?.meetingId);
    if (!meeting) {
      return { error: `Reunião com ID '${args?.meetingId}' não foi encontrada no banco de dados.` };
    }
    return {
      meeting: {
        id: meeting.id,
        obraCodigo: meeting.obraCodigo,
        obraNome: meeting.obraNome,
        fornecedor: meeting.fornecedor,
        servico: meeting.servico,
        assunto: meeting.assunto,
        rm: meeting.rm,
        cot: meeting.cot,
        status: meeting.status,
        createdAt: meeting.createdAt,
        updatedAt: meeting.updatedAt,
        divergences: meeting.aiDivergences,
        checklistAnalysis: meeting.aiContext,
        agreedItems: meeting.finalAtaData?.agreedItems || [],
        pendingItems: meeting.finalAtaData?.pendingItems || [],
        resumoExecutivo: meeting.finalAtaData?.notes || '',
        meetingTranscriptSnippet: meeting.meetingTranscript ? meeting.meetingTranscript.substring(0, 1500) : ''
      }
    };
  }

  return { error: `Ferramenta desconhecida: ${name}` };
}

export async function processChat(history: { role: string, text: string }[], message: string) {
  const models = getActiveModels();
  const prompts = getActivePrompts();
  const params = models.chatbotParams || {
    model: models.chatbotModel || 'gemini-3.7-flash',
    temperature: 0.3,
    topP: 0.95,
    maxOutputTokens: 4096,
    thinkingBudget: 0,
  };
  const modelToUse = params.model || models.chatbotModel || 'gemini-3.7-flash';
  
  // Dynamic RAG overview of database
  const allMeetings = getMeetingsFromStore();
  const meetingsOverview = allMeetings.length > 0 
    ? allMeetings.map(m => `- ID: ${m.id} | Obra: ${m.obraCodigo || 'S/N'} (${m.obraNome || 'Sem nome'}) | Fornecedor: ${m.fornecedor || 'S/F'} | Serviço: ${m.servico || 'N/A'} | Status: ${m.status} | Atualizado: ${m.updatedAt}`).join('\n')
    : 'Nenhuma ata gravada no banco de dados até o momento.';

  const baseInstructions = prompts.chatbotInstructions || 'Você é um assistente especialista em suprimentos e atas de reunião de construção civil da Afonso França Engenharia.';
  
  const systemInstruction = `${baseInstructions}

VOCÊ TEM ACESSO DIRETO AO BANCO DE DADOS DE ATAS DE REUNIÃO DA EMPRESA.
Você dispõe de ferramentas de recuperação e busca (RAG / Tool Calling) para consultar o histórico completo de atas, itens acordados, pendências, divergências contratuais, propostas e negociações com fornecedores.

DIRETRIZES DE ATENDIMENTO:
1. Quando o usuário fizer perguntas sobre atas geradas, fornecedores, obras específicas, acordos, pendências, prazos ou histórico de negociações, use as ferramentas disponíveis (\`buscar_atas_database\`, \`obter_detalhes_ata_completa\`, \`listar_todas_atas_cadastradas\`) para recuperar as informações diretamente do banco de dados.
2. Use o contexto recuperado para formular respostas precisas, claras, executivas e profissionais em Português (Brasil).
3. Cite claramente o código da Obra, Fornecedor e Data sempre que fizer referência a um dado do banco.
4. Se o usuário pedir para redigir ou resumir, utilize o tom formal de engenharia e suprimentos da Afonso França.

=== ÍNDICE DO BANCO DE DADOS DE ATAS ATUAL ===
${meetingsOverview}
==============================================`;

  addLog('DEBUG', 'AI', `Chatbot acionado: "${message.substring(0, 50)}..."`, {
    model: modelToUse,
    totalMeetingsInDB: allMeetings.length
  });

  try {
    const aiClient = getAI();
    
    const contents: any[] = history.map(msg => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));
    
    contents.push({ role: 'user', parts: [{ text: message }] });

    const config = buildGenAIConfig(params, {
      systemInstruction: systemInstruction,
      tools: [{
        functionDeclarations: [
          searchMeetingsTool,
          getMeetingDetailsTool,
          listAllMeetingsTool
        ]
      }]
    });

    let currentResponse = await aiClient.models.generateContent({
      model: modelToUse,
      contents: contents as any,
      config: config
    });

    // Multi-turn Function Calling handling (up to 3 turns)
    let turns = 0;
    while (currentResponse.functionCalls && currentResponse.functionCalls.length > 0 && turns < 3) {
      turns++;
      const call = currentResponse.functionCalls[0];
      const functionName = call.name;
      const functionArgs = call.args || {};

      addLog('INFO', 'AI', `Chatbot executou consulta/tool: ${functionName}`, { args: functionArgs });

      const toolResult = executeMeetingTool(functionName, functionArgs);

      // Append model turn with function call
      const candidateContent = currentResponse.candidates?.[0]?.content;
      if (candidateContent) {
        contents.push(candidateContent);
      } else {
        contents.push({
          role: 'model',
          parts: [{
            functionCall: {
              name: functionName,
              args: functionArgs
            }
          }]
        });
      }

      // Append user turn with function response
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: functionName,
            response: toolResult
          }
        }]
      });

      currentResponse = await aiClient.models.generateContent({
        model: modelToUse,
        contents: contents as any,
        config: config
      });
    }

    const reply = currentResponse.text || 'Processamento concluído.';
    return reply;
  } catch (error: any) {
    addLog('ERROR', 'AI', `Erro no Chatbot: ${error.message}`, { error: error.stack });
    throw error;
  }
}

const metadataSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    obraCodigo: { type: Type.STRING, description: "Código numérico ou identificador da obra (ex: 0048, OBR-2026, 1024)" },
    obraNome: { type: Type.STRING, description: "Nome do empreendimento ou condomínio/obra" },
    fornecedor: { type: Type.STRING, description: "Razão social ou nome fantasia do fornecedor" },
    assunto: { type: Type.STRING, description: "Assunto da reunião ou escopo principal de suprimentos" },
    servico: { type: Type.STRING, description: "Serviço, pacote ou escopo contratado" },
    rm: { type: Type.STRING, description: "Código da Requisição de Materiais (RM), se identificado" },
    cot: { type: Type.STRING, description: "Código da Cotação (COT), se identificado" }
  }
};

export async function extractMetadataFromDocs(files?: Express.Multer.File[], rawText?: string) {
  let fullText = rawText || '';

  if (files && files.length > 0) {
    const contents = await Promise.all(files.map(extractTextFromFile));
    fullText = (fullText ? fullText + '\n\n' : '') + contents.join('\n\n====================\n\n');
  }

  if (!fullText.trim()) {
    return {
      obraCodigo: '',
      obraNome: '',
      fornecedor: '',
      assunto: '',
      servico: '',
      rm: '',
      cot: ''
    };
  }

  const prompt = `Você é um assistente de inteligência artificial de Suprimentos para Construção Civil.
Analise com extrema atenção os documentos ou textos anexos (Checklist, Caderno de Encargos, Proposta Comercial, Contrato ou Transcrição de Reunião) e extraia os metadados de identificação:

1. Código da Obra (obraCodigo): Ex: "0048", "OBR-10", "1234", etc.
2. Nome da Obra / Empreendimento (obraNome): Ex: "Residencial Bela Vista", "Edifício Horizonte"
3. Fornecedor / Empresa Contratada (fornecedor): Razão social ou nome comercial (ex: "Construtora Alfa Ltda", "Votorantim Cimentos")
4. Assunto da Reunião (assunto): Ex: "Alinhamento de Escopo e Minuta Contratual", "Negociação Comercial"
5. Serviço / Pacote (servico): Ex: "Instalações Elétricas e Hidráulicas", "Estrutura de Concreto", "Esquadrias de Alumínio"
6. RM (rm): Código de Requisição de Materiais se constar
7. COT (cot): Código de Cotação se constar

Caso algum item não seja encontrado com certeza, retorne string vazia "". Nunca invente códigos ou nomes de fornecedores.

Conteúdo dos Documentos:
${fullText.substring(0, 50000)}
`;

  try {
    const aiClient = getAI();
    const response = await aiClient.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: metadataSchema,
      }
    });

    const text = response.text || "{}";
    const result = JSON.parse(text);

    addLog('INFO', 'AI', `Metadados da obra/reunião auto-extraídos dos documentos com sucesso`, {
      obraCodigo: result.obraCodigo,
      fornecedor: result.fornecedor,
      assunto: result.assunto,
      servico: result.servico
    });

    return result;
  } catch (error: any) {
    addLog('WARN', 'AI', `Aviso ao extrair metadados dos documentos: ${error.message}`);
    return {
      obraCodigo: '',
      obraNome: '',
      fornecedor: '',
      assunto: '',
      servico: '',
      rm: '',
      cot: ''
    };
  }
}

// ================= DYNAMIC DOCX TEMPLATE AI STRUCTURE ANALYSIS =================

const templateAnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    templateName: { type: Type.STRING, description: "Nome limpo e descritivo do template baseado no cabeçalho e propósito (ex: 'Ata de Negociação Comercial', 'Template Padrão Suprimentos')" },
    companyName: { type: Type.STRING, description: "Nome da empresa ou departamento identificado no cabeçalho do documento" },
    templateType: { type: Type.STRING, description: "Tipo de template (ex: Ata de Reunião, Pré-Ata de Negociação, Relatório de Suprimentos, Contrato)" },
    structureSummary: { type: Type.STRING, description: "Resumo executivo claro da estrutura, seções e tabelas encontradas no documento" },
    detectedSections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Nome ou título da seção" },
          type: { type: Type.STRING, description: "Tipo de seção: 'header', 'dados_obra', 'participantes', 'checklist', 'divergencias', 'acordos', 'pendencias', 'assinaturas', 'clausulas' ou 'generico'" },
          description: { type: Type.STRING, description: "Descrição de como esta seção está estruturada e o que ela espera conter" },
          fields: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Tags ou variáveis pertencentes a esta seção" }
        },
        required: ["title", "type", "description"]
      }
    },
    tableSchemas: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Nome ou finalidade da tabela" },
          columns: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Lista de nomes das colunas identificadas" },
          sampleRowTags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Tags ou variáveis de linha da tabela" }
        },
        required: ["name", "columns"]
      }
    },
    suggestedClauses: { type: Type.STRING, description: "Cláusulas padrão, observações fixas ou notas gerais identificadas no documento" },
    suggestedSignatures: { type: Type.STRING, description: "Assinaturas ou participantes identificados nas seções de vistos" }
  },
  required: ["templateName", "structureSummary", "detectedSections"]
};

export async function analyzeUploadedDocxStructureWithAI(
  rawText: string,
  detectedPlaceholders: string[],
  tableHeaders: string[],
  paragraphsCount: number,
  tablesCount: number,
  filename: string
) {
  const prompt = `Você é um Engenheiro Especialista em Processamento de Documentos Word (DOCX OpenXML) e Automação de Suprimentos na Construção Civil.
Um novo arquivo de template DOCX corporativo foi enviado pelo usuário ("${filename}").
A estrutura do template NÃO é pré-definida no código: ela deve ser compreendida dinamicamente a partir deste documento.

Estatísticas do DOCX:
- Quantidade de Parágrafos: ${paragraphsCount}
- Quantidade de Tabelas: ${tablesCount}
- Variáveis / Tags XML detectadas: [${detectedPlaceholders.join(', ')}]
- Cabeçalhos de tabelas identificados: [${tableHeaders.join(', ')}]

Texto Extraído do Documento:
${rawText.substring(0, 35000)}

Sua missão:
1. Analisar detalhadamente a estrutura deste template (seções, cabeçalhos, blocos de dados, tabelas, notas de rodapé, campos de visto/assinatura).
2. Identificar quais seções existem (Identificação da Obra/Contrato, Participantes, Tabela de Itens/Checklist, Divergências, Itens Acordados, Pendências, Assinaturas, etc.).
3. Gerar um resumo estrutural e descrições claras para que o sistema saiba como direcionar e mapear dinamicamente os dados extraídos de propostas, checklists e transcrições de reuniões para este template.
`;

  try {
    const aiClient = getAI();
    const response = await aiClient.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: templateAnalysisSchema,
      }
    });

    const text = response.text || "{}";
    const result = JSON.parse(text);

    addLog('INFO', 'AI', `Estrutura do template DOCX "${filename}" analisada com sucesso pela IA`, {
      templateName: result.templateName,
      companyName: result.companyName,
      sectionsCount: result.detectedSections?.length || 0,
      tablesCount: result.tableSchemas?.length || 0
    });

    return result;
  } catch (err: any) {
    addLog('WARN', 'AI', `Aviso na análise por IA da estrutura do DOCX: ${err.message}`);
    return {
      templateName: filename.replace(/\.docx$/i, ''),
      companyName: 'DEPARTAMENTO DE SUPRIMENTOS',
      templateType: 'Ata de Reunião',
      structureSummary: `Template DOCX com ${paragraphsCount} parágrafos e ${tablesCount} tabelas.`,
      detectedSections: [
        { title: 'Cabeçalho e Identificação', type: 'header', description: 'Identificação da empresa e obra' },
        { title: 'Tabela de Itens', type: 'checklist', description: 'Seção principal para tópicos e deliberações' }
      ],
      tableSchemas: tableHeaders.length > 0 ? [{ name: 'Tabela Principal', columns: tableHeaders, sampleRowTags: [] }] : [],
      suggestedClauses: '',
      suggestedSignatures: ''
    };
  }
}


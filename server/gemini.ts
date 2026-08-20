import { GoogleGenAI, Type } from '@google/genai';
import { getStoredPrompts, getStoredModelsConfig } from './configStore';
import { getActiveTemplateFromDb, extrairTextosPadraoDoTemplate, encontrarTabelaCorpo } from './templateRepository';
import { 
  TopicItemSchema, 
  DivergenceItemSchema, 
  TemplateSchema,
  BlocosListSchema
} from './types/template';
import { AtaState, TopicoEstado, Participante, Divergencia, ItemAcao, Situacao } from './types/ataState';
import { validarTopicosAtaState, extrairTokensNumericos, normalizarTexto } from './validators/ataValidators';
import { setAnalysisProgress } from './meetingStore';
import { addLog } from './logger';
import { appendDebugMd } from './debugMd';

const ai = new GoogleGenAI({});

// ==================== SEMANTIC PROMPT VERSIONS (PROMPT 07) ====================
export const PROMPT_VERSIONS = {
  checklist: 'checklist@2.0.0',
  proposal: 'proposal@2.0.0',
  segmentation: 'segmentation@2.0.0',
  decisions: 'decisions@2.0.0',
  metadata: 'metadata@2.0.0'
} as const;

export function safeParseJsonFromAI<T = any>(raw: string, fallback: T): T {
  if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
    appendDebugMd('ia_fallback.md', 'Tentativa de parse de string vazia da IA', { raw: '', timestamp: new Date().toISOString() });
    return fallback;
  }

  let text = raw.trim();

  // 1. Direct parse attempt
  try {
    return JSON.parse(text);
  } catch {}

  // 2. Try extract from ```json ... ``` blocks anywhere in the text
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    const extracted = codeBlockMatch[1].trim();
    try {
      const res = JSON.parse(extracted);
      appendDebugMd('ia_fallback.md', 'Recuperado de bloco markdown ```json', { snippet: extracted.slice(0, 300) });
      return res;
    } catch {}
    text = extracted;
  }

  // 3. Find outer boundaries of JSON object { ... } or array [ ... ]
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');

  const candidates: string[] = [];

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(text.substring(firstBrace, lastBrace + 1));
  }
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    candidates.push(text.substring(firstBracket, lastBracket + 1));
  }

  for (const candidate of candidates) {
    try {
      const res = JSON.parse(candidate);
      appendDebugMd('ia_fallback.md', 'Recuperado via boundary scan JSON', { snippet: candidate.slice(0, 300) });
      return res;
    } catch {}

    // 4. Sanitize common LLM JSON syntax issues
    const sanitized = candidate
      .replace(/\/\/.*$/gm, '')
      .replace(/,\s*([\}\]])/g, '$1')
      .replace(/[\u0000-\u001F]+/g, (match) => (match === '\n' || match === '\r' || match === '\t' ? match : ' '));

    try {
      const res = JSON.parse(sanitized);
      appendDebugMd('ia_fallback.md', 'Recuperado via sanitização de vírgulas/caracteres de controle', { snippet: sanitized.slice(0, 300) });
      return res;
    } catch {}

    // Fix unescaped newlines inside strings
    try {
      const fixedNewlines = sanitized.replace(/(:\s*"[^"]*")/g, (m) => m.replace(/\n/g, '\\n').replace(/\r/g, ''));
      const res = JSON.parse(fixedNewlines);
      appendDebugMd('ia_fallback.md', 'Recuperado via correção de quebras de linha em strings', { snippet: fixedNewlines.slice(0, 300) });
      return res;
    } catch {}
  }

  addLog('WARN', 'AI', 'safeParseJsonFromAI: Falha ao fazer parse de JSON bruto da IA. Usando fallback estruturado.', {
    snippet: raw.slice(0, 300)
  });

  appendDebugMd('ia_fallback.md', 'Falha total de parse JSON da IA - Usando Fallback Estruturado', {
    rawSnippet: raw.slice(0, 500),
    timestamp: new Date().toISOString()
  });

  return fallback;
}

/**
 * Builds a comprehensive prompt description of the active template structure, text content, tables, and loops.
 */
function buildTemplateContextPrompt(template: any): string {
  if (!template) {
    return 'ATENÇÃO: Nenhum template DOCX cadastrado.';
  }

  const templateBodyTable = encontrarTabelaCorpo(template.tables || []);
  const textosPadrao = templateBodyTable ? extrairTextosPadraoDoTemplate(templateBodyTable) : [];

  const textosPadraoDesc = textosPadrao.map(tp => {
    const vars = tp.variaveisExemplo.length
      ? `\n    Parâmetros a preencher/negociar: ${tp.variaveisExemplo.map(v =>
          `{${v.nome}} (no modelo: "${v.token}", ref.: ${v.rotulo || 'geral'}, tipo: ${v.tipo})`).join('; ')}`
      : '';
    return `  Item ${tp.num} - ${tp.titulo || 'Sem título'}:\n    "${tp.descricao}"${vars}`;
  }).join('\n\n');

  const rawFull = (template.rawTextFull || template.rawTextPreview || '')
    .replace(/[ \t]+/g, ' ')
    .slice(0, 20000);

  const referenceJson = {
    templateInfo: {
      name: template.name || 'Template Padrão',
      version: template.version || 1,
      department: template.companyName || 'DEPARTAMENTO DE SUPRIMENTOS - AFONSO FRANÇA ENGENHARIA',
      structureSummary: template.structureSummary || 'Documento DOCX corporativo com tabelas de deliberações e campos de identificação da obra.'
    },
    schema: template.schema || null,
    tablesInspection: template.tables?.map((t: any, idx: number) => ({
      tableIndex: idx + 1,
      rowCount: t.rowCount,
      columnCount: t.columnCount,
      headers: t.rows?.[0]?.cells?.filter(Boolean) || [],
      sampleRow: t.rows?.[1]?.cells?.filter(Boolean) || []
    })) || [],
    rawTextPreview: rawFull.slice(0, 2500)
  };

  return `======================================================================
DADOS DO TEMPLATE DOCX OFICIAL ATIVO EM FORMATO JSON (REFERÊNCIA OBRIGATÓRIA):
\`\`\`json
${JSON.stringify(referenceJson, null, 2)}
\`\`\`

TEXTOS PADRÃO INTEGRAIS DA TABELA DE CORPO (itens que DEVEM constar na Ata Final, mantidos como MANTIDO_PADRAO quando não alterados na reunião):
${textosPadraoDesc}

VARIÁVEIS DE EXEMPLO DO MODELO:
Os marcadores como [xx], R$ XXXX, XXX e [xxx] indicam parâmetros que devem ser preenchidos com o que for deliberado na reunião. Valores concretos presentes no modelo (percentuais, prazos em dias, condições de pagamento) são o PADRÃO BASELINE da construtora: mantenha-os quando a reunião não os alterar e substitua-os apenas com base em decisão explícita da transcrição, nunca inventando valores novos. Quando não houver deliberação, use [A DEFINIR NA REUNIÃO].

AMOSTRA DO CONTEÚDO TEXTUAL DO MODELO:
${rawFull}

DIRETRIZES DE DISPOSIÇÃO E FORMATAÇÃO:
1. Mantenha estrita coerência com a disposição das tabelas e campos mapeados no JSON do template DOCX acima.
2. Cada item gerado deve corresponder exatamente às colunas identificadas (ex: Número, Descrição Técnica/Acordada, Responsável, Prazo).
3. Utilize a linguagem técnica de engenharia civil, contratos e suprimentos da Afonso França.
======================================================================`;
}

// ==================== 1. CHECKLIST ANALYSIS IN BATCHES (PROMPT 07) ====================

const checklistBatchResponseSchema = {
  type: Type.OBJECT,
  properties: {
    tipoFornecimento: { type: Type.STRING },
    topics: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          regraObra: { type: Type.STRING },
          excecaoAdmitida: { type: Type.STRING },
          pontoAtencao: { type: Type.STRING },
          perguntaFornecedor: { type: Type.STRING },
          source: { type: Type.STRING }
        },
        required: ['title', 'regraObra']
      }
    }
  },
  required: ['topics']
};

export async function analyzeChecklist(
  files: any[],
  meetingId?: string,
  options?: { batchSize?: number }
) {
  const template = await getActiveTemplateFromDb();
  if (!template || !template.docxBlobBase64) {
    throw new Error('Nenhum template DOCX ativo disponível. Faça o upload do template oficial antes de realizar as análises de checklist.');
  }

  const prompts = await getStoredPrompts();
  const modelsConfig = await getStoredModelsConfig();
  const templateContext = buildTemplateContextPrompt(template);
  const promptVersion = PROMPT_VERSIONS.checklist;

  // Extrai taxonomia padrão a partir do template oficial (PROMPT 05 / 07)
  const templateBodyTable = encontrarTabelaCorpo(template.tables || []);
  const taxonomiaPadraoTemplate = templateBodyTable ? extrairTextosPadraoDoTemplate(templateBodyTable) : [];

  // Mapeia tópicos base a partir da taxonomia do template
  const baseTopicsTaxonomy = taxonomiaPadraoTemplate.map((item, idx) => ({
    title: item.titulo || `Tópico ${idx + 1}`,
    descricaoPadrao: item.descricao || ''
  }));

  // Tópicos padrão de engenharia de suprimentos para complementar caso a taxonomia esteja enxuta
  const standardEngineeringTaxonomy = [
    { title: 'Escopo, Objeto e Especificações Técnicas dos Serviços', descricaoPadrao: '' },
    { title: 'Critério de Medição, Faturamento e Condições de Pagamento', descricaoPadrao: '' },
    { title: 'Segurança do Trabalho, NR-18, NR-35, PCMSO/PGR e EPIs', descricaoPadrao: '' },
    { title: 'Logística de Canteiro, Horários, Carga, Descarga e Içamento', descricaoPadrao: '' },
    { title: 'Retenções Contratuais, Garantias e Risco Sacado', descricaoPadrao: '' },
    { title: 'Cronograma Físico, Prazos de Mobilização, Execução e Entrega', descricaoPadrao: '' },
    { title: 'Penalidades, Multas por Atraso e Não Conformidades', descricaoPadrao: '' },
    { title: 'Documentação Técnica, ART/RRT, Seguros e Responsabilidades', descricaoPadrao: '' },
    { title: 'Qualidade, Ensaios Tecnológicos e Aceite de Serviços', descricaoPadrao: '' },
    { title: 'Obrigações Trabalhistas, Registro de Funcionários e Folha', descricaoPadrao: '' },
    { title: 'Meio Ambiente, Limpeza e Descarte de Entulhos/Resíduos', descricaoPadrao: '' },
    { title: 'Instalações Provisórias, Água, Energia e Refeitório', descricaoPadrao: '' }
  ];

  const candidateTopics = baseTopicsTaxonomy.length >= 6
    ? baseTopicsTaxonomy
    : [
        ...baseTopicsTaxonomy,
        ...standardEngineeringTaxonomy.filter(st => 
          !baseTopicsTaxonomy.some(bt => normalizarTexto(bt.title).includes(normalizarTexto(st.title).slice(0, 8)))
        )
      ];

  // Tamanho do lote: 5 a 7 tópicos
  const batchSize = Math.max(4, Math.min(7, options?.batchSize || 6));

  // Define lotes de tópicos a serem analisados
  const batches: (typeof candidateTopics)[] = [];
  for (let i = 0; i < candidateTopics.length; i += batchSize) {
    batches.push(candidateTopics.slice(i, i + batchSize));
  }
  const totalBatches = batches.length;

  if (meetingId) {
    setAnalysisProgress(meetingId, {
      stage: 'CHECKLIST_BATCH',
      totalBatches,
      currentBatch: 0,
      progressPercent: 0,
      message: `Iniciando análise completa do Check List em ${totalBatches} lote(s)...`
    });
  }

  const modelName = modelsConfig.checklistModel || 'gemini-2.5-pro';
  const temperature = modelsConfig.checklistParams?.temperature ?? 0.2;

  let aggregatedTopics: any[] = [];
  let detectedTipoFornecimento = 'Subempreitada de Serviços e Materiais';

  for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    const currentBatch = batches[batchIdx];
    const batchNumber = batchIdx + 1;
    const progressPercent = Math.round((batchNumber / totalBatches) * 90);

    if (meetingId) {
      setAnalysisProgress(meetingId, {
        stage: 'CHECKLIST_BATCH',
        totalBatches,
        currentBatch: batchNumber,
        progressPercent,
        message: `Processando lote ${batchNumber} de ${totalBatches} do Check List (${currentBatch.length} tópicos)...`
      });
    }

    const batchTopicsPrompt = currentBatch.map((t, idx) =>
      `${idx + 1}. Tópico: "${t.title}" ${t.descricaoPadrao ? `(Padrão Construtora: ${t.descricaoPadrao.slice(0, 150)}...)` : ''}`
    ).join('\n');

    const systemInstruction = `Você é um Engenheiro de Suprimentos Sênior Especialista em Contratações e Gestão de Obras Civis da Afonso França Engenharia.
Sua missão é realizar a LEITURA COMPLETA, EXTRAÇÃO DE PREMISSAS E ANÁLISE DE CONFORMIDADE dos documentos de Check List da Obra (incluindo planilhas Excel, memoriais descritivos, normas de canteiro e PDFs) para o seguinte LOTE ESPECÍFICO de tópicos da taxonomia oficial:

LOTE ${batchNumber} de ${totalBatches}:
${batchTopicsPrompt}

CRÍTICO - PREENCHIMENTO E ENQUADRAMENTO NO TEMPLATE:
Você DEVE utilizar a estrutura, seções e vocabulário do TEMPLATE DOCX OFICIAL ATIVO como parâmetro de enquadramento.
É vital que você extraia dados para preencher adequadamente o template original em TODOS os campos cabíveis, gerando artefatos completos.
Não invente itens ou grupos de informações não existentes no material fonte. Se encontrar pendências importantes para a contratação de serviços e equipamentos em construção civil, apresente as mesmas de forma clara e explícita nas respostas.

${templateContext}

REGRAS DE FORMATAÇÃO DO JSON DE RESPOSTA (Lote ${batchNumber}/${totalBatches}):
1. "tipoFornecimento": Tipo de fornecimento da contratação (ex: "Subempreitada de Serviços e Materiais", "Locação de Equipamentos com Operador", etc.).
2. "topics": Array contendo os tópicos deste lote e eventuais regras específicas encontradas nos documentos anexos:
   - "title": Título conciso da regra/premissa enquadrada na taxonomia.
   - "regraObra": Descrição clara e detalhada da especificação técnica ou operacional exigida pela obra.
   - "excecaoAdmitida": Flexibilização admitida pela obra (ou "N/A" caso a regra seja estrita).
   - "pontoAtencao": Ponto crítico de risco ou atenção a ser alinhado na reunião com o fornecedor.
   - "perguntaFornecedor": Pergunta objetiva e assertiva a ser feita ao fornecedor na mesa de negociação.
   - "source": Identificação da fonte no Check List (ex: "Planilha Check List Canteiro", "Memorial Descritivo").

${prompts.checklistInstructions ? `\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${prompts.checklistInstructions}` : ''}`;

    const promptText = `Analise detalhadamente todos os arquivos de Check List da Obra anexados (planilhas, textos, PDFs) e extraia todas as premissas e regras para os tópicos do Lote ${batchNumber} (${currentBatch.map(c => c.title).join(', ')}), além de quaisquer outras regras da obra aplicáveis.`;

    const contents = [
      ...files,
      { text: promptText }
    ];

    const config: any = {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: checklistBatchResponseSchema,
      temperature
    };

    if (modelsConfig.checklistParams) {
      if (modelsConfig.checklistParams.topP !== undefined) config.topP = modelsConfig.checklistParams.topP;
      if (modelsConfig.checklistParams.maxOutputTokens !== undefined) config.maxOutputTokens = modelsConfig.checklistParams.maxOutputTokens;
      if (modelsConfig.checklistParams.thinkingBudget !== undefined && modelsConfig.checklistParams.thinkingBudget > 0) {
        config.thinkingConfig = { thinkingBudget: modelsConfig.checklistParams.thinkingBudget };
      }
    }

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config
      });

      const parsed = safeParseJsonFromAI(response.text || '{}', {
        tipoFornecimento: detectedTipoFornecimento,
        topics: []
      });

      if (parsed.tipoFornecimento) {
        detectedTipoFornecimento = parsed.tipoFornecimento;
      }

      const rawTopics = Array.isArray(parsed.topics) ? parsed.topics : [];
      aggregatedTopics.push(...rawTopics);

      addLog('INFO', 'AI', `[promptVersion: ${promptVersion}] Lote ${batchNumber}/${totalBatches} de checklist processado com sucesso (${rawTopics.length} tópicos)`, {
        batch: batchNumber,
        totalBatches,
        model: modelName,
        topicsCount: rawTopics.length
      });
    } catch (batchErr: any) {
      addLog('WARN', 'AI', `[promptVersion: ${promptVersion}] Erro no lote ${batchNumber} com modelo ${modelName} (${batchErr.message}). Tentando modelo fallback...`);
      try {
        const fallbackResp = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: checklistBatchResponseSchema,
            temperature: 0.2
          }
        });
        const parsedFallback = safeParseJsonFromAI(fallbackResp.text || '{}', {
          tipoFornecimento: detectedTipoFornecimento,
          topics: []
        });
        if (parsedFallback.tipoFornecimento) {
          detectedTipoFornecimento = parsedFallback.tipoFornecimento;
        }
        const rawFallbackTopics = Array.isArray(parsedFallback.topics) ? parsedFallback.topics : [];
        aggregatedTopics.push(...rawFallbackTopics);
        addLog('INFO', 'AI', `Lote ${batchNumber} recuperado com sucesso via modelo fallback gemini-2.5-flash (${rawFallbackTopics.length} tópicos)`);
      } catch (fbErr: any) {
        addLog('WARN', 'AI', `Aviso: Falha no processamento do lote ${batchNumber}: ${fbErr.message}`);
      }
    }
  }

  // ================= CRITICAL: VARREDURA GLOBAL DE FALLBACK SE NENHUM TÓPICO FOR ENCONTRADO =================
  if (aggregatedTopics.length === 0) {
    if (meetingId) {
      setAnalysisProgress(meetingId, {
        stage: 'CHECKLIST_BATCH',
        totalBatches: 1,
        currentBatch: 1,
        progressPercent: 92,
        message: 'Executando varredura profunda e completa em todos os documentos do Check List...'
      });
    }

    addLog('INFO', 'AI', `[promptVersion: ${promptVersion}] Executando varredura global profunda sobre os documentos de Check List...`);
    try {
      const globalSystemInstruction = `Você é um Engenheiro de Suprimentos Sênior Especialista em Contratações da Construtora Afonso França.
Sua missão é realizar a LEITURA INTEGRAL de todos os arquivos fornecidos (planilhas Excel, memoriais, arquivos de especificação e PDFs) e extrair TODAS as regras técnicas, premissas de contratação, critérios de medição, prazos, obrigações de segurança, logística de canteiro, penalidades e exigências da obra.

CRÍTICO:
1. Extraia o máximo de tópicos estruturados possíveis identificados no material fonte.
2. Cada tópico deve ter título claro, regraObra com a especificação da construtora, pontoAtencao e perguntaFornecedor.
3. Não retorne lista vazia se houver qualquer informação técnica, comercial, operacional ou de segurança nos documentos.
${templateContext}`;

      const globalPrompt = `Analise na íntegra todos os documentos de Check List da Obra anexados e extraia todas as regras, especificações técnicas, exigências de fornecimento, prazos, critérios de medição e penalidades estabelecidas pela construtora.`;

      const globalContents = [
        ...files,
        { text: globalPrompt }
      ];

      const globalResp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: globalContents,
        config: {
          systemInstruction: globalSystemInstruction,
          responseMimeType: 'application/json',
          responseSchema: checklistBatchResponseSchema,
          temperature: 0.2
        }
      });

      const globalParsed = safeParseJsonFromAI(globalResp.text || '{}', {
        tipoFornecimento: detectedTipoFornecimento,
        topics: []
      });

      if (globalParsed.tipoFornecimento) {
        detectedTipoFornecimento = globalParsed.tipoFornecimento;
      }

      if (Array.isArray(globalParsed.topics) && globalParsed.topics.length > 0) {
        aggregatedTopics.push(...globalParsed.topics);
        addLog('INFO', 'AI', `Varredura global profunda resgatou ${globalParsed.topics.length} tópicos com sucesso.`);
      }
    } catch (globalErr: any) {
      addLog('WARN', 'AI', `Erro na varredura global profunda: ${globalErr.message}`);
    }
  }

  // Normalização e deduplicação dos tópicos agregados
  const seenTitles = new Set<string>();
  const validatedTopics = aggregatedTopics
    .map((t: any, idx: number) => {
      const title = t.title || t.titulo || `Regra ${idx + 1}`;
      const regraObra = t.regraObra || t.regra || t.descricao || 'Conforme especificação do checklist da obra';
      const excecaoAdmitida = t.excecaoAdmitida || t.excecao || 'N/A';
      const pontoAtencao = t.pontoAtencao || t.atencao || 'Nenhum';
      const perguntaFornecedor = t.perguntaFornecedor || t.pergunta || 'Confirmar atendimento integral às premissas';
      const source = t.source || t.fonte || 'Check List da Obra';

      return {
        id: `topic-${idx + 1}`,
        title: String(title).trim(),
        regraObra: String(regraObra).trim(),
        excecaoAdmitida: String(excecaoAdmitida).trim(),
        pontoAtencao: String(pontoAtencao).trim(),
        perguntaFornecedor: String(perguntaFornecedor).trim(),
        source: String(source).trim()
      };
    })
    .filter(t => {
      const norm = normalizarTexto(t.title);
      if (seenTitles.has(norm)) return false;
      seenTitles.add(norm);
      return true;
    });

  if (meetingId) {
    setAnalysisProgress(meetingId, {
      stage: 'COMPLETED',
      totalBatches,
      currentBatch: totalBatches,
      progressPercent: 100,
      message: `Análise do Check List concluída (${validatedTopics.length} tópicos mapeados).`
    });
  }

  addLog('INFO', 'AI', `[promptVersion: ${promptVersion}] Análise completa de checklist em lotes finalizada: ${validatedTopics.length} tópicos consolidados`, {
    promptVersion,
    model: modelName,
    templateId: template.id,
    topicsCount: validatedTopics.length,
    totalBatches
  });

  return {
    tipoFornecimento: detectedTipoFornecimento,
    topics: validatedTopics,
    promptVersion
  };
}

// ==================== 2. PROPOSAL ANALYSIS ====================

const proposalResponseSchema = {
  type: Type.OBJECT,
  properties: {
    divergences: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          severity: { type: Type.STRING, enum: ['ALTA', 'MEDIA', 'BAIXA'] },
          source: { type: Type.STRING }
        },
        required: ['description', 'severity']
      }
    }
  },
  required: ['divergences']
};

export async function analyzeProposal(
  proposalFiles: any[],
  checklistData: any,
  meetingId?: string
) {
  const template = await getActiveTemplateFromDb();
  if (!template || !template.docxBlobBase64) {
    throw new Error('Nenhum template DOCX ativo disponível. Faça o upload do template oficial antes de realizar as análises de proposta.');
  }

  const prompts = await getStoredPrompts();
  const modelsConfig = await getStoredModelsConfig();
  const templateContext = buildTemplateContextPrompt(template);
  const promptVersion = PROMPT_VERSIONS.proposal;

  if (meetingId) {
    setAnalysisProgress(meetingId, {
      stage: 'PROPOSAL_ANALYSIS',
      totalBatches: 1,
      currentBatch: 1,
      progressPercent: 30,
      message: 'Confrontando proposta comercial com as regras do Check List...'
    });
  }

  const systemInstruction = `Você é um Engenheiro Especialista em Análise de Propostas e Negociação de Contratos de Construção Civil da Afonso França Engenharia.
Sua missão é confrontar a Proposta Comercial e Técnica do fornecedor com o Check List de Regras da Obra previamente aprovado, identificando divergências, omissões, ressalvas e condições não atendidas.

CRITÉRIOS DE QUALIDADE:
1. Preencha adequadamente as necessidades do template original (via metadados/divergências) em todos os campos contidos, gerando artefatos completos.
2. Quando encontradas pendências importantes para a contratação de serviços e equipamentos em construção civil, as mesmas devem ser apresentadas de forma CLARA e EXPLÍCITA.
3. Não invente itens ou grupos de informações não existentes na proposta ou no Check List.

${templateContext}

REGRAS DA OBRA JÁ ESTABELECIDAS:
${JSON.stringify(checklistData?.topics || [], null, 2)}

${prompts.proposalInstructions ? `\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${prompts.proposalInstructions}` : ''}`;

  const promptText = `Confronte as propostas comerciais anexadas com as regras do Check List e identifique todas as divergências técnicas, comerciais, tributárias ou operacionais para inclusão na Pré-Ata.`;

  const contents = [
    ...proposalFiles,
    { text: promptText }
  ];

  const modelName = modelsConfig.proposalModel || 'gemini-2.5-pro';
  const temperature = modelsConfig.proposalParams?.temperature ?? 0.2;

  const config: any = {
    systemInstruction,
    responseMimeType: 'application/json',
    responseSchema: proposalResponseSchema,
    temperature
  };

  if (modelsConfig.proposalParams) {
    if (modelsConfig.proposalParams.topP !== undefined) config.topP = modelsConfig.proposalParams.topP;
    if (modelsConfig.proposalParams.maxOutputTokens !== undefined) config.maxOutputTokens = modelsConfig.proposalParams.maxOutputTokens;
    if (modelsConfig.proposalParams.thinkingBudget !== undefined && modelsConfig.proposalParams.thinkingBudget > 0) {
      config.thinkingConfig = { thinkingBudget: modelsConfig.proposalParams.thinkingBudget };
    }
  }

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config
    });

    const parsed = safeParseJsonFromAI(response.text || '{}', {
      divergences: []
    });

    const rawDivergences = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.divergences) ? parsed.divergences : []);
    const divergencesList = rawDivergences.map((d: any, idx: number) => {
      const res = DivergenceItemSchema.safeParse(d);
      return res.success ? { ...res.data, id: `div-${idx + 1}` } : {
        id: `div-${idx + 1}`,
        description: d.description || d.descricao || d.divergencia || d.titulo || `Divergência ${idx + 1}`,
        severity: d.severity || d.severidade || 'MEDIA',
        source: d.source || d.fonte || 'Proposta'
      };
    });

    if (meetingId) {
      setAnalysisProgress(meetingId, {
        stage: 'COMPLETED',
        totalBatches: 1,
        currentBatch: 1,
        progressPercent: 100,
        message: `Análise da Proposta concluída (${divergencesList.length} divergências encontradas).`
      });
    }

    addLog('INFO', 'AI', `[promptVersion: ${promptVersion}] Análise de Proposta concluída: ${divergencesList.length} divergências identificadas`, {
      promptVersion,
      model: modelName,
      divergencesCount: divergencesList.length
    });

    return divergencesList;
  } catch (err: any) {
    addLog('ERROR', 'AI', `[promptVersion: ${promptVersion}] Erro na análise de propostas: ${err.message}`);
    throw err;
  }
}

// ==================== 3. TRANSCRIPTION PIPELINE: SEGMENTATION & DECISIONS (PROMPT 07) ====================

// Chamada 1: Segmentação de Transcrição (Flash)
const segmentationResponseSchema = {
  type: Type.OBJECT,
  properties: {
    segmentos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          topicoId: { type: Type.STRING },
          titulo: { type: Type.STRING },
          tipo: { type: Type.STRING, enum: ['DELIBERACAO', 'RUIDO'] },
          trecho: { type: Type.STRING }
        },
        required: ['tipo', 'trecho']
      }
    }
  },
  required: ['segmentos']
};

export async function segmentarTranscricao(
  transcript: string,
  topics: any[],
  meetingId?: string
): Promise<{ segmentos: { topicoId?: string; titulo?: string; tipo: 'DELIBERACAO' | 'RUIDO'; trecho: string }[]; promptVersion: string }> {
  const promptVersion = PROMPT_VERSIONS.segmentation;
  const modelsConfig = await getStoredModelsConfig();
  const flashModelName = process.env.AI_SEGMENTATION_MODEL || process.env.AI_FLASH_MODEL || 'gemini-2.5-flash';

  if (meetingId) {
    setAnalysisProgress(meetingId, {
      stage: 'SEGMENTATION',
      totalBatches: 2,
      currentBatch: 1,
      progressPercent: 50,
      message: 'Segmentando diálogo da transcrição e filtrando ruídos com Gemini Flash...'
    });
  }

  const topicsListSummary = topics.map((t, idx) =>
    `- ID: "${t.id || `topic-${idx + 1}`}" | Título: "${t.title || t.titulo || `Tópico ${idx + 1}`}"`
  ).join('\n');

  const systemInstruction = `Você é um Analista Técnico Especialista em Transcrições de Reuniões de Engenharia da Afonso França.
Sua missão é ler a transcrição bruta da reunião, segmentar o fluxo de fala e rotular cada trecho:
1. Trechos técnicos, contratuais, alinhamento de preços, prazos, deliberações e acordos devem ser classificados como "DELIBERACAO" e associados ao "topicoId" correspondente da pauta.
2. Trechos de conversas informais, cumprimentos, piadas, interrupções ou discussões sem valor contratual devem ser classificados como "RUIDO".

PAUTA DE TÓPICOS IDENTIFICADOS:
${topicsListSummary || 'Pauta geral de contratação de suprimentos e serviços.'}`;

  const promptText = `Transcreve e rotula os trechos da seguinte reunião em segmentos estruturados:

=== TRANSCRIÇÃO BRUTA ===
${transcript}
=========================`;

  try {
    const response = await ai.models.generateContent({
      model: flashModelName,
      contents: [{ text: promptText }],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: segmentationResponseSchema,
        temperature: 0.2
      }
    });

    const parsed = safeParseJsonFromAI(response.text || '{}', { segmentos: [] });
    const rawSegmentos: any[] = Array.isArray(parsed.segmentos) ? parsed.segmentos : [];

    const segmentos = rawSegmentos.map((s: any) => ({
      topicoId: s.topicoId ? String(s.topicoId).trim() : undefined,
      titulo: s.titulo ? String(s.titulo).trim() : undefined,
      tipo: (s.tipo === 'RUIDO' ? 'RUIDO' : 'DELIBERACAO') as 'DELIBERACAO' | 'RUIDO',
      trecho: String(s.trecho || '').trim()
    })).filter(s => s.trecho.length > 0);

    const deliberacoes = segmentos.filter(s => s.tipo === 'DELIBERACAO');
    const ruidos = segmentos.filter(s => s.tipo === 'RUIDO');

    addLog('INFO', 'AI', `[promptVersion: ${promptVersion}] Segmentação de transcrição concluída: ${deliberacoes.length} deliberações, ${ruidos.length} trechos de ruído filtrados`, {
      promptVersion,
      model: flashModelName,
      totalSegmentos: segmentos.length,
      deliberacoesCount: deliberacoes.length,
      ruidosCount: ruidos.length
    });

    return { segmentos, promptVersion };
  } catch (err: any) {
    addLog('WARN', 'AI', `[promptVersion: ${promptVersion}] Falha na segmentação Flash. Utilizando transcrição integral: ${err.message}`);
    return {
      segmentos: [{ tipo: 'DELIBERACAO', trecho: transcript }],
      promptVersion
    };
  }
}

// Chamada 2: Extração de Decisões e Consolidação do AtaState (Pro)
const finalAtaResponseSchema = {
  type: Type.OBJECT,
  properties: {
    resumo: { type: Type.STRING, description: 'Resumo executivo completo e estruturado da reunião com quebras de linha e tópicos' },
    participantes: {
      type: Type.ARRAY,
      description: 'Tabela de participantes presentes na reunião identificados na transcrição e abertura',
      items: {
        type: Type.OBJECT,
        properties: {
          nome: { type: Type.STRING, description: 'Nome completo do participante' },
          cargoDepto: { type: Type.STRING, description: 'Cargo, função ou departamento' },
          empresa: { type: Type.STRING, description: 'Empresa representada (ex: Afonso França Engenharia ou Fornecedor)' },
          email: { type: Type.STRING, description: 'E-mail corporativo do participante se citado na transcrição/proposta' },
          visto: { type: Type.STRING, description: 'Visto ou presença' }
        },
        required: ['nome', 'empresa']
      }
    },
    topicos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          topicoId: { type: Type.STRING },
          titulo: { type: Type.STRING },
          situacao: {
            type: Type.STRING,
            enum: ['ATUALIZADO', 'ACORDADO', 'PENDENTE', 'MANTIDO_PADRAO', 'NAO_APLICAVEL']
          },
          textoAta: { type: Type.STRING },
          camposADefinir: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          ancoraTranscricao: { type: Type.STRING },
          responsavel: { type: Type.STRING },
          prazo: { type: Type.STRING }
        },
        required: ['topicoId', 'titulo', 'situacao', 'textoAta']
      }
    },
    itensDeAcao: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          num: { type: Type.STRING },
          descricao: { type: Type.STRING },
          responsavel: { type: Type.STRING },
          prazo: { type: Type.STRING }
        },
        required: ['descricao']
      }
    }
  },
  required: ['topicos']
};

// ==================== PARTICIPANT EXTRACTION & SANITIZATION ====================

export function isInvalidPersonName(name: string): boolean {
  if (!name || name.trim().length < 2) return true;
  const clean = name.trim().toLowerCase();
  const invalidPrefixes = [
    'coordena', 'representante', 'comprador', 'diretor', 'diretoria',
    'engenheiro', 'engenharia', 'gerente', 'gerência', 'fiscal', 'fiscalização',
    'suprimento', 'analista', 'técnico', 'tecnico', 'gestor', 'equipe',
    'setor', 'departamento', 'consultor', 'consultoria', 'comercial', 'área de', 'area de'
  ];
  return invalidPrefixes.some(pref => clean.startsWith(pref));
}

export function sanitizeParticipantesList(list: any[]): Participante[] {
  const result: Participante[] = [];
  const seen = new Set<string>();

  for (const p of list) {
    let nome = (p?.nome || '').trim();
    let cargoDepto = (p?.cargoDepto || p?.cargo || '').trim();
    let empresa = (p?.empresa || '').trim();
    let email = (p?.email || '').trim();
    let visto = (p?.visto || '').trim();

    // Se o 'nome' for na verdade um cargo ou departamento (ex: "Coordenação de Engenharia...", "Representante Comercial...")
    if (isInvalidPersonName(nome)) {
      if (!cargoDepto) {
        cargoDepto = nome;
      }
      nome = ''; // Limpa nome inválido para não poluir a coluna de pessoas físicas
    }

    // Se não tiver nome de pessoa física, nem cargo, nem empresa, ignora
    if (!nome && !cargoDepto && !empresa && !email) {
      continue;
    }

    const dedupeKey = normalizarTexto(`${nome || cargoDepto}-${empresa}`);
    if (dedupeKey && !seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      result.push({
        nome,
        cargoDepto,
        empresa,
        email,
        visto
      });
    }
  }

  return result;
}

export async function generateFinalAta(
  abertura: any,
  checklistData: any,
  divergences: any[],
  transcript: string,
  meetingId?: string
): Promise<AtaState & { agreedItems: any[]; pendingItems: any[]; notes: string }> {
  // PROMPT 06 b: Sem transcrição, a rota deve falhar sem fabricar texto
  if (!transcript || !transcript.trim()) {
    const msg = 'Transcrição da reunião ausente. Anexe a transcrição ou decida tópico a tópico na lista de verificação.';
    addLog('WARN', 'AI', `Tentativa de gerar Ata Final sem transcrição: ${msg}`);
    const err: any = new Error(msg);
    err.statusCode = 422;
    err.code = 'TRANSCRIPT_REQUIRED';
    throw err;
  }

  const template = await getActiveTemplateFromDb();
  if (!template || !template.docxBlobBase64) {
    throw new Error('Nenhum template DOCX ativo disponível. Faça o upload do template oficial antes de redigir a Ata Final.');
  }

  const prompts = await getStoredPrompts();
  const modelsConfig = await getStoredModelsConfig();
  const templateContext = buildTemplateContextPrompt(template);

  // Extrai textos padrão do template para preencher itens MANTIDO_PADRAO (PROMPT 05 / 06)
  const templateBodyTable = encontrarTabelaCorpo(template.tables || []);
  const textosPadraoTemplate = templateBodyTable ? extrairTextosPadraoDoTemplate(templateBodyTable) : [];

  // Normalize checklist data and topics
  const topics: any[] = Array.isArray(checklistData)
    ? checklistData
    : (Array.isArray(checklistData?.topics) ? checklistData.topics : []);
  
  const checklistSummary = typeof checklistData === 'string'
    ? checklistData
    : (checklistData?.summary || '');
  
  const generalRules: string[] = Array.isArray(checklistData?.generalRules)
    ? checklistData.generalRules
    : [];

  const normalizedDivergences: any[] = Array.isArray(divergences) ? divergences : [];
  const fornecedorNome = abertura?.fornecedor || 'Fornecedor';
  const obraIdentificacao = `${abertura?.obraCodigo || 'S/N'} - ${abertura?.obraNome || 'Obra'}`;

  // PROMPT 07: Etapa 1 do pipeline de transcrição - Segmentação Flash
  const { segmentos, promptVersion: segPromptVersion } = await segmentarTranscricao(transcript, topics, meetingId);
  const deliberacoesTrechos = segmentos
    .filter(s => s.tipo === 'DELIBERACAO')
    .map(s => `[${s.titulo || s.topicoId || 'Geral'}] ${s.trecho}`)
    .join('\n\n');

  if (meetingId) {
    setAnalysisProgress(meetingId, {
      stage: 'DECISION_EXTRACTION',
      totalBatches: 2,
      currentBatch: 2,
      progressPercent: 80,
      message: 'Extraindo decisões e consolidando AtaState com Gemini Pro...'
    });
  }

  // PROMPT 07: Etapa 2 do pipeline de transcrição - Extração de Decisões Pro
  const decisionsPromptVersion = PROMPT_VERSIONS.decisions;

  const systemInstruction = `Você é o Redator Técnico Oficial de Atas de Reunião de Suprimentos e Engenharia da Afonso França Engenharia.
Sua missão é consolidar a Ata de Reunião Oficial Final no formato estruturado TopicoEstado[], cruzando obrigatoriamente:
1. O Check List de Suprimentos da Obra;
2. As Divergências da Proposta Comercial e Ressalvas Técnicas/Comerciais;
3. As Cláusulas e Tabela do Template Oficial da Ata;
4. A Transcrição Integral e Segmentos de Deliberação da Reunião.

${templateContext}

${prompts?.finalAtaInstructions ? `DIRETRIZES PERSONALIZADAS DA ADMINISTRAÇÃO PARA ATA FINAL E PARTICIPANTES:\n${prompts.finalAtaInstructions}\n` : ''}

DADOS DA CONTRATAÇÃO:
- Obra: ${obraIdentificacao}
- Fornecedor: ${fornecedorNome}
- Objeto / Assunto: ${abertura?.assunto || 'Contratação de Fornecimento e Serviços'}
- Pacote / Serviço: ${abertura?.servico || 'Serviços de Engenharia'}
- RM / Cotação: RM ${abertura?.rm || 'S/N'} • COT ${abertura?.cot || 'S/N'}

REGRAS RÍGIDAS DE IDENTIFICAÇÃO DE PARTICIPANTES, PENDÊNCIAS E RESUMO EXECUTIVO (PROMPTS 06 & 07):
1. IDENTIFICAÇÃO FORÇADA DE PARTICIPANTES DA REUNIÃO (OBRIGATÓRIO):
   - Faça uma varredura COMPLETA e RIGOROSA na transcrição da reunião para identificar TODAS as pessoas físicas presentes (falas, apresentações, saudações, introduções, nomes de engenheiros, compradores, coordenadores da Afonso França Engenharia e representantes/diretores/técnicos do fornecedor).
   - REGRAS MANDATÓRIAS PARA O CAMPO 'nome':
     • O campo "nome" DEVE conter OBRIGATORIAMENTE o NOME e SOBRENOME de uma PESSOA FÍSICA REAL (ex: "Carlos Eduardo Silva", "Thais Louise Barroso", "Mariana Costa").
     • NUNCA utilize termos como "Coordenação de Engenharia...", "Representante Comercial...", "Comprador", "Diretoria", "Gerente da Obra", "Fiscal", "Suprimentos", "Setor Técnico" no campo "nome". Esses termos NÃO são nomes de pessoas!
     • Se alguém se apresentar como "Aqui é a Coordenação de Engenharia, Carlos falando", o "nome" é "Carlos", o "cargoDepto" é "Coordenação de Engenharia" e a "empresa" é "Afonso França Engenharia".
     • Se na fala for citado apenas um cargo ou departamento sem NENHUM nome de pessoa física associado, NÃO crie um participante nominal.
   - Para cada participante identificado, preencha:
     • "nome": Nome completo da pessoa (ex: "Carlos Eduardo Silva", "Thais Louise Barroso")
     • "cargoDepto": Cargo, função ou departamento (ex: "Engenheiro Coordenador", "Analista de Suprimentos", "Diretor Técnico", "Gerente Comercial")
     • "empresa": Razão social / Nome da Empresa representada (ex: "Afonso França Engenharia", ou o nome do fornecedor "${fornecedorNome}")
     • "email": E-mail corporativo (se citado na transcrição, cabeçalho ou proposta; se não constar, prever formato de e-mail corporativo ou deixar em branco)
     • "visto": Visto ou indicação de presença (ex: "Presente" ou "")
   - Mescle e consolide todos os participantes já previamente cadastrados na Abertura com os novos participantes extraídos da transcrição, garantindo que TODOS os interlocutores constem na tabela de participantes.

2. IDENTIFICAÇÃO DE PENDÊNCIAS (OBRIGATÓRIO):
   - Cruze atentamente as Divergências da Proposta Comercial com a transcrição da reunião. Se houver divergência não sanada ou condicionada a envio posterior de nova proposta/documentação/memória de cálculo pelo fornecedor, classifique obrigatoriamente o tópico como "PENDENTE" e cadastre uma entrada em "itensDeAcao" com responsável e prazo.
   - Verifique requisitos do Checklist e do Template de Obra que exigem documentos prévios (ex: ART/RRT, PCMSO/PGR/LTCAT, Comprovante de EPI com CA, Certidões Negativas, Cronograma Detalhado, Amostras para Aprovação, Carta de Fiança/Garantia). Havendo pendência de entrega ou aprovação, registre como "PENDENTE".
   - Todo item com ressalva, pendência de documentação, prazo de regularização ou aprovação futura DEVE ter situação "PENDENTE".

3. ESTRUTURAÇÃO DO RESUMO EXECUTIVO (CAMPO 'resumo'):
   - O Resumo Executivo deve ser completo, formal, fidedigno e perfeitamente legível com quebras de linha e seções claras.
   - Formate o texto com seções temáticas indentadas:
     • 1. OBJETO E ESCOPO: Descrição da contratação para a obra ${obraIdentificacao}, fornecedor ${fornecedorNome} e pacote ${abertura?.servico || 'especificado'}.
     • 2. CONDIÇÕES COMERCIAIS E FATURAMENTO: Síntese dos valores negociados, retenção de garantia, medições e condições de pagamento aprovadas.
     • 3. CRONOGRAMA E MOBILIZAÇÃO: Datas de início, prazos de execução, marcos críticos e liberação de frentes de serviço.
     • 4. SEGURANÇA DO TRABALHO E DOCUMENTAÇÃO (SST): Exigências mandatórias para integração da equipe e início dos serviços.
     • 5. ENCAMINHAMENTOS E PENDÊNCIAS CRÍTICAS: Síntese das entregas pendentes com prazos limites fixados na reunião.

4. CLASSIFICAÇÃO DE CADA TÓPICO:
   - "ACORDADO": O item foi expressamente deliberado e aceito pelas partes na reunião. É OBRIGATÓRIO fornecer "ancoraTranscricao" contendo citação literal ou trecho comprovatório da transcrição.
   - "PENDENTE": O item possui ressalva técnica/comercial, divergência da proposta ou documentação pendente de envio pelo fornecedor ou aprovação pela engenharia.
   - "MANTIDO_PADRAO": O item do checklist/template não sofreu alteração e mantém a regra corporativa da Afonso França.
   - "ATUALIZADO": O item foi retificado e atualizado conforme alinhamento em reunião.
   - "NAO_APLICAVEL": O item não se aplica ao escopo contratado.

5. NUNCA invente dados fictícios. Se um dado ou prazo não foi definido na reunião, indique expressamente [A DEFINIR NA REUNIÃO] ou [A DEFINIR].`;

  const promptText = `Consolide a Ata Final oficial da reunião.

=== PARTICIPANTES CADASTRADOS NA ABERTURA ===
${Array.isArray(abertura?.participantes) && abertura.participantes.length > 0 ? JSON.stringify(abertura.participantes, null, 2) : 'Nenhum participante previamente cadastrado.'}
==============================================

=== CHECK LIST DE SUPRIMENTOS DA OBRA ===
${topics.length > 0 ? JSON.stringify(topics, null, 2) : 'Nenhum item de checklist especificado.'}
${generalRules.length > 0 ? `\nRegras Gerais:\n${generalRules.join('\n')}` : ''}
${checklistSummary ? `\nResumo:\n${checklistSummary}` : ''}
=========================================

=== DIVERGÊNCIAS DA PROPOSTA COMERCIAL ===
${normalizedDivergences.length > 0 ? JSON.stringify(normalizedDivergences, null, 2) : 'Nenhuma divergência identificada.'}
===========================================

=== SEGMENTOS DE DELIBERAÇÃO DA TRANSCRIÇÃO (FILTRADOS) ===
${deliberacoesTrechos || transcript}
===========================================================

=== TRANSCRIÇÃO COMPLETA DA REUNIÃO (FONTE DE PARTICIPANTES E INTRODUÇÕES) ===
${transcript}
=============================================================================`;

  const modelName = modelsConfig.finalAtaModel || 'gemini-2.5-pro';
  const temperature = modelsConfig.finalAtaParams?.temperature ?? 0.2;

  const config: any = {
    systemInstruction,
    responseMimeType: 'application/json',
    responseSchema: finalAtaResponseSchema,
    temperature
  };

  if (modelsConfig.finalAtaParams) {
    if (modelsConfig.finalAtaParams.topP !== undefined) config.topP = modelsConfig.finalAtaParams.topP;
    if (modelsConfig.finalAtaParams.maxOutputTokens !== undefined) config.maxOutputTokens = modelsConfig.finalAtaParams.maxOutputTokens;
    if (modelsConfig.finalAtaParams.thinkingBudget !== undefined && modelsConfig.finalAtaParams.thinkingBudget > 0) {
      config.thinkingConfig = { thinkingBudget: modelsConfig.finalAtaParams.thinkingBudget };
    }
  }

  let rawResponseText = '';
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ text: promptText }],
      config
    });
    rawResponseText = response.text || '';
  } catch (err: any) {
    // PROMPT 06 a: Falha do LLM => lançar erro (502 no gateway), NUNCA fabricar documento
    addLog('ERROR', 'AI', `[promptVersion: ${decisionsPromptVersion}] Falha na comunicação com o LLM para geração da Ata Final: ${err.message}`, {
      promptVersion: decisionsPromptVersion,
      model: modelName,
      error: err.message
    });
    const gatewayErr: any = new Error(`Falha de processamento de IA: ${err.message}`);
    gatewayErr.statusCode = 502;
    gatewayErr.code = 'LLM_GATEWAY_ERROR';
    throw gatewayErr;
  }

  const parsed = safeParseJsonFromAI(rawResponseText, {
    resumo: '',
    participantes: [],
    topicos: [],
    itensDeAcao: []
  });

  // Extrai lista bruta de tópicos retornada pelo LLM
  const rawTopicosList: any[] = Array.isArray(parsed.topicos) ? parsed.topicos : [];

  // Mapeia tópicos brutos para a interface TopicoEstado
  let parsedTopicos: TopicoEstado[] = rawTopicosList.map((t: any, idx: number) => {
    const topicoId = t.topicoId || `topic-${idx + 1}`;
    const titulo = t.titulo || t.title || `Item ${idx + 1}`;
    const situacao: Situacao = ['ATUALIZADO', 'ACORDADO', 'PENDENTE', 'MANTIDO_PADRAO', 'NAO_APLICAVEL'].includes(t.situacao)
      ? t.situacao
      : 'PENDENTE';
    const textoAta = t.textoAta || t.descricao || t.texto || '';
    const camposADefinir = Array.isArray(t.camposADefinir) ? t.camposADefinir : [];
    const responsavel = t.responsavel && t.responsavel.trim() ? t.responsavel.trim() : null;
    const prazo = t.prazo && t.prazo.trim() ? t.prazo.trim() : null;
    const ancoraTranscricao = t.ancoraTranscricao ? String(t.ancoraTranscricao).trim() : undefined;

    return {
      topicoId,
      titulo,
      situacao,
      textoAta,
      camposADefinir,
      origens: [{ doc: 'TRANSCRICAO', ref: 'Reunião de Alinhamento', citacao: ancoraTranscricao }],
      ancoraTranscricao,
      responsavel,
      prazo
    };
  });

  // PROMPT 06 d: Tópico aplicável do checklist ausente na resposta => MANTIDO_PADRAO com o texto padrão do template, nunca inventado
  const existingTitles = new Set(parsedTopicos.map(pt => normalizarTexto(pt.titulo)));
  
  if (topics.length > 0) {
    topics.forEach((ckTopic: any, idx: number) => {
      const ckTitle = ckTopic.title || ckTopic.titulo || `Regra ${idx + 1}`;
      if (!existingTitles.has(normalizarTexto(ckTitle))) {
        // Busca texto padrão extraído do template correspondente ou da regra da obra
        const defaultTemplateRow =
          textosPadraoTemplate.find(tp => normalizarTexto(tp.titulo || '') === normalizarTexto(ckTitle))
          || textosPadraoTemplate[idx] || null;
        const textoDescricaoPadrao = defaultTemplateRow?.descricao || ckTopic.regraObra || '[A DEFINIR NA REUNIÃO]';

        parsedTopicos.push({
          topicoId: ckTopic.id || `ck-topic-${idx + 1}`,
          titulo: ckTitle,
          situacao: 'MANTIDO_PADRAO',
          textoAta: textoDescricaoPadrao,
          camposADefinir: ['[A DEFINIR NA REUNIÃO]'],
          origens: [{ doc: 'MODELO', ref: 'Template Oficial', citacao: 'Texto Padrão da Tabela de Corpo' }],
          responsavel: null,
          prazo: null
        });
        existingTitles.add(normalizarTexto(ckTitle));
      }
    });
  }

  // FORCE INJECTION: Garante a injeção integral da matriz de textos padrão do modelo DOCX original, independentemente de terem sido mapeadas como tópicos na Pré-Ata
  if (textosPadraoTemplate.length > 0) {
    textosPadraoTemplate.forEach((tp: any, idx: number) => {
      const title = tp.titulo || `Regra Template ${idx + 1}`;
      if (title.trim() && !existingTitles.has(normalizarTexto(title))) {
        parsedTopicos.push({
          topicoId: `tpl-topic-${idx + 1}`,
          titulo: title,
          situacao: 'MANTIDO_PADRAO',
          textoAta: tp.descricao || '[A DEFINIR NA REUNIÃO]',
          camposADefinir: ['[A DEFINIR NA REUNIÃO]'],
          origens: [{ doc: 'MODELO', ref: 'Template Oficial', citacao: 'Texto Padrão da Tabela de Corpo' }],
          responsavel: null,
          prazo: null
        });
        existingTitles.add(normalizarTexto(title));
      }
    });
  }

  // Prepara fontes textuais para a validação V3 (Checklist, Proposta, Transcrição, Template)
  const fontesTextuais: string[] = [
    transcript,
    JSON.stringify(checklistData || {}),
    JSON.stringify(normalizedDivergences),
    JSON.stringify(abertura || {}),
    ...textosPadraoTemplate.map(tp => tp.descricao)
  ];

  // PROMPT 06 c: Aplica validações em código V1, V2 e V3
  const { topicosValidados, conflitosV3 } = validarTopicosAtaState(parsedTopicos, transcript, fontesTextuais);

  if (conflitosV3.length > 0) {
    addLog('WARN', 'AI', `[promptVersion: ${decisionsPromptVersion}] Conflitos V3 identificados na Ata Final: ${conflitosV3.length} tópicos contêm números/valores ausentes nas fontes`, {
      promptVersion: decisionsPromptVersion,
      conflitosCount: conflitosV3.length,
      conflitos: conflitosV3
    });
  }

  // Participantes consolidados (mesclando os já cadastrados na Abertura com os identificados na transcrição pela IA)
  const rawParticipantesList: any[] = [];

  if (Array.isArray(abertura?.participantes)) {
    abertura.participantes.forEach((p: any) => {
      rawParticipantesList.push(p);
    });
  }

  if (Array.isArray(parsed.participantes)) {
    parsed.participantes.forEach((p: any) => {
      rawParticipantesList.push(p);
    });
  }

  const finalParticipantes: Participante[] = sanitizeParticipantesList(rawParticipantesList);

  // Divergências da proposta
  const finalDivergencias: Divergencia[] = normalizedDivergences.map((d: any, idx: number) => ({
    id: d.id || `div-${idx + 1}`,
    severidade: (d.severity || d.severidade || 'MEDIA').toUpperCase() as any,
    descricao: d.description || d.descricao || '',
    regraChecklist: d.regraChecklist || '',
    propostaFornecedor: d.source || d.propostaFornecedor || '',
    status: 'PENDENTE'
  }));

  // Itens de Ação
  const finalItensAcao: ItemAcao[] = Array.isArray(parsed.itensDeAcao)
    ? parsed.itensDeAcao.map((it: any, idx: number) => ({
        id: `acao-${idx + 1}`,
        num: it.num || String(idx + 1).padStart(2, '0'),
        descricao: it.descricao || '',
        responsavel: it.responsavel || null,
        prazo: it.prazo || null,
        status: 'PENDENTE'
      }))
    : [];

  const ataState: AtaState = {
    versao: 1,
    topicos: topicosValidados,
    participantes: finalParticipantes,
    resumo: parsed.resumo && parsed.resumo.trim() ? parsed.resumo.trim() : null,
    divergencias: finalDivergencias,
    itensDeAcao: finalItensAcao,
    proveniencia: {
      promptVersion: {
        checklist: PROMPT_VERSIONS.checklist,
        proposal: PROMPT_VERSIONS.proposal,
        segmentation: PROMPT_VERSIONS.segmentation,
        decisions: PROMPT_VERSIONS.decisions,
        metadata: PROMPT_VERSIONS.metadata
      },
      modelo: modelName,
      templateId: template.id,
      templateVersion: template.version,
      hashesFontes: []
    }
  };

  // Prepara retrocompatibilidade para views que esperam agreedItems e pendingItems
  const agreedItems = topicosValidados
    .filter(t => t.situacao === 'ACORDADO' || t.situacao === 'ATUALIZADO' || t.situacao === 'MANTIDO_PADRAO')
    .map((t, idx) => ({
      item: String(idx + 1).padStart(2, '0'),
      num: String(idx + 1).padStart(2, '0'),
      titulo: t.titulo,
      descricao: t.textoAta,
      responsavel: t.responsavel,
      prazo: t.prazo,
      blocos: t.blocos
    }));

  const pendingItems: any[] = [
    ...topicosValidados
      .filter(t => t.situacao === 'PENDENTE')
      .map(t => ({
        titulo: t.titulo,
        descricao: t.textoAta,
        responsavel: t.responsavel,
        prazo: t.prazo,
        blocos: t.blocos
      })),
    ...finalItensAcao.map(it => ({
      titulo: 'Item de Ação',
      descricao: it.descricao,
      responsavel: it.responsavel,
      prazo: it.prazo
    })),
    ...finalDivergencias.map(d => ({
      titulo: `Divergência [${d.severidade}]`,
      descricao: `${d.descricao} (Regra: ${d.regraChecklist} | Proposta: ${d.propostaFornecedor})`,
      responsavel: 'A Definir',
      prazo: 'A Definir'
    }))
  ].map((it, idx) => ({
    ...it,
    item: String(idx + 1).padStart(2, '0'),
    num: String(idx + 1).padStart(2, '0')
  }));

  if (meetingId) {
    setAnalysisProgress(meetingId, {
      stage: 'COMPLETED',
      totalBatches: 2,
      currentBatch: 2,
      progressPercent: 100,
      message: `AtaState gerado e validado com sucesso (${topicosValidados.length} tópicos).`
    });
  }

  addLog('INFO', 'AI', `[promptVersion: ${decisionsPromptVersion}] AtaState gerado e validado com sucesso: ${topicosValidados.length} tópicos`, {
    promptVersion: decisionsPromptVersion,
    model: modelName,
    templateId: template.id,
    topicosCount: topicosValidados.length,
    conflitosV3Count: conflitosV3.length
  });

  return {
    ...ataState,
    agreedItems,
    pendingItems,
    notes: ataState.resumo || ''
  };
}

// ==================== 4. METADATA EXTRACTION ====================

const metadataResponseSchema = {
  type: Type.OBJECT,
  properties: {
    metadata: {
      type: Type.OBJECT,
      properties: {
        obraCodigo: { type: Type.STRING },
        obraNome: { type: Type.STRING },
        fornecedor: { type: Type.STRING },
        assunto: { type: Type.STRING },
        servico: { type: Type.STRING },
        rm: { type: Type.STRING },
        cot: { type: Type.STRING },
        ataNumero: { type: Type.STRING },
        dataReuniao: { type: Type.STRING },
        horario: { type: Type.STRING },
        local: { type: Type.STRING },
        linkReuniao: { type: Type.STRING },
        folha: { type: Type.STRING },
        resumoExecutivo: { type: Type.STRING },
        valoresComerciais: {
          type: Type.OBJECT,
          properties: {
            valorTotal: { type: Type.STRING },
            valorServicos: { type: Type.STRING },
            valorIndustrializacao: { type: Type.STRING },
            valorVendaMercantil: { type: Type.STRING },
            valorLocacao: { type: Type.STRING },
            valorFretes: { type: Type.STRING },
            valorGerenciamento: { type: Type.STRING },
            valorFaturamentoDireto: { type: Type.STRING },
            sinalMobilizacao: { type: Type.STRING },
            condicaoPagamento: { type: Type.STRING },
            retencaoGarantia: { type: Type.STRING },
            riscoSacado: { type: Type.STRING },
            reajuste: { type: Type.STRING }
          }
        },
        prazosCronograma: {
          type: Type.OBJECT,
          properties: {
            mobilizacao: { type: Type.STRING },
            elaboracaoProjeto: { type: Type.STRING },
            aprovacaoProjeto: { type: Type.STRING },
            entregaMaterial: { type: Type.STRING },
            medidasDefinitivas: { type: Type.STRING },
            fabricacao: { type: Type.STRING },
            execucao: { type: Type.STRING },
            comissionamento: { type: Type.STRING },
            operacaoAssistida: { type: Type.STRING }
          }
        },
        participantes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              nome: { type: Type.STRING },
              cargoDepto: { type: Type.STRING },
              empresa: { type: Type.STRING },
              email: { type: Type.STRING },
              visto: { type: Type.STRING }
            }
          }
        }
      }
    }
  },
  required: ['metadata']
};

export async function extractDocumentMetadata(files: any[]) {
  const template = await getActiveTemplateFromDb();
  const templateContext = template ? buildTemplateContextPrompt(template) : '';
  const promptVersion = PROMPT_VERSIONS.metadata;

  const systemInstruction = `Você é um Engenheiro de Suprimentos Sênior e Extrator Técnico Contratual da Afonso França Engenharia.
Sua missão é inspecionar minuciosamente os arquivos fornecidos (documentos complementares, propostas comerciais, transcrições e planilhas) e extrair com MÁXIMA FIDELIDADE e PRECISÃO todos os metadados verídicos, comerciais, cronogramas, participantes e um resumo executivo bem estruturado e indentado.

ESTRUTURA DE EXTRAÇÃO:
- obraCodigo: Código identificador ou número da obra (ex: 0048, 0590).
- obraNome: Nome oficial do empreendimento ou projeto.
- fornecedor: Razão social ou nome fantasia da empresa fornecedora/contratada.
- assunto: Tema ou objeto da reunião e contratação.
- servico: Descrição detalhada do pacote ou escopo contratado.
- rm: Número da Requisição de Materiais/Serviços (RM).
- cot: Número da Cotação/Proposta Comercial (COT).
- ataNumero: Número sequencial da ata.
- dataReuniao: Data da reunião (formato DD/MM/AAAA).
- horario: Horário da reunião (formato HH:MMh).
- local: Local físico ou plataforma de videoconferência.
- linkReuniao: Link da sala virtual de reunião.
- folha: Número da folha.
- resumoExecutivo: Resumo executivo organizado, com parágrafos claros, tópicos indentados e marcadores executivos (• ou subitens) consolidando:
  * Objeto e Escopo Principal da Contratação
  * Resumo dos Valores e Condição Comercial Negociada
  * Prazos Críticos, Mobilização e Cronograma
  * Diretrizes Mandatórias de Segurança do Trabalho (SST/NRs) e Logística de Canteiro
  * Próximos Passos e Responsabilidades Imediatas
- valoresComerciais: Extrair valores monetários e condições REAIS encontrados nos documentos:
  * valorTotal: Valor global total negociado com moeda (ex: R$ 1.500.000,00)
  * valorServicos: Parcela correspondente a serviços
  * valorIndustrializacao: Parcela de industrialização
  * valorVendaMercantil: Parcela de materiais/venda mercantil
  * valorLocacao: Parcela de locação de equipamentos
  * valorFretes: Custos de frete/transporte
  * valorGerenciamento: Custos de gerenciamento/projetos
  * valorFaturamentoDireto: Condições de faturamento direto se houver
  * sinalMobilizacao: Condição de adiantamento/sinal de mobilização
  * condicaoPagamento: Prazos e percentuais de desembolso (ex: 30 dias fora a quinzena, medição mensal até dia 25)
  * retencaoGarantia: Percentual e prazo de liberação de retenção contratual (ex: 5% por 180 dias)
  * riscoSacado: Prazos e taxas de antecipação bancária/risco sacado
  * reajuste: Regra de reajuste de preços (ex: Fixo e irreajustável por 12 meses)
- prazosCronograma: Extrair prazos REAIS encontrados nos documentos e transcrições:
  * mobilizacao: Prazo ou data para início de mobilização de equipe e canteiro
  * elaboracaoProjeto: Prazo para elaboração dos projetos executivos
  * aprovacaoProjeto: Prazo para análise e aprovação técnica pela construtora
  * entregaMaterial: Prazo de fornecimento de insumos e matérias-primas
  * medidasDefinitivas: Prazo para confirmação de medidas in loco
  * fabricacao: Prazo de produção/fabricação
  * execucao: Duração estimada para execução dos serviços
  * comissionamento: Prazos de testes e comissionamento
  * operacaoAssistida: Período de suporte/operação assistida
- participantes: Lista dos participantes reais identificados nos documentos e transcrição com nome, cargo/depto, empresa, email e visto.

CRÍTICO:
1. NUNCA utilize placeholders genéricos ou fictícios (como "xx dias", "R$ X", "Empresa ABC") se houver dados reais nos documentos.
2. Se uma informação específica não constar nos arquivos analisados, preencha o campo com string vazia "" ou deixe sem valor, nunca inventando dados inexistentes.
${templateContext}`;

  const modelsConfig = await getStoredModelsConfig();
  const modelName = modelsConfig.proposalModel || 'gemini-2.5-flash';

  const promptText = `Analise todos os documentos e transcrições fornecidos e extraia os metadados cadastrais, valores comerciais reais discriminados, cronograma de prazos, participantes e o resumo executivo estruturado e indentado.`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [...files, { text: promptText }],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: metadataResponseSchema,
        temperature: 0.2
      }
    });

    const parsed = safeParseJsonFromAI(response.text || '{}', { metadata: {} });
    const metadataResult = (parsed.metadata && typeof parsed.metadata === 'object' && Object.keys(parsed.metadata).length > 0)
      ? parsed.metadata
      : parsed;

    // Sanitiza participantes extraídos dos metadados
    if (metadataResult && Array.isArray((metadataResult as any).participantes)) {
      (metadataResult as any).participantes = sanitizeParticipantesList((metadataResult as any).participantes);
    }

    addLog('INFO', 'AI', `[promptVersion: ${promptVersion}] Extração de metadados cadastrais concluída`, {
      promptVersion,
      model: modelName
    });
    return { metadata: metadataResult };
  } catch (err: any) {
    addLog('WARN', 'AI', `[promptVersion: ${promptVersion}] Erro ao extrair metadados automáticos: ${err.message}. Tentando fallback em texto...`);
    
    // Fallback: Se falhar em multimodal, tenta passar apenas o texto disponível
    try {
      const textParts = files
        .map(f => f.text || '')
        .filter(t => t && t.trim().length > 0)
        .join('\n\n---\n\n');

      if (textParts) {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ text: `${textParts}\n\n${promptText}` }],
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: metadataResponseSchema,
            temperature: 0.2
          }
        });
        const parsedFallback = safeParseJsonFromAI(response.text || '{}', { metadata: {} });
        const metaFallback = (parsedFallback.metadata && typeof parsedFallback.metadata === 'object') ? parsedFallback.metadata : parsedFallback;
        if (metaFallback && Array.isArray((metaFallback as any).participantes)) {
          (metaFallback as any).participantes = sanitizeParticipantesList((metaFallback as any).participantes);
        }
        return { metadata: metaFallback };
      }
    } catch (fallbackErr: any) {
      addLog('ERROR', 'AI', `Fallback de metadados também falhou: ${fallbackErr.message}`);
    }

    return { metadata: {} };
  }
}

export async function extractTextFromUploadedFiles(files: Express.Multer.File[]): Promise<string> {
  if (!files || files.length === 0) {
    return '';
  }

  const results: string[] = [];

  for (const file of files) {
    const filename = file.originalname || 'documento';
    const mimeType = file.mimetype || '';
    const lowerName = filename.toLowerCase();

    // 1. Plain text / Markdown / CSV
    if (
      mimeType.startsWith('text/') ||
      lowerName.endsWith('.txt') ||
      lowerName.endsWith('.md') ||
      lowerName.endsWith('.csv')
    ) {
      try {
        const text = file.buffer.toString('utf-8').trim();
        if (text) {
          results.push(text);
          continue;
        }
      } catch (err) {
        console.warn(`Erro ao ler arquivo de texto ${filename}:`, err);
      }
    }

    // 2. DOCX documents via Mammoth
    if (
      lowerName.endsWith('.docx') ||
      lowerName.endsWith('.doc') ||
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      try {
        const mammoth = await import('mammoth');
        const extracted = await mammoth.extractRawText({ buffer: file.buffer });
        const text = (extracted.value || '').trim();
        if (text) {
          results.push(text);
          continue;
        }
      } catch (err) {
        console.warn(`Erro ao extrair texto do DOCX com mammoth (${filename}):`, err);
      }
    }

    // 3. Multimodal extraction via Gemini (PDF, Audio, or fallback)
    try {
      let resolvedMime = mimeType;
      if (!resolvedMime || resolvedMime === 'application/octet-stream') {
        if (lowerName.endsWith('.pdf')) resolvedMime = 'application/pdf';
        else if (lowerName.endsWith('.txt')) resolvedMime = 'text/plain';
        else resolvedMime = 'application/pdf';
      }

      const promptText = `Transcreva e extraia todo o texto deste documento na íntegra de forma fidedigna, limpa e estruturada, preservando falas, deliberações, valores, prazos e decisões da reunião. Não resuma: forneça o conteúdo completo.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            inlineData: {
              data: file.buffer.toString('base64'),
              mimeType: resolvedMime
            }
          },
          { text: promptText }
        ]
      });

      const extractedText = (response.text || '').trim();
      if (extractedText) {
        results.push(extractedText);
      }
    } catch (err: any) {
      addLog('WARN', 'AI', `Erro ao extrair texto com Gemini do arquivo ${filename}: ${err.message}`);
      try {
        const fallbackText = file.buffer.toString('utf-8').trim();
        if (fallbackText && fallbackText.length > 20) {
          results.push(fallbackText);
        }
      } catch {
        // ignore
      }
    }
  }

  const finalCombinedText = results.join('\n\n---\n\n');
  addLog('INFO', 'AI', `Texto extraído de ${files.length} arquivo(s) (${finalCombinedText.length} caracteres)`, {
    filesCount: files.length,
    totalCharacters: finalCombinedText.length
  });

  return finalCombinedText;
}

/**
 * Assistente RAG de Atas e Suprimentos (/api/chat).
 */
export async function chatWithAssistant(
  history: { role: string; text: string }[],
  message: string,
  meetingsContext: string = ''
): Promise<string> {
  const modelsConfig = getStoredModelsConfig();
  const modelName = process.env.MODEL_CHAT || process.env.MODEL_FLASH || modelsConfig.chatbotModel || 'gemini-2.5-flash';

  const systemInstruction = `Você é o Assistente Especialista em Suprimentos e Atas de Reunião da Afonso França Engenharia.
Sua missão é responder com precisão, clareza e fundamentação técnica em português do Brasil sobre o histórico de atas, termos negociados, itens acordados, pendências e divergências de fornecedores.
Não use travessões longos ("—"), prefira vírgulas ou pontos.
Se o usuário perguntar sobre atas gravadas ou detalhes de negociações, use prioritariamente o contexto histórico disponibilizado abaixo.

CONTEXTO DE ATAS RECENTES NO SISTEMA:
${meetingsContext || 'Nenhuma ata gravada no momento.'}`;

  try {
    const formattedContents: any[] = [];
    if (Array.isArray(history)) {
      for (const h of history.slice(-10)) {
        formattedContents.push({
          role: h.role === 'model' || h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.text }]
        });
      }
    }
    formattedContents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const response = await ai.models.generateContent({
      model: modelName,
      contents: formattedContents,
      config: {
        systemInstruction,
        temperature: 0.2
      }
    });

    const reply = (response.text || '').trim();
    return reply || 'Não foi possível sintetizar uma resposta para esta consulta no momento.';
  } catch (err: any) {
    addLog('ERROR', 'AI', `Erro no Chatbot RAG (/api/chat): ${err.message}`, { error: err.message });
    throw new Error(`Falha no assistente de IA: ${err.message}`);
  }
}

/**
 * Processador de extração e análise de transcrições (/api/process-sonnet).
 */
export async function processSonnetExtract(textoAta: string): Promise<string> {
  const modelsConfig = getStoredModelsConfig();
  const modelName = process.env.MODEL_PRO || process.env.MODEL_FLASH || modelsConfig.finalAtaModel || 'gemini-2.5-pro';

  const prompt = `Você é um engenheiro sênior de suprimentos da Afonso França Engenharia.
Analise detalhadamente o texto e transcrição abaixo extraindo:
1. Resumo Executivo da Negociação
2. Itens e Escopos Acordados (com responsabilidades e prazos quando citados)
3. Pendências Críticas / Itens Não Resolvidos
4. Condições Comerciais, Preços e Formas de Pagamento
5. Riscos de Segurança, SST e Normas Regulamentadoras

Formate a resposta em Markdown limpo, estruturado por tópicos e bullets legíveis. Não use travessões ("—"), use vírgulas ou pontos.

TEXTO DA TRANSCRIÇÃO / REUNIÃO:
${textoAta}`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        temperature: 0.2
      }
    });

    const output = (response.text || '').trim();
    return output || 'Nenhum resultado estruturado pôde ser extraído da transcrição fornecida.';
  } catch (err: any) {
    addLog('ERROR', 'AI', `Erro no processamento de transcrição (/api/process-sonnet): ${err.message}`);
    throw new Error(`Falha no processamento com IA: ${err.message}`);
  }
}


import { GoogleGenAI, Type } from '@google/genai';
import { getStoredPrompts, getStoredModelsConfig } from './configStore';
import { getActiveTemplateFromDb } from './templateRepository';
import { 
  TopicItemSchema, 
  DivergenceItemSchema, 
  FinalAtaValidationSchema, 
  TemplateSchema,
  BlocosListSchema
} from './types/template';
import { addLog } from './logger';
import { z } from 'zod';

const ai = new GoogleGenAI({});

function cleanJsonText(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

/**
 * Builds a comprehensive prompt description of the active template structure, text content, tables, and loops.
 */
function buildTemplateContextPrompt(template: any): string {
  if (!template) {
    return 'ATENÇÃO: Nenhum template DOCX cadastrado.';
  }

  const schema: TemplateSchema = template.schema;
  const fieldsDesc = schema?.fields
    ? schema.fields.map(f => `- ${f.name} (${f.type}${f.required ? ', OBRIGATÓRIO' : ''}): ${f.description || f.name}`).join('\n')
    : 'Campos padrão corporativos';

  const loopsDesc = schema?.loops
    ? schema.loops.map(l => `- Loop/Tabela {${l.tag}}: ${l.description || l.tag} (Colunas: ${l.columns?.map(c => `${c.label || c.key} (col ${c.cellIndex}): ${c.key}`).join(', ') || 'padrão'})`).join('\n')
    : 'Tabela principal de itens e tópicos';

  let tablesInspectionDesc = '';
  if (template.tables && template.tables.length > 0) {
    tablesInspectionDesc = template.tables.map((t: any, idx: number) => {
      const headers = t.rows?.[0]?.cells?.filter(Boolean).join(' | ') || 'Sem cabeçalho explícito';
      const sampleRow = t.rows?.[1]?.cells?.filter(Boolean).join(' | ') || '';
      return `  • Tabela #${idx + 1} (${t.rowCount} linhas x ${t.colCount} colunas):\n    - Cabeçalho: [ ${headers} ]\n    ${sampleRow ? `- Linha de exemplo do template: [ ${sampleRow} ]` : ''}`;
    }).join('\n');
  }

  const rawPreview = template.rawTextPreview
    ? template.rawTextPreview.replace(/\s+/g, ' ').slice(0, 2500)
    : '';

  return `
======================================================================
ESTRUTURA E CONTEÚDO DO TEMPLATE DOCX OFICIAL ATIVO (REFERÊNCIA OBRIGATÓRIA):
- Nome do Template: "${template.name || 'Template Padrão'}" (v${template.version || 1})
- Departamento: "${template.companyName || 'DEPARTAMENTO DE SUPRIMENTOS - AFONSO FRANÇA ENGENHARIA'}"
- Resumo Estrutural: ${template.structureSummary || 'Documento DOCX corporativo com tabelas de deliberações e campos de identificação da obra.'}

${template.preAtaIntro ? `TEXTO INTRODUTÓRIO DO TEMPLATE:\n"${template.preAtaIntro}"\n` : ''}
${template.standardClauses ? `CLÁUSULAS / ORIENTAÇÕES PADRÃO DO TEMPLATE:\n"${template.standardClauses}"\n` : ''}

TABELAS E COLUNAS DO TEMPLATE OFICIAL:
${tablesInspectionDesc || loopsDesc}

VARIÁVEIS/TAGS MAPEADAS NO TEMPLATE:
${fieldsDesc}

AMOSTRA DO CONTEÚDO TEXTUAL DO TEMPLATE (VOCABULÁRIO, DISPOSIÇÃO E PADRÃO AFONSO FRANÇA):
"""
${rawPreview}
"""

DIRETRIZES DE DISPOSIÇÃO E FORMATAÇÃO:
1. Mantenha estrita coerência com a disposição das tabelas e títulos do template DOCX acima.
2. Cada item gerado deve corresponder exatamente às colunas identificadas (ex: Número, Descrição Técnica/Acordada, Responsável, Prazo).
3. Utilize a linguagem técnica de engenharia civil, contratos e suprimentos da Afonso França.
======================================================================
`;
}

export async function analyzeChecklist(files: { inlineData: { data: string; mimeType: string } }[]) {
  const template = await getActiveTemplateFromDb();
  if (!template || !template.docxBlobBase64) {
    throw new Error('Nenhum template DOCX ativo disponível. Faça o upload do template oficial antes de realizar as análises de checklist.');
  }

  const prompts = await getStoredPrompts();
  const modelsConfig = await getStoredModelsConfig();
  const templateContext = buildTemplateContextPrompt(template);

  const systemInstruction = `Você é um Engenheiro de Suprimentos Sênior Especialista em Contratações e Gestão de Obras Civis da Afonso França Engenharia.
Sua missão é realizar a LEITURA, EXTRAÇÃO DE PREMISSAS E ANÁLISE DE CONFORMIDADE técnica e operacional dos documentos de Check List da Obra (regras, cronogramas, critérios de medição, penalidades, logística de canteiro, normas de segurança e restrições).

CRÍTICO - ENQUADRAMENTO DAS PREMISSAS NO TEMPLATE:
Você DEVE utilizar a estrutura, seções, vocabulário e tabelas do TEMPLATE DOCX OFICIAL ATIVO como parâmetro e contexto obrigatório de enquadramento. Cada exigência e premissa identificada no Check List deve ser categorizada e estruturada exatamente de acordo com as seções e colunas do template oficial.

${templateContext}

REGRAS DE FORMATAÇÃO E ESTRUTURAÇÃO DO JSON DE RESPOSTA:
1. "tipoFornecimento": Identifique o tipo de fornecimento da contratação (ex: "Subempreitada de Serviços e Materiais", "Empreitada Global", "Fornecimento de Materiais e Equipamentos", "Locação de Equipamentos").
2. "topics": Array contendo TODOS os tópicos, premissas técnicas, exigências operacionais e regras contratuais extraídas do Check List da Obra. NUNCA retorne a lista de tópicos vazia. Cada tópico deve conter:
   - "title": Título conciso da regra/premissa enquadrada nas seções do template (ex: "Escopo e Objeto", "Critério de Medição e Pagamento", "Horários de Canteiro e Descarga", "Segurança do Trabalho, EPIs e Documentação", "Retenções Contratuais e Garantias", "Penalidades e Multas por Atraso").
   - "regraObra": Descrição clara e detalhada da especificação técnica ou operacional exigida pela obra.
   - "excecaoAdmitida": Flexibilização admitida pela obra (ou "N/A" caso a regra seja estrita).
   - "pontoAtencao": Ponto crítico de risco ou atenção que deve ser deliberado e alinhado na reunião com o fornecedor.
   - "perguntaFornecedor": Pergunta objetiva e assertiva a ser feita ao fornecedor durante a mesa de negociação.
   - "source": Identificação da fonte no Check List (ex: "Check List da Obra - Item 3.2").

${prompts.checklistInstructions ? `\nINSTRUÇÕES ADICIONAIS DO USUÁRIO PARA CHECKLIST:\n${prompts.checklistInstructions}` : ''}

IMPORTANTE: Responda SOMENTE em JSON válido com as chaves "tipoFornecimento" e "topics".`;

  const promptText = `Analise detalhadamente os documentos de Check List da Obra fornecidos em anexo. Extraia TODAS as premissas, exigências técnicas, operacionais, fiscais e contratuais, enquadrando cada uma na estrutura e seções do template DOCX oficial ativo.`;

  const contents = [
    ...files,
    { text: promptText }
  ];

  const config: any = {
    systemInstruction,
    responseMimeType: 'application/json',
  };

  if (modelsConfig.checklistParams) {
    if (modelsConfig.checklistParams.temperature !== undefined) config.temperature = modelsConfig.checklistParams.temperature;
    if (modelsConfig.checklistParams.topP !== undefined) config.topP = modelsConfig.checklistParams.topP;
    if (modelsConfig.checklistParams.maxOutputTokens !== undefined) config.maxOutputTokens = modelsConfig.checklistParams.maxOutputTokens;
  }

  const modelName = modelsConfig.checklistModel || 'gemini-2.5-pro';

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config
    });

    const cleaned = cleanJsonText(response.text || '{}');
    let parsed: any = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: try to extract JSON block if any
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      }
    }

    // Support flexible keys returned by LLM
    const rawTopicsList = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsed.topics) ? parsed.topics
        : (Array.isArray(parsed.premissas) ? parsed.premissas
        : (Array.isArray(parsed.regras) ? parsed.regras
        : (Array.isArray(parsed.itens) ? parsed.itens
        : (Array.isArray(parsed.items) ? parsed.items
        : (Array.isArray(parsed.conteudos) ? parsed.conteudos
        : (Array.isArray(parsed.checklist) ? parsed.checklist
        : [])))))));

    // Normalize and validate each topic
    const validatedTopics = rawTopicsList.map((t: any, idx: number) => {
      const title = t.title || t.titulo || t.nome || t.assunto || t.premissa || `Regra ${idx + 1}`;
      const regraObra = t.regraObra || t.regra || t.exigencia || t.descricao || t.especificacao || 'Conforme especificação do checklist da obra';
      const excecaoAdmitida = t.excecaoAdmitida || t.excecao || t.flexibilizacao || 'N/A';
      const pontoAtencao = t.pontoAtencao || t.atencao || t.risco || t.alerta || 'Nenhum';
      const perguntaFornecedor = t.perguntaFornecedor || t.pergunta || t.questionamento || t.alinhamento || 'Confirmar atendimento integral às premissas';
      const source = t.source || t.fonte || t.origem || 'Check List da Obra';

      const topicObj = {
        id: `topic-${idx + 1}`,
        title: String(title).trim(),
        regraObra: String(regraObra).trim(),
        excecaoAdmitida: String(excecaoAdmitida).trim(),
        pontoAtencao: String(pontoAtencao).trim(),
        perguntaFornecedor: String(perguntaFornecedor).trim(),
        source: String(source).trim()
      };

      const res = TopicItemSchema.safeParse(topicObj);
      return res.success ? res.data : topicObj;
    });

    addLog('INFO', 'AI', `Análise de Checklist concluída: ${validatedTopics.length} premissas/tópicos enquadrados com base no template`, {
      model: modelName,
      templateId: template.id,
      topicsCount: validatedTopics.length
    });

    return {
      tipoFornecimento: parsed.tipoFornecimento || parsed.tipo_fornecimento || parsed.tipo || 'Subempreitada de Serviços e Materiais',
      topics: validatedTopics
    };
  } catch (err: any) {
    addLog('ERROR', 'AI', `Erro na análise de checklist: ${err.message}`);
    throw err;
  }
}

export async function analyzeProposal(
  proposalFiles: { inlineData: { data: string; mimeType: string } }[],
  checklistData: any
) {
  const template = await getActiveTemplateFromDb();
  if (!template || !template.docxBlobBase64) {
    throw new Error('Nenhum template DOCX ativo disponível. Faça o upload do template oficial antes de realizar as análises de proposta.');
  }

  const prompts = await getStoredPrompts();
  const modelsConfig = await getStoredModelsConfig();
  const templateContext = buildTemplateContextPrompt(template);

  const systemInstruction = `Você é um Engenheiro Especialista em Análise de Propostas e Negociação de Contratos de Construção Civil.
Sua missão é confrontar a Proposta Comercial e Técnica do fornecedor com o Check List de Regras da Obra previamente aprovado, identificando divergências, omissões, ressalvas e condições não atendidas.

${templateContext}

REGRAS DA OBRA JÁ ESTABELECIDAS:
${JSON.stringify(checklistData?.topics || [], null, 2)}

ESTRUTURA DE RESPOSTA ESPERADA (JSON):
{
  "divergences": [
    {
      "description": "Descrição clara da divergência entre a proposta do fornecedor e a exigência da obra.",
      "severity": "ALTA" | "MEDIA" | "BAIXA",
      "source": "Item/Página da Proposta",
      "blocos": [
        {
          "tipo": "paragrafo",
          "runs": [
            { "t": "Divergência: ", "estilo": "forte" },
            { "t": "Texto explicativo...", "estilo": "normal" },
            { "t": " [ATENÇÃO: Severidade ALTA]", "estilo": "alerta" }
          ]
        }
      ]
    }
  ]
}

${prompts.proposalInstructions ? `\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${prompts.proposalInstructions}` : ''}

IMPORTANTE: Responda SOMENTE em formato JSON válido.`;

  const promptText = `Confronte as propostas comerciais anexadas com as regras do Check List e identifique todas as divergências técnicas, comerciais, tributárias ou operacionais para inclusão na Pré-Ata.`;

  const contents = [
    ...proposalFiles,
    { text: promptText }
  ];

  const config: any = {
    systemInstruction,
    responseMimeType: 'application/json',
  };

  if (modelsConfig.proposalParams) {
    if (modelsConfig.proposalParams.temperature !== undefined) config.temperature = modelsConfig.proposalParams.temperature;
    if (modelsConfig.proposalParams.topP !== undefined) config.topP = modelsConfig.proposalParams.topP;
    if (modelsConfig.proposalParams.maxOutputTokens !== undefined) config.maxOutputTokens = modelsConfig.proposalParams.maxOutputTokens;
  }

  const modelName = modelsConfig.proposalModel || 'gemini-2.5-pro';

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config
    });

    const cleaned = cleanJsonText(response.text || '{}');
    const parsed = JSON.parse(cleaned);

    const divergencesList = Array.isArray(parsed.divergences)
      ? parsed.divergences.map((d: any, idx: number) => {
          const res = DivergenceItemSchema.safeParse(d);
          return res.success ? { ...res.data, id: `div-${idx + 1}` } : {
            id: `div-${idx + 1}`,
            description: d.description || `Divergência ${idx + 1}`,
            severity: d.severity || 'MEDIA',
            source: d.source || 'Proposta'
          };
        })
      : [];

    addLog('INFO', 'AI', `Análise de Proposta concluída: ${divergencesList.length} divergências identificadas`, {
      model: modelName,
      divergencesCount: divergencesList.length
    });

    return divergencesList;
  } catch (err: any) {
    addLog('ERROR', 'AI', `Erro na análise de propostas: ${err.message}`);
    throw err;
  }
}

export async function generateFinalAta(
  abertura: any,
  checklistData: any,
  divergences: any[],
  transcript: string
) {
  const template = await getActiveTemplateFromDb();
  if (!template || !template.docxBlobBase64) {
    throw new Error('Nenhum template DOCX ativo disponível. Faça o upload do template oficial antes de redigir a Ata Final.');
  }

  const prompts = await getStoredPrompts();
  const modelsConfig = await getStoredModelsConfig();
  const templateContext = buildTemplateContextPrompt(template);

  const systemInstruction = `Você é o Redator Técnico Oficial e Especialista em Atas de Reunião da Afonso França Engenharia.
Sua missão é analisar a transcrição da reunião de negociação, cruzando com a Pré-Ata (Check List + Divergências da Proposta), para consolidar as deliberações finais da Ata de Reunião oficial de acordo com a estrutura do template DOCX.

${templateContext}

DADOS DA OBRA E FORNECEDOR:
- Obra: ${abertura?.obraCodigo || ''} - ${abertura?.obraNome || ''}
- Fornecedor: ${abertura?.fornecedor || ''}
- Assunto: ${abertura?.assunto || ''}
- Pacote/Serviço: ${abertura?.servico || ''}

ESTRUTURA DE RESPOSTA OBRIGATÓRIA (JSON):
{
  "agreedItems": [
    {
      "num": "01",
      "titulo": "Título da deliberação",
      "descricao": "Texto claro e conclusivo do que foi acordado",
      "responsavel": "Razão Social ou Nome do Responsável",
      "prazo": "Data ou prazo limite acordado",
      "blocos": [
        {
          "tipo": "titulo",
          "runs": [{ "t": "Título da deliberação", "estilo": "forte" }]
        },
        {
          "tipo": "paragrafo",
          "runs": [{ "t": "Texto do acordo...", "estilo": "normal" }]
        }
      ]
    }
  ],
  "pendingItems": [
    {
      "num": "02",
      "titulo": "Título da pendência",
      "descricao": "O que ficou pendente de entrega/definição",
      "responsavel": "Responsável pela pendência",
      "prazo": "Prazo estipulado",
      "blocos": [
        {
          "tipo": "titulo",
          "runs": [{ "t": "Título da pendência", "estilo": "forte" }]
        },
        {
          "tipo": "paragrafo",
          "runs": [
            { "t": "PENDÊNCIA: ", "estilo": "alerta" },
            { "t": "Descrição da pendência...", "estilo": "alerta" }
          ]
        }
      ]
    }
  ],
  "notes": "Resumo executivo conciso dos principais acordos e encaminhamentos da reunião."
}

${prompts.finalAtaInstructions ? `\nINSTRUÇÕES ADICIONAIS DO USUÁRIO:\n${prompts.finalAtaInstructions}` : ''}

IMPORTANTE: Responda SOMENTE em formato JSON válido.`;

  const promptText = `Abaixo está a transcrição integral da reunião de negociação com o fornecedor. Extraia todas as deliberações, acordos, pendências, prazos e responsabilidades:

=== TRANSCRIÇÃO DA REUNIÃO ===
${transcript || 'Reunião concluída com alinhamento das condições comerciais e técnicas.'}
==============================

=== PRÉ-ATA DE REFERÊNCIA ===
Check List: ${JSON.stringify(checklistData?.topics || [])}
Divergências Prévias: ${JSON.stringify(divergences || [])}
=============================`;

  const config: any = {
    systemInstruction,
    responseMimeType: 'application/json',
  };

  if (modelsConfig.finalAtaParams) {
    if (modelsConfig.finalAtaParams.temperature !== undefined) config.temperature = modelsConfig.finalAtaParams.temperature;
    if (modelsConfig.finalAtaParams.topP !== undefined) config.topP = modelsConfig.finalAtaParams.topP;
    if (modelsConfig.finalAtaParams.maxOutputTokens !== undefined) config.maxOutputTokens = modelsConfig.finalAtaParams.maxOutputTokens;
  }

  const modelName = modelsConfig.finalAtaModel || 'gemini-2.5-pro';

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ text: promptText }],
      config
    });

    const cleaned = cleanJsonText(response.text || '{}');
    const parsed = JSON.parse(cleaned);
    const validated = FinalAtaValidationSchema.safeParse(parsed);

    const finalResult = validated.success ? validated.data : {
      agreedItems: Array.isArray(parsed.agreedItems) ? parsed.agreedItems : [],
      pendingItems: Array.isArray(parsed.pendingItems) ? parsed.pendingItems : [],
      notes: parsed.notes || 'Reunião de alinhamento técnico concluída.'
    };

    addLog('INFO', 'AI', `Minuta da Ata Final gerada com sucesso pela IA`, {
      model: modelName,
      templateId: template.id,
      agreedCount: finalResult.agreedItems.length,
      pendingCount: finalResult.pendingItems.length
    });

    return finalResult;
  } catch (err: any) {
    addLog('ERROR', 'AI', `Erro ao gerar minuta da Ata Final: ${err.message}`);
    throw err;
  }
}

export async function extractDocumentMetadata(files: { inlineData: { data: string; mimeType: string } }[]) {
  const template = await getActiveTemplateFromDb();
  const templateContext = template ? buildTemplateContextPrompt(template) : '';

  const systemInstruction = `Você é um extrator de metadados contratuais e de engenharia de documentos de obras da Afonso França Engenharia.
Sua missão é inspecionar os arquivos fornecidos (PDFs de checklists, planilhas orçamentárias, propostas ou especificações) e extrair os metadados cadastrais fundamentais:
- obraCodigo: Código identificador da obra (ex: "590", "421", "OBRA 102").
- obraNome: Nome do projeto ou condomínio (ex: "Hospital Sabará", "Edifício Parque da Cidade").
- fornecedor: Razão social ou nome fantasia do fornecedor/empreiteiro.
- assunto: Tema ou objeto da reunião/negociação.
- servico: Descrição do pacote ou escopo contratado (ex: "Pintura Externa", "Estrutura Metálica").
- rm: Número da Requisição de Materiais/Serviços (RM).
- cot: Número da Cotação (COT) ou Mapa de Cotação.

${templateContext}

Responda SOMENTE em JSON com o formato:
{
  "metadata": {
    "obraCodigo": "...",
    "obraNome": "...",
    "fornecedor": "...",
    "assunto": "...",
    "servico": "...",
    "rm": "...",
    "cot": "..."
  }
}`;

  const promptText = `Extraia todos os metadados de obra, fornecedor, serviço e cotação encontrados nos documentos.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [...files, { text: promptText }],
      config: {
        systemInstruction,
        responseMimeType: 'application/json'
      }
    });

    const cleaned = cleanJsonText(response.text || '{}');
    return JSON.parse(cleaned);
  } catch (err: any) {
    addLog('WARN', 'AI', `Erro ao extrair metadados automáticos: ${err.message}`);
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
        else if (lowerName.endsWith('.mp3')) resolvedMime = 'audio/mp3';
        else if (lowerName.endsWith('.wav')) resolvedMime = 'audio/wav';
        else if (lowerName.endsWith('.m4a')) resolvedMime = 'audio/m4a';
        else if (lowerName.endsWith('.ogg')) resolvedMime = 'audio/ogg';
        else if (lowerName.endsWith('.txt')) resolvedMime = 'text/plain';
        else resolvedMime = 'application/pdf';
      }

      const promptText = `Transcreva e extraia todo o texto deste documento ou áudio na íntegra de forma fidedigna, limpa e estruturada, preservando falas, deliberações, valores, prazos e decisões da reunião. Não resuma: forneça o conteúdo completo.`;

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
      // If error, try a basic UTF-8 decode as last resort
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

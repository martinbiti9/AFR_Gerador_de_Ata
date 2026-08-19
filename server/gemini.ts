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

export function safeParseJsonFromAI<T = any>(raw: string, fallback: T): T {
  if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
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
      return JSON.parse(extracted);
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
      return JSON.parse(candidate);
    } catch {}

    // 4. Sanitize common LLM JSON syntax issues
    const sanitized = candidate
      // Remove line comments // ...
      .replace(/\/\/.*$/gm, '')
      // Remove trailing commas before } or ]
      .replace(/,\s*([\}\]])/g, '$1')
      // Replace unescaped control chars if any
      .replace(/[\u0000-\u001F]+/g, (match) => (match === '\n' || match === '\r' || match === '\t' ? match : ' '));

    try {
      return JSON.parse(sanitized);
    } catch {}

    // Fix unescaped newlines inside strings
    try {
      const fixedNewlines = sanitized.replace(/(:\s*"[^"]*")/g, (m) => m.replace(/\n/g, '\\n').replace(/\r/g, ''));
      return JSON.parse(fixedNewlines);
    } catch {}
  }

  addLog('WARN', 'AI', 'safeParseJsonFromAI: Falha ao fazer parse de JSON bruto da IA. Usando fallback estruturado.', {
    snippet: raw.slice(0, 300)
  });

  return fallback;
}

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
    if (modelsConfig.checklistParams.thinkingBudget !== undefined && modelsConfig.checklistParams.thinkingBudget > 0) {
      config.thinkingConfig = { thinkingBudget: modelsConfig.checklistParams.thinkingBudget };
    }
  }

  const modelName = modelsConfig.checklistModel || 'gemini-2.5-pro';

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config
    });

    const parsed = safeParseJsonFromAI(response.text || '{}', {
      tipoFornecimento: 'Subempreitada de Serviços e Materiais',
      topics: []
    });

    const parsedObj = (parsed || {}) as any;

    // Support flexible keys returned by LLM
    const rawTopicsList = Array.isArray(parsed)
      ? parsed
      : (Array.isArray(parsedObj.topics) ? parsedObj.topics
        : (Array.isArray(parsedObj.premissas) ? parsedObj.premissas
        : (Array.isArray(parsedObj.regras) ? parsedObj.regras
        : (Array.isArray(parsedObj.itens) ? parsedObj.itens
        : (Array.isArray(parsedObj.items) ? parsedObj.items
        : (Array.isArray(parsedObj.conteudos) ? parsedObj.conteudos
        : (Array.isArray(parsedObj.checklist) ? parsedObj.checklist
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
      tipoFornecimento: parsedObj.tipoFornecimento || parsedObj.tipo_fornecimento || parsedObj.tipo || 'Subempreitada de Serviços e Materiais',
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
    if (modelsConfig.proposalParams.thinkingBudget !== undefined && modelsConfig.proposalParams.thinkingBudget > 0) {
      config.thinkingConfig = { thinkingBudget: modelsConfig.proposalParams.thinkingBudget };
    }
  }

  const modelName = modelsConfig.proposalModel || 'gemini-2.5-pro';

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

  const modelsConfig = await getStoredModelsConfig();
  const templateContext = buildTemplateContextPrompt(template);

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

  const fornecedorNome = abertura?.fornecedor || 'Contratada';
  const obraIdentificacao = `${abertura?.obraCodigo || 'S/N'} - ${abertura?.obraNome || 'Obra'}`;

  // Hardcoded, strict System Instruction for Final Ata extraction
  const systemInstruction = `Você é o Redator Técnico Oficial e Especialista em Atas de Reunião da Afonso França Engenharia.
Sua missão é consolidar a Ata de Reunião oficial final no formato JSON estruturado, cruzando obrigatoriamente:
1. O Check List de Suprimentos da Obra (regras técnicas, operacionais, segurança EPI/PCMSO/ART, medição, retenções);
2. As Divergências da Proposta Comercial;
3. A Transcrição ou anotações da Reunião de Negociação.

${templateContext}

DADOS DA CONTRATAÇÃO:
- Obra: ${obraIdentificacao}
- Fornecedor: ${fornecedorNome}
- Objeto / Assunto: ${abertura?.assunto || 'Checklist de Contratação e Condições Gerais'}
- Pacote / Serviço: ${abertura?.servico || 'Serviços de Engenharia e Fornecimento'}
- RM / Cotação: RM ${abertura?.rm || 'S/N'} • COT ${abertura?.cot || 'S/N'}

DIRETRIZES TÉCNICAS E CONTRATUAIS OBRIGATÓRIAS (MOTOR OFICIAL HARDCODED):

1. PARTICIPANTES DA REUNIÃO (participantes):
   - Extraia rigorosamente todos os participantes mencionados na Transcrição e na base analisada.
   - Cada participante deve ter:
     • nome: Nome completo do participante
     • empresa: Empresa representada (ex: "${fornecedorNome}", "Afonso França Engenharia")
     • email: E-mail de contato do participante
     • cargoDepto: Cargo ou departamento
     • visto: Status do visto (ex: "Pendente", "Assinado")
   - A tabela oficial de participantes é organizada no padrão de colunas duplas:
     [ Participante | Empresa/ E-mail | Visto | Participante | Empresa/ E-mail | Visto ]

2. RESUMO EXECUTIVO (resumo / notes):
   - Redija um Resumo Executivo formal, denso e completo (mínimo de 2 a 4 parágrafos) com a síntese da reunião, confirmação do escopo, alinhamento de valores/pagamentos, principais compromissos operacionais assumidos e prazos críticos.

3. DEMAIS TÓPICOS DA ATA (agreedItems e pendingItems):
   - Todos os tópicos da ata DEVEM ser obrigatoriamente estruturados nas 4 COLUNAS:
     1. Item: Numeração sequencial do item (ex: "01", "02", "03", ...)
     2. Descrição: Descrição clara, técnica e conclusiva do que foi deliberado ou acordado / ou da pendência
     3. Responsável: Empresa ou responsável pela ação (ex: "${fornecedorNome}" ou "Afonso França")
     4. Prazo: Prazo limite ou marco de cronograma (ex: "Conforme cronograma", "Em até 5 dias antes da mobilização", "25/02/2025")

   - ITENS ACORDADOS / DELIBERAÇÕES (agreedItems):
     Cada tópico e exigência técnica do Check List da Obra que foi aceito ou alinhado DEVE gerar um item específico e conclusivo estruturado nas 4 colunas (Item, Descrição, Responsável, Prazo).

   - PENDÊNCIAS E PRAZOS (pendingItems):
     Cada divergência comercial/técnica da proposta e documentação pendente (ART de execução, PCMSO/PGR, certidões, laudos, amostras, cronograma detalhado de fabricação) DEVE gerar um item de pendência estruturado nas 4 colunas (Item, Descrição, Responsável, Prazo).

ESTRUTURA DE RESPOSTA OBRIGATÓRIA (JSON puro, sem markdown fora do json):
{
  "participantes": [
    {
      "nome": "Nome do Participante",
      "empresa": "Afonso França Engenharia",
      "email": "participante@afonsofranca.com.br",
      "cargoDepto": "Engenheiro de Obra",
      "visto": "Pendente"
    },
    {
      "nome": "Representante do Fornecedor",
      "empresa": "${fornecedorNome}",
      "email": "contato@fornecedor.com.br",
      "cargoDepto": "Diretor Comercial",
      "visto": "Pendente"
    }
  ],
  "resumo": "Resumo Executivo da reunião contendo a síntese da negociação, premissas acordadas e diretrizes gerais...",
  "notes": "Resumo Executivo da reunião contendo a síntese da negociação, premissas acordadas e diretrizes gerais...",
  "agreedItems": [
    {
      "item": "01",
      "num": "01",
      "titulo": "Escopo Técnico e Condições de Execução",
      "descricao": "O fornecedor declara pleno conhecimento do projeto e compromete-se a atender integralmente as especificações da Afonso França...",
      "responsavel": "${fornecedorNome}",
      "prazo": "Conforme cronograma da obra",
      "blocos": [
        {
          "tipo": "titulo",
          "runs": [{ "t": "01. Escopo Técnico e Condições de Execução", "estilo": "forte" }]
        },
        {
          "tipo": "paragrafo",
          "runs": [{ "t": "O fornecedor declara pleno conhecimento...", "estilo": "normal" }]
        }
      ]
    }
  ],
  "pendingItems": [
    {
      "item": "01",
      "num": "01",
      "titulo": "Apresentação da ART e Documentação de SST",
      "descricao": "Envio obrigatório da ART de execução quitada e documentação de SST (PGR/PCMSO) dos colaboradores antes do acesso ao canteiro.",
      "responsavel": "${fornecedorNome}",
      "prazo": "Em até 5 dias antes da mobilização",
      "blocos": [
        {
          "tipo": "titulo",
          "runs": [{ "t": "01. Apresentação da ART e Documentação de SST", "estilo": "forte" }]
        },
        {
          "tipo": "paragrafo",
          "runs": [
            { "t": "PENDÊNCIA: ", "estilo": "alerta" },
            { "t": "Envio obrigatório da ART de execução quitada...", "estilo": "alerta" }
          ]
        }
      ]
    }
  ]
}`;

  const promptText = `Consolide a Ata Final oficial da reunião. Extraia rigorosamente:
1. Participantes (com Nome, Empresa, E-mail, Cargo/Depto, Visto);
2. Resumo Executivo da reunião;
3. Demais tópicos da ata estruturados nas 4 colunas: 1. Item, 2. Descrição, 3. Responsável, 4. Prazo.

=== PARTICIPANTES JÁ CADASTRADOS NA ABERTURA ===
${Array.isArray(abertura?.participantes) && abertura.participantes.length > 0 ? JSON.stringify(abertura.participantes, null, 2) : 'Nenhum participante previamente cadastrado.'}
================================================

=== CHECK LIST DE SUPRIMENTOS DA OBRA ===
${topics.length > 0 ? JSON.stringify(topics, null, 2) : 'Checklist padrão da Afonso França para contratação de pacotes de engenharia.'}
${generalRules.length > 0 ? `\nRegras Gerais do Checklist:\n${generalRules.join('\n')}` : ''}
${checklistSummary ? `\nResumo do Checklist:\n${checklistSummary}` : ''}
=========================================

=== DIVERGÊNCIAS DA PROPOSTA COMERCIAL ===
${normalizedDivergences.length > 0 ? JSON.stringify(normalizedDivergences, null, 2) : 'Nenhuma divergência grave identificada na proposta.'}
===========================================

=== TRANSCRIÇÃO / REGISTRO DA REUNIÃO ===
${transcript && transcript.trim() ? transcript : 'Reunião de alinhamento com o fornecedor realizada com validação de todas as premissas do Check List e deliberações comerciais.'}
=========================================`;

  const config: any = {
    systemInstruction,
    responseMimeType: 'application/json',
  };

  if (modelsConfig.finalAtaParams) {
    if (modelsConfig.finalAtaParams.temperature !== undefined) config.temperature = modelsConfig.finalAtaParams.temperature;
    if (modelsConfig.finalAtaParams.topP !== undefined) config.topP = modelsConfig.finalAtaParams.topP;
    if (modelsConfig.finalAtaParams.maxOutputTokens !== undefined) config.maxOutputTokens = modelsConfig.finalAtaParams.maxOutputTokens;
    if (modelsConfig.finalAtaParams.thinkingBudget !== undefined && modelsConfig.finalAtaParams.thinkingBudget > 0) {
      config.thinkingConfig = { thinkingBudget: modelsConfig.finalAtaParams.thinkingBudget };
    }
  }

  const modelName = modelsConfig.finalAtaModel || 'gemini-3.1-pro-preview';

  let rawResult: any = { participantes: [], agreedItems: [], pendingItems: [], notes: '', resumo: '' };

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ text: promptText }],
      config
    });

    rawResult = safeParseJsonFromAI(response.text || '{}', {
      participantes: [],
      agreedItems: [],
      pendingItems: [],
      notes: '',
      resumo: ''
    });
  } catch (err: any) {
    addLog('WARN', 'AI', `Aviso ao chamar LLM para Ata Final: ${err.message}. Ativando sintetizador de contingência.`);
  }

  // --- HARDCODED DETERMINISTIC ENRICHMENT & SYNTHESIS ---
  // If LLM returned empty arrays or sparse content, synthesize rich structured items from Checklist + Divergences

  let finalParticipantes: any[] = Array.isArray(rawResult.participantes) && rawResult.participantes.length > 0
    ? rawResult.participantes
    : (Array.isArray(abertura?.participantes) && abertura.participantes.length > 0 ? abertura.participantes : []);

  // Guarantee existing abertura participants are preserved if not in AI output
  if (Array.isArray(abertura?.participantes) && abertura.participantes.length > 0) {
    const existingEmails = new Set(finalParticipantes.map((p: any) => (p.email || '').toLowerCase()).filter(Boolean));
    for (const p of abertura.participantes) {
      if (p.email && !existingEmails.has(p.email.toLowerCase())) {
        finalParticipantes.push(p);
      } else if (!p.email && !finalParticipantes.some((fp: any) => fp.nome === p.nome)) {
        finalParticipantes.push(p);
      }
    }
  }

  // Normalize 4 columns for all agreed items
  let finalAgreed: any[] = Array.isArray(rawResult.agreedItems) ? rawResult.agreedItems : [];
  let finalPending: any[] = Array.isArray(rawResult.pendingItems) ? rawResult.pendingItems : [];
  let finalNotes: string = typeof rawResult.notes === 'string' && rawResult.notes.trim() 
    ? rawResult.notes.trim() 
    : (typeof rawResult.resumo === 'string' ? rawResult.resumo.trim() : '');

  // 1. Fallback / Enrichment for Agreed Items from Checklist Topics
  if (finalAgreed.length === 0 && topics.length > 0) {
    finalAgreed = topics.map((t: any, idx: number) => {
      const numStr = String(idx + 1).padStart(2, '0');
      const title = t.title || t.titulo || t.section || `Item ${idx + 1} do Check List`;
      const reqList = Array.isArray(t.requirements) ? t.requirements.join('; ') : (t.requirements || t.description || t.descricao || 'Conforme especificações e normas técnicas aplicáveis.');
      
      return {
        item: numStr,
        num: numStr,
        titulo: title,
        descricao: `Fica acordado o atendimento integral ao item "${title}": ${reqList}`,
        responsavel: fornecedorNome,
        prazo: 'Conforme cronograma da obra',
        blocos: [
          {
            tipo: 'titulo',
            runs: [{ t: `${numStr}. ${title}`, estilo: 'forte' }]
          },
          {
            tipo: 'paragrafo',
            runs: [{ t: `Fica acordado o atendimento integral ao item "${title}": ${reqList}`, estilo: 'normal' }]
          }
        ]
      };
    });
  } else if (finalAgreed.length === 0) {
    // Basic standard agreed items if no checklist was attached
    finalAgreed = [
      {
        item: '01',
        num: '01',
        titulo: 'Escopo Técnico e Conformidade dos Serviços',
        descricao: `O fornecedor ${fornecedorNome} compromete-se a executar o pacote ${abertura?.servico || 'contratado'} com rigor técnico, obedecendo às normas da ABNT, projetos executivos e diretrizes da Afonso França Engenharia.`,
        responsavel: fornecedorNome,
        prazo: 'Durante toda a vigência da obra',
        blocos: [
          { tipo: 'titulo', runs: [{ t: '01. Escopo Técnico e Conformidade dos Serviços', estilo: 'forte' }] },
          { tipo: 'paragrafo', runs: [{ t: `O fornecedor ${fornecedorNome} compromete-se a executar o pacote ${abertura?.servico || 'contratado'} com rigor técnico...`, estilo: 'normal' }] }
        ]
      },
      {
        item: '02',
        num: '02',
        titulo: 'Segurança do Trabalho e Normas Regulamentadoras',
        descricao: 'Obrigatoriedade do fornecimento e uso diário de EPIs completos com CA válido, integração prévia de todos os funcionários na obra e cumprimento rigoroso das NRs (NR-06, NR-18 e NR-35).',
        responsavel: fornecedorNome,
        prazo: 'Imediato e contínuo',
        blocos: [
          { tipo: 'titulo', runs: [{ t: '02. Segurança do Trabalho e Normas Regulamentadoras', estilo: 'forte' }] },
          { tipo: 'paragrafo', runs: [{ t: 'Obrigatoriedade do fornecimento e uso diário de EPIs completos com CA válido...', estilo: 'normal' }] }
        ]
      },
      {
        item: '03',
        num: '03',
        titulo: 'Critérios de Medição e Pagamento',
        descricao: 'As medições serão mensais até o dia 25 de cada mês, avaliando exclusivamente serviços 100% executados e aprovados pela fiscalização de obra da Afonso França.',
        responsavel: 'Afonso França / Fornecedor',
        prazo: 'Mensal (até dia 25)',
        blocos: [
          { tipo: 'titulo', runs: [{ t: '03. Critérios de Medição e Pagamento', estilo: 'forte' }] },
          { tipo: 'paragrafo', runs: [{ t: 'As medições serão mensais até o dia 25 de cada mês...', estilo: 'normal' }] }
        ]
      }
    ];
  } else {
    // Ensure every item has 4 columns: item, descricao, responsavel, prazo
    finalAgreed = finalAgreed.map((it: any, idx: number) => {
      const numStr = String(it.item || it.num || idx + 1).padStart(2, '0');
      return {
        item: numStr,
        num: numStr,
        titulo: it.titulo || `Item ${numStr}`,
        descricao: it.descricao || it.titulo || 'Atendimento integral acordado.',
        responsavel: it.responsavel || fornecedorNome,
        prazo: it.prazo || 'Conforme cronograma da obra',
        blocos: it.blocos || [
          { tipo: 'titulo', runs: [{ t: `${numStr}. ${it.titulo || `Item ${numStr}`}`, estilo: 'forte' }] },
          { tipo: 'paragrafo', runs: [{ t: it.descricao || 'Atendimento integral acordado.', estilo: 'normal' }] }
        ]
      };
    });
  }

  // 2. Fallback / Enrichment for Pending Items from Divergences
  if (finalPending.length === 0 && normalizedDivergences.length > 0) {
    finalPending = normalizedDivergences.map((divItem: any, idx: number) => {
      const numStr = String(idx + 1).padStart(2, '0');
      const desc = divItem.description || divItem.descricao || divItem.divergencia || `Pendência ${idx + 1}`;
      const sev = divItem.severity || divItem.severidade || 'MEDIA';
      
      return {
        item: numStr,
        num: numStr,
        titulo: `Ajuste de Divergência: ${desc.length > 60 ? `${desc.slice(0, 57)}...` : desc}`,
        descricao: `Regularizar pendência identificada na proposta comercial [Severidade ${sev}]: ${desc}. Enviar proposta retificada ou documento comprobatório.`,
        responsavel: fornecedorNome,
        prazo: sev === 'ALTA' ? 'Em até 48 horas' : 'Em até 5 dias úteis',
        blocos: [
          {
            tipo: 'titulo',
            runs: [{ t: `${numStr}. Ajuste de Divergência [Severidade ${sev}]`, estilo: 'forte' }]
          },
          {
            tipo: 'paragrafo',
            runs: [
              { t: 'PENDÊNCIA: ', estilo: 'alerta' },
              { t: `Regularizar pendência identificada na proposta comercial: ${desc}`, estilo: 'alerta' }
            ]
          }
        ]
      };
    });
  } else {
    // Ensure every pending item has 4 columns: item, descricao, responsavel, prazo
    finalPending = finalPending.map((it: any, idx: number) => {
      const numStr = String(it.item || it.num || idx + 1).padStart(2, '0');
      return {
        item: numStr,
        num: numStr,
        titulo: it.titulo || `Pendência ${numStr}`,
        descricao: it.descricao || it.titulo || 'Regularização pendente pelo fornecedor.',
        responsavel: it.responsavel || fornecedorNome,
        prazo: it.prazo || 'Em até 5 dias úteis',
        blocos: it.blocos || [
          { tipo: 'titulo', runs: [{ t: `${numStr}. ${it.titulo || `Pendência ${numStr}`}`, estilo: 'forte' }] },
          { tipo: 'paragrafo', runs: [{ t: `PENDÊNCIA: ${it.descricao || 'Regularização pendente.'}`, estilo: 'alerta' }] }
        ]
      };
    });
  }

  // 3. Fallback / Enrichment for Executive Summary (notes)
  if (!finalNotes || finalNotes.length < 50) {
    const topicSummary = topics.length > 0 
      ? `Foram analisados e deliberados ${topics.length} tópicos técnicos e operacionais do Check List da Obra.` 
      : 'Foram estabelecidas as premissas técnicas, operacionais e de segurança.';
    
    const divSummary = normalizedDivergences.length > 0
      ? `Foram mapeadas ${normalizedDivergences.length} pendências/divergências para adequação e envio pelo fornecedor.`
      : 'As condições comerciais e tributárias foram alinhadas em conformidade com as diretrizes da construtora.';

    finalNotes = `Reunião de alinhamento e negociação final realizada para a contratação da Obra ${obraIdentificacao} com o fornecedor ${fornecedorNome}, referente ao pacote de ${abertura?.servico || 'serviços de engenharia'} (RM: ${abertura?.rm || 'S/N'} • Cotação: ${abertura?.cot || 'S/N'}).\n\n${topicSummary} ${divSummary}\n\nFica acordado que todos os itens deliberados integram o instrumento contratual, com início das mobilizações condicionado à entrega dos documentos de SST e regularidade cadastral exigidos pela Afonso França Engenharia.`;
  }

  // Format and validate with schema
  const validated = FinalAtaValidationSchema.safeParse({
    participantes: finalParticipantes,
    agreedItems: finalAgreed,
    pendingItems: finalPending,
    notes: finalNotes,
    resumo: finalNotes
  });

  const finalResult = validated.success ? validated.data : {
    participantes: finalParticipantes,
    agreedItems: finalAgreed,
    pendingItems: finalPending,
    notes: finalNotes,
    resumo: finalNotes
  };

  addLog('INFO', 'AI', `Minuta da Ata Final gerada e estruturada com sucesso`, {
    model: modelName,
    templateId: template.id,
    participantesCount: finalResult.participantes?.length || 0,
    agreedCount: finalResult.agreedItems.length,
    pendingCount: finalResult.pendingItems.length,
    notesLength: finalResult.notes.length
  });

  return finalResult;
}

export async function extractDocumentMetadata(files: { inlineData: { data: string; mimeType: string } }[]) {
  const template = await getActiveTemplateFromDb();
  const templateContext = template ? buildTemplateContextPrompt(template) : '';

  const systemInstruction = `Você é um extrator de metadados contratuais e de engenharia de documentos de obras da Afonso França Engenharia.
Sua missão é inspecionar os arquivos fornecidos (PDFs de checklists, planilhas orçamentárias, propostas ou especificações) e extrair todos os metadados cadastrais, comerciais e de participantes fundamentais de acordo com a estrutura do template oficial:
- obraCodigo: Código identificador da obra (ex: "0590", "421", "OBRA 102").
- obraNome: Nome do projeto ou condomínio (ex: "Hospital Sabará", "Edifício Parque da Cidade").
- fornecedor: Razão social ou nome fantasia do fornecedor/empreiteiro (ex: "Construmódulo Sistemas Internos Ltda.").
- assunto: Tema ou objeto da reunião/negociação (ex: "REUNIÃO DE Checklist de Contratação e Condições Gerais de Fornecimento").
- servico: Descrição do pacote ou escopo contratado (ex: "Drywall, forros e divisórias internas").
- rm: Número da Requisição de Materiais/Serviços (RM).
- cot: Número da Cotação (COT).
- ataNumero: Número da ata (ex: "01").
- dataReuniao: Data da reunião (ex: "09/01/2025").
- horario: Horário (ex: "10:30h").
- local: Local (ex: "Online - Teams").
- linkReuniao: Link da reunião (ex: Teams/Meet).
- folha: Número da folha.
- participantes: Array de objetos com { "nome": "...", "cargoDepto": "...", "empresa": "...", "email": "...", "visto": "..." }.
- valoresComerciais: Objeto com { "valorTotal": "...", "valorServicos": "...", "valorIndustrializacao": "...", "valorVendaMercantil": "...", "valorLocacao": "...", "valorFretes": "...", "valorGerenciamento": "...", "valorFaturamentoDireto": "...", "sinalMobilizacao": "...", "condicaoPagamento": "...", "retencaoGarantia": "...", "riscoSacado": "...", "reajuste": "..." }.
- prazosCronograma: Objeto com { "mobilizacao": "...", "elaboracaoProjeto": "...", "aprovacaoProjeto": "...", "entregaMaterial": "...", "medidasDefinitivas": "...", "fabricacao": "...", "execucao": "...", "comissionamento": "...", "operacaoAssistida": "..." }.
- resumoExecutivo: Resumo geral da contratação e dos alinhamentos.

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
    "cot": "...",
    "ataNumero": "01",
    "dataReuniao": "...",
    "horario": "...",
    "local": "Online - Teams",
    "linkReuniao": "...",
    "folha": "01",
    "participantes": [],
    "valoresComerciais": {},
    "prazosCronograma": {},
    "resumoExecutivo": "..."
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

    const parsed = safeParseJsonFromAI(response.text || '{}', { metadata: {} });
    return parsed;
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

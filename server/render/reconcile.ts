import { TemplateSchema, TemplateField } from '../types/template';

export interface ReconciledData {
  payload: Record<string, any>;
  missingRequiredFields: string[];
  warnings: string[];
}

/**
 * Normalizes string keys to lowercase alphanumeric for robust alias matching.
 */
function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Maps input application states into a pristine dictionary for docxtemplater and XML injection.
 */
export function reconcilePayload(
  schema: TemplateSchema | null,
  abertura: any,
  analysisResult: any,
  divergences: any[],
  finalData: any | null,
  transcript: string = '',
  isPreAta: boolean = false,
  templateIntro: string = ''
): ReconciledData {
  const missingRequiredFields: string[] = [];
  const warnings: string[] = [];

  const dataReuniao = new Date().toLocaleDateString('pt-BR');
  const horaAtual = '10:30h';
  const localReuniao = 'Online - Teams';
  const anoAtual = new Date().getFullYear().toString();
  const mesAtual = (new Date().getMonth() + 1).toString().padStart(2, '0');
  const diaAtual = new Date().getDate().toString().padStart(2, '0');

  const obraCodigo = abertura?.obraCodigo ? String(abertura.obraCodigo).trim() : 'OBRA A DEFINIR';
  const obraNome = abertura?.obraNome ? String(abertura.obraNome).trim() : 'Obra / Empreendimento';
  const fornecedor = abertura?.fornecedor ? String(abertura.fornecedor).trim() : 'FORNECEDOR A DEFINIR';
  const assunto = abertura?.assunto ? String(abertura.assunto).trim() : 'Reunião de Contratação e Alinhamento Técnico';
  const servico = abertura?.servico ? String(abertura.servico).trim() : 'Serviço / Escopo Contratado';
  const rm = abertura?.rm ? String(abertura.rm).trim() : 'S/N';
  const cot = abertura?.cot ? String(abertura.cot).trim() : 'S/N';

  if (!abertura?.fornecedor) {
    warnings.push('Fornecedor não preenchido na Abertura. O documento foi preenchido com "FORNECEDOR A DEFINIR".');
  }
  if (!abertura?.obraCodigo) {
    warnings.push('Código da obra não preenchido na Abertura. O documento foi preenchido com "OBRA A DEFINIR".');
  }

  // Format topics list
  const topicsList = (analysisResult?.topics || []).map((t: any, idx: number) => {
    const num = String(idx + 1).padStart(2, '0');
    const isAtt = Boolean(t.pontoAtencao && t.pontoAtencao !== 'N/A' && t.pontoAtencao !== 'Nenhum' && t.pontoAtencao !== 'Não identificado');
    return {
      index: idx + 1,
      num,
      item: num,
      numero: num,
      title: t.title || `Item ${idx + 1}`,
      titulo: t.title || `Item ${idx + 1}`,
      assunto: t.title || `Item ${idx + 1}`,
      regraObra: t.regraObra || 'N/A',
      regra: t.regraObra || 'N/A',
      excecaoAdmitida: t.excecaoAdmitida || 'N/A',
      excecao: t.excecaoAdmitida || 'N/A',
      pontoAtencao: t.pontoAtencao || 'Nenhum',
      atencao: t.pontoAtencao || 'Nenhum',
      perguntaFornecedor: t.perguntaFornecedor || 'N/A',
      pergunta: t.perguntaFornecedor || 'N/A',
      source: t.source || 'Check List',
      origem: t.source || 'Check List',
      isAttention: isAtt,
      temAtencao: isAtt,
      responsavel: 'Informativo',
      prazo: 'Na reunião'
    };
  });

  // Format divergences list
  const divergencesList = (divergences || []).map((d: any, idx: number) => {
    const num = String(idx + 1).padStart(2, '0');
    const sev = (d.severity || 'MEDIA').toUpperCase();
    return {
      index: idx + 1,
      num,
      item: num,
      numero: num,
      severity: sev,
      severidade: sev,
      description: d.description || '',
      descricao: d.description || '',
      texto: d.description || '',
      source: d.source || 'Proposta Comercial',
      origem: d.source || 'Proposta Comercial',
      isAlta: sev === 'ALTA',
      isMedia: sev === 'MEDIA',
      isBaixa: sev === 'BAIXA',
      responsavel: 'Fornecedor / Engenharia',
      prazo: 'Na reunião'
    };
  });

  // Format agreed items
  const rawAgreed = Array.isArray(finalData?.agreedItems) ? finalData.agreedItems : [];
  const agreedList = rawAgreed.map((it: any, idx: number) => {
    const num = String(idx + 1).padStart(2, '0');
    const textVal = typeof it === 'string' ? it : (it.text || it.title || it.descricao || '');
    return {
      index: idx + 1,
      num,
      item: num,
      numero: num,
      text: textVal,
      texto: textVal,
      descricao: textVal,
      title: textVal,
      responsavel: it.responsavel || 'Informativo',
      prazo: it.prazo || 'Conforme cronograma'
    };
  });

  // Format pending items
  const rawPending = Array.isArray(finalData?.pendingItems) ? finalData.pendingItems : [];
  const pendingList = rawPending.map((it: any, idx: number) => {
    const num = String(idx + 1).padStart(2, '0');
    const textVal = typeof it === 'string' ? it : (it.text || it.title || it.descricao || '');
    return {
      index: idx + 1,
      num,
      item: num,
      numero: num,
      text: textVal,
      texto: textVal,
      descricao: textVal,
      title: textVal,
      responsavel: it.responsavel || 'Fornecedor / Engenharia',
      prazo: it.prazo || 'A definir'
    };
  });

  // Summary
  const resumoTexto = isPreAta
    ? (templateIntro || 'Esta Pré-Ata contém a análise de aderência das propostas comerciais frente ao check list de obrigações da obra, identificando regras acordadas, exceções admitidas e pontos de atenção para deliberação na reunião.')
    : (finalData?.notes || (transcript ? `Reunião realizada com alinhamento das condições técnicas e comerciais com a ${fornecedor}.` : 'Reunião de alinhamento e contratação realizada com sucesso.'));

  // Plain text blocks
  const topicsText = topicsList.map((t: any) =>
    `• [${t.item}] ${t.title}\n  - Regra da Obra: ${t.regraObra}\n  - Exceção Admitida: ${t.excecaoAdmitida}\n  - Ponto de Atenção: ${t.pontoAtencao}${isPreAta ? `\n  - Orientação: ${t.perguntaFornecedor}` : ''}`
  ).join('\n\n');

  const divergencesText = divergencesList.map((d: any) =>
    `• [${d.severity}] ${d.description} (Origem: ${d.source})`
  ).join('\n');

  const agreedText = agreedList.map((a: any) => `• ${a.text}`).join('\n');
  const pendingText = pendingList.map((p: any) => `• [PENDÊNCIA] ${p.text}`).join('\n');

  // Master Payload
  const payload: Record<string, any> = {
    // Obra
    obraCodigo,
    OBRA_CODIGO: obraCodigo,
    codigoObra: obraCodigo,
    CODIGO_OBRA: obraCodigo,
    codObra: obraCodigo,
    obra: obraCodigo,
    OBRA: obraCodigo,
    '[CÓDIGO DA OBRA]': obraCodigo,
    '[CODIGO DA OBRA]': obraCodigo,
    '[CÓDIGO_DA_OBRA]': obraCodigo,

    obraNome,
    OBRA_NOME: obraNome,
    nomeObra: obraNome,
    NOME_OBRA: obraNome,
    empreendimento: obraNome,
    EMPREENDIMENTO: obraNome,
    '[NOME DA OBRA]': obraNome,
    '[NOME_DA_OBRA]': obraNome,

    // Fornecedor
    fornecedor,
    FORNECEDOR: fornecedor,
    fornecedorNome: fornecedor,
    razaoSocial: fornecedor,
    RAZAO_SOCIAL: fornecedor,
    empresa: fornecedor,
    EMPRESA: fornecedor,
    '[FORNECEDOR]': fornecedor,

    // Assunto
    assunto,
    ASSUNTO: assunto,
    tema: assunto,
    TEMA: assunto,
    '[ASSUNTO]': assunto,

    // Servico
    servico,
    SERVICO: servico,
    SERVIÇO: servico,
    escopo: servico,
    ESCOPO: servico,
    pacote: servico,
    PACOTE: servico,
    '[SERVIÇO]': servico,
    '[SERVICO]': servico,

    // RM / COT
    rm,
    RM: rm,
    numRM: rm,
    cot,
    COT: cot,
    numCOT: cot,
    '[RM]': rm,
    '[COT]': cot,

    // Dates
    dataReuniao,
    DATA_REUNIAO: dataReuniao,
    data: dataReuniao,
    DATA: dataReuniao,
    dataExtenso: `${diaAtual}/${mesAtual}/${anoAtual}`,
    dia: diaAtual,
    mes: mesAtual,
    ano: anoAtual,
    horario: horaAtual,
    hora: horaAtual,
    local: localReuniao,

    // Resumo
    resumo: resumoTexto,
    RESUMO: resumoTexto,
    resumoExecutivo: resumoTexto,
    RESUMO_EXECUTIVO: resumoTexto,
    notas: resumoTexto,
    NOTAS: resumoTexto,
    '[EXTRAIR DO FIRE FLIES]': resumoTexto,
    '[EXTRAIR_DO_FIRE_FLIES]': resumoTexto,
    '[caminho da rede]': 'https://afonsofranca.sharepoint.com/reunioes/suprimentos',
    '[caminho_da_rede]': 'https://afonsofranca.sharepoint.com/reunioes/suprimentos',

    // Loops
    topics: topicsList,
    itens: topicsList,
    checklist: topicsList,
    analiseAderencia: topicsList,
    divergences: divergencesList,
    divergencias: divergencesList,
    agreedItems: agreedList,
    itensAcordados: agreedList,
    acordos: agreedList,
    pendingItems: pendingList,
    pendencias: pendingList,
    itensPendentes: pendingList,

    // Text aggregates
    topicsText,
    divergencesText,
    agreedText,
    pendingText,
    corpoAta: isPreAta ? `${topicsText}\n\n${divergencesText}` : `${agreedText}\n\n${pendingText}\n\n${resumoTexto}`
  };

  // Schema Validation & Fallbacks
  if (schema && Array.isArray(schema.fields)) {
    for (const field of schema.fields) {
      const val = payload[field.name];
      if (val === undefined || val === null || String(val).trim() === '') {
        if (field.defaultValue !== undefined && field.defaultValue !== null) {
          payload[field.name] = field.defaultValue;
        } else if (field.required) {
          payload[field.name] = `[${field.name.toUpperCase()}]`;
          warnings.push(`Campo obrigatório "${field.name}" não preenchido. Substituído por [${field.name.toUpperCase()}].`);
        }
      }
    }
  }

  return {
    payload,
    missingRequiredFields,
    warnings
  };
}

import { TemplateSchema } from '../types/template';
import { blocosParaOoxml, itemParaBlocos } from './richText';

export interface ReconciledData {
  payload: Record<string, any>;
  missingRequiredFields: string[];
  warnings: string[];
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

  const obraCodigo = abertura?.obraCodigo ? String(abertura.obraCodigo).trim() : '';
  const obraNome = abertura?.obraNome ? String(abertura.obraNome).trim() : '';
  const fornecedor = abertura?.fornecedor ? String(abertura.fornecedor).trim() : '';
  const assunto = abertura?.assunto ? String(abertura.assunto).trim() : '';
  const servico = abertura?.servico ? String(abertura.servico).trim() : '';
  const rm = abertura?.rm ? String(abertura.rm).trim() : '';
  const cot = abertura?.cot ? String(abertura.cot).trim() : '';
  const dataReuniao = abertura?.dataReuniao || abertura?.data || '';
  const horaReuniao = abertura?.horario || abertura?.hora || abertura?.horaAbertura || '';
  const horaAbertura = abertura?.horaAbertura || horaReuniao || '';
  const horaEncerramento = abertura?.horaEncerramento || '';
  const localReuniao = abertura?.local || abertura?.localReuniao || '';
  const linkReuniao = abertura?.linkReuniao || abertura?.link || '';

  // Get base formatting from schema loops if present
  const mainLoop = schema?.loops?.find(l => ['itens', 'topics', 'agreeditems'].includes(l.tag.toLowerCase()));
  const basePPr = mainLoop?.basePPr || '';
  const baseRPr = mainLoop?.baseRPr || '';

  // 1. Build Topics List
  const rawTopics = analysisResult?.topics || [];
  const topicsList = rawTopics.map((t: any, idx: number) => {
    const num = String(idx + 1).padStart(2, '0');
    const title = t.title || t.titulo || `Item ${idx + 1}`;
    const regraObra = t.regraObra || t.regra || '';
    const excecaoAdmitida = t.excecaoAdmitida || t.excecao || '';
    const pontoAtencao = t.pontoAtencao || t.atencao || '';
    const perguntaFornecedor = t.perguntaFornecedor || t.pergunta || '';
    const responsavel = t.responsavel || 'Fornecedor / Engenharia';
    const prazo = t.prazo || 'Conforme cronograma';

    const blocos = t.blocos && Array.isArray(t.blocos) && t.blocos.length > 0
      ? t.blocos
      : itemParaBlocos(title, '', {
          regra: regraObra,
          excecao: excecaoAdmitida,
          atencao: pontoAtencao,
          pergunta: perguntaFornecedor,
          responsavel,
          prazo
        });

    const corpoXml = blocosParaOoxml(blocos, basePPr, baseRPr);

    return {
      index: idx + 1,
      num,
      item: num,
      numero: num,
      title,
      titulo: title,
      descricao: `${regraObra ? `Regra: ${regraObra}. ` : ''}${pontoAtencao ? `Atenção: ${pontoAtencao}.` : ''}`.trim(),
      regraObra,
      excecaoAdmitida,
      pontoAtencao,
      perguntaFornecedor,
      source: t.source || 'Check List',
      responsavel,
      prazo,
      blocos,
      corpoXml,
      '@corpoXml': corpoXml
    };
  });

  // 2. Build Divergences List
  const rawDivergences = divergences || [];
  const divergencesList = rawDivergences.map((d: any, idx: number) => {
    const num = String(idx + 1).padStart(2, '0');
    const sev = (d.severity || d.severidade || 'MEDIA').toUpperCase();
    const desc = d.description || d.descricao || '';
    const title = `Divergência [${sev}]`;

    const blocos = d.blocos && Array.isArray(d.blocos) && d.blocos.length > 0
      ? d.blocos
      : itemParaBlocos(title, desc, { atencao: `Severidade: ${sev}`, responsavel: 'Fornecedor' });

    const corpoXml = blocosParaOoxml(blocos, basePPr, baseRPr);

    return {
      index: idx + 1,
      num,
      item: num,
      numero: num,
      severity: sev,
      severidade: sev,
      description: desc,
      descricao: desc,
      title,
      titulo: title,
      source: d.source || 'Proposta Comercial',
      responsavel: 'Fornecedor / Engenharia',
      prazo: 'Na reunião',
      blocos,
      corpoXml,
      '@corpoXml': corpoXml
    };
  });

  // 3. Build Agreed Items List
  const rawAgreed = Array.isArray(finalData?.agreedItems) ? finalData.agreedItems : [];
  const agreedList = rawAgreed.map((it: any, idx: number) => {
    const num = String(idx + 1).padStart(2, '0');
    const isObj = typeof it === 'object' && it !== null;
    const textVal = isObj ? (it.descricao || it.text || it.titulo || '') : String(it || '');
    const titleVal = isObj && it.titulo ? it.titulo : `Item Acordado ${idx + 1}`;
    const resp = isObj && it.responsavel ? it.responsavel : 'Informativo / Contratada';
    const prz = isObj && it.prazo ? it.prazo : 'Conforme cronograma';

    const blocos = isObj && Array.isArray(it.blocos) && it.blocos.length > 0
      ? it.blocos
      : itemParaBlocos(titleVal, textVal, { responsavel: resp, prazo: prz });

    const corpoXml = blocosParaOoxml(blocos, basePPr, baseRPr);

    return {
      index: idx + 1,
      num,
      item: num,
      numero: num,
      text: textVal,
      texto: textVal,
      descricao: textVal,
      title: titleVal,
      titulo: titleVal,
      responsavel: resp,
      prazo: prz,
      blocos,
      corpoXml,
      '@corpoXml': corpoXml
    };
  });

  // 4. Build Pending Items List
  const rawPending = Array.isArray(finalData?.pendingItems) ? finalData.pendingItems : [];
  const pendingList = rawPending.map((it: any, idx: number) => {
    const num = String(idx + 1).padStart(2, '0');
    const isObj = typeof it === 'object' && it !== null;
    const textVal = isObj ? (it.descricao || it.text || it.titulo || '') : String(it || '');
    const titleVal = isObj && it.titulo ? it.titulo : `Pendência ${idx + 1}`;
    const resp = isObj && it.responsavel ? it.responsavel : 'Fornecedor / Engenharia';
    const prz = isObj && it.prazo ? it.prazo : 'A definir';

    const blocos = isObj && Array.isArray(it.blocos) && it.blocos.length > 0
      ? it.blocos
      : itemParaBlocos(titleVal, textVal, { atencao: `PENDÊNCIA: ${textVal}`, responsavel: resp, prazo: prz });

    const corpoXml = blocosParaOoxml(blocos, basePPr, baseRPr);

    return {
      index: idx + 1,
      num,
      item: num,
      numero: num,
      text: textVal,
      texto: textVal,
      descricao: textVal,
      title: titleVal,
      titulo: titleVal,
      responsavel: resp,
      prazo: prz,
      blocos,
      corpoXml,
      '@corpoXml': corpoXml
    };
  });

  // 5. Consolidated Master Items for the body table
  // In Pre-Ata: topics + divergences
  // In Final Ata: agreedItems + pendingItems (or topics if agreed is empty)
  let masterItensList: any[] = [];
  if (isPreAta) {
    masterItensList = [...topicsList, ...divergencesList];
  } else {
    if (agreedList.length > 0 || pendingList.length > 0) {
      masterItensList = [...agreedList, ...pendingList];
    } else if (topicsList.length > 0) {
      masterItensList = [...topicsList];
    }
  }

  // Renumber master items sequentially
  masterItensList = masterItensList.map((item, idx) => ({
    ...item,
    index: idx + 1,
    num: String(idx + 1).padStart(2, '0'),
    item: String(idx + 1).padStart(2, '0'),
    numero: String(idx + 1).padStart(2, '0')
  }));

  // Summary notes
  const resumoTexto = isPreAta
    ? (templateIntro || 'Esta Pré-Ata contém a análise de aderência das propostas comerciais frente ao check list de obrigações da obra, identificando regras acordadas, exceções admitidas e pontos de atenção para deliberação na reunião.')
    : (finalData?.notes || (transcript ? `Reunião realizada com alinhamento das condições técnicas e comerciais com ${fornecedor || 'a contratada'}.` : ''));

  // Plain text aggregates
  const topicsText = topicsList.map((t: any) =>
    `• [${t.item}] ${t.title}\n  - Regra da Obra: ${t.regraObra || 'N/A'}\n  - Exceção Admitida: ${t.excecaoAdmitida || 'N/A'}\n  - Ponto de Atenção: ${t.pontoAtencao || 'Nenhum'}`
  ).join('\n\n');

  const divergencesText = divergencesList.map((d: any) =>
    `• [${d.severity}] ${d.description} (Origem: ${d.source})`
  ).join('\n');

  const agreedText = agreedList.map((a: any) => `• ${a.text}`).join('\n');
  const pendingText = pendingList.map((p: any) => `• [PENDÊNCIA] ${p.text}`).join('\n');

  // Master Payload WITHOUT brackets and WITHOUT fabricated default strings
  const payload: Record<string, any> = {
    // Obra
    obraCodigo: obraCodigo || null,
    OBRA_CODIGO: obraCodigo || null,
    codigoObra: obraCodigo || null,
    CODIGO_OBRA: obraCodigo || null,
    codObra: obraCodigo || null,
    obra: obraCodigo || null,
    OBRA: obraCodigo || null,

    obraNome: obraNome || null,
    OBRA_NOME: obraNome || null,
    nomeObra: obraNome || null,
    NOME_OBRA: obraNome || null,
    empreendimento: obraNome || null,
    EMPREENDIMENTO: obraNome || null,

    // Fornecedor
    fornecedor: fornecedor || null,
    FORNECEDOR: fornecedor || null,
    fornecedorNome: fornecedor || null,
    razaoSocial: fornecedor || null,
    RAZAO_SOCIAL: fornecedor || null,
    empresa: fornecedor || null,
    EMPRESA: fornecedor || null,

    // Assunto
    assunto: assunto || null,
    ASSUNTO: assunto || null,
    tema: assunto || null,
    TEMA: assunto || null,

    // Servico
    servico: servico || null,
    SERVICO: servico || null,
    SERVIÇO: servico || null,
    escopo: servico || null,
    ESCOPO: servico || null,
    pacote: servico || null,
    PACOTE: servico || null,

    // RM / COT
    rm: rm || null,
    RM: rm || null,
    numRM: rm || null,
    cot: cot || null,
    COT: cot || null,
    numCOT: cot || null,

    // Dates / Location
    dataReuniao: dataReuniao || null,
    DATA_REUNIAO: dataReuniao || null,
    data: dataReuniao || null,
    DATA: dataReuniao || null,
    horario: horaReuniao || null,
    hora: horaReuniao || null,
    horaAbertura: horaAbertura || null,
    horaEncerramento: horaEncerramento || null,
    local: localReuniao || null,
    localReuniao: localReuniao || null,
    linkReuniao: linkReuniao || null,
    link: linkReuniao || null,

    // Resumo
    resumo: resumoTexto || null,
    RESUMO: resumoTexto || null,
    resumoExecutivo: resumoTexto || null,
    RESUMO_EXECUTIVO: resumoTexto || null,
    notas: resumoTexto || null,
    NOTAS: resumoTexto || null,

    // Loops
    itens: masterItensList,
    ITENS: masterItensList,
    topics: topicsList,
    TOPICS: topicsList,
    checklist: topicsList,
    divergences: divergencesList,
    DIVERGENCES: divergencesList,
    divergencias: divergencesList,
    agreedItems: agreedList,
    AGREEDITEMS: agreedList,
    itensAcordados: agreedList,
    acordos: agreedList,
    pendingItems: pendingList,
    PENDINGITEMS: pendingList,
    pendencias: pendingList,
    itensPendentes: pendingList,

    // Text aggregates
    topicsText,
    divergencesText,
    agreedText,
    pendingText,
    corpoAta: isPreAta
      ? `${topicsText}\n\n${divergencesText}`.trim()
      : `${agreedText}\n\n${pendingText}\n\n${resumoTexto}`.trim()
  };

  // Schema Validation & Required Fields Check
  if (schema && Array.isArray(schema.fields)) {
    for (const field of schema.fields) {
      const val = payload[field.name];
      const isBlank = val === undefined || val === null || String(val).trim() === '';

      if (isBlank) {
        if (field.defaultValue !== undefined && field.defaultValue !== null && String(field.defaultValue).trim() !== '') {
          payload[field.name] = field.defaultValue;
        } else if (field.required) {
          missingRequiredFields.push(field.name);
        }
      }
    }
  } else {
    // Basic standard required checks
    if (!obraCodigo) missingRequiredFields.push('obraCodigo');
    if (!fornecedor) missingRequiredFields.push('fornecedor');
  }

  return {
    payload,
    missingRequiredFields: Array.from(new Set(missingRequiredFields)),
    warnings
  };
}

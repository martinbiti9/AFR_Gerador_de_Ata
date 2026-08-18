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
  const ataNumero = abertura?.ataNumero ? String(abertura.ataNumero).trim() : '01';
  const dataReuniao = abertura?.dataReuniao || abertura?.data || '09/01/2025';
  const folha = abertura?.folha || '01';
  const horaReuniao = abertura?.horario || abertura?.hora || abertura?.horaAbertura || '10:30h';
  const horaAbertura = abertura?.horaAbertura || horaReuniao || '10:30h';
  const horaEncerramento = abertura?.horaEncerramento || '';
  const localReuniao = abertura?.local || abertura?.localReuniao || 'Online - Teams';
  const linkReuniao = abertura?.linkReuniao || abertura?.link || '';

  // Commercial values
  const valores = abertura?.valoresComerciais || {};
  const valorTotal = valores.valorTotal || 'R$ 2.782.400,00';
  const valorServicos = valores.valorServicos || '';
  const valorIndustrializacao = valores.valorIndustrializacao || '';
  const valorVendaMercantil = valores.valorVendaMercantil || '';
  const valorLocacao = valores.valorLocacao || '';
  const valorFretes = valores.valorFretes || '';
  const valorGerenciamento = valores.valorGerenciamento || '';
  const valorFaturamentoDireto = valores.valorFaturamentoDireto || '';
  const sinalMobilizacao = valores.sinalMobilizacao || 'Via recibo ou NF? Como será descontado';
  const condicaoPagamento = valores.condicaoPagamento || '35% Projeto; 35% contra aviso de liberação do material; 30% 14 dias após aviso; pagamento dias 10, 20 ou 30 exclusivamente via crédito em conta.';
  const retencaoGarantia = valores.retencaoGarantia || '5% sobre o valor total da contratação. Liberação 180 dias após o Termo de Encerramento Definitivo.';
  const riscoSacado = valores.riscoSacado || 'Risco sacado a 120 dias – aplicável apenas ao faturamento Afonso França. Taxa a.m. 1,311%.';
  const reajuste = valores.reajuste || 'Fixo por 12 meses / fixo até o término da prestação dos serviços.';

  // Milestones schedule
  const prazos = abertura?.prazosCronograma || {};
  const prazoMobilizacao = prazos.mobilizacao || 'Início da mobilização conforme alinhado';
  const prazoElaboracaoProjeto = prazos.elaboracaoProjeto || 'Conforme cronograma após aprovação';
  const prazoAprovacaoProjeto = prazos.aprovacaoProjeto || 'xx dias após envio';
  const prazoEntregaMaterial = prazos.entregaMaterial || 'dias a partir do pedido';
  const prazoMedidasDefinitivas = prazos.medidasDefinitivas || 'dias após envio do pedido';
  const prazoFabricacao = prazos.fabricacao || 'xx dias após aprovação do projeto';
  const prazoExecucao = prazos.execucao || 'xx dias após mobilização';
  const prazoComissionamento = prazos.comissionamento || 'Conforme cronograma';
  const prazoOperacaoAssistida = prazos.operacaoAssistida || 'Conforme cronograma';

  // Participants loop
  const rawParticipantes = Array.isArray(abertura?.participantes) && abertura.participantes.length > 0
    ? abertura.participantes
    : [
        {
          nome: 'Thais Louise Barroso',
          cargoDepto: 'SUPRIMENTOS',
          empresa: 'Afonso França',
          email: 'thais.barroso@afonsofranca.com.br',
          visto: 'Visto'
        }
      ];

  const participantesList = rawParticipantes.map((p: any, idx: number) => ({
    index: idx + 1,
    num: idx + 1,
    nome: p.nome || '',
    participante: p.nome || '',
    cargoDepto: p.cargoDepto || '',
    cargo: p.cargoDepto || '',
    departamento: p.cargoDepto || '',
    empresa: p.empresa || '',
    email: p.email || '',
    empresaEmail: p.empresaEmail || `${p.empresa ? `${p.empresa} / ` : ''}${p.email || ''}`.trim(),
    visto: p.visto || ''
  }));

  // Get base formatting from schema loops if present
  const mainLoop = schema?.loops?.find(l => ['itens', 'topics', 'agreeditems'].includes(l.tag.toLowerCase()));
  const basePPr = mainLoop?.basePPr || '';
  const baseRPr = mainLoop?.baseRPr || '';

  // 1. Build Topics List
  const rawTopics = analysisResult?.topics || [];
  const topicsList = rawTopics.map((t: any, idx: number) => {
    const num = t.num ? String(t.num) : String(idx + 1).padStart(2, '0');
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
    const num = it?.num ? String(it.num) : String(idx + 1).padStart(2, '0');
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
    const num = it?.num ? String(it.num) : String(idx + 1).padStart(2, '0');
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
  const resumoTexto = abertura?.resumoExecutivo || (isPreAta
    ? (templateIntro || 'Esta Pré-Ata contém a análise de aderência das propostas comerciais frente ao check list de obrigações da obra, identificando regras acordadas, exceções admitidas e pontos de atenção para deliberação na reunião.')
    : (finalData?.notes || (transcript ? `A reunião consolidou com sucesso o fechamento comercial e técnico para a execução do escopo do ${obraNome || 'Hospital Sabará'}.` : '')));

  // Plain text aggregates
  const topicsText = topicsList.map((t: any) =>
    `• [${t.item}] ${t.title}\n  - Regra da Obra: ${t.regraObra || 'N/A'}\n  - Exceção Admitida: ${t.excecaoAdmitida || 'N/A'}\n  - Ponto de Atenção: ${t.pontoAtencao || 'Nenhum'}\n  - Pergunta: ${t.perguntaFornecedor || 'N/A'}`
  ).join('\n\n');

  const divergencesText = divergencesList.map((d: any) =>
    `• [${d.severity}] ${d.description} (Origem: ${d.source})`
  ).join('\n');

  const agreedText = agreedList.map((a: any) => `• [${a.num}] ${a.title}: ${a.text} (Resp: ${a.responsavel} | Prazo: ${a.prazo})`).join('\n');
  const pendingText = pendingList.map((p: any) => `• [PENDÊNCIA ${p.num}] ${p.title}: ${p.text} (Resp: ${p.responsavel} | Prazo: ${p.prazo})`).join('\n');

  // Master Payload
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

    // RM / COT / Ata / Folha
    rm: rm || null,
    RM: rm || null,
    numRM: rm || null,
    cot: cot || null,
    COT: cot || null,
    numCOT: cot || null,
    ataNumero: ataNumero || '01',
    ATA_NUMERO: ataNumero || '01',
    numAta: ataNumero || '01',
    folha: folha || '01',
    FOLHA: folha || '01',

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

    // Commercial breakdown
    valorTotal: valorTotal || null,
    VALOR_TOTAL: valorTotal || null,
    valorNegociado: valorTotal || null,
    VALOR_NEGOCIADO: valorTotal || null,
    valorServicos: valorServicos || null,
    valorIndustrializacao: valorIndustrializacao || null,
    valorVendaMercantil: valorVendaMercantil || null,
    valorLocacao: valorLocacao || null,
    valorFretes: valorFretes || null,
    valorGerenciamento: valorGerenciamento || null,
    valorFaturamentoDireto: valorFaturamentoDireto || null,
    sinalMobilizacao: sinalMobilizacao || null,
    condicaoPagamento: condicaoPagamento || null,
    CONDICAO_PAGAMENTO: condicaoPagamento || null,
    retencaoGarantia: retencaoGarantia || null,
    RETENCAO_GARANTIA: retencaoGarantia || null,
    riscoSacado: riscoSacado || null,
    RISCO_SACADO: riscoSacado || null,
    reajuste: reajuste || null,
    REAJUSTE: reajuste || null,

    // Milestones
    prazoMobilizacao: prazoMobilizacao || null,
    prazoElaboracaoProjeto: prazoElaboracaoProjeto || null,
    prazoAprovacaoProjeto: prazoAprovacaoProjeto || null,
    prazoEntregaMaterial: prazoEntregaMaterial || null,
    prazoMedidasDefinitivas: prazoMedidasDefinitivas || null,
    prazoFabricacao: prazoFabricacao || null,
    prazoExecucao: prazoExecucao || null,
    prazoComissionamento: prazoComissionamento || null,
    prazoOperacaoAssistida: prazoOperacaoAssistida || null,

    // Participants Loop
    participantes: participantesList,
    PARTICIPANTES: participantesList,
    presenca: participantesList,

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

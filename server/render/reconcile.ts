import { TemplateSchema } from '../types/template';
import { blocosParaOoxml, itemParaBlocos, topicoParaBlocos } from './richText';

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
  const ataNumero = abertura?.ataNumero ? String(abertura.ataNumero).trim() : null;
  const dataReuniao = abertura?.dataReuniao || abertura?.data || null;
  const folha = abertura?.folha ? String(abertura.folha).trim() : null;
  const horaReuniao = abertura?.horario || abertura?.hora || abertura?.horaAbertura || null;
  const horaAbertura = abertura?.horaAbertura || horaReuniao || null;
  const horaEncerramento = abertura?.horaEncerramento || null;
  const localReuniao = abertura?.local || abertura?.localReuniao || null;
  const linkReuniao = abertura?.linkReuniao || abertura?.link || null;

  // Commercial values
  const valores = abertura?.valoresComerciais || {};
  const valorTotal = valores.valorTotal || null;
  const valorServicos = valores.valorServicos || null;
  const valorIndustrializacao = valores.valorIndustrializacao || null;
  const valorVendaMercantil = valores.valorVendaMercantil || null;
  const valorLocacao = valores.valorLocacao || null;
  const valorFretes = valores.valorFretes || null;
  const valorGerenciamento = valores.valorGerenciamento || null;
  const valorFaturamentoDireto = valores.valorFaturamentoDireto || null;
  const sinalMobilizacao = valores.sinalMobilizacao || null;
  const condicaoPagamento = valores.condicaoPagamento || null;
  const retencaoGarantia = valores.retencaoGarantia || null;
  const riscoSacado = valores.riscoSacado || null;
  const reajuste = valores.reajuste || null;

  // Milestones schedule
  const prazos = abertura?.prazosCronograma || {};
  const prazoMobilizacao = prazos.mobilizacao || null;
  const prazoElaboracaoProjeto = prazos.elaboracaoProjeto || null;
  const prazoAprovacaoProjeto = prazos.aprovacaoProjeto || null;
  const prazoEntregaMaterial = prazos.entregaMaterial || null;
  const prazoMedidasDefinitivas = prazos.medidasDefinitivas || null;
  const prazoFabricacao = prazos.fabricacao || null;
  const prazoExecucao = prazos.execucao || null;
  const prazoComissionamento = prazos.comissionamento || null;
  const prazoOperacaoAssistida = prazos.operacaoAssistida || null;

  // Participants list - sem participante fake/default hardcoded
  const rawParticipantes: any[] = Array.isArray(abertura?.participantes)
    ? abertura.participantes.filter((p: any) => p && (p.nome || p.empresa || p.email))
    : [];

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
    empresaEmail: p.empresaEmail || `${p.empresa ? `${p.empresa}` : ''}${p.cargoDepto ? ` (${p.cargoDepto})` : ''}${p.email ? ` - ${p.email}` : ''}`.trim() || `${p.empresa || ''} ${p.email || ''}`.trim(),
    visto: p.visto || ''
  }));

  // Agrupa participantes de 2 em 2 para a tabela de 6 colunas (participantesPares)
  const participantesPares: any[] = [];
  if (participantesList.length > 0) {
    for (let i = 0; i < participantesList.length; i += 2) {
      const p1 = participantesList[i];
      const p2 = participantesList[i + 1] || null;
      participantesPares.push({
        p1Nome: p1.nome || '',
        p1EmpresaEmail: p1.empresaEmail || '',
        p1Visto: p1.visto || 'Visto',
        p2Nome: p2 ? (p2.nome || '') : '',
        p2EmpresaEmail: p2 ? (p2.empresaEmail || '') : '',
        p2Visto: p2 ? (p2.visto || 'Visto') : ''
      });
    }
  } else {
    // Lista vazia gera uma única linha de par vazio
    participantesPares.push({
      p1Nome: '',
      p1EmpresaEmail: '',
      p1Visto: '',
      p2Nome: '',
      p2EmpresaEmail: '',
      p2Visto: ''
    });
  }

  // Get base formatting and bulletNumId from schema loops if present
  const mainLoop = schema?.loops?.find(l => ['itens', 'topics', 'agreeditems'].includes(l.tag.toLowerCase()));
  const basePPr = mainLoop?.basePPr || '';
  const baseRPr = mainLoop?.baseRPr || '';
  const bulletNumId = schema?.bulletNumId ?? null;

  // 1. Build Topics List
  const rawTopics = analysisResult?.topics || [];
  const topicsList = rawTopics.map((t: any, idx: number) => {
    const num = t.num ? String(t.num) : String(idx + 1).padStart(2, '0');
    const title = t.title || t.titulo || `Item ${idx + 1}`;
    const regraObra = t.regraObra || t.regra || '';
    const excecaoAdmitida = t.excecaoAdmitida || t.excecao || '';
    const pontoAtencao = t.pontoAtencao || t.atencao || '';
    const perguntaFornecedor = t.perguntaFornecedor || t.pergunta || '';
    const responsavel = t.responsavel || null;
    const prazo = t.prazo || null;

    const blocos = t.blocos && Array.isArray(t.blocos) && t.blocos.length > 0
      ? t.blocos
      : itemParaBlocos(title, '', {
          regra: regraObra,
          excecao: excecaoAdmitida,
          atencao: pontoAtencao,
          pergunta: perguntaFornecedor,
          responsavel: responsavel || undefined,
          prazo: prazo || undefined
        });

    const corpoXml = blocosParaOoxml(blocos, basePPr, baseRPr, bulletNumId);

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
      responsavel: responsavel || '[A DEFINIR]',
      prazo: prazo || '[A DEFINIR]',
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
    const responsavel = d.responsavel || null;
    const prazo = d.prazo || null;

    const blocos = d.blocos && Array.isArray(d.blocos) && d.blocos.length > 0
      ? d.blocos
      : itemParaBlocos(title, desc, {
          atencao: `Severidade: ${sev}`,
          responsavel: responsavel || undefined,
          prazo: prazo || undefined
        });

    const corpoXml = blocosParaOoxml(blocos, basePPr, baseRPr, bulletNumId);

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
      responsavel: responsavel || '[A DEFINIR]',
      prazo: prazo || '[A DEFINIR]',
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
    const textVal = isObj ? (it.descricao || it.text || it.titulo || it.title || '') : String(it || '');
    const titleVal = isObj ? (it.titulo || it.title || `Item Acordado ${idx + 1}`) : `Item Acordado ${idx + 1}`;
    const resp = isObj && it.responsavel ? it.responsavel : null;
    const prz = isObj && it.prazo ? it.prazo : null;

    const blocos = isObj && Array.isArray(it.blocos) && it.blocos.length > 0
      ? it.blocos
      : itemParaBlocos(titleVal, textVal, {
          responsavel: resp || undefined,
          prazo: prz || undefined
        });

    const corpoXml = blocosParaOoxml(blocos, basePPr, baseRPr, bulletNumId);

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
      responsavel: resp || '[A DEFINIR]',
      prazo: prz || '[A DEFINIR]',
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
    const textVal = isObj ? (it.descricao || it.text || it.titulo || it.title || '') : String(it || '');
    const titleVal = isObj ? (it.titulo || it.title || `Pendência ${idx + 1}`) : `Pendência ${idx + 1}`;
    const resp = isObj && it.responsavel ? it.responsavel : null;
    const prz = isObj && it.prazo ? it.prazo : null;

    const blocos = isObj && Array.isArray(it.blocos) && it.blocos.length > 0
      ? it.blocos
      : topicoParaBlocos({
          titulo: titleVal,
          situacao: 'PENDENTE',
          textoAta: textVal,
          responsavel: resp,
          prazo: prz
        });

    const corpoXml = blocosParaOoxml(blocos, basePPr, baseRPr, bulletNumId);

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
      situacao: 'PENDENTE',
      responsavel: resp || '[A DEFINIR NA REUNIÃO]',
      prazo: prz || '[A DEFINIR NA REUNIÃO]',
      blocos,
      corpoXml,
      '@corpoXml': corpoXml
    };
  });

  // 5. Consolidated Master Items for the body table
  let masterItensList: any[] = [];
  if (isPreAta) {
    masterItensList = [...topicsList, ...divergencesList];
  } else if (Array.isArray(finalData?.topicos) && finalData.topicos.length > 0) {
    masterItensList = finalData.topicos.map((top: any, idx: number) => {
      const num = String(idx + 1).padStart(2, '0');
      const titleVal = top.titulo || top.title || `Item ${idx + 1}`;
      const textVal = top.textoAta || top.descricao || '';
      const resp = top.responsavel || null;
      const prz = top.prazo || null;
      const blocos = Array.isArray(top.blocos) && top.blocos.length > 0
        ? top.blocos
        : topicoParaBlocos({
            topicoId: top.topicoId,
            titulo: titleVal,
            situacao: top.situacao,
            textoAta: textVal,
            camposADefinir: top.camposADefinir,
            responsavel: resp,
            prazo: prz
          });
      const corpoXml = blocosParaOoxml(blocos, basePPr, baseRPr, bulletNumId);
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
        situacao: top.situacao,
        responsavel: resp || (top.situacao === 'PENDENTE' ? '[A DEFINIR NA REUNIÃO]' : '[A DEFINIR]'),
        prazo: prz || (top.situacao === 'PENDENTE' ? '[A DEFINIR NA REUNIÃO]' : '[A DEFINIR]'),
        blocos,
        corpoXml,
        '@corpoXml': corpoXml
      };
    });
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
    ? (templateIntro || null)
    : (finalData?.notes || finalData?.resumo || null));

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
    participantesPares,
    PARTICIPANTES_PARES: participantesPares,

    // Resumo
    resumo: resumoTexto || null,
    RESUMO: resumoTexto || null,
    resumoExecutivo: resumoTexto || null,
    RESUMO_EXECUTIVO: resumoTexto || null,
    resumo_executivo: resumoTexto || null,
    resumoReuniao: resumoTexto || null,
    RESUMO_REUNIAO: resumoTexto || null,
    resumo_reuniao: resumoTexto || null,
    resumoDaReuniao: resumoTexto || null,
    RESUMO_DA_REUNIAO: resumoTexto || null,
    sintese: resumoTexto || null,
    SINTESE: resumoTexto || null,
    sinteseExecutiva: resumoTexto || null,
    SINTESE_EXECUTIVA: resumoTexto || null,
    introducao: resumoTexto || null,
    INTRODUCAO: resumoTexto || null,
    notas: resumoTexto || null,
    NOTAS: resumoTexto || null,
    observacoes: resumoTexto || null,
    OBSERVACOES: resumoTexto || null,
    fechamento: resumoTexto || null,
    FECHAMENTO: resumoTexto || null,

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

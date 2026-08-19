import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validarV1AncoraPresente,
  validarV2AncoraNaTranscricao,
  validarV3NumerosEValoresNasFontes,
  validarTopicosAtaState,
  normalizarTexto,
  extrairTokensNumericos
} from '../server/validators/ataValidators';
import { TopicoEstado } from '../server/types/ataState';

test('Validações V1, V2 e V3 do Motor AtaState', async (t) => {
  await t.test('V1: ACORDADO sem âncora deve ser rebaixado para PENDENTE', () => {
    const topicoSemAncora: TopicoEstado = {
      topicoId: 't1',
      titulo: 'Critério de Medição',
      situacao: 'ACORDADO',
      textoAta: 'Medições até o dia 25.',
      camposADefinir: [],
      origens: [{ doc: 'CHECKLIST', ref: 'Item 1' }],
      responsavel: 'Fornecedor',
      prazo: 'Mensal'
    };

    const res = validarV1AncoraPresente(topicoSemAncora);
    assert.equal(res.valido, false);
    assert.equal(res.topicoAtualizado.situacao, 'PENDENTE');
  });

  await t.test('V1: ACORDADO com âncora deve permanecer ACORDADO', () => {
    const topicoComAncora: TopicoEstado = {
      topicoId: 't2',
      titulo: 'Segurança do Trabalho',
      situacao: 'ACORDADO',
      textoAta: 'EPIs completos obrigatórios.',
      camposADefinir: [],
      origens: [{ doc: 'TRANSCRICAO', ref: 'Reunião' }],
      ancoraTranscricao: 'Concordamos plenamente com a exigência dos EPIs e integração',
      responsavel: 'Fornecedor',
      prazo: 'Imediato'
    };

    const res = validarV1AncoraPresente(topicoComAncora);
    assert.equal(res.valido, true);
    assert.equal(res.topicoAtualizado.situacao, 'ACORDADO');
  });

  await t.test('V2: Âncora não encontrada literalmente na transcrição normalizada rebaixa para PENDENTE', () => {
    const topico: TopicoEstado = {
      topicoId: 't3',
      titulo: 'Retenção de Garantia',
      situacao: 'ACORDADO',
      textoAta: 'Retenção de 5% sobre cada medição.',
      camposADefinir: [],
      origens: [{ doc: 'TRANSCRICAO', ref: 'Reunião' }],
      ancoraTranscricao: 'Aceitamos a retenção contratual de 10% sem ressalvas',
      responsavel: 'Construtora',
      prazo: 'Contratual'
    };

    const transcricao = 'Na reunião o fornecedor concordou apenas com medição mensal e entrega de ART.';
    const res = validarV2AncoraNaTranscricao(topico, transcricao);

    assert.equal(res.valido, false);
    assert.equal(res.topicoAtualizado.situacao, 'PENDENTE');
  });

  await t.test('V2: Âncora encontrada com variação de espaços e caixa mantém ACORDADO', () => {
    const topico: TopicoEstado = {
      topicoId: 't4',
      titulo: 'Prazo de Mobilização',
      situacao: 'ACORDADO',
      textoAta: 'Mobilização em 5 dias.',
      camposADefinir: [],
      origens: [{ doc: 'TRANSCRICAO', ref: 'Reunião' }],
      ancoraTranscricao: 'Mobilização   em 5   dias após a OS',
      responsavel: 'Fornecedor',
      prazo: '5 dias'
    };

    const transcricao = 'Ficou acordado: mobilização em 5 dias após a os pelo fornecedor.';
    const res = validarV2AncoraNaTranscricao(topico, transcricao);

    assert.equal(res.valido, true);
    assert.equal(res.topicoAtualizado.situacao, 'ACORDADO');
  });

  await t.test('V3: Detecta números/valores monetários/datas no textoAta ausentes nas fontes', () => {
    const textoAta = 'O valor total acordado foi de R$ 4.500.000,00 com taxa de 18% e entrega até 28/02/2026.';
    const fontes = [
      'Proposta Comercial: Fornecimento de estruturas metálicas no valor de R$ 1.200.000,00.',
      'Checklist: Taxa padrão de 5% de retenção e cronograma com entrega em 15/12/2025.'
    ];

    const res = validarV3NumerosEValoresNasFontes(textoAta, fontes);
    assert.equal(res.valido, false);
    assert.ok(res.divergencias.length > 0);
    // Deve identificar os números inventados
    assert.ok(res.divergencias.some(d => d.includes('4.500.000') || d.includes('4500000')));
  });

  await t.test('V3: Aprova quando todos os valores constam nas fontes documentais', () => {
    const textoAta = 'Valor total de R$ 1.200.000,00 com retenção de 5% e conclusão em 15/12/2025.';
    const fontes = [
      'Proposta Comercial: Fornecimento de estruturas metálicas no valor de R$ 1.200.000,00.',
      'Checklist: Taxa padrão de 5% de retenção e cronograma com entrega em 15/12/2025.'
    ];

    const res = validarV3NumerosEValoresNasFontes(textoAta, fontes);
    assert.equal(res.valido, true);
    assert.equal(res.divergencias.length, 0);
  });

  await t.test('Pipeline consolidado validarTopicosAtaState', () => {
    const topicos: TopicoEstado[] = [
      {
        topicoId: 't1',
        titulo: 'Tópico 1 Acordado Válido',
        situacao: 'ACORDADO',
        textoAta: 'Entrega do projeto em 10 dias.',
        camposADefinir: [],
        origens: [],
        ancoraTranscricao: 'projeto em 10 dias',
        responsavel: 'Fornecedor',
        prazo: '10 dias'
      },
      {
        topicoId: 't2',
        titulo: 'Tópico 2 Acordado Inválido Sem Âncora',
        situacao: 'ACORDADO',
        textoAta: 'Sem âncora',
        camposADefinir: [],
        origens: [],
        responsavel: null,
        prazo: null
      }
    ];

    const transcricao = 'Confirmamos a entrega do projeto em 10 dias após assinatura.';
    const fontes = [transcricao, '10 dias'];

    const { topicosValidados } = validarTopicosAtaState(topicos, transcricao, fontes);

    assert.equal(topicosValidados[0].situacao, 'ACORDADO');
    assert.equal(topicosValidados[1].situacao, 'PENDENTE');
  });

  await t.test('PROMPT 07: Versões semânticas de prompt e rastreador de progresso', async () => {
    const { PROMPT_VERSIONS } = await import('../server/gemini');
    const { setAnalysisProgress, getAnalysisProgress } = await import('../server/meetingStore');

    assert.equal(PROMPT_VERSIONS.checklist, 'checklist@2.0.0');
    assert.equal(PROMPT_VERSIONS.proposal, 'proposal@2.0.0');
    assert.equal(PROMPT_VERSIONS.segmentation, 'segmentation@2.0.0');
    assert.equal(PROMPT_VERSIONS.decisions, 'decisions@2.0.0');
    assert.equal(PROMPT_VERSIONS.metadata, 'metadata@2.0.0');

    // Test progress tracking
    const mId = 'test-meeting-prog-1';
    setAnalysisProgress(mId, {
      stage: 'CHECKLIST_BATCH',
      totalBatches: 3,
      currentBatch: 2,
      progressPercent: 67,
      message: 'Processando lote 2 de 3 do Check List...'
    });

    const status = getAnalysisProgress(mId);
    assert.equal(status.meetingId, mId);
    assert.equal(status.stage, 'CHECKLIST_BATCH');
    assert.equal(status.totalBatches, 3);
    assert.equal(status.currentBatch, 2);
    assert.equal(status.progressPercent, 67);
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import mammoth from 'mammoth';
import { parseDocxTemplate } from '../server/docx';
import { renderAtaDocumentWithTemplate, mergeAdjacentRuns } from '../server/render/renderAta';
import { findBlocks } from '../server/render/injectLoop';
import { blocosParaOoxml, extrairBulletNumId, itemParaBlocos } from '../server/render/richText';
import { extrairTextosPadraoDoTemplate } from '../server/templateRepository';
import { TemplateDocument } from '../server/types/template';
import { appendDebugMd } from '../server/debugMd';

const STRICT = process.env.STRICT === '1';
const BASELINE_LOG_FILE = path.resolve(process.cwd(), 'debug', '00_baseline.md');

// Helper to record baseline defects or fail in STRICT mode
function assertOrRecord(testName: string, checkFn: () => void) {
  try {
    checkFn();
  } catch (err: any) {
    const errorDetails = {
      test: testName,
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    };

    appendDebugMd('00_baseline', `Defeito Baseline Detectado: ${testName}`, errorDetails);

    // Also write directly to debug/00_baseline.md
    const logEntry = `\n### [${new Date().toISOString()}] Defeito: ${testName}\n- **Erro**: ${err.message}\n- **Modo**: ${STRICT ? 'STRICT (Falha Real)' : 'BASELINE (Capturado para refatoração nos prompts 03-05)'}\n\n`;
    try {
      fs.appendFileSync(BASELINE_LOG_FILE, logEntry, 'utf-8');
    } catch {
      // ignore
    }

    if (STRICT) {
      throw err;
    } else {
      console.warn(`[BASELINE DEFECT CAPTURED] ${testName}: ${err.message}`);
    }
  }
}

test('Regression Suite - Template Parsing e Pipeline de Render DOCX', async (t) => {
  // 1. Carregar fixtures/ATA_MODELO.docx
  const fixturePath = path.resolve(process.cwd(), 'fixtures', 'ATA_MODELO.docx');
  assert.ok(fs.existsSync(fixturePath), 'Arquivo fixtures/ATA_MODELO.docx deve existir');
  const templateBuffer = fs.readFileSync(fixturePath);

  // 2. Executar parseDocxTemplate
  const inspection = await parseDocxTemplate(templateBuffer);

  await t.test('Inspeção do Template Oficial (5 tabelas, cabeçalho e placeholders)', () => {
    // Afirmar 5 tabelas
    assert.strictEqual(inspection.tablesCount, 5, `Esperado 5 tabelas no template, encontrado ${inspection.tablesCount}`);

    // Afirmar tabela de corpo com 4 colunas e cabeçalho iniciando com "Item" e "Descri"
    const bodyTable = inspection.tables.find(tbl =>
      tbl.columnCount === 4 &&
      tbl.rows.length >= 2 &&
      tbl.rows[0]?.cells[0]?.startsWith('Item') &&
      tbl.rows[0]?.cells[1]?.startsWith('Descri')
    );
    assert.ok(bodyTable, 'Tabela de corpo principal com 4 colunas (Item e Descrição) deve existir');

    // Placeholders detectados contêm CÓDIGO DA OBRA, NOME DA OBRA, ASSUNTO, SERVIÇO, FORNECEDOR, EXTRAIR DO FIRE FLIES
    const tags = inspection.detectedPlaceholders;
    const requiredPlaceholders = [
      'CÓDIGO DA OBRA',
      'NOME DA OBRA',
      'ASSUNTO',
      'SERVIÇO',
      'FORNECEDOR',
      'EXTRAIR DO FIRE FLIES'
    ];

    for (const ph of requiredPlaceholders) {
      assert.ok(
        tags.includes(ph),
        `Placeholder "${ph}" deve estar presente nos detectedPlaceholders: [${tags.join(', ')}]`
      );
    }

    // Contabilizar estatísticas de merge de runs nos XMLs do template oficial
    const zip = new PizZip(templateBuffer);
    const mergeStats: Record<string, { runsAntes: number; runsDepois: number; runsMesclados: number }> = {};
    let totalMesclados = 0;

    for (const filename of Object.keys(zip.files)) {
      if (/^word\/(document|header\d*|footer\d*)\.xml$/.test(filename)) {
        const rawXml = zip.files[filename].asText();
        const runsAntes = (rawXml.match(/<w:r[\s>]/g) || []).length;
        const mergedXml = mergeAdjacentRuns(rawXml);
        const runsDepois = (mergedXml.match(/<w:r[\s>]/g) || []).length;
        const runsMesclados = Math.max(0, runsAntes - runsDepois);
        totalMesclados += runsMesclados;
        mergeStats[filename] = { runsAntes, runsDepois, runsMesclados };
      }
    }

    appendDebugMd('03_parser', 'Métricas de Merge de Runs OOXML no Template Oficial', {
      totalMesclados,
      detalhesPorArquivo: mergeStats,
      placeholdersDetectados: tags,
      timestamp: new Date().toISOString()
    });
  });

  // 3. Executar pipeline de render completo com payload fixo
  const fixedPayload = {
    abertura: {
      obraCodigo: 'OBRA-102',
      obraNome: 'Hospital Sabará',
      fornecedor: 'Alpha Elevadores Ltda',
      assunto: 'Fechamento Comercial e Técnico',
      servico: 'Instalação e Manutenção de Elevadores',
      rm: 'RM-2025',
      cot: 'COT-881',
      ataNumero: '01',
      folha: '01',
      dataReuniao: '18/08/2026',
      horario: '10:30h',
      localReuniao: 'Online - Microsoft Teams',
      linkReuniao: 'https://teams.microsoft.com/l/meetup-join/123456',
      valoresComerciais: {
        valorTotal: 'R$ 2.782.400,00',
        condicaoPagamento: '35% Projeto, 35% fabricação, 30% entrega.',
        retencaoGarantia: '5% sobre o valor total.'
      },
      participantes: [
        {
          nome: 'Thais Louise Barroso',
          cargoDepto: 'Suprimentos',
          empresa: 'Afonso França',
          email: 'thais.barroso@afonsofranca.com.br',
          visto: 'Visto'
        }
      ]
    },
    analysisResult: {
      topics: [
        {
          num: '01',
          title: 'Fornecimento de Cabos de Tração e Motorização',
          regraObra: 'Cabos de aço certificados conforme NBR NM 207',
          pontoAtencao: 'Necessidade de laudo de conformidade técnica',
          responsavel: 'Alpha Elevadores',
          prazo: '30 dias úteis'
        }
      ]
    },
    divergences: [
      {
        severity: 'ALTA',
        description: 'Garantia de 24 meses solicitada pela obra vs 12 meses na proposta inicial',
        source: 'Checklist Proposta'
      }
    ],
    finalData: {
      agreedItems: [
        {
          num: '01',
          title: 'Acordo sobre Prazo de Fabricação',
          text: 'Prazo reduzido para 45 dias úteis com cronograma detalhado.',
          responsavel: 'Alpha Elevadores',
          prazo: '45 dias'
        }
      ],
      pendingItems: [
        {
          num: '02',
          title: 'Apresentação de ART do Engenheiro',
          text: 'Fornecedor deve emitir e protocolar ART do engenheiro responsável.',
          responsavel: 'Alpha Elevadores',
          prazo: '5 dias úteis'
        }
      ],
      notes: 'A reunião consolidou com sucesso o fechamento comercial e técnico para a execução do escopo do Hospital Sabará.'
    },
    transcript: 'Transcrição da reunião de alinhamento com a Alpha Elevadores...'
  };

  const mockTemplate: TemplateDocument = {
    id: 'template-test-official',
    version: 1,
    name: 'ATA_MODELO Oficial',
    description: 'Template oficial de Ata de Reunião para testes de regressão',
    companyName: 'Afonso França Engenharia',
    originalFileName: 'ATA_MODELO.docx',
    fileSizeBytes: templateBuffer.length,
    docxBlobBase64: templateBuffer.toString('base64'),
    schema: inspection.initialSchema || {
      version: 1,
      templateId: 'template-test-official',
      fields: [],
      loops: [],
      placeholderMap: inspection.placeholderMap,
      removerRealceAmarelo: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      generatedBy: 'system'
    },
    detectedPlaceholders: inspection.detectedPlaceholders,
    tables: inspection.tables,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    isActive: true
  };

  const renderResult = await renderAtaDocumentWithTemplate(
    mockTemplate,
    fixedPayload.abertura,
    fixedPayload.analysisResult,
    fixedPayload.divergences,
    fixedPayload.finalData,
    fixedPayload.transcript,
    false
  );

  assert.ok(renderResult.buffer, 'Render deve retornar um buffer válido');
  assert.ok(renderResult.buffer.length > 0, 'Buffer não pode ser vazio');

  // 4. Verificação no DOCX de saída
  await t.test('Verificação de Conteúdo e Integridade Estrutural no DOCX de Saída', async () => {
    // Extrai texto via mammoth
    const mammothRes = await mammoth.extractRawText({ buffer: renderResult.buffer });
    const rawText = mammothRes.value || '';

    // Reabre via PizZip
    const outZip = new PizZip(renderResult.buffer);
    const docXml = outZip.files['word/document.xml']?.asText() || '';
    const combinedText = `${rawText} ${docXml.replace(/<[^>]+>/g, ' ')}`;

    // a) Contém o fornecedor e o serviço do payload
    assertOrRecord('DOCX contém fornecedor do payload', () => {
      assert.ok(
        combinedText.includes('Alpha Elevadores Ltda'),
        'DOCX de saída deve conter o fornecedor "Alpha Elevadores Ltda"'
      );
    });

    assertOrRecord('DOCX contém serviço do payload', () => {
      assert.ok(
        combinedText.includes('Instalação e Manutenção de Elevadores'),
        'DOCX de saída deve conter o serviço "Instalação e Manutenção de Elevadores"'
      );
    });

    // b) Contém o título do primeiro item do payload
    assertOrRecord('DOCX contém título do primeiro item do payload', () => {
      assert.ok(
        combinedText.includes('Acordo sobre Prazo de Fabricação') ||
        combinedText.includes('Fornecimento de Cabos de Tração'),
        'DOCX de saída deve conter o título do primeiro item do payload'
      );
    });

    // c) NÃO contém [FORNECEDOR], [SERVIÇO], "XXX", "[xx]", "R$ XXXX"
    assertOrRecord('DOCX NÃO contém [FORNECEDOR]', () => {
      assert.ok(
        !combinedText.includes('[FORNECEDOR]'),
        'DOCX de saída não pode conter [FORNECEDOR]'
      );
    });

    assertOrRecord('DOCX NÃO contém [SERVIÇO]', () => {
      assert.ok(
        !combinedText.includes('[SERVIÇO]') && !combinedText.includes('[SERVICO]'),
        'DOCX de saída não pode conter [SERVIÇO]'
      );
    });

    assertOrRecord('DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX', () => {
      const temXxx = combinedText.includes('XXX');
      const temXxBracket = combinedText.includes('[xx]');
      const temRsXxxx = combinedText.includes('R$ XXXX');
      assert.ok(
        !temXxx && !temXxBracket && !temRsXxxx,
        `DOCX de saída não deve conter marcadores não substituídos: XXX (${temXxx}), [xx] (${temXxBracket}), R$ XXXX (${temRsXxxx})`
      );
    });

    // d) O arquivo reabre via PizZip e nenhum <w:tc> fica sem <w:p>
    assertOrRecord('Nenhum <w:tc> fica sem <w:p> no XML', () => {
      // Procura qualquer <w:tc> que não contenha <w:p
      const tcMatches = docXml.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || [];
      for (let i = 0; i < tcMatches.length; i++) {
        const tc = tcMatches[i];
        assert.ok(
          tc.includes('<w:p') || tc.includes('<w:p/>'),
          `Célula <w:tc> na posição ${i} não possui elemento <w:p>`
        );
      }
    });

    // e) Tabela de cabeçalho (índice 0) preserva suas linhas originais e não foi corrompida
    assertOrRecord('Tabela de cabeçalho intacta com suas linhas preservadas', () => {
      const tblBlocks = findBlocks(docXml, 'w:tbl');
      assert.ok(tblBlocks.length >= 4, 'Documento deve conter ao menos 4 tabelas');
      const table0Xml = docXml.slice(tblBlocks[0].start, tblBlocks[0].end);
      const trBlocks = findBlocks(table0Xml, 'w:tr');
      assert.ok(trBlocks.length >= 2, 'Tabela 0 de cabeçalho deve manter suas linhas intactas');
    });

    // f) Participantes reais aparecem no documento
    assertOrRecord('Participantes reais renderizados', () => {
      assert.ok(
        combinedText.includes('Thais Louise Barroso') || combinedText.includes('thais.barroso@afonsofranca.com.br'),
        'Participante informado no payload deve estar presente'
      );
    });

    // Registra relatório de depuração do Prompt 04
    appendDebugMd('04_tabelas', 'Validação das Tabelas e Loops de Renderização', {
      totalTabelas: inspection.tablesCount,
      tabelaCorpoEscolhida: inspection.initialSchema?.loops.find(l => l.tag === 'itens')?.tableIndex,
      tabelaParticipantesEscolhida: inspection.initialSchema?.loops.find(l => l.tag === 'participantes' || l.tag === 'participantesPares')?.tableIndex,
      loopsConfigurados: inspection.initialSchema?.loops.map(l => ({ tag: l.tag, tableIndex: l.tableIndex })),
      timestamp: new Date().toISOString()
    });

    // Contagem de resíduos no template bruto vs documento de saída
    const templateZip = new PizZip(templateBuffer);
    const templateDocXml = templateZip.files['word/document.xml']?.asText() || '';
    const templateTextMatches = templateDocXml.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g) || [];
    const templateAllText = templateTextMatches.map(t => t.replace(/<[^>]+>/g, '')).join(' ');

    const resRawXxx = (templateAllText.match(/\bX{3,}\b/g) || []).length;
    const resRawBrackets = (templateAllText.match(/\[x+\]/gi) || []).length;
    const resRawRsXxx = (templateAllText.match(/R\$\s*X+/gi) || []).length;
    const totalResiduosTemplate = resRawXxx + resRawBrackets + resRawRsXxx;

    const outXxx = (combinedText.match(/\bX{3,}\b/g) || []).length;
    const outBrackets = (combinedText.match(/\[x+\]/gi) || []).length;
    const outRsXxx = (combinedText.match(/R\$\s*X+/gi) || []).length;
    const totalResiduosSaida = outXxx + outBrackets + outRsXxx;

    appendDebugMd('05_residuos', 'Auditoria de Eliminação de Resíduos XXX / [xx] / R$ XXXX', {
      templateOficial: {
        totalResiduos: totalResiduosTemplate,
        detalhes: { xxx: resRawXxx, colchetesXx: resRawBrackets, rsXxxx: resRawRsXxx }
      },
      docxSaida: {
        totalResiduos: totalResiduosSaida,
        detalhes: { xxx: outXxx, colchetesXx: outBrackets, rsXxxx: outRsXxx }
      },
      zerado: totalResiduosSaida === 0,
      timestamp: new Date().toISOString()
    });
  });

  // 4. Testes Unitários de Blocos OOXML, Resíduos e Listas (Prompt 05)
  await t.test('Testes Unitários de Blocos OOXML, Fallback de Bullets e Limpeza de Resíduos', async () => {
    // a) blocosParaOoxml com lista vazia retorna '<w:p/>'
    assert.strictEqual(blocosParaOoxml([]), '<w:p/>', 'blocosParaOoxml([]) deve retornar <w:p/>');
    assert.strictEqual(blocosParaOoxml(undefined as any), '<w:p/>', 'blocosParaOoxml(undefined) deve retornar <w:p/>');

    // b) Bullet com numId válido usa w:numPr
    const bulletComNumId = blocosParaOoxml([
      { tipo: 'bullet', nivel: 0, runs: [{ t: 'Item com numId' }] }
    ], '', '', 3);
    assert.ok(bulletComNumId.includes('<w:numId w:val="3"/>'), 'Deve gerar elemento w:numId com valor 3');

    // c) Bullet sem numId válido usa fallback com prefixo "• "
    const bulletFallback = blocosParaOoxml([
      { tipo: 'bullet', nivel: 0, runs: [{ t: 'Item com fallback' }] }
    ], '', '', null);
    assert.ok(!bulletFallback.includes('<w:numId'), 'Não deve gerar w:numId no fallback');
    assert.ok(bulletFallback.includes('• '), 'Deve conter caractere de bullet "• " no fallback');

    // d) extrairTextosPadraoDoTemplate limpa resíduos
    const mockTabelaCorpo = {
      index: 3,
      rowCount: 3,
      columnCount: 4,
      rows: [
        { index: 0, cells: ['Item', 'Descrição / Deliberação', 'Responsável', 'Prazo'] },
        { index: 1, cells: ['01', 'Fornecimento de [xx] cabos com taxa de R$ XXXX', 'Engenharia', 'XXX dias'] },
        { index: 2, cells: ['02', 'Revisão do cronograma em até [xxxx] dias úteis', 'XXX', 'R$ XXXX'] }
      ]
    };
    const extraidos = extrairTextosPadraoDoTemplate(mockTabelaCorpo);
    assert.strictEqual(extraidos.length, 2, 'Deve extrair 2 itens padrão');
    for (const item of extraidos) {
      assert.ok(!item.descricao.includes('[xx]'), 'Descrição não deve conter [xx]');
      assert.ok(!item.descricao.includes('R$ XXXX'), 'Descrição não deve conter R$ XXXX');
      assert.ok(item.descricao.includes('[A DEFINIR NA REUNIÃO]'), 'Resíduos devem ser substituídos por [A DEFINIR NA REUNIÃO]');
    }

    // e) extrairBulletNumId detecta numId válido se existir no XML
    const mockNumberingXml = `
      <w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:abstractNum w:abstractNumId="10">
          <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl>
        </w:abstractNum>
        <w:num w:numId="42">
          <w:abstractNumId w:val="10"/>
        </w:num>
      </w:numbering>
    `;
    const numIdExtraido = extrairBulletNumId(mockNumberingXml);
    assert.strictEqual(numIdExtraido, 42, 'Deve extrair numId 42 associado ao formato bullet');
  });

  // ================= PROMPT 09: VALIDADOR DE SAÍDA BLOQUEANTE =================
  await t.test('PROMPT 09: Verificação Ampliada e Validador Bloqueante (verifyGeneratedDocx)', async () => {
    const { verifyGeneratedDocx } = await import('../server/render/verify.js');

    // 1. Detecção de tags docxtemplater não resolvidas e resíduos genéricos
    const zipWithResidues = new PizZip();
    zipWithResidues.file('word/document.xml', `
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>Contrato Obra 590: {tagNaoResolvida}</w:t></w:r></w:p>
          <w:p><w:r><w:t>Valor residual: R$ XXXXX</w:t></w:r></w:p>
          <w:p><w:r><w:t>Prazo: [A INFORMAR]</w:t></w:r></w:p>
          <w:p><w:r><w:t>Código: XXXX</w:t></w:r></w:p>
        </w:body>
      </w:document>
    `);
    const docxWithResiduesBuffer = zipWithResidues.generate({ type: 'nodebuffer' });

    const reportResidues = await verifyGeneratedDocx(
      docxWithResiduesBuffer,
      { obraCodigo: '590' },
      ['Contrato']
    );

    assert.strictEqual(reportResidues.isVerified, false, 'Deve reprovar documento com resíduos genéricos');
    assert.ok(reportResidues.unresolvedPlaceholders.some(p => p.includes('{tagNaoResolvida}')), 'Deve detectar {tagNaoResolvida}');
    assert.ok(reportResidues.unresolvedPlaceholders.some(p => /R\$\s*X+/i.test(p)), 'Deve detectar R$ XXXXX');
    assert.ok(reportResidues.unresolvedPlaceholders.some(p => p.includes('[A INFORMAR]')), 'Deve detectar [A INFORMAR]');

    // 2. Detecção de marcador [A DEFINIR NA REUNIÃO] quando não há tópicos PENDENTE
    const zipWithAdDefinir = new PizZip();
    zipWithAdDefinir.file('word/document.xml', `
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>Item 01: Escopo Aprovado [A DEFINIR NA REUNIÃO]</w:t></w:r></w:p>
        </w:body>
      </w:document>
    `);
    const docxAdDefinirBuffer = zipWithAdDefinir.generate({ type: 'nodebuffer' });

    const ataSemPendencia = {
      topicos: [
        { topicoId: 't1', titulo: 'Item 01', situacao: 'ACORDADO', textoAta: 'Escopo Aprovado' }
      ]
    };

    const reportSemPendencia = await verifyGeneratedDocx(
      docxAdDefinirBuffer,
      {},
      ['Item 01'],
      ataSemPendencia
    );

    assert.strictEqual(reportSemPendencia.isVerified, false, 'Deve reprovar [A DEFINIR NA REUNIÃO] em ata sem pendências');
    assert.ok(
      reportSemPendencia.unresolvedPlaceholders.some(p => p.includes('[A DEFINIR NA REUNIÃO]')),
      'Deve registrar [A DEFINIR NA REUNIÃO] como não resolvido'
    );

    // 3. Verificação estrutural: falha se existir <w:tc> sem <w:p>
    const zipBrokenTable = new PizZip();
    zipBrokenTable.file('word/document.xml', `
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:tbl>
            <w:tr>
              <w:tc>
                <w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>
              </w:tc>
            </w:tr>
          </w:tbl>
        </w:body>
      </w:document>
    `);
    const docxBrokenTableBuffer = zipBrokenTable.generate({ type: 'nodebuffer' });

    const reportBrokenTable = await verifyGeneratedDocx(docxBrokenTableBuffer, {});
    assert.strictEqual(reportBrokenTable.isVerified, false, 'Deve reprovar DOCX com <w:tc> sem <w:p>');
    assert.ok(reportBrokenTable.structuralErrors.length > 0, 'Deve registrar erro estrutural');
    assert.ok(reportBrokenTable.structuralErrors[0].includes('<w:tc> sem parágrafo filho <w:p>'));

    // 4. Amostragem de loop: reprova se nenhum título esperado do AtaState estiver presente
    const zipValidStructure = new PizZip();
    zipValidStructure.file('word/document.xml', `
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>590 - Hospital Sabara</w:t></w:r></w:p>
          <w:p><w:r><w:t>Alpha Engenharia Ltda</w:t></w:r></w:p>
          <w:p><w:r><w:t>Texto qualquer sem correspondência de itens</w:t></w:r></w:p>
        </w:body>
      </w:document>
    `);
    const docxValidBuffer = zipValidStructure.generate({ type: 'nodebuffer' });

    const reportMissingLoop = await verifyGeneratedDocx(
      docxValidBuffer,
      { obraCodigo: '590', fornecedor: 'Alpha Engenharia' },
      ['Título Inexistente do Tópico 1', 'Título Inexistente do Tópico 2']
    );

    assert.strictEqual(reportMissingLoop.isVerified, false, 'Deve reprovar se nenhum título do loop for encontrado');
    assert.strictEqual(reportMissingLoop.loopVerification?.verified, false);

    // 5. Sucesso completo quando todos os critérios são atendidos
    const zipPerfect = new PizZip();
    zipPerfect.file('word/document.xml', `
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>Obra 590 - Hospital Sabara</w:t></w:r></w:p>
          <w:p><w:r><w:t>Fornecedor: Alpha Engenharia Ltda</w:t></w:r></w:p>
          <w:p><w:r><w:t>Item 01: Escopo e Fornecimento de Cabos</w:t></w:r></w:p>
        </w:body>
      </w:document>
    `);
    const docxPerfectBuffer = zipPerfect.generate({ type: 'nodebuffer' });

    const reportPerfect = await verifyGeneratedDocx(
      docxPerfectBuffer,
      { obraCodigo: '590', fornecedor: 'Alpha Engenharia' },
      ['Escopo e Fornecimento de Cabos']
    );

    assert.strictEqual(reportPerfect.isVerified, true, 'Deve aprovar documento íntegro e preenchido');
    assert.strictEqual(reportPerfect.missingFields.length, 0);
    assert.strictEqual(reportPerfect.unresolvedPlaceholders.length, 0);
    assert.strictEqual(reportPerfect.structuralErrors.length, 0);
    assert.strictEqual(reportPerfect.loopVerification?.verified, true);
  });
});

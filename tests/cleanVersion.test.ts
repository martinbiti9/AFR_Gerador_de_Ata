import test from 'node:test';
import assert from 'node:assert/strict';
import PizZip from 'pizzip';
import {
  removerRunsVermelhos,
  contemResiduosVermelhos,
  validarAtaParaExportacaoLimpa,
  gerarVersaoLimpaDocx
} from '../server/render/cleanVersion';
import { AtaState } from '../server/types/ataState';

test('Testes da Versão Limpa do Fornecedor (cleanVersion.ts)', async (t) => {
  await t.test('removerRunsVermelhos: remove apenas runs com cor C00000 e mantém runs pretos/normais', () => {
    const xmlOriginal = `
      <w:p>
        <w:r><w:rPr><w:b/></w:rPr><w:t>Tópico Acordado Válido: </w:t></w:r>
        <w:r><w:t>Texto regular em preto.</w:t></w:r>
        <w:r><w:rPr><w:color w:val="C00000"/><w:b/></w:rPr><w:t>PENDENTE: Ponto de divergência</w:t></w:r>
        <w:r><w:t> Continuação válida.</w:t></w:r>
      </w:p>
    `;

    const xmlLimpo = removerRunsVermelhos(xmlOriginal);

    assert.ok(xmlLimpo.includes('Tópico Acordado Válido: '));
    assert.ok(xmlLimpo.includes('Texto regular em preto.'));
    assert.ok(xmlLimpo.includes('Continuação válida.'));
    assert.equal(xmlLimpo.includes('PENDENTE: Ponto de divergência'), false);
    assert.equal(contemResiduosVermelhos(xmlLimpo), false);
  });

  await t.test('removerRunsVermelhos: normaliza parágrafo esvaziado para <w:p/>', () => {
    const xmlComParagrafoTotalmenteVermelho = `
      <w:p>
        <w:r><w:rPr><w:b/></w:rPr><w:t>Parágrafo preto 1</w:t></w:r>
      </w:p>
      <w:p>
        <w:pPr><w:jc w:val="left"/></w:pPr>
        <w:r><w:rPr><w:color w:val="C00000"/></w:rPr><w:t>Linha inteira em vermelho de pendência</w:t></w:r>
      </w:p>
      <w:p>
        <w:r><w:t>Parágrafo preto 2</w:t></w:r>
      </w:p>
    `;

    const xmlLimpo = removerRunsVermelhos(xmlComParagrafoTotalmenteVermelho);

    assert.ok(xmlLimpo.includes('Parágrafo preto 1'));
    assert.ok(xmlLimpo.includes('Parágrafo preto 2'));
    assert.equal(xmlLimpo.includes('Linha inteira em vermelho de pendência'), false);
    assert.ok(xmlLimpo.includes('<w:p/>'));
    assert.equal(contemResiduosVermelhos(xmlLimpo), false);
  });

  await t.test('validarAtaParaExportacaoLimpa: bloqueia exportação se houver tópicos PENDENTE', () => {
    const ataComPendencia: Partial<AtaState> = {
      versao: 1,
      topicos: [
        {
          topicoId: 't1',
          titulo: 'Escopo Contratual',
          situacao: 'ACORDADO',
          textoAta: 'Escopo alinhado.',
          responsavel: null,
          prazo: null,
          camposADefinir: [],
          origens: []
        },
        {
          topicoId: 't2',
          titulo: 'Critério de Reajuste',
          situacao: 'PENDENTE',
          textoAta: 'Reajuste anual pelo INCC a definir na reunião.',
          responsavel: null,
          prazo: null,
          camposADefinir: [],
          origens: []
        }
      ]
    };

    const res = validarAtaParaExportacaoLimpa(ataComPendencia);
    assert.equal(res.podeExportar, false);
    assert.equal(res.topicosPendentes.length, 1);
    assert.equal(res.topicosPendentes[0].topicoId, 't2');
  });

  await t.test('validarAtaParaExportacaoLimpa: bloqueia se houver camposADefinir restantes', () => {
    const ataComCamposADefinir: Partial<AtaState> = {
      versao: 1,
      topicos: [
        {
          topicoId: 't1',
          titulo: 'Prazo de Mobilização',
          situacao: 'ACORDADO',
          textoAta: 'Mobilização em [A DEFINIR NA REUNIÃO].',
          responsavel: null,
          prazo: null,
          camposADefinir: ['[A DEFINIR NA REUNIÃO]'],
          origens: []
        }
      ]
    };

    const res = validarAtaParaExportacaoLimpa(ataComCamposADefinir);
    assert.equal(res.podeExportar, false);
    assert.equal(res.camposADefinir.length, 1);
  });

  await t.test('validarAtaParaExportacaoLimpa: aprova quando todos os itens estão resolvidos', () => {
    const ataPronta: Partial<AtaState> = {
      versao: 1,
      topicos: [
        {
          topicoId: 't1',
          titulo: 'Critério de Medição',
          situacao: 'ACORDADO',
          textoAta: 'Corte no dia 25.',
          responsavel: null,
          prazo: null,
          camposADefinir: [],
          origens: []
        },
        {
          topicoId: 't2',
          titulo: 'SST e NR-18',
          situacao: 'MANTIDO_PADRAO',
          textoAta: 'Condições de segurança padrão.',
          responsavel: null,
          prazo: null,
          camposADefinir: [],
          origens: []
        }
      ]
    };

    const res = validarAtaParaExportacaoLimpa(ataPronta);
    assert.equal(res.podeExportar, true);
    assert.equal(res.topicosPendentes.length, 0);
    assert.equal(res.camposADefinir.length, 0);
  });

  await t.test('gerarVersaoLimpaDocx: processa pacote DOCX e valida regra V8', () => {
    const zip = new PizZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
    zip.file('word/document.xml', `
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p>
            <w:r><w:t>Item 01: Escopo e Fornecimento Aprovados.</w:t></w:r>
            <w:r><w:rPr><w:color w:val="C00000"/></w:rPr><w:t>PENDENTE: Ponto de atenção não alinhado</w:t></w:r>
          </w:p>
        </w:body>
      </w:document>
    `);
    zip.file('word/header1.xml', `
      <w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:p><w:r><w:t>Cabeçalho Oficial Afonso França</w:t></w:r></w:p>
      </w:hdr>
    `);

    const docxBuffer = zip.generate({ type: 'nodebuffer' });
    const { buffer: cleanBuffer, totalRemovidos } = gerarVersaoLimpaDocx(docxBuffer);

    assert.ok(cleanBuffer.length > 0);
    assert.ok(totalRemovidos >= 1);

    // Inspeciona o zip resultante
    const cleanZip = new PizZip(cleanBuffer);
    const cleanedDocXml = cleanZip.file('word/document.xml')?.asText() || '';

    assert.ok(cleanedDocXml.includes('Item 01: Escopo e Fornecimento Aprovados.'));
    assert.equal(cleanedDocXml.includes('PENDENTE: Ponto de atenção não alinhado'), false);
    assert.equal(contemResiduosVermelhos(cleanedDocXml), false);
  });
});

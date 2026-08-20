import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { parseDocxTemplate } from '../server/docx';
import { encontrarTabelaCorpo, extrairTextosPadraoDoTemplate } from '../server/templateRepository';
import { createOfficialTemplateDocx } from '../scripts/generateFixtureTemplate';

test('Testes de Inspeção e Extração de Textos Padrão do Template DOCX', async (t) => {
  const docxBuffer = createOfficialTemplateDocx();
  const inspection = await parseDocxTemplate(docxBuffer);

  await t.test('1. Inspeção completa sem truncamento de linhas (> 10 linhas)', () => {
    assert.ok(inspection.tablesCount >= 4, 'Deve conter ao menos 4 tabelas');
    
    const bodyTable = encontrarTabelaCorpo(inspection.tables);
    assert.ok(bodyTable, 'Deve encontrar a tabela de corpo de 4 colunas');
    assert.equal(bodyTable!.columnCount, 4, 'A tabela de corpo deve ter 4 colunas');
    assert.ok(bodyTable!.rows.length >= 30, `A tabela deve conter todas as 31 linhas (encontradas: ${bodyTable!.rows.length})`);
    assert.equal(bodyTable!.rowCount, bodyTable!.rows.length, 'rowCount e rows.length devem coincidir');

    // Verifica que nenhuma célula longa foi cortada com "..."
    const hasLongCell = bodyTable!.rows.some(r => r.cells.some(c => c.length > 100));
    assert.ok(hasLongCell, 'Deve conter células com mais de 100 caracteres sem corte');
  });

  await t.test('2. Preservação de parágrafos nas células com múltiplos <w:p>', () => {
    const bodyTable = encontrarTabelaCorpo(inspection.tables);
    // Linha do Item 01 (descrição com 2 parágrafos)
    const rowDescricaoItem1 = bodyTable!.rows.find(r => r.cells[1]?.includes('ABNT') && r.cells[1]?.includes('relatórios'));
    assert.ok(rowDescricaoItem1, 'Deve encontrar a linha com múltiplos parágrafos');
    assert.ok(rowDescricaoItem1!.cells[1].includes('\n'), 'Deve preservar a quebra de linha entre parágrafos na célula');
  });

  await t.test('3. Identificação robusta da tabela de corpo via encontrarTabelaCorpo', () => {
    const bodyTable = encontrarTabelaCorpo(inspection.tables);
    assert.ok(bodyTable);
    assert.equal(bodyTable!.columnCount, 4);
    assert.notEqual(bodyTable!.index, 0, 'Nunca deve retornar a tabela de cabeçalho (índice 0)');
    assert.ok(bodyTable!.rows[0].cells[0].toLowerCase().includes('item'));
    assert.ok(bodyTable!.rows[0].cells[1].toLowerCase().includes('descri'));
  });

  await t.test('4. Extração de textos padrão com variáveis de exemplo (placeholder e baseline)', () => {
    const bodyTable = encontrarTabelaCorpo(inspection.tables);
    const textosPadrao = extrairTextosPadraoDoTemplate(bodyTable);

    assert.ok(textosPadrao.length >= 15, `Deve extrair 15 itens padrão consolidados (encontrados: ${textosPadrao.length})`);

    // Item 01: Objeto e Escopo
    const item1 = textosPadrao.find(i => i.num === '01');
    assert.ok(item1, 'Item 01 deve existir');
    assert.equal(item1!.titulo, 'Objeto e Escopo do Fornecimento');
    assert.ok(item1!.descricao.includes('ABNT'));

    // Item 02: Condições Comerciais com placeholders
    const item2 = textosPadrao.find(i => i.num === '02');
    assert.ok(item2, 'Item 02 deve existir');
    assert.ok(item2!.variaveisExemplo.length > 0, 'Item 02 deve ter variáveis de exemplo');
    const phValor = item2!.variaveisExemplo.find(v => v.tipo === 'placeholder');
    assert.ok(phValor, 'Deve detectar placeholder tipo [xx] ou R$ XXXX');

    // Item 03: Retenção com baseline 5% e 180 dias
    const item3 = textosPadrao.find(i => i.num === '03');
    assert.ok(item3, 'Item 03 deve existir');
    const baseRetencao = item3!.variaveisExemplo.find(v => v.tipo === 'baseline');
    assert.ok(baseRetencao, 'Deve detectar baseline de percentual ou prazo');

    // Item 04: Prazos com xx dias e 120 dias
    const item4 = textosPadrao.find(i => i.num === '04');
    assert.ok(item4, 'Item 04 deve existir');
    assert.ok(item4!.variaveisExemplo.some(v => v.token.toLowerCase().includes('xx dias')));
  });

  await t.test('5. Inclusão de rawTextFull e rawTextPreview na inspeção', () => {
    assert.ok(inspection.rawTextFull, 'rawTextFull deve estar presente');
    assert.ok(inspection.rawTextFull.length > 1000, `rawTextFull deve ter o texto completo (> 1000 chars, tem ${inspection.rawTextFull.length})`);
    assert.ok(inspection.rawTextPreview.length <= 1000, 'rawTextPreview deve ter no máximo 1000 chars');
    assert.ok(inspection.rawTextFull.startsWith(inspection.rawTextPreview.slice(0, 100)));
  });
});

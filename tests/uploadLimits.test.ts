import { test } from 'node:test';
import assert from 'node:assert';
import { validateUploadFiles, ALLOWED_EXTENSIONS, ALLOWED_TEMPLATE_EXTENSIONS, MAX_FILE_SIZE_BYTES } from '../src/utils/fileValidation.js';

test('Validação de Limites de Upload no Frontend (PROMPT 10)', async (t) => {
  await t.test('Rejeita quando nenhum arquivo é selecionado', () => {
    const res = validateUploadFiles([]);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error?.includes('Nenhum arquivo'));
  });

  await t.test('Rejeita quando excede 5 arquivos', () => {
    const mockFiles: any[] = [
      { name: '1.pdf', size: 1024 },
      { name: '2.pdf', size: 1024 },
      { name: '3.pdf', size: 1024 },
      { name: '4.pdf', size: 1024 },
      { name: '5.pdf', size: 1024 },
      { name: '6.pdf', size: 1024 }
    ];
    const res = validateUploadFiles(mockFiles);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error?.includes('no máximo 5 arquivos'));
  });

  await t.test('Rejeita arquivo maior que 15 MB', () => {
    const mockFiles: any[] = [
      { name: 'grande.pdf', size: 16 * 1024 * 1024 }
    ];
    const res = validateUploadFiles(mockFiles);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error?.includes('excede o limite máximo permitido de 15 MB'));
  });

  await t.test('Rejeita arquivo com extensão não autorizada (.exe, .zip, etc.)', () => {
    const mockFiles: any[] = [
      { name: 'virus.exe', size: 1024 }
    ];
    const res = validateUploadFiles(mockFiles);
    assert.strictEqual(res.valid, false);
    assert.ok(res.error?.includes('Extensão não permitida'));
  });

  await t.test('Aprova arquivos válidos dentro dos limites (.pdf, .docx, .xlsx, .csv, .txt, .md, .mp3, .wav, .m4a)', () => {
    const mockFiles: any[] = [
      { name: 'documento.pdf', size: 2 * 1024 * 1024 },
      { name: 'tabela.xlsx', size: 500 * 1024 },
      { name: 'audio.m4a', size: 10 * 1024 * 1024 }
    ];
    const res = validateUploadFiles(mockFiles);
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.error, undefined);
  });

  await t.test('Validação de template do Word restringe a .docx', () => {
    const pdfTemplate: any[] = [{ name: 'modelo.pdf', size: 1024 }];
    const resPdf = validateUploadFiles(pdfTemplate, ALLOWED_TEMPLATE_EXTENSIONS, 1);
    assert.strictEqual(resPdf.valid, false);

    const docxTemplate: any[] = [{ name: 'modelo.docx', size: 1024 }];
    const resDocx = validateUploadFiles(docxTemplate, ALLOWED_TEMPLATE_EXTENSIONS, 1);
    assert.strictEqual(resDocx.valid, true);
  });
});

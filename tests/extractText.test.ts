import { test } from 'node:test';
import assert from 'node:assert';
import { extractTextFromFiles, prepareUploadedFilesForAI } from '../server/fileProcessor.js';

test('Extração e Processamento de Texto de Arquivos (PDF, DOCX, TXT)', async (t) => {
  await t.test('Extrai texto plano de arquivos TXT/MD', async () => {
    const mockTxtFile: any = {
      originalname: 'transcricao.txt',
      mimetype: 'text/plain',
      buffer: Buffer.from('Reunião realizada em 10/05/2025 com o fornecedor.', 'utf-8')
    };

    const text = await extractTextFromFiles([mockTxtFile]);
    assert.ok(text.includes('Reunião realizada em 10/05/2025'));
    assert.ok(text.includes('=== ARQUIVO TEXTO / CSV: transcricao.txt ==='));
  });

  await t.test('Extrai texto de arquivos PDF reais ou emulados', async () => {
    const dummyPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 712 Td (Transcricao da Reuniao Afonso Franca) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000227 00000 n \n0000000344 00000 n \ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n419\n%%EOF'
    );

    const mockPdfFile: any = {
      originalname: 'ata_reuniao.pdf',
      mimetype: 'application/pdf',
      buffer: dummyPdf
    };

    const text = await extractTextFromFiles([mockPdfFile]);
    assert.ok(text.includes('Transcricao da Reuniao Afonso Franca'));
    assert.ok(text.includes('=== DOCUMENTO PDF: ata_reuniao.pdf ==='));
  });

  await t.test('Prepara partes estruturadas para arquivos de áudio', async () => {
    const mockAudioFile: any = {
      originalname: 'gravacao.mp3',
      mimetype: 'audio/mp3',
      buffer: Buffer.from('fake-audio-bytes')
    };

    const parts = await prepareUploadedFilesForAI([mockAudioFile]);
    assert.strictEqual(parts.length, 1);
    assert.strictEqual(parts[0].inlineData?.mimeType, 'audio/mp3');
  });
});

import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { GoogleGenAI } from '@google/genai';
import { addLog } from './logger';

export interface AIContentPart {
  inlineData?: {
    data: string;
    mimeType: string;
  };
  text?: string;
}

/**
 * Converte arquivos enviados (PDF, Excel XLSX/XLS, Word DOCX, CSV, TXT, MD, Áudio, Imagens)
 * em partes de conteúdo suportadas de forma 100% segura e compatível pela API do Gemini.
 * Planilhas Excel e Documentos Word são convertidos em representações textuais estruturadas,
 * evitando erros de 'Unsupported MIME type' na API multimodal.
 */
export async function prepareUploadedFilesForAI(files: Express.Multer.File[]): Promise<AIContentPart[]> {
  if (!files || files.length === 0) {
    return [];
  }

  const parts: AIContentPart[] = [];

  for (const file of files) {
    const filename = file.originalname || 'documento';
    const lowerName = filename.toLowerCase();
    const mimeType = file.mimetype || '';

    try {
      // 1. Planilhas Excel (.xlsx, .xls, .xlsm, .csv)
      if (
        lowerName.endsWith('.xlsx') ||
        lowerName.endsWith('.xls') ||
        lowerName.endsWith('.xlsm') ||
        mimeType.includes('spreadsheet') ||
        mimeType.includes('excel') ||
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel'
      ) {
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        let excelText = `=== ARQUIVO EXCEL: ${filename} ===\n`;

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) continue;
          const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ' | ', RS: '\n' });
          if (csv && csv.trim()) {
            excelText += `\n[PLANILHA / ABA: "${sheetName}"]\n${csv.trim()}\n`;
          }
        }

        if (excelText.trim().length > 30) {
          parts.push({ text: excelText });
          addLog('INFO', 'SYSTEM', `Planilha Excel processada com sucesso: ${filename} (${workbook.SheetNames.length} abas)`);
          continue;
        }
      }

      // 2. Documentos Word (.docx, .doc)
      if (
        lowerName.endsWith('.docx') ||
        lowerName.endsWith('.doc') ||
        mimeType.includes('wordprocessingml') ||
        mimeType === 'application/msword'
      ) {
        const extracted = await mammoth.extractRawText({ buffer: file.buffer });
        const wordText = (extracted.value || '').trim();
        if (wordText) {
          parts.push({
            text: `=== DOCUMENTO WORD: ${filename} ===\n${wordText}`
          });
          addLog('INFO', 'SYSTEM', `Documento Word processado com sucesso: ${filename} (${wordText.length} caracteres)`);
          continue;
        }
      }

      // 3. Arquivos de Texto Plano, Markdown e CSV
      if (
        mimeType.startsWith('text/') ||
        lowerName.endsWith('.txt') ||
        lowerName.endsWith('.md') ||
        lowerName.endsWith('.csv') ||
        mimeType === 'application/csv' ||
        mimeType === 'text/csv'
      ) {
        const textContent = file.buffer.toString('utf-8').trim();
        if (textContent) {
          parts.push({
            text: `=== ARQUIVO TEXTO / CSV: ${filename} ===\n${textContent}`
          });
          continue;
        }
      }

      // 4. Arquivos PDF (.pdf)
      if (lowerName.endsWith('.pdf') || mimeType === 'application/pdf') {
        let pdfText = '';
        try {
          const parser = new PDFParse({ data: file.buffer });
          const textResult = await parser.getText();
          if (textResult?.text) {
            // Remove page joiners or markers if needed
            pdfText = textResult.text.replace(/-- \d+ of \d+ --/g, '').trim();
          }
        } catch (pdfErr: any) {
          addLog('WARN', 'SYSTEM', `Não foi possível extrair texto do PDF ${filename} via pdf-parse: ${pdfErr.message}`);
        }

        if (pdfText && pdfText.length > 20) {
          parts.push({
            text: `=== DOCUMENTO PDF: ${filename} ===\n${pdfText}`
          });
          addLog('INFO', 'SYSTEM', `Documento PDF processado em texto: ${filename} (${pdfText.length} caracteres)`);
        } else {
          parts.push({
            inlineData: {
              data: file.buffer.toString('base64'),
              mimeType: 'application/pdf'
            }
          });
        }
        continue;
      }

      // 5. Áudio e Vídeo (.mp3, .wav, .m4a, .aac, .ogg, .webm, .mp4)
      if (
        mimeType.startsWith('audio/') ||
        mimeType.startsWith('video/') ||
        lowerName.endsWith('.mp3') ||
        lowerName.endsWith('.wav') ||
        lowerName.endsWith('.m4a') ||
        lowerName.endsWith('.aac') ||
        lowerName.endsWith('.ogg') ||
        lowerName.endsWith('.webm') ||
        lowerName.endsWith('.mp4')
      ) {
        let detectedMime = mimeType;
        if (!detectedMime || !detectedMime.startsWith('audio/')) {
          if (lowerName.endsWith('.mp3')) detectedMime = 'audio/mp3';
          else if (lowerName.endsWith('.wav')) detectedMime = 'audio/wav';
          else if (lowerName.endsWith('.m4a')) detectedMime = 'audio/m4a';
          else if (lowerName.endsWith('.aac')) detectedMime = 'audio/aac';
          else if (lowerName.endsWith('.ogg')) detectedMime = 'audio/ogg';
          else if (lowerName.endsWith('.webm')) detectedMime = 'audio/webm';
          else if (lowerName.endsWith('.mp4')) detectedMime = 'video/mp4';
          else detectedMime = 'audio/mp3';
        }
        parts.push({
          inlineData: {
            data: file.buffer.toString('base64'),
            mimeType: detectedMime
          }
        });
        continue;
      }

      // 6. Imagens (PNG, JPG, JPEG, WEBP)
      if (mimeType.startsWith('image/') || lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.webp')) {
        parts.push({
          inlineData: {
            data: file.buffer.toString('base64'),
            mimeType: mimeType || 'image/jpeg'
          }
        });
        continue;
      }

      // Fallback genérico: tenta ler como texto UTF-8 se for legível
      const genericText = file.buffer.toString('utf-8').trim();
      if (genericText && genericText.length > 10 && !/[\x00-\x08\x0E-\x1F]/.test(genericText.slice(0, 100))) {
        parts.push({
          text: `=== ARQUIVO: ${filename} ===\n${genericText}`
        });
      } else {
        // Fallback como PDF inlineData se for binário não identificado
        parts.push({
          inlineData: {
            data: file.buffer.toString('base64'),
            mimeType: 'application/pdf'
          }
        });
      }
    } catch (err: any) {
      addLog('WARN', 'SYSTEM', `Aviso ao processar arquivo ${filename} para IA: ${err.message}`);
      // Fallback básico para não perder o arquivo
      try {
        parts.push({
          text: `=== ARQUIVO (FALLBACK): ${filename} ===\n${file.buffer.toString('utf-8').slice(0, 5000)}`
        });
      } catch {
        // ignore
      }
    }
  }

  return parts;
}

/**
 * Extrai todo o conteúdo de texto legível de um conjunto de arquivos.
 * Suporta arquivos de texto, PDF, Word, Excel e transcrição de áudio/mídia via IA.
 */
export async function extractTextFromFiles(files: Express.Multer.File[]): Promise<string> {
  const parts = await prepareUploadedFilesForAI(files);
  const textBlocks: string[] = [];
  const inlineParts: AIContentPart[] = [];

  for (const part of parts) {
    if (part.text && part.text.trim()) {
      textBlocks.push(part.text.trim());
    } else if (part.inlineData) {
      inlineParts.push(part);
    }
  }

  // Se houver partes binárias/multimídia (áudio, fotos, PDFs escaneados), processa via Gemini para transcrição
  if (inlineParts.length > 0) {
    try {
      const ai = new GoogleGenAI({});
      const prompt = `Transcreva na íntegra todo o conteúdo falado em áudio, anotações de imagem ou texto destes arquivos para Português do Brasil. Identifique falas, oradores, deliberações, decisões acordadas, tópicos e valores. Retorne apenas o texto transcrito.`;
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          ...inlineParts,
          { text: prompt }
        ]
      });
      if (response.text && response.text.trim()) {
        textBlocks.push(response.text.trim());
        addLog('INFO', 'AI', `Conteúdo multimídia/áudio transcrito com sucesso via IA (${response.text.length} caracteres)`);
      }
    } catch (err: any) {
      addLog('WARN', 'AI', `Aviso ao transcrever arquivos de mídia via IA: ${err.message}`);
    }
  }

  return textBlocks.join('\n\n---\n\n');
}

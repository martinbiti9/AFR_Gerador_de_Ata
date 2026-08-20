/**
 * Utilitário central de validação de arquivos para upload (Frontend).
 * Implementa as regras do PROMPT 10:
 * - Máximo de 15 MB por arquivo
 * - Máximo de 5 arquivos por envio
 * - Extensões permitidas: .pdf, .docx, .xlsx, .csv, .txt, .md
 */

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_FILES_COUNT = 5;

export const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.xlsx',
  '.csv',
  '.txt',
  '.md'
];

export const ALLOWED_TEMPLATE_EXTENSIONS = ['.docx'];

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Valida uma lista de arquivos antes do envio (POST).
 */
export function validateUploadFiles(
  files: File[] | FileList | null | undefined,
  allowedExtensions: string[] = ALLOWED_EXTENSIONS,
  maxCount: number = MAX_FILES_COUNT,
  maxSizeBytes: number = MAX_FILE_SIZE_BYTES
): FileValidationResult {
  if (!files || files.length === 0) {
    return { valid: false, error: 'Nenhum arquivo selecionado para upload.' };
  }

  const fileArray = Array.from(files);

  // 1. Validação de quantidade máxima
  if (fileArray.length > maxCount) {
    return {
      valid: false,
      error: `Limite de arquivos excedido: selecione no máximo ${maxCount} arquivos por envio (você selecionou ${fileArray.length}).`
    };
  }

  // 2. Validação individual de tamanho e extensão
  for (const file of fileArray) {
    // Tamanho
    if (file.size > maxSizeBytes) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      const maxMb = (maxSizeBytes / (1024 * 1024)).toFixed(0);
      return {
        valid: false,
        error: `O arquivo "${file.name}" (${sizeMb} MB) excede o limite máximo permitido de ${maxMb} MB.`
      };
    }

    if (file.size === 0) {
      return {
        valid: false,
        error: `O arquivo "${file.name}" está vazio (0 bytes).`
      };
    }

    // Extensão
    const fileNameLower = file.name.toLowerCase();
    const hasValidExt = allowedExtensions.some(ext => fileNameLower.endsWith(ext.toLowerCase()));
    
    if (!hasValidExt) {
      return {
        valid: false,
        error: `Extensão não permitida para o arquivo "${file.name}". Formatos aceitos: ${allowedExtensions.join(', ')}.`
      };
    }
  }

  return { valid: true };
}

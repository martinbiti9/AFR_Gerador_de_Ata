import fs from 'fs';
import path from 'path';
import { addLog } from './logger';

const DEBUG_RUNTIME_DIR = path.resolve(process.cwd(), 'debug', 'runtime');

/**
 * Anexa blocos Markdown com timestamp em debug/runtime/*.md quando process.env.DEBUG_MD === '1',
 * e sempre espelha a entrada no logger central (addLog) para compatibilidade com Cloud Run.
 *
 * @param arquivo Nome do arquivo destino (ex: 'render.md' ou '00_baseline.md')
 * @param secao Nome da seção Markdown (ex: 'Falha de Asserção', 'Validação de DOCX')
 * @param dados Conteúdo textual, objeto ou erro para registrar
 */
export function appendDebugMd(arquivo: string, secao: string, dados: unknown): void {
  const timestamp = new Date().toISOString();
  const safeFileName = arquivo.endsWith('.md') ? arquivo : `${arquivo}.md`;
  
  // Format dados as string
  let conteudoFormatado = '';
  if (typeof dados === 'string') {
    conteudoFormatado = dados;
  } else if (dados instanceof Error) {
    conteudoFormatado = `**Erro:** ${dados.message}\n\`\`\`\n${dados.stack || ''}\n\`\`\``;
  } else {
    try {
      conteudoFormatado = `\`\`\`json\n${JSON.stringify(dados, null, 2)}\n\`\`\``;
    } catch {
      conteudoFormatado = String(dados);
    }
  }

  const blocoMd = `\n### [${timestamp}] ${secao}\n\n${conteudoFormatado}\n\n---\n`;

  // 1. Sempre espelha no logger existente
  addLog('DEBUG', 'DOCX', `[debugMd:${safeFileName}] ${secao}`, {
    timestamp,
    secao,
    arquivo: safeFileName,
    dados: typeof dados === 'object' ? dados : { valor: String(dados) }
  });

  // 2. Anexa em disco local apenas quando DEBUG_MD === '1'
  if (process.env.DEBUG_MD === '1') {
    try {
      if (!fs.existsSync(DEBUG_RUNTIME_DIR)) {
        fs.mkdirSync(DEBUG_RUNTIME_DIR, { recursive: true });
      }
      const destinoCompleto = path.join(DEBUG_RUNTIME_DIR, safeFileName);
      fs.appendFileSync(destinoCompleto, blocoMd, 'utf-8');
    } catch (err: any) {
      console.warn(`[debugMd] Aviso ao gravar em ${safeFileName}: ${err.message}`);
    }
  }
}

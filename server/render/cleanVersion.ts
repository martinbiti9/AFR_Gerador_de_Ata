import PizZip from 'pizzip';
import { AtaState, TopicoEstado } from '../types/ataState';
import { addLog } from '../logger';

/**
 * Remove qualquer elemento <w:r> que contenha a cor vermelha (C00000).
 * Normaliza parágrafos que ficarem vazios após a remoção para <w:p/>.
 */
export function removerRunsVermelhos(xml: string): string {
  if (!xml || typeof xml !== 'string') return xml;

  // 1. Remove qualquer <w:r> que contenha cor vermelha de alerta (C00000 / c00000 / ff0000)
  // Expressão com regex não guloso sobre elementos de run
  const xmlSemRunsVermelhos = xml.replace(/<w:r\b[\s\S]*?<\/w:r>/gi, (runXml) => {
    // Verifica se possui w:color com C00000 ou ff0000
    const possuiCorAlerta = /<w:color\b[^>]*w:val="(c00000|ff0000)"/i.test(runXml);
    if (possuiCorAlerta) {
      return ''; // Elimina o run vermelho por completo
    }
    return runXml;
  });

  // 2. Normaliza parágrafos que ficaram vazios para <w:p/>
  // Parágrafos que contêm apenas <w:pPr>...</w:pPr> ou espaços em branco sem nenhum <w:r> nem outro elemento de conteúdo
  const xmlNormalizado = xmlSemRunsVermelhos.replace(/<w:p\b[^>]*>(\s*<w:pPr>[\s\S]*?<\/w:pPr>\s*|\s*)<\/w:p>/gi, (pXml) => {
    // Se o parágrafo não tem nenhum run (<w:r), substitui por <w:p/>
    if (!/<w:r\b/i.test(pXml) && !/<w:hyperlink\b/i.test(pXml)) {
      return '<w:p/>';
    }
    return pXml;
  });

  return xmlNormalizado;
}

/**
 * Validação V8: Verifica se existe qualquer resíduo da cor vermelha C00000 no XML.
 */
export function contemResiduosVermelhos(xml: string): boolean {
  if (!xml) return false;
  return /<w:color\b[^>]*w:val="(c00000|ff0000)"/i.test(xml);
}

/**
 * Valida se um AtaState está apto para exportação da versão limpa do fornecedor:
 * - Sem tópicos na situação 'PENDENTE'
 * - Sem camposADefinir não preenchidos
 */
export function validarAtaParaExportacaoLimpa(ataState?: Partial<AtaState> | null): {
  podeExportar: boolean;
  topicosPendentes: { topicoId: string; titulo: string }[];
  camposADefinir: { topicoId: string; titulo: string; campos: string[] }[];
} {
  const topicosPendentes: { topicoId: string; titulo: string }[] = [];
  const camposADefinir: { topicoId: string; titulo: string; campos: string[] }[] = [];

  const topicos = (ataState?.topicos || []) as TopicoEstado[];

  for (const topico of topicos) {
    if (topico.situacao === 'PENDENTE') {
      topicosPendentes.push({
        topicoId: topico.topicoId,
        titulo: topico.titulo
      });
    }

    if (topico.camposADefinir && topico.camposADefinir.length > 0) {
      camposADefinir.push({
        topicoId: topico.topicoId,
        titulo: topico.titulo,
        campos: topico.camposADefinir
      });
    }
  }

  const podeExportar = topicosPendentes.length === 0 && camposADefinir.length === 0;

  return {
    podeExportar,
    topicosPendentes,
    camposADefinir
  };
}

/**
 * Aplica a remoção de runs vermelhos em todas as partes XML do pacote DOCX
 * (document.xml, headers, footers, notas de rodapé) e valida V8.
 */
export function gerarVersaoLimpaDocx(docxBuffer: Buffer): { buffer: Buffer; totalRemovidos: number } {
  const zip = new PizZip(docxBuffer);
  let totalRemovidos = 0;

  const xmlTargetPattern = /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i;

  for (const fileName in zip.files) {
    if (xmlTargetPattern.test(fileName)) {
      const fileObj = zip.file(fileName);
      if (fileObj) {
        const originalXml = fileObj.asText();
        const cleanedXml = removerRunsVermelhos(originalXml);
        
        if (cleanedXml !== originalXml) {
          totalRemovidos++;
          zip.file(fileName, cleanedXml);
        }
      }
    }
  }

  // Validação V8 em todas as partes XML
  const violacoesV8: string[] = [];
  for (const fileName in zip.files) {
    if (xmlTargetPattern.test(fileName)) {
      const fileObj = zip.file(fileName);
      if (fileObj) {
        const currentXml = fileObj.asText();
        if (contemResiduosVermelhos(currentXml)) {
          violacoesV8.push(fileName);
        }
      }
    }
  }

  if (violacoesV8.length > 0) {
    addLog('ERROR', 'VALIDATOR', `[V8] Resíduo de cor vermelha (C00000) detectado na versão limpa`, {
      arquivosComViolacao: violacoesV8
    });
    throw new Error(`Falha na validação V8: Resíduos de cor vermelha (C00000) encontrados na versão limpa nos arquivos: ${violacoesV8.join(', ')}`);
  }

  addLog('INFO', 'DOCX', `Versão Limpa do Fornecedor gerada com sucesso. Arquivos higienizados: ${totalRemovidos}`);

  const buffer = zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE'
  });

  return { buffer, totalRemovidos };
}

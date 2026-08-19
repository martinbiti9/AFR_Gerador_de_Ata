import { TopicoEstado } from '../types/ataState';
import { addLog } from '../logger';

/**
 * Normaliza strings para comparação robusta:
 * - minúsculas
 * - colapsa múltiplos espaços em um único espaço
 * - remove pontuação nas extremidades
 */
export function normalizarTexto(texto: string): string {
  if (!texto) return '';
  return texto
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza tokens numéricos, monetários, percentuais ou datas para busca nas fontes:
 * Ex: "R$ 1.500,00" -> "1500", "1500,00", "1.500,00", "1500.00"
 * Ex: "35%" -> "35"
 * Ex: "15/02/2025" -> "15/02/2025"
 */
export function extrairTokensNumericos(texto: string): string[] {
  if (!texto) return [];

  const tokens = new Set<string>();

  // 1. Valores monetários: R$ 1.250,50 ou R$ 1250
  const rsRegex = /R\$\s*([\d.,]+)/gi;
  let m;
  while ((m = rsRegex.exec(texto)) !== null) {
    if (m[1]) tokens.add(m[1].trim());
  }

  // 2. Percentuais: 35% ou 12,5%
  const pctRegex = /(\d+(?:[.,]\d+)?)\s*%/g;
  while ((m = pctRegex.exec(texto)) !== null) {
    if (m[1]) tokens.add(`${m[1]}%`);
  }

  // 3. Datas: DD/MM/AAAA ou DD-MM-AAAA
  const dataRegex = /(\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b)/g;
  while ((m = dataRegex.exec(texto)) !== null) {
    if (m[1]) tokens.add(m[1].trim());
  }

  // 4. Números decimais ou inteiros significativos (>= 2 dígitos ou decimais)
  const numRegex = /\b(\d+(?:[.,]\d+)+|\d{2,})\b/g;
  while ((m = numRegex.exec(texto)) !== null) {
    const raw = m[1].trim();
    // ignora se for apenas número de item 01..99
    if (raw && raw.length >= 2) {
      tokens.add(raw);
    }
  }

  return Array.from(tokens);
}

/**
 * Validação V1: Se a situação for ACORDADO, deve possuir âncora de transcrição.
 * Se não possuir, rebaixa para PENDENTE.
 */
export function validarV1AncoraPresente(topico: TopicoEstado): {
  valido: boolean;
  topicoAtualizado: TopicoEstado;
  aviso?: string;
} {
  if (topico.situacao === 'ACORDADO') {
    if (!topico.ancoraTranscricao || !topico.ancoraTranscricao.trim()) {
      const aviso = `[V1] Tópico "${topico.titulo}" marcado como ACORDADO sem âncora de transcrição. Rebaixado para PENDENTE.`;
      addLog('WARN', 'VALIDATOR', aviso, { topicoId: topico.topicoId, titulo: topico.titulo });
      return {
        valido: false,
        topicoAtualizado: {
          ...topico,
          situacao: 'PENDENTE'
        },
        aviso
      };
    }
  }

  return { valido: true, topicoAtualizado: topico };
}

/**
 * Validação V2: Se houver âncora de transcrição, ela deve existir literalmente
 * na transcrição (comparação normalizada).
 * Se não for encontrada, rebaixa para PENDENTE.
 */
export function validarV2AncoraNaTranscricao(
  topico: TopicoEstado,
  transcricao: string
): {
  valido: boolean;
  topicoAtualizado: TopicoEstado;
  aviso?: string;
} {
  if (topico.situacao === 'ACORDADO' && topico.ancoraTranscricao) {
    const transcricaoNorm = normalizarTexto(transcricao);
    const ancoraNorm = normalizarTexto(topico.ancoraTranscricao);

    if (!ancoraNorm || !transcricaoNorm.includes(ancoraNorm)) {
      const aviso = `[V2] Âncora "${topico.ancoraTranscricao}" do tópico "${topico.titulo}" não encontrada na transcrição. Rebaixado para PENDENTE.`;
      addLog('WARN', 'VALIDATOR', aviso, {
        topicoId: topico.topicoId,
        titulo: topico.titulo,
        ancora: topico.ancoraTranscricao
      });
      return {
        valido: false,
        topicoAtualizado: {
          ...topico,
          situacao: 'PENDENTE'
        },
        aviso
      };
    }
  }

  return { valido: true, topicoAtualizado: topico };
}

/**
 * Validação V3: Todo número, percentual, valor monetário ou data presente no textoAta
 * deve existir comprovadamente em ao menos um documento fonte.
 */
export function validarV3NumerosEValoresNasFontes(
  textoAta: string,
  fontes: string[]
): {
  valido: boolean;
  divergencias: string[];
} {
  if (!textoAta || !fontes || fontes.length === 0) {
    return { valido: true, divergencias: [] };
  }

  const textoFontesCombinado = normalizarTexto(fontes.join(' '));
  const tokens = extrairTokensNumericos(textoAta);
  const divergencias: string[] = [];

  for (const token of tokens) {
    const tokenNorm = normalizarTexto(token);
    // Variação sem separadores de milhar / formato limpo
    const tokenDigitosApenas = token.replace(/[^\d]/g, '');

    // Verifica se token literal ou formato normalizado existe nas fontes
    const existeLiteral = textoFontesCombinado.includes(tokenNorm);
    const existeDigitos = tokenDigitosApenas.length >= 3 && textoFontesCombinado.includes(tokenDigitosApenas);

    if (!existeLiteral && !existeDigitos) {
      divergencias.push(token);
    }
  }

  const valido = divergencias.length === 0;
  if (!valido) {
    addLog('WARN', 'VALIDATOR', `[V3] Conflito de integridade: tokens numéricos não encontrados nas fontes: ${divergencias.join(', ')}`, {
      divergencias,
      textoAta: textoAta.slice(0, 200)
    });
  }

  return { valido, divergencias };
}

/**
 * Executa as validações V1, V2 e V3 sobre uma lista de tópicos.
 */
export function validarTopicosAtaState(
  topicos: TopicoEstado[],
  transcricao: string,
  fontes: string[]
): {
  topicosValidados: TopicoEstado[];
  conflitosV3: Array<{ topicoId: string; titulo: string; divergencias: string[] }>;
} {
  const topicosValidados: TopicoEstado[] = [];
  const conflitosV3: Array<{ topicoId: string; titulo: string; divergencias: string[] }> = [];

  for (const t of topicos) {
    // 1. Aplica V1
    const resV1 = validarV1AncoraPresente(t);
    let topicoCorrente = resV1.topicoAtualizado;

    // 2. Aplica V2
    const resV2 = validarV2AncoraNaTranscricao(topicoCorrente, transcricao);
    topicoCorrente = resV2.topicoAtualizado;

    // 3. Aplica V3
    const resV3 = validarV3NumerosEValoresNasFontes(topicoCorrente.textoAta, fontes);
    if (!resV3.valido) {
      conflitosV3.push({
        topicoId: topicoCorrente.topicoId,
        titulo: topicoCorrente.titulo,
        divergencias: resV3.divergencias
      });
    }

    topicosValidados.push(topicoCorrente);
  }

  return { topicosValidados, conflitosV3 };
}

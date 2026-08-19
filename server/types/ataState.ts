import { Bloco } from './template';

export type Situacao = 'ATUALIZADO' | 'ACORDADO' | 'PENDENTE'
  | 'MANTIDO_PADRAO' | 'NAO_APLICAVEL';

export interface OrigemRef {
  doc: 'CHECKLIST' | 'PROPOSTA' | 'ANEXO' | 'TRANSCRICAO' | 'MODELO';
  ref: string;
  citacao?: string;
}

export interface TopicoEstado {
  topicoId: string;
  titulo: string;
  situacao: Situacao;
  textoAta: string;             // vai para a coluna Descrição
  camposADefinir: string[];     // marcadores [A DEFINIR NA REUNIÃO] restantes
  origens: OrigemRef[];
  ancoraTranscricao?: string;   // OBRIGATÓRIA quando ACORDADO
  responsavel: string | null;
  prazo: string | null;
  blocos?: Bloco[];             // validados por BlocosListSchema
}

export interface Participante {
  nome: string;
  empresa?: string;
  cargoDepto?: string;
  email?: string;
  visto?: string;
}

export interface Divergencia {
  id?: string;
  item?: string;
  severidade: 'ALTA' | 'MEDIA' | 'BAIXA';
  descricao: string;
  regraChecklist?: string;
  propostaFornecedor?: string;
  impacto?: string;
  status?: 'PENDENTE' | 'RESOLVIDA' | 'ACEITA';
}

export interface ItemAcao {
  id?: string;
  num?: string;
  descricao: string;
  responsavel: string | null;
  prazo: string | null;
  status?: 'PENDENTE' | 'CONCLUIDO';
}

export interface AtaState {
  versao: number;
  topicos: TopicoEstado[];
  participantes: Participante[];
  resumo: string | null;
  divergencias: Divergencia[];
  itensDeAcao: ItemAcao[];
  proveniencia: {
    promptVersion: Record<string, string>;
    modelo: string;
    templateId: string;
    templateVersion: number;
    hashesFontes: string[];
  };
}

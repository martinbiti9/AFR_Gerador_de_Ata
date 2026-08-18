import { addLog } from './logger';

export interface MeetingEntity {
  id: string;
  obraCodigo: string;
  obraNome: string;
  assunto: string;
  fornecedor: string;
  servico: string;
  rm: string;
  cot: string;
  step: number;
  aiContext: any;
  aiDivergences: any[];
  meetingTranscript: string;
  finalAtaData: any;
  sonnetAnalysis?: string;
  status: 'DRAFT' | 'PRE_ATA_GENERATED' | 'FINAL_ATA_GENERATED';
  createdAt: string;
  updatedAt: string;
}

// In-Memory persistent store for meetings
let meetingsStore: Map<string, MeetingEntity> = new Map();

export function saveMeetingToStore(data: Partial<MeetingEntity> & { id?: string }): MeetingEntity {
  const id = data.id || `meet-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  
  const existing = meetingsStore.get(id);
  
  let status: 'DRAFT' | 'PRE_ATA_GENERATED' | 'FINAL_ATA_GENERATED' = 'DRAFT';
  if (data.status) {
    status = data.status;
  } else if (data.finalAtaData || (data as any).finalAtaGenerated) {
    status = 'FINAL_ATA_GENERATED';
  } else if ((data as any).preAtaGenerated) {
    status = 'PRE_ATA_GENERATED';
  } else if (existing?.status) {
    status = existing.status;
  }

  const meeting: MeetingEntity = {
    id,
    obraCodigo: data.obraCodigo || existing?.obraCodigo || '',
    obraNome: data.obraNome || existing?.obraNome || '',
    assunto: data.assunto || existing?.assunto || '',
    fornecedor: data.fornecedor || existing?.fornecedor || '',
    servico: data.servico || existing?.servico || '',
    rm: data.rm || existing?.rm || '',
    cot: data.cot || existing?.cot || '',
    step: data.step !== undefined ? data.step : (existing?.step || 1),
    aiContext: data.aiContext !== undefined ? data.aiContext : (existing?.aiContext || null),
    aiDivergences: Array.isArray(data.aiDivergences) ? data.aiDivergences : (existing?.aiDivergences || []),
    meetingTranscript: data.meetingTranscript !== undefined ? data.meetingTranscript : (existing?.meetingTranscript || ''),
    finalAtaData: data.finalAtaData !== undefined ? data.finalAtaData : (existing?.finalAtaData || null),
    sonnetAnalysis: data.sonnetAnalysis !== undefined ? data.sonnetAnalysis : (existing?.sonnetAnalysis || ''),
    status,
    createdAt: existing?.createdAt || data.createdAt || now,
    updatedAt: now,
  };

  meetingsStore.set(id, meeting);

  addLog('INFO', 'SYSTEM', `Reunião salva no histórico: ${meeting.obraCodigo || 'S/N'} (${meeting.fornecedor || 'Fornecedor N/A'}) [${meeting.status}]`, {
    meetingId: id,
    status: meeting.status,
    hasAnalysis: !!meeting.aiContext,
    divergencesCount: meeting.aiDivergences.length
  });

  return meeting;
}

export function getMeetingsFromStore(searchTerm?: string): MeetingEntity[] {
  let list = Array.from(meetingsStore.values());

  if (searchTerm && searchTerm.trim()) {
    const term = searchTerm.toLowerCase().trim();
    list = list.filter(m => 
      (m.obraCodigo && m.obraCodigo.toLowerCase().includes(term)) ||
      (m.obraNome && m.obraNome.toLowerCase().includes(term)) ||
      (m.fornecedor && m.fornecedor.toLowerCase().includes(term)) ||
      (m.assunto && m.assunto.toLowerCase().includes(term)) ||
      (m.servico && m.servico.toLowerCase().includes(term))
    );
  }

  // Sort by updatedAt descending
  return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function getMeetingById(id: string): MeetingEntity | null {
  return meetingsStore.get(id) || null;
}

export function deleteMeetingFromStore(id: string): boolean {
  const existed = meetingsStore.delete(id);
  if (existed) {
    addLog('WARN', 'SYSTEM', `Reunião excluída do histórico: ID ${id}`);
  }
  return existed;
}

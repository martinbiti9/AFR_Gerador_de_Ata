import { AppState, AuditLog } from '../types';
import { safeFetchJson } from '../utils/api';
import { emitCriticalDbError } from '../contexts/AlertContext';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {},
    operationType,
    path
  };
  console.error('API / Storage Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Salva a reunião enviando o estado para o endpoint /api/meetings do backend.
 * O backend persiste diretamente no Firestore e cria a versão na subcoleção ataState.
 */
export const saveMeeting = async (state: AppState): Promise<string> => {
  const meetingId = state.meetingId || `meet-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

  let status: 'DRAFT' | 'PRE_ATA_GENERATED' | 'FINAL_ATA_GENERATED' = 'DRAFT';
  if (state.finalAtaGenerated || state.finalAtaData) {
    status = 'FINAL_ATA_GENERATED';
  } else if (state.preAtaGenerated) {
    status = 'PRE_ATA_GENERATED';
  }

  const payload = {
    id: meetingId,
    obraCodigo: state.abertura?.obraCodigo || '',
    obraNome: state.abertura?.obraNome || '',
    assunto: state.abertura?.assunto || '',
    fornecedor: state.abertura?.fornecedor || '',
    servico: state.abertura?.servico || '',
    rm: state.abertura?.rm || '',
    cot: state.abertura?.cot || '',
    step: state.step || 1,
    aiContext: state.analysisResult || null,
    aiDivergences: state.divergences || [],
    meetingTranscript: state.finalAtaText || '',
    finalAtaData: state.finalAtaData || null,
    sonnetAnalysis: state.sonnetAnalysis || '',
    status: status,
  };

  try {
    const res = await safeFetchJson<{ success: boolean; id: string; meeting: any }>('/api/meetings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.id || meetingId;
  } catch (apiError: any) {
    console.error('Erro ao persistir reunião via API:', apiError);
    emitCriticalDbError({
      title: 'Falha ao Persistir Reunião',
      message: 'A reunião não pôde ser gravada no banco de dados via API.',
      details: apiError.message || apiError,
      path: `meetings/${meetingId}`,
      retryAction: async () => {
        await saveMeeting(state);
      }
    });
    throw apiError;
  }
};

/**
 * Carrega a lista de reuniões a partir da API /api/meetings (filtrada por usuário no backend).
 */
export const loadMeetings = async (searchTerm?: string): Promise<any[]> => {
  try {
    const url = searchTerm ? `/api/meetings?search=${encodeURIComponent(searchTerm)}` : '/api/meetings';
    const data = await safeFetchJson<{ meetings: any[] }>(url);
    if (data && Array.isArray(data.meetings)) {
      return data.meetings;
    }
    return [];
  } catch (apiErr: any) {
    console.error('Erro ao buscar reuniões do backend via API:', apiErr);
    return [];
  }
};

/**
 * Carrega uma reunião específica pelo ID via /api/meetings/:id e converte para AppState.
 */
export const loadMeeting = async (id: string): Promise<AppState | null> => {
  try {
    const json = await safeFetchJson<{ meeting: any }>(`/api/meetings/${id}`);
    const data = json.meeting;

    if (!data) return null;

    let stepToLoad = data.step || 1;
    if (!data.step) {
      stepToLoad = data.status === 'FINAL_ATA_GENERATED' ? 5 : data.status === 'PRE_ATA_GENERATED' ? 4 : (data.aiContext ? 2 : 1);
    }

    return {
      meetingId: id,
      step: stepToLoad,
      abertura: {
        obraCodigo: data.obraCodigo || '',
        obraNome: data.obraNome || '',
        assunto: data.assunto || '',
        fornecedor: data.fornecedor || '',
        servico: data.servico || '',
        rm: data.rm || '',
        cot: data.cot || '',
      },
      analysisResult: data.aiContext || null,
      divergences: Array.isArray(data.aiDivergences) ? data.aiDivergences : [],
      preAtaGenerated: data.status === 'PRE_ATA_GENERATED' || data.status === 'FINAL_ATA_GENERATED',
      finalAtaText: data.meetingTranscript || '',
      finalAtaData: data.finalAtaData || null,
      finalAtaGenerated: data.status === 'FINAL_ATA_GENERATED',
      sonnetAnalysis: data.sonnetAnalysis || '',
    };
  } catch (apiErr) {
    console.warn('Aviso ao buscar reunião na API:', apiErr);
    return null;
  }
};

/**
 * Exclui uma reunião através da API /api/meetings/:id.
 */
export const deleteMeeting = async (id: string): Promise<void> => {
  try {
    await safeFetchJson(`/api/meetings/${id}`, {
      method: 'DELETE',
    });
  } catch (err: any) {
    console.error('Erro ao excluir reunião via API:', err);
    throw err;
  }
};

// ================= AUDIT LOGS PERSISTENCE VIA API =================

export const saveAuditLogInFirestore = async (entry: AuditLog): Promise<void> => {
  try {
    await safeFetchJson('/api/admin/logs', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
  } catch (err) {
    // Audit logs non-blocking
  }
};

export const saveAuditLogsBatchInFirestore = async (entries: AuditLog[]): Promise<void> => {
  if (!entries || entries.length === 0) return;
  try {
    await Promise.all(entries.map(e => saveAuditLogInFirestore(e)));
  } catch {
    // non-blocking
  }
};

export const loadAuditLogsFromFirestore = async (limitCount: number = 200): Promise<AuditLog[]> => {
  try {
    const data = await safeFetchJson<{ logs: AuditLog[] }>(`/api/admin/logs?limit=${limitCount}`);
    return data?.logs || [];
  } catch (err) {
    console.warn('Aviso ao carregar logs de auditoria via API:', err);
    return [];
  }
};

export const clearAuditLogsFromFirestore = async (): Promise<void> => {
  try {
    await safeFetchJson('/api/admin/logs', {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn('Erro ao limpar logs de auditoria via API:', err);
  }
};

export const syncAuditLogsWithFirestore = async (limitCount: number = 200): Promise<AuditLog[]> => {
  return loadAuditLogsFromFirestore(limitCount);
};

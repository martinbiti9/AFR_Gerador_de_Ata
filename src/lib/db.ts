import { collection, doc, setDoc, getDoc, getDocs, deleteDoc, serverTimestamp, query, where, orderBy } from 'firebase/firestore';
import { db, auth } from './firebase';
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
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Deeply sanitizes an object for Firestore to remove any `undefined` properties,
 * which cause Firestore write operations to fail.
 */
function sanitizeForFirestore(val: any): any {
  if (val === undefined) {
    return null;
  }
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeForFirestore);
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(val)) {
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
    }
  }
  return clean;
}

export const saveMeeting = async (state: AppState): Promise<string> => {
  const meetingId = state.meetingId || `meet-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
  const meetingRef = doc(db, 'meetings', meetingId);

  let status: 'DRAFT' | 'PRE_ATA_GENERATED' | 'FINAL_ATA_GENERATED' = 'DRAFT';
  if (state.finalAtaGenerated || state.finalAtaData) {
    status = 'FINAL_ATA_GENERATED';
  } else if (state.preAtaGenerated) {
    status = 'PRE_ATA_GENERATED';
  }

  const currentUser = auth.currentUser;
  const ownerUid = currentUser?.uid || 'anonymous';
  const ownerEmail = currentUser?.email || '';
  const ownerName = currentUser?.displayName || currentUser?.email?.split('@')[0] || '';

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
    ownerUid,
    ownerEmail,
    ownerName,
    updatedAt: serverTimestamp(),
  };

  const cleanFirestorePayload = sanitizeForFirestore(payload);

  // 1. Primary: Save to Firestore directly
  let firestoreFailed = false;
  try {
    await setDoc(meetingRef, cleanFirestorePayload, { merge: true });
  } catch (firestoreError: any) {
    firestoreFailed = true;
    console.warn("Aviso ao salvar diretamente no Firestore:", firestoreError);
    if (firestoreError?.message?.includes('PERMISSION_DENIED') || firestoreError?.code === 'permission-denied') {
      emitCriticalDbError({
        title: 'Permissão Insuficiente no Firestore',
        message: 'Não foi possível gravar a reunião no Firestore devido a regras de permissão (PERMISSION_DENIED).',
        details: firestoreError.message || firestoreError,
        path: `meetings/${meetingId}`,
        retryAction: () => setDoc(meetingRef, cleanFirestorePayload, { merge: true })
      });
    }
  }

  // 2. Secondary: Sync with Backend Storage API
  try {
    await safeFetchJson('/api/meetings', {
      method: 'POST',
      body: JSON.stringify({
        ...cleanFirestorePayload,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }),
    });
  } catch (apiError: any) {
    console.warn("Aviso ao sincronizar reunião com API de backend:", apiError);
    if (firestoreFailed) {
      emitCriticalDbError({
        title: 'Falha Crítica ao Persistir Reunião',
        message: 'A reunião não pôde ser gravada no Firestore nem sincronizada com o backend.',
        details: apiError.message || apiError,
        path: `meetings/${meetingId}`
      });
    }
  }

  // 3. Record Audit Log in Firestore
  try {
    const logEntry: AuditLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      level: 'INFO',
      category: 'SYSTEM',
      message: `Reunião persistida: Obra ${state.abertura?.obraCodigo || 'S/N'} (${state.abertura?.fornecedor || 'Fornecedor N/A'}) [${status}]`,
      actorUid: ownerUid,
      actorEmail: ownerEmail,
      details: {
        meetingId,
        step: state.step,
        status,
        hasAnalysis: !!state.analysisResult,
        divergencesCount: state.divergences?.length || 0,
      }
    };
    await saveAuditLogInFirestore(logEntry);
  } catch (logErr) {
    console.warn("Aviso ao registrar log de reunião no Firestore:", logErr);
  }

  return meetingId;
};

export const loadMeetings = async (searchTerm?: string): Promise<any[]> => {
  const mergedMap = new Map<string, any>();

  // 1. Load from Backend Server (isolated per ownerUid for members, all for admin)
  try {
    const url = searchTerm ? `/api/meetings?search=${encodeURIComponent(searchTerm)}` : '/api/meetings';
    const data = await safeFetchJson(url);
    if (data && Array.isArray(data.meetings)) {
      data.meetings.forEach((m: any) => {
        if (m.id) mergedMap.set(m.id, m);
      });
    }
  } catch (apiErr) {
    console.warn("Aviso ao buscar reuniões do backend:", apiErr);
  }

  // 2. Load from Firestore if user is logged in
  try {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const colRef = collection(db, 'meetings');
      // If we can query, read snapshot
      const snapshot = await getDocs(colRef);
      snapshot.docs.forEach(docSnap => {
        const docData = docSnap.data();
        const existing = mergedMap.get(docSnap.id);
        mergedMap.set(docSnap.id, {
          id: docSnap.id,
          ...existing,
          ...docData,
        });
      });
    }
  } catch (firestoreErr) {
    // Firestore rules might block cross-user queries, which is expected
    console.warn("Aviso ao buscar reuniões do Firestore:", firestoreErr);
  }

  const list = Array.from(mergedMap.values());

  // Filter if searchTerm provided
  let filtered = list;
  if (searchTerm && searchTerm.trim()) {
    const term = searchTerm.toLowerCase().trim();
    filtered = list.filter(m =>
      (m.obraCodigo && String(m.obraCodigo).toLowerCase().includes(term)) ||
      (m.obraNome && String(m.obraNome).toLowerCase().includes(term)) ||
      (m.fornecedor && String(m.fornecedor).toLowerCase().includes(term)) ||
      (m.assunto && String(m.assunto).toLowerCase().includes(term)) ||
      (m.servico && String(m.servico).toLowerCase().includes(term)) ||
      (m.ownerName && String(m.ownerName).toLowerCase().includes(term)) ||
      (m.ownerEmail && String(m.ownerEmail).toLowerCase().includes(term))
    );
  }

  // Sort descending by date
  return filtered.sort((a, b) => {
    const timeA = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : new Date(a.updatedAt || 0).getTime();
    const timeB = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : new Date(b.updatedAt || 0).getTime();
    return timeB - timeA;
  });
};

export const loadMeeting = async (id: string): Promise<AppState | null> => {
  let data: any = null;

  // 1. Try Firestore
  try {
    const meetingRef = doc(db, 'meetings', id);
    const snap = await getDoc(meetingRef);
    if (snap.exists()) {
      data = snap.data();
    }
  } catch (firestoreErr) {
    console.warn("Aviso ao buscar reunião no Firestore:", firestoreErr);
  }

  // 2. Try Backend API
  if (!data) {
    try {
      const json = await safeFetchJson(`/api/meetings/${id}`);
      data = json.meeting;
    } catch (apiErr) {
      console.warn("Aviso ao buscar reunião na API:", apiErr);
    }
  }

  if (data) {
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
  }

  return null;
};

export const deleteMeeting = async (id: string): Promise<void> => {
  // Delete from Firestore
  try {
    const meetingRef = doc(db, 'meetings', id);
    await deleteDoc(meetingRef);
  } catch (err) {
    console.warn("Aviso ao excluir do Firestore:", err);
  }

  // Delete from Backend API
  try {
    await safeFetchJson(`/api/meetings/${id}`, {
      method: 'DELETE',
    });
  } catch (err) {
    console.warn("Aviso ao excluir do backend:", err);
  }
};

// ================= AUDIT LOGS FIRESTORE PERSISTENCE =================

export const saveAuditLogInFirestore = async (entry: AuditLog): Promise<void> => {
  try {
    const logId = entry.id || `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const logRef = doc(db, 'logs', logId);
    const currentUser = auth.currentUser;
    
    const payload = sanitizeForFirestore({
      id: logId,
      timestamp: entry.timestamp || new Date().toISOString(),
      level: entry.level || 'INFO',
      category: entry.category || 'SYSTEM',
      message: entry.message || '',
      actorUid: entry.actorUid || currentUser?.uid || null,
      actorEmail: entry.actorEmail || currentUser?.email || null,
      details: entry.details || null,
    });

    await setDoc(logRef, payload, { merge: true });
  } catch (err) {
    console.warn('Erro ao salvar log de auditoria no Firestore:', err);
  }
};

export const saveAuditLogsBatchInFirestore = async (entries: AuditLog[]): Promise<void> => {
  if (!entries || entries.length === 0) return;
  try {
    await Promise.all(
      entries.map(entry => saveAuditLogInFirestore(entry))
    );
  } catch (err) {
    console.warn('Erro ao salvar lote de logs no Firestore:', err);
  }
};

export const loadAuditLogsFromFirestore = async (limitCount: number = 200): Promise<AuditLog[]> => {
  try {
    const colRef = collection(db, 'logs');
    const snapshot = await getDocs(colRef);
    
    const list: AuditLog[] = [];
    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      list.push({
        id: docSnap.id,
        timestamp: data.timestamp || new Date().toISOString(),
        level: data.level || 'INFO',
        category: data.category || 'SYSTEM',
        message: data.message || '',
        actorUid: data.actorUid || undefined,
        actorEmail: data.actorEmail || undefined,
        actorRole: data.actorRole || undefined,
        details: data.details || undefined,
      });
    });

    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limitCount);
  } catch (err) {
    console.warn('Aviso ao carregar logs de auditoria do Firestore:', err);
    return [];
  }
};

export const clearAuditLogsFromFirestore = async (): Promise<void> => {
  try {
    const colRef = collection(db, 'logs');
    const snapshot = await getDocs(colRef);
    const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'logs', d.id)));
    await Promise.all(deletePromises);
  } catch (err) {
    console.warn('Erro ao limpar logs de auditoria no Firestore:', err);
  }
};

export const syncAuditLogsWithFirestore = async (limitCount: number = 200): Promise<AuditLog[]> => {
  const mergedMap = new Map<string, AuditLog>();

  // 1. Fetch from Firestore
  const firestoreLogs = await loadAuditLogsFromFirestore(limitCount);
  firestoreLogs.forEach(log => {
    if (log.id) mergedMap.set(log.id, log);
  });

  // 2. Fetch from Backend API
  try {
    const data = await safeFetchJson(`/api/admin/logs?limit=${limitCount}`);
    if (data && Array.isArray(data.logs)) {
      const unsavedToFirestore: AuditLog[] = [];
      data.logs.forEach((log: AuditLog) => {
        if (log.id && !mergedMap.has(log.id)) {
          mergedMap.set(log.id, log);
          unsavedToFirestore.push(log);
        }
      });

      if (unsavedToFirestore.length > 0) {
        saveAuditLogsBatchInFirestore(unsavedToFirestore).catch(() => {});
      }
    }
  } catch (apiErr) {
    console.warn('Aviso ao sincronizar logs do backend:', apiErr);
  }

  const allLogs = Array.from(mergedMap.values());
  return allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limitCount);
};

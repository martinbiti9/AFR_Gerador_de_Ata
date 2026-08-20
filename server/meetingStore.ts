import fs from 'fs';
import path from 'path';
import { addLog } from './logger';
import { initFirebaseAdmin } from './auth';
import { getActiveModels, getActiveTemplate } from './configStore';
import { AtaState } from './types/ataState';

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
  ownerUid: string;
  ownerEmail: string;
  ownerName: string;
  sharedWith?: string[];
  isPublicShare?: boolean;
  shareToken?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AtaStateDocument {
  versao: number;
  promptVersion: number | string;
  modelo: string;
  templateVersion: number;
  savedAt: string;
  savedBy: {
    uid: string;
    email: string;
    displayName?: string;
  };
  status: 'DRAFT' | 'PRE_ATA_GENERATED' | 'FINAL_ATA_GENERATED';
  state: Partial<MeetingEntity>;
}

export interface AnalysisProgress {
  meetingId: string;
  stage: 'IDLE' | 'CHECKLIST_BATCH' | 'PROPOSAL_ANALYSIS' | 'SEGMENTATION' | 'DECISION_EXTRACTION' | 'COMPLETED' | 'ERROR';
  totalBatches: number;
  currentBatch: number;
  progressPercent: number;
  message: string;
  updatedAt: string;
  error?: string;
}

const memoryAnalysisProgressStore = new Map<string, AnalysisProgress>();

export function setAnalysisProgress(meetingId: string, progress: Partial<AnalysisProgress>): AnalysisProgress {
  const current = memoryAnalysisProgressStore.get(meetingId) || {
    meetingId,
    stage: 'IDLE',
    totalBatches: 1,
    currentBatch: 0,
    progressPercent: 0,
    message: '',
    updatedAt: new Date().toISOString()
  };

  const updated: AnalysisProgress = {
    ...current,
    ...progress,
    meetingId,
    updatedAt: new Date().toISOString()
  };

  memoryAnalysisProgressStore.set(meetingId, updated);
  return updated;
}

export function getAnalysisProgress(meetingId: string): AnalysisProgress {
  return memoryAnalysisProgressStore.get(meetingId) || {
    meetingId,
    stage: 'IDLE',
    totalBatches: 1,
    currentBatch: 0,
    progressPercent: 0,
    message: 'Nenhum processamento em andamento',
    updatedAt: new Date().toISOString()
  };
}

// Local disk persistence fallback for meetings and snapshots
const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const MEETINGS_FILE = path.join(DATA_DIR, 'meetings.json');
const memoryMeetingsStore = new Map<string, MeetingEntity>();
const memoryAtaStatesStore = new Map<string, AtaStateDocument[]>();

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {}
}

function loadDiskMeetings(): void {
  try {
    ensureDataDir();
    if (fs.existsSync(MEETINGS_FILE)) {
      const raw = fs.readFileSync(MEETINGS_FILE, 'utf-8');
      const list: MeetingEntity[] = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const m of list) {
          if (m && m.id) {
            memoryMeetingsStore.set(m.id, m);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Aviso ao carregar reuniões do disco:', err);
  }
}

function saveDiskMeetings(): void {
  try {
    ensureDataDir();
    const list = Array.from(memoryMeetingsStore.values());
    fs.writeFileSync(MEETINGS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Aviso ao salvar reuniões no disco:', err);
  }
}

// Initial hydration from disk
loadDiskMeetings();

function getFirestoreDb() {
  try {
    const { adminDb } = initFirebaseAdmin();
    return adminDb;
  } catch {
    return null;
  }
}

/**
 * Persiste reunião diretamente na coleção Firestore 'meetings' e grava snapshot
 * versionado na subcoleção 'meetings/{id}/ataState/{versao}'.
 * Inclui fallback automático e transparente em disco para garantir zero perda de dados.
 * O ownerUid sempre tem como fonte de verdade o token verificado da requisição.
 */
export async function saveMeetingToStore(
  data: Partial<MeetingEntity> & { id?: string },
  owner?: { uid: string; email: string; displayName?: string }
): Promise<MeetingEntity> {
  const db = getFirestoreDb();
  const id = data.id || `meet-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  let existing: MeetingEntity | null = memoryMeetingsStore.get(id) || null;

  if (db) {
    try {
      const meetingRef = db.collection('meetings').doc(id);
      const existingDoc = await meetingRef.get();
      if (existingDoc.exists) {
        existing = existingDoc.data() as MeetingEntity;
      }
    } catch (err: any) {
      console.warn(`Aviso ao consultar Firestore para reunião ${id}:`, err.message);
    }
  }

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

  // ownerUid vem obrigatoriamente do token autenticado, ignorando qualquer tentativa de injeção no body
  const ownerUid = existing?.ownerUid || owner?.uid || 'anonymous';
  const ownerEmail = existing?.ownerEmail || owner?.email || '';
  const ownerName = existing?.ownerName || owner?.displayName || owner?.email?.split('@')[0] || '';

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
    ownerUid,
    ownerEmail,
    ownerName,
    createdAt: existing?.createdAt || data.createdAt || now,
    updatedAt: now,
  };

  // 1. Persist to RAM and Disk Storage
  memoryMeetingsStore.set(id, meeting);
  saveDiskMeetings();

  // 2. Persist to Firestore if available
  if (db) {
    try {
      const meetingRef = db.collection('meetings').doc(id);
      await meetingRef.set(meeting, { merge: true });

      // Subcoleção meetings/{id}/ataState/{versao}
      try {
        const statesCol = meetingRef.collection('ataState');
        const lastSnap = await statesCol.orderBy('versao', 'desc').limit(1).get();
        const currentVersion = lastSnap.empty ? 0 : (lastSnap.docs[0].data().versao || 0);
        const nextVersion = currentVersion + 1;

        const activeModels = getActiveModels();
        const activeTemplate = getActiveTemplate();

        const selectedModel = status === 'FINAL_ATA_GENERATED'
          ? activeModels.finalAtaModel
          : (status === 'PRE_ATA_GENERATED' ? activeModels.preAtaModel : activeModels.checklistModel);

        const ataStateDoc: AtaStateDocument = {
          versao: nextVersion,
          promptVersion: '1.0',
          modelo: selectedModel || 'gemini-3.1-pro-preview',
          templateVersion: activeTemplate?.version || 1,
          savedAt: now,
          savedBy: {
            uid: ownerUid,
            email: ownerEmail,
            displayName: ownerName,
          },
          status: meeting.status,
          state: {
            obraCodigo: meeting.obraCodigo,
            obraNome: meeting.obraNome,
            assunto: meeting.assunto,
            fornecedor: meeting.fornecedor,
            servico: meeting.servico,
            step: meeting.step,
            aiContext: meeting.aiContext,
            aiDivergences: meeting.aiDivergences,
            finalAtaData: meeting.finalAtaData,
            meetingTranscript: meeting.meetingTranscript,
          }
        };

        await statesCol.doc(String(nextVersion)).set(ataStateDoc);

        const localStates = memoryAtaStatesStore.get(id) || [];
        localStates.push(ataStateDoc);
        memoryAtaStatesStore.set(id, localStates);
      } catch (stateErr: any) {
        console.warn(`Aviso ao gravar subcoleção ataState para reunião ${id}:`, stateErr.message);
      }
    } catch (firestoreErr: any) {
      console.warn(`Aviso ao gravar reunião ${id} no Firestore:`, firestoreErr.message);
    }
  }

  addLog('INFO', 'SYSTEM', `Reunião persistida: ${meeting.obraCodigo || 'S/N'} (${meeting.fornecedor || 'Fornecedor N/A'}) [${meeting.status}]`, {
    meetingId: id,
    status: meeting.status,
    ownerUid: meeting.ownerUid,
    ownerEmail: meeting.ownerEmail,
    divergencesCount: meeting.aiDivergences.length
  }, { uid: ownerUid, email: ownerEmail });

  return meeting;
}

/**
 * Consulta reuniões do Firestore com fallback em disco e isolamento por perfil (member vs admin).
 */
export async function getMeetingsFromStore(
  searchTerm?: string,
  user?: { uid: string; email?: string; role: 'member' | 'admin' }
): Promise<MeetingEntity[]> {
  const db = getFirestoreDb();
  let list: MeetingEntity[] = [];

  if (db) {
    try {
      const snap = await db.collection('meetings').get();
      list = snap.docs.map(doc => doc.data() as MeetingEntity);
      
      if (user && user.role === 'member') {
        list = list.filter(m => 
          m.ownerUid === user.uid ||
          (user.email && m.sharedWith?.includes(user.email.toLowerCase())) ||
          m.isPublicShare
        );
      }
    } catch (err: any) {
      console.warn('Aviso ao consultar Firestore em getMeetingsFromStore:', err.message);
    }
  }

  // If Firestore returned nothing or failed, use disk storage
  if (list.length === 0 && memoryMeetingsStore.size > 0) {
    list = Array.from(memoryMeetingsStore.values());
    if (user && user.role === 'member') {
      list = list.filter(m => 
        m.ownerUid === user.uid ||
        (user.email && m.sharedWith?.includes(user.email.toLowerCase())) ||
        m.isPublicShare
      );
    }
  }

  if (searchTerm && searchTerm.trim()) {
    const term = searchTerm.toLowerCase().trim();
    list = list.filter(m =>
      (m.obraCodigo && m.obraCodigo.toLowerCase().includes(term)) ||
      (m.obraNome && m.obraNome.toLowerCase().includes(term)) ||
      (m.fornecedor && m.fornecedor.toLowerCase().includes(term)) ||
      (m.assunto && m.assunto.toLowerCase().includes(term)) ||
      (m.servico && m.servico.toLowerCase().includes(term)) ||
      (m.ownerName && m.ownerName.toLowerCase().includes(term)) ||
      (m.ownerEmail && m.ownerEmail.toLowerCase().includes(term))
    );
  }

  // Ordenação decrescente por updatedAt
  return list.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
}

/**
 * Busca uma reunião pelo ID no Firestore ou disco com checagem de propriedade ou compartilhamento para membros.
 */
export async function getMeetingById(
  id: string,
  user?: { uid: string; email?: string; role: 'member' | 'admin' }
): Promise<MeetingEntity | null> {
  const db = getFirestoreDb();
  let meeting: MeetingEntity | null = null;

  if (db) {
    try {
      const docSnap = await db.collection('meetings').doc(id).get();
      if (docSnap.exists) {
        meeting = docSnap.data() as MeetingEntity;
      }
    } catch (err: any) {
      console.warn(`Aviso ao buscar reunião ${id} no Firestore:`, err.message);
    }
  }

  if (!meeting) {
    meeting = memoryMeetingsStore.get(id) || null;
  }

  if (!meeting) {
    return null;
  }

  // Membro comum pode visualizar se for proprietário, se tiver sido compartilhado com ele ou se for público
  if (user && user.role === 'member') {
    const isOwner = meeting.ownerUid === user.uid;
    const isSharedWithUser = Boolean(user.email && meeting.sharedWith?.includes(user.email.toLowerCase()));
    const isPublic = Boolean(meeting.isPublicShare);

    if (!isOwner && !isSharedWithUser && !isPublic) {
      return null;
    }
  }

  return meeting;
}

/**
 * Compartilha reunião com outro usuário ou gera token público de acesso
 */
export async function shareMeetingInStore(
  id: string,
  options: { shareWithEmail?: string; isPublic?: boolean },
  user: { uid: string; email: string; role: 'member' | 'admin' }
): Promise<{ success: boolean; meeting: MeetingEntity; shareUrl?: string }> {
  const meeting = await getMeetingById(id, user);
  if (!meeting) {
    throw new Error('Reunião não encontrada ou você não tem permissão para compartilhá-la.');
  }

  if (user.role !== 'admin' && meeting.ownerUid !== user.uid) {
    throw new Error('Apenas o proprietário da reunião ou administrador pode alterar permissões de compartilhamento.');
  }

  const updatedSharedWith = new Set<string>(meeting.sharedWith || []);
  if (options.shareWithEmail && options.shareWithEmail.trim()) {
    updatedSharedWith.add(options.shareWithEmail.toLowerCase().trim());
  }

  if (!meeting.shareToken) {
    meeting.shareToken = `share-${id}-${Math.random().toString(36).substring(2, 10)}`;
  }

  meeting.sharedWith = Array.from(updatedSharedWith);
  if (options.isPublic !== undefined) {
    meeting.isPublicShare = options.isPublic;
  }
  meeting.updatedAt = new Date().toISOString();

  const db = getFirestoreDb();
  if (db) {
    try {
      await db.collection('meetings').doc(id).set(meeting, { merge: true });
    } catch (err: any) {
      console.warn(`Aviso ao atualizar compartilhamento no Firestore:`, err.message);
    }
  }

  memoryMeetingsStore.set(id, meeting);
  saveDiskMeetings();

  addLog('INFO', 'SYSTEM', `Reunião ${id} compartilhada: public=${meeting.isPublicShare}, emails=${meeting.sharedWith.join(',')}`, {
    meetingId: id,
    sharedBy: user.email
  });

  return {
    success: true,
    meeting,
    shareUrl: `/shared/${meeting.shareToken}`
  };
}

/**
 * Busca reunião por token de compartilhamento público
 */
export async function getMeetingByShareToken(token: string): Promise<MeetingEntity | null> {
  if (!token) return null;
  const db = getFirestoreDb();
  if (db) {
    try {
      const snap = await db.collection('meetings').where('shareToken', '==', token).limit(1).get();
      if (!snap.empty) {
        return snap.docs[0].data() as MeetingEntity;
      }
    } catch (err: any) {
      console.warn('Aviso ao buscar por shareToken no Firestore:', err.message);
    }
  }

  for (const m of memoryMeetingsStore.values()) {
    if (m.shareToken === token) {
      return m;
    }
  }

  return null;
}

/**
 * Exclui uma reunião do Firestore e disco com checagem de autorização por proprietário.
 */
export async function deleteMeetingFromStore(
  id: string,
  user?: { uid: string; role: 'member' | 'admin' }
): Promise<boolean> {
  const db = getFirestoreDb();
  let existing: MeetingEntity | null = memoryMeetingsStore.get(id) || null;

  if (db) {
    try {
      const meetingRef = db.collection('meetings').doc(id);
      const docSnap = await meetingRef.get();
      if (docSnap.exists) {
        existing = docSnap.data() as MeetingEntity;
        if (!user || user.role === 'admin' || existing.ownerUid === user.uid) {
          await meetingRef.delete();
        }
      }
    } catch (err: any) {
      console.warn(`Aviso ao excluir reunião ${id} do Firestore:`, err.message);
    }
  }

  if (existing) {
    if (user && user.role === 'member' && existing.ownerUid !== user.uid) {
      return false;
    }
  }

  memoryMeetingsStore.delete(id);
  memoryAtaStatesStore.delete(id);
  saveDiskMeetings();

  addLog('WARN', 'SYSTEM', `Reunião excluída: ID ${id}`, {
    meetingId: id,
    deletedBy: user?.uid
  });

  return true;
}

const memoryAtaStateEntityStore = new Map<string, AtaState>();

/**
 * Persiste o AtaState resultante em meetings/{meetingId}/ataState (Firestore e memória)
 */
export async function saveAtaState(meetingId: string, ataState: AtaState): Promise<void> {
  memoryAtaStateEntityStore.set(meetingId, ataState);
  const db = getFirestoreDb();
  if (db) {
    try {
      await db.collection('meetings').doc(meetingId).collection('ataState').doc('current').set(ataState);
    } catch (err: any) {
      console.warn(`Aviso ao persistir AtaState em meetings/${meetingId}/ataState no Firestore:`, err.message);
    }
  }
}

/**
 * Recupera o AtaState de uma reunião (Firestore ou memória)
 */
export async function getAtaState(meetingId: string): Promise<AtaState | null> {
  const db = getFirestoreDb();
  if (db) {
    try {
      const snap = await db.collection('meetings').doc(meetingId).collection('ataState').doc('current').get();
      if (snap.exists) {
        return snap.data() as AtaState;
      }
    } catch (err: any) {
      console.warn(`Aviso ao buscar AtaState de meetings/${meetingId}/ataState no Firestore:`, err.message);
    }
  }
  return memoryAtaStateEntityStore.get(meetingId) || null;
}


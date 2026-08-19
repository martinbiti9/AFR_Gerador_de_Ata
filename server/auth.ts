import 'dotenv/config';
import { Request, Response, NextFunction } from 'express';
import { initializeApp, getApps, cert, applicationDefault, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { addLog } from './logger';

export interface UserRecord {
  uid: string;
  email: string;              // sempre em minúsculas
  displayName: string;
  role: 'member' | 'admin';
  domain: string;
  provider: 'password' | 'google.com' | string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;           // ISO
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
}

export interface AuthContext {
  uid: string;
  email: string;
  displayName: string;
  role: 'member' | 'admin';
  domain: string;
  mustChangePassword: boolean;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

let adminApp: App | null = null;
let adminAuth: Auth | null = null;
let adminDb: Firestore | null = null;

/**
 * Valida variáveis de ambiente obrigatórias no boot.
 * Se qualquer uma estiver ausente, loga erro claro e encerra o processo (process.exit(1)).
 */
function getRequiredEnv(key: string, alias?: string): string {
  const val = process.env[key] || (alias ? process.env[alias] : undefined);
  if (!val || !val.trim()) {
    const errorMsg = `[FATAL] Variável de ambiente obrigatória '${key}'${alias ? ` (ou '${alias}')` : ''} não está configurada. Encerrando servidor no boot.`;
    console.error(errorMsg);
    try {
      addLog('ERROR', 'SYSTEM', errorMsg, { missingEnv: key });
    } catch {}
    process.exit(1);
  }
  return val.trim().replace(/^["']|["']$/g, '');
}

export const FIREBASE_PROJECT_ID = getRequiredEnv('FIREBASE_PROJECT_ID', 'GCP_PROJECT_ID');
export const FIRESTORE_DATABASE_ID = getRequiredEnv('FIRESTORE_DATABASE_ID');
export const ALLOWED_ADMIN_DOMAIN = getRequiredEnv('ALLOWED_ADMIN_DOMAIN').toLowerCase().replace(/^@+/, '');
export const ALLOWED_MEMBER_DOMAIN = getRequiredEnv('ALLOWED_MEMBER_DOMAIN').toLowerCase().replace(/^@+/, '');

// In-memory fallback cache for user records
const memoryUsersCache = new Map<string, UserRecord>();

export function initFirebaseAdmin(): { adminApp: App; adminAuth: Auth; adminDb: Firestore } {
  if (!adminApp) {
    const apps = getApps();
    if (apps.length > 0) {
      adminApp = apps[0];
    } else {
      let credential = applicationDefault();
      const saKey = process.env.GCP_SERVICE_ACCOUNT_KEY;
      if (saKey && saKey.trim().startsWith('{') && saKey.trim() !== '{}') {
        try {
          const parsed = JSON.parse(saKey);
          if (parsed.client_email && parsed.private_key) {
            credential = cert(parsed);
          }
        } catch (e) {
          console.warn('Aviso: GCP_SERVICE_ACCOUNT_KEY inválido, usando applicationDefault()', e);
        }
      }

      adminApp = initializeApp({
        credential,
        projectId: FIREBASE_PROJECT_ID
      });
    }

    adminAuth = getAuth(adminApp);
    try {
      adminDb = getFirestore(adminApp, FIRESTORE_DATABASE_ID);
    } catch (e) {
      console.warn(`Aviso ao conectar Firestore ${FIRESTORE_DATABASE_ID}:`, e);
      adminDb = getFirestore(adminApp);
    }
  }

  return { adminApp, adminAuth: adminAuth!, adminDb: adminDb! };
}

/**
 * Middleware: Verify Firebase ID token and validate domain & user status.
 * Rejeita com 401 se a assinatura do token não puder ser validada pelo Firebase Admin.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Token de autenticação não fornecido.',
        code: 'UNAUTHORIZED'
      });
    }

    const token = authHeader.split('Bearer ')[1].trim();
    if (!token) {
      return res.status(401).json({ 
        error: 'Token de autenticação inválido.',
        code: 'UNAUTHORIZED'
      });
    }

    let decodedToken: any = null;

    // Verificação estrita de assinatura via Firebase Admin
    try {
      const { adminAuth: authInstance } = initFirebaseAdmin();
      // Use checkRevoked = false for fast local x509 validation
      decodedToken = await authInstance.verifyIdToken(token, false);
    } catch (adminErr: any) {
      addLog('WARN', 'AUTH', `Falha ao verificar assinatura do token Firebase: ${adminErr?.message || adminErr}`);
      return res.status(401).json({ 
        error: 'Sessão inválida, não autenticada ou expirada. Assinatura do token não pôde ser verificada.',
        code: 'UNAUTHORIZED'
      });
    }

    if (!decodedToken || (!decodedToken.sub && !decodedToken.uid && !decodedToken.user_id)) {
      return res.status(401).json({ 
        error: 'Sessão expirada ou token inválido. Por favor, faça login novamente.',
        code: 'UNAUTHORIZED'
      });
    }

    const uid = decodedToken.uid || decodedToken.sub || decodedToken.user_id || 'anonymous';
    const email = (
      decodedToken.email || 
      decodedToken.firebase?.identities?.email?.[0] || 
      decodedToken.firebase?.identities?.['google.com']?.[0] || 
      decodedToken.preferred_username ||
      decodedToken.upn ||
      ''
    ).toLowerCase().trim();

    if (!email) {
      return res.status(403).json({ error: 'Conta de usuário sem e-mail associado.' });
    }

    // Checagem estrita de sufixo de domínio (@dominio)
    const isBiti9 = email === ALLOWED_ADMIN_DOMAIN || email.endsWith('@' + ALLOWED_ADMIN_DOMAIN);
    const isAfonsoFranca = email === ALLOWED_MEMBER_DOMAIN || email.endsWith('@' + ALLOWED_MEMBER_DOMAIN);

    if (!isBiti9 && !isAfonsoFranca) {
      addLog('WARN', 'AUTH', `Tentativa de login negada: domínio não autorizado (${email})`, {
        uid,
        email,
      });
      return res.status(403).json({ 
        error: `Acesso negado. Apenas contas dos domínios @${ALLOWED_MEMBER_DOMAIN} e @${ALLOWED_ADMIN_DOMAIN} são autorizadas.` 
      });
    }

    // Atribuição de perfil baseada no domínio verificado
    const assignedRole: 'admin' | 'member' = isBiti9 ? 'admin' : 'member';
    const domain = isBiti9 ? ALLOWED_ADMIN_DOMAIN : ALLOWED_MEMBER_DOMAIN;

    let userRecord: UserRecord | null = memoryUsersCache.get(uid) || null;

    // Leitura/atualização do documento no Firestore via Admin SDK
    try {
      const { adminDb: dbInstance, adminAuth: authInstance } = initFirebaseAdmin();
      const userDocRef = dbInstance.collection('users').doc(uid);
      
      // Safely wrap the get() call to catch rejection and prevent unhandledRejection if it resolves/rejects after timeout
      let isSettled = false;
      const fetchPromise = userDocRef.get().catch(err => {
        if (!isSettled) throw err;
      });

      const userSnap = await Promise.race([
        fetchPromise.then(res => { isSettled = true; return res; }),
        new Promise<any>((_, reject) => setTimeout(() => { isSettled = true; reject(new Error('Firestore timeout')); }, 1500))
      ]);

      if (!userSnap.exists) {
        userRecord = {
          uid,
          email,
          displayName: decodedToken.name || email.split('@')[0],
          role: assignedRole,
          domain,
          provider: decodedToken.firebase?.sign_in_provider || (isBiti9 ? 'google.com' : 'password'),
          isActive: true,
          mustChangePassword: assignedRole === 'member' ? Boolean(decodedToken.mustChangePassword) : false,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          passwordChangedAt: null,
        };

        userDocRef.set(userRecord, { merge: true }).catch(err => {
          console.warn('Aviso ao persistir userDocRef no Firestore:', err);
        });

        // Configuração de custom claims no Firebase Auth
        if (authInstance && authInstance.setCustomUserClaims) {
          authInstance.setCustomUserClaims(uid, {
            role: assignedRole,
            domain
          }).catch(() => {});
        }

        addLog('INFO', 'AUTH', `Usuário registrado/autenticado: ${email} [${assignedRole}]`, {
          uid,
          email,
          role: assignedRole
        });
      } else {
        const existingData = userSnap.data();
        userRecord = {
          ...existingData,
          uid,
          email,
          role: assignedRole, // Garantia estrita de perfil alinhado ao domínio verificado
          domain,
          mustChangePassword: assignedRole === 'admin' ? false : Boolean(existingData?.mustChangePassword),
          isActive: existingData?.isActive !== false
        } as UserRecord;

        if (!userRecord.isActive) {
          addLog('WARN', 'AUTH', `Tentativa de acesso por usuário inativo (${email})`, { uid, email });
          return res.status(403).json({ error: 'Usuário inativo. Contate o suporte.' });
        }

        userDocRef.update({ lastLoginAt: new Date().toISOString() }).catch(() => {});
      }
    } catch (dbErr) {
      if (!userRecord) {
        userRecord = {
          uid,
          email,
          displayName: decodedToken.name || email.split('@')[0],
          role: assignedRole,
          domain,
          provider: decodedToken.firebase?.sign_in_provider || (isBiti9 ? 'google.com' : 'password'),
          isActive: true,
          mustChangePassword: false,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          passwordChangedAt: null,
        };
      }
    }

    if (userRecord) {
      userRecord.role = assignedRole;
      memoryUsersCache.set(uid, userRecord);
    }

    req.auth = {
      uid: userRecord?.uid || uid,
      email: userRecord?.email || email,
      displayName: userRecord?.displayName || decodedToken.name || email.split('@')[0],
      role: assignedRole,
      domain,
      mustChangePassword: assignedRole === 'admin' ? false : Boolean(userRecord?.mustChangePassword)
    };

    next();
  } catch (error: any) {
    console.error('Erro no middleware requireAuth:', error);
    return res.status(500).json({ error: 'Erro interno ao autenticar requisição.' });
  }
}

/**
 * Middleware: Requires admin role (@biti9.com.br)
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth || req.auth.role !== 'admin') {
    addLog('WARN', 'ADMIN', `Acesso administrativo negado para usuário ${req.auth?.email || 'anônimo'}`, {
      uid: req.auth?.uid,
      email: req.auth?.email,
      role: req.auth?.role
    });
    return res.status(403).json({ error: `Acesso restrito a administradores do sistema (@${ALLOWED_ADMIN_DOMAIN}).` });
  }
  next();
}

/**
 * Middleware: Requires that user has already changed temporary password (428 Precondition Required)
 */
export function requirePasswordChanged(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.mustChangePassword && req.auth?.role !== 'admin') {
    return res.status(428).json({ 
      error: 'Troca de senha obrigatória no primeiro acesso antes de utilizar o sistema.',
      code: 'MUST_CHANGE_PASSWORD'
    });
  }
  next();
}

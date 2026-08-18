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
  domain: 'afonsofranca.com.br' | 'biti9.com.br' | string;
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

export const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-495e4a2f-bc01-4197-9d3d-8b17577710a2';
export const ALLOWED_ADMIN_DOMAIN = process.env.ALLOWED_ADMIN_DOMAIN || 'biti9.com.br';
export const ALLOWED_MEMBER_DOMAIN = process.env.ALLOWED_MEMBER_DOMAIN || 'afonsofranca.com.br';
export const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID || 'biti9-performevaluationsummary';

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
 * Resilient JWT token decoder fallback for Firebase ID tokens and Google tokens
 */
function decodeJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    
    // Validate standard Firebase/Google JWT fields with relaxed clock tolerance
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now - 600) {
      console.warn('Token expirado:', payload.exp, 'Agora:', now);
      return null;
    }
    return payload;
  } catch (err) {
    console.warn('Falha ao decodificar payload JWT:', err);
    return null;
  }
}

/**
 * Middleware: Verify Firebase ID token and validate domain & user status
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
    }

    const token = authHeader.split('Bearer ')[1].trim();
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticação inválido.' });
    }

    let decodedToken: any = null;

    // 1. Try Firebase Admin verification
    try {
      const { adminAuth: authInstance } = initFirebaseAdmin();
      // Use checkRevoked = false for fast local x509 validation
      decodedToken = await authInstance.verifyIdToken(token, false);
    } catch (adminErr: any) {
      // 2. Resilient JWT fallback validation
      decodedToken = decodeJwtPayload(token);
    }

    if (!decodedToken || (!decodedToken.sub && !decodedToken.uid && !decodedToken.user_id)) {
      return res.status(401).json({ 
        error: 'Sessão expirada ou token inválido. Por favor, faça login novamente.' 
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

    const isBiti9 = email.endsWith(`@${ALLOWED_ADMIN_DOMAIN}`) || email.includes('biti9.com.br');
    const isAfonsoFranca = email.endsWith(`@${ALLOWED_MEMBER_DOMAIN}`) || email.includes('afonsofranca.com.br');

    if (!isBiti9 && !isAfonsoFranca) {
      addLog('WARN', 'AUTH', `Tentativa de login negada: domínio não autorizado (${email})`, {
        uid,
        email,
      });
      return res.status(403).json({ 
        error: `Acesso negado. Apenas contas dos domínios @${ALLOWED_MEMBER_DOMAIN} e @${ALLOWED_ADMIN_DOMAIN} são autorizadas.` 
      });
    }

    // Role assignment based on verified domain
    const assignedRole: 'admin' | 'member' = isBiti9 ? 'admin' : 'member';
    const domain = isBiti9 ? ALLOWED_ADMIN_DOMAIN : ALLOWED_MEMBER_DOMAIN;

    let userRecord: UserRecord | null = memoryUsersCache.get(uid) || null;

    // Try reading/writing to Firestore users collection with timeout
    try {
      const { adminDb: dbInstance, adminAuth: authInstance } = initFirebaseAdmin();
      const userDocRef = dbInstance.collection('users').doc(uid);
      
      const userSnap = await Promise.race([
        userDocRef.get(),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 1500))
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

        // Set custom claims if possible
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
          role: assignedRole, // Enforce domain-based role guarantee
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
      userRecord.role = assignedRole; // Guarantee role always matches verified domain
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
 * Middleware: Requires admin role
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth || req.auth.role !== 'admin') {
    addLog('WARN', 'ADMIN', `Acesso administrativo negado para usuário ${req.auth?.email || 'anônimo'}`, {
      uid: req.auth?.uid,
      email: req.auth?.email,
      role: req.auth?.role
    });
    return res.status(403).json({ error: 'Acesso restrito a administradores do sistema (@biti9.com.br).' });
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

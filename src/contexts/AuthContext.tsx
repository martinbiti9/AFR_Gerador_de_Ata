import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserProfile } from '../types';
import { safeFetchJson, MustChangePasswordError } from '../utils/api';

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  role: 'member' | 'admin' | null;
  loading: boolean;
  mustChangePassword: boolean;
  error: string | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<'member' | 'admin' | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Builds an immediate client-side profile from Firebase User credentials
   */
  const buildClientProfile = (firebaseUser: FirebaseUser): UserProfile => {
    const email = (firebaseUser.email || '').toLowerCase().trim();
    const isAdmin = email.endsWith('@biti9.com.br');
    const domain = isAdmin ? 'biti9.com.br' : 'afonsofranca.com.br';
    const role: 'admin' | 'member' = isAdmin ? 'admin' : 'member';

    return {
      uid: firebaseUser.uid,
      email,
      displayName: firebaseUser.displayName || email.split('@')[0],
      role,
      domain,
      provider: firebaseUser.providerData?.[0]?.providerId || (isAdmin ? 'google.com' : 'password'),
      isActive: true,
      mustChangePassword: false,
    };
  };

  /**
   * Synchronizes user profile with Backend API and Firestore
   */
  const fetchSession = useCallback(async (currentUser: FirebaseUser): Promise<UserProfile> => {
    const fallbackProfile = buildClientProfile(currentUser);

    // 1. Try Firestore direct read with client SDK
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userDocRef);

      if (userSnap.exists()) {
        const data = userSnap.data();
        fallbackProfile.role = fallbackProfile.email.endsWith('@biti9.com.br') ? 'admin' : (data.role || fallbackProfile.role);
        fallbackProfile.displayName = data.displayName || fallbackProfile.displayName;
        fallbackProfile.mustChangePassword = Boolean(data.mustChangePassword && fallbackProfile.role !== 'admin');
      }
    } catch (firestoreErr) {
      console.warn('Aviso ao consultar Firestore no cliente:', firestoreErr);
    }

    // 2. Try Backend session API (which persists user with Admin SDK if missing)
    try {
      const session = await safeFetchJson<UserProfile>('/api/auth/session');
      if (session) {
        setProfile(session);
        setRole(session.role);
        setMustChangePassword(Boolean(session.mustChangePassword && session.role !== 'admin'));
        setError(null);
        return session;
      }
    } catch (err: any) {
      if (err instanceof MustChangePasswordError) {
        fallbackProfile.mustChangePassword = true;
        setMustChangePassword(true);
      } else {
        console.warn('Aviso ao sincronizar sessão com backend:', err);
      }
    }

    // 3. Fallback to client profile
    setProfile(fallbackProfile);
    setRole(fallbackProfile.role);
    setMustChangePassword(Boolean(fallbackProfile.mustChangePassword && fallbackProfile.role !== 'admin'));
    setError(null);
    return fallbackProfile;
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Set immediate client profile to avoid any UI flash
        const initialProfile = buildClientProfile(firebaseUser);
        setProfile(initialProfile);
        setRole(initialProfile.role);
        setLoading(false);

        // Hydrate session in background
        try {
          await fetchSession(firebaseUser);
        } catch (err: any) {
          console.error('Erro na inicialização da sessão:', err);
        }
      } else {
        setProfile(null);
        setRole(null);
        setMustChangePassword(false);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [fetchSession]);

  const signInWithEmail = async (email: string, password: string) => {
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    
    // Check client domain
    if (!cleanEmail.endsWith('@afonsofranca.com.br') && !cleanEmail.endsWith('@biti9.com.br')) {
      throw new Error('Acesso permitido apenas para e-mails institucionais (@afonsofranca.com.br ou @biti9.com.br).');
    }

    const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const session = await fetchSession(cred.user);
    if (session?.mustChangePassword && session.role !== 'admin') {
      setMustChangePassword(true);
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ 
      hd: 'biti9.com.br', 
      prompt: 'select_account' 
    });

    const cred = await signInWithPopup(auth, provider);
    const email = (cred.user.email ?? '').toLowerCase().trim();

    if (!email.endsWith('@biti9.com.br')) {
      await signOut(auth);
      throw new Error('Acesso administrativo restrito a contas @biti9.com.br.');
    }

    // Set immediate admin profile
    const adminProfile: UserProfile = {
      uid: cred.user.uid,
      email,
      displayName: cred.user.displayName || email.split('@')[0],
      role: 'admin',
      domain: 'biti9.com.br',
      provider: 'google.com',
      isActive: true,
      mustChangePassword: false,
    };

    setUser(cred.user);
    setProfile(adminProfile);
    setRole('admin');
    setMustChangePassword(false);

    // Sync with backend & Firestore
    await fetchSession(cred.user).catch(() => {});
  };

  const changePassword = async (newPassword: string) => {
    setError(null);
    await safeFetchJson('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword })
    });
    setMustChangePassword(false);
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
      await fetchSession(auth.currentUser);
    }
  };

  const resetPassword = async (email: string) => {
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      throw new Error('Informe o e-mail cadastrado para redefinir a senha.');
    }
    await sendPasswordResetEmail(auth, cleanEmail);
  };

  const logout = async () => {
    try {
      if (auth.currentUser) {
        await safeFetchJson('/api/auth/logout', { method: 'POST' }).catch(() => {});
      }
    } catch {}
    await signOut(auth);
    setUser(null);
    setProfile(null);
    setRole(null);
    setMustChangePassword(false);
    setError(null);
  };

  const refreshSession = async () => {
    if (auth.currentUser) {
      await auth.currentUser.getIdToken(true);
      await fetchSession(auth.currentUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role,
        loading,
        mustChangePassword,
        error,
        signInWithEmail,
        signInWithGoogle,
        changePassword,
        resetPassword,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
}

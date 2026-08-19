import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface CriticalErrorItem {
  id: string;
  title: string;
  message: string;
  details?: any;
  path?: string;
  timestamp: string;
  retryAction?: () => void | Promise<void>;
}

interface AlertContextValue {
  criticalErrors: CriticalErrorItem[];
  showCriticalError: (error: Omit<CriticalErrorItem, 'id' | 'timestamp'>) => string;
  dismissCriticalError: (id: string) => void;
  clearAllCriticalErrors: () => void;
}

const AlertContext = createContext<AlertContextValue | null>(null);

// Global custom event name for non-React dispatches (e.g. from db.ts)
const CRITICAL_ERROR_EVENT = 'app:critical_db_error';

/**
 * Universal global dispatcher to report critical database/storage errors from anywhere in the codebase.
 */
export function emitCriticalDbError(error: {
  title?: string;
  message: string;
  details?: any;
  path?: string;
  retryAction?: () => void | Promise<void>;
}) {
  const event = new CustomEvent(CRITICAL_ERROR_EVENT, {
    detail: {
      title: error.title || 'Erro Crítico de Gravação no Banco de Dados',
      message: error.message,
      details: error.details,
      path: error.path,
      retryAction: error.retryAction,
    }
  });
  window.dispatchEvent(event);
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [criticalErrors, setCriticalErrors] = useState<CriticalErrorItem[]>([]);

  const showCriticalError = useCallback((error: Omit<CriticalErrorItem, 'id' | 'timestamp'>): string => {
    const id = `err-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newItem: CriticalErrorItem = {
      ...error,
      id,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
    };

    setCriticalErrors(prev => {
      // Avoid spamming duplicate identical messages
      const existing = prev.find(e => e.message === newItem.message && e.path === newItem.path);
      if (existing) {
        return prev.map(e => e.id === existing.id ? { ...newItem, id: existing.id } : e);
      }
      return [...prev, newItem];
    });

    return id;
  }, []);

  const dismissCriticalError = useCallback((id: string) => {
    setCriticalErrors(prev => prev.filter(e => e.id !== id));
  }, []);

  const clearAllCriticalErrors = useCallback(() => {
    setCriticalErrors([]);
  }, []);

  // Listen for global non-React dispatches
  useEffect(() => {
    const handleGlobalError = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail) {
        showCriticalError(customEvent.detail);
      }
    };

    window.addEventListener(CRITICAL_ERROR_EVENT, handleGlobalError);
    return () => window.removeEventListener(CRITICAL_ERROR_EVENT, handleGlobalError);
  }, [showCriticalError]);

  return (
    <AlertContext.Provider
      value={{
        criticalErrors,
        showCriticalError,
        dismissCriticalError,
        clearAllCriticalErrors,
      }}
    >
      {children}
    </AlertContext.Provider>
  );
}

export function useAlert(): AlertContextValue {
  const ctx = useContext(AlertContext);
  if (!ctx) {
    throw new Error('useAlert deve ser utilizado dentro de um AlertProvider');
  }
  return ctx;
}

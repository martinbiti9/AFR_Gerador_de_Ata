import { auth } from '../lib/firebase';

/**
 * Custom error class for Precondition Required (428 - Must Change Password)
 */
export class MustChangePasswordError extends Error {
  code = 'MUST_CHANGE_PASSWORD';
  constructor(message = 'Troca de senha obrigatória no primeiro acesso.') {
    super(message);
    this.name = 'MustChangePasswordError';
  }
}

/**
 * Safe fetch utility that guarantees JSON response parsing, automatic token injection,
 * token auto-refresh on 401, permission error handling (403), and password change enforcement (428).
 */
export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit,
  retryOn401 = true
): Promise<T> {
  const headers = new Headers(init?.headers || {});

  // Wait for initial auth state readiness if currentUser is not yet resolved
  if (!auth.currentUser && typeof auth.authStateReady === 'function') {
    try {
      await auth.authStateReady();
    } catch {}
  }

  // 1. Automatically obtain and inject Bearer token if user is signed in
  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const token = await currentUser.getIdToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    } catch (tokenErr) {
      console.warn('Aviso ao obter token do usuário:', tokenErr);
    }
  }

  // If body is plain string/object and not FormData, ensure Content-Type is json unless specified
  if (init?.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const requestConfig: RequestInit = {
    ...init,
    headers,
  };

  let res: Response;
  try {
    res = await fetch(input, requestConfig);
  } catch (networkErr: any) {
    throw new Error(`Falha de conexão com o servidor: ${networkErr.message || 'Verifique a rede'}`);
  }

  // 2. Handle 401 Unauthorized: Try once with forced refresh token
  if (res.status === 401) {
    if (retryOn401 && auth.currentUser) {
      try {
        const freshToken = await auth.currentUser.getIdToken(true);
        const retryHeaders = new Headers(init?.headers || {});
        retryHeaders.set('Authorization', `Bearer ${freshToken}`);
        if (init?.body && typeof init.body === 'string' && !retryHeaders.has('Content-Type')) {
          retryHeaders.set('Content-Type', 'application/json');
        }

        const retryRes = await fetch(input, {
          ...init,
          headers: retryHeaders,
        });

        if (retryRes.ok) {
          const rawText = await retryRes.text();
          return (rawText ? JSON.parse(rawText) : null) as T;
        }
      } catch (refreshErr) {
        console.warn('Falha na renovação do token após 401:', refreshErr);
      }
    }

    throw new Error('Sessão expirada ou não autorizada. Por favor, faça login novamente.');
  }

  // 3. Handle 403 Forbidden
  if (res.status === 403) {
    let forbiddenMsg = 'Você não tem permissão para esta operação.';
    try {
      const clone = res.clone();
      const errData = await clone.json();
      if (errData?.error) forbiddenMsg = errData.error;
    } catch {
      try {
        const rawText = await res.text();
        if (rawText && !rawText.includes('<!DOCTYPE')) forbiddenMsg = rawText;
      } catch {}
    }
    throw new Error(forbiddenMsg);
  }

  // 4. Handle 428 Precondition Required (Must Change Password)
  if (res.status === 428) {
    let msg = 'Troca de senha obrigatória no primeiro acesso.';
    try {
      const clone = res.clone();
      const errData = await clone.json();
      if (errData?.error) msg = errData.error;
    } catch {}
    throw new MustChangePasswordError(msg);
  }

  // Parse response
  const rawText = await res.text();
  let data: any = null;

  if (rawText && rawText.trim().length > 0) {
    try {
      data = JSON.parse(rawText);
    } catch {
      // Try extract JSON from markdown fences or substring if present
      let parsedSuccessfully = false;
      const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      const textToTry = codeBlockMatch ? codeBlockMatch[1].trim() : rawText.trim();

      const firstBrace = textToTry.indexOf('{');
      const lastBrace = textToTry.lastIndexOf('}');
      const firstBracket = textToTry.indexOf('[');
      const lastBracket = textToTry.lastIndexOf(']');

      const candidates: string[] = [textToTry];
      if (firstBrace !== -1 && lastBrace > firstBrace) candidates.push(textToTry.substring(firstBrace, lastBrace + 1));
      if (firstBracket !== -1 && lastBracket > firstBracket) candidates.push(textToTry.substring(firstBracket, lastBracket + 1));

      for (const cand of candidates) {
        try {
          data = JSON.parse(cand);
          parsedSuccessfully = true;
          break;
        } catch {
          try {
            // Remove trailing commas and comments
            const sanitized = cand.replace(/\/\/.*$/gm, '').replace(/,\s*([\}\]])/g, '$1');
            data = JSON.parse(sanitized);
            parsedSuccessfully = true;
            break;
          } catch {}
        }
      }

      if (!parsedSuccessfully) {
        if (!res.ok) {
          if (rawText.includes('<!DOCTYPE') || rawText.includes('<html') || rawText.includes('Cannot POST') || rawText.includes('Cannot GET')) {
            throw new Error(`Erro no servidor (${res.status}): O servidor retornou uma página de erro HTML. Tente novamente.`);
          }
          throw new Error(`Erro (${res.status}): ${rawText.slice(0, 180)}`);
        }
        throw new Error(`Erro ao interpretar resposta do servidor: Formato de dados não reconhecido.`);
      }
    }
  }

  if (!res.ok) {
    const errorMsg = data?.error || data?.message || `Erro na requisição (Status ${res.status})`;
    throw new Error(errorMsg);
  }

  return data as T;
}

/**
 * Safe fetch for binary blobs (DOCX downloads, etc.) with automatic token injection
 */
export async function safeFetchBlob(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Blob> {
  const headers = new Headers(init?.headers || {});

  if (!auth.currentUser && typeof auth.authStateReady === 'function') {
    try {
      await auth.authStateReady();
    } catch {}
  }

  const currentUser = auth.currentUser;
  if (currentUser) {
    try {
      const token = await currentUser.getIdToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    } catch (tokenErr) {
      console.warn('Aviso ao obter token do usuário:', tokenErr);
    }
  }

  const res = await fetch(input, { ...init, headers });
  if (!res.ok) {
    let errMsg = `Erro ao baixar arquivo (Status ${res.status})`;
    try {
      const text = await res.text();
      const json = JSON.parse(text);
      if (json?.error) errMsg = json.error;
    } catch {}
    throw new Error(errMsg);
  }
  return res.blob();
}

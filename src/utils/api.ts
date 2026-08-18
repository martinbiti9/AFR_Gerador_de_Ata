/**
 * Safe fetch utility that guarantees JSON response parsing without crashing on HTML 
 * (e.g. proxy errors, server restarts, 404s, 500s).
 */
export async function safeFetchJson<T = any>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (networkErr: any) {
    throw new Error(`Falha de conexão com o servidor: ${networkErr.message || 'Verifique a rede'}`);
  }

  const rawText = await res.text();
  let data: any = null;

  if (rawText && rawText.trim().length > 0) {
    try {
      data = JSON.parse(rawText);
    } catch {
      // Not valid JSON (e.g. HTML <!doctype ...> from Vite/Express error page)
      if (!res.ok) {
        if (rawText.includes('<!DOCTYPE') || rawText.includes('<html') || rawText.includes('Cannot POST') || rawText.includes('Cannot GET')) {
          throw new Error(`Erro no servidor (${res.status}): O servidor retornou uma página de erro HTML. Tente novamente.`);
        }
        throw new Error(`Erro (${res.status}): ${rawText.slice(0, 180)}`);
      }
      throw new Error('A resposta do servidor não é um formato JSON válido.');
    }
  }

  if (!res.ok) {
    const errorMsg = data?.error || data?.message || `Erro na requisição (Status ${res.status})`;
    throw new Error(errorMsg);
  }

  return data as T;
}

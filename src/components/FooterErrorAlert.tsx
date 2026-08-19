import { useState } from 'react';
import { useAlert } from '../contexts/AlertContext';
import { 
  AlertOctagon, 
  X, 
  ChevronDown, 
  ChevronUp, 
  Copy, 
  Check, 
  RotateCw, 
  Database,
  ShieldAlert
} from 'lucide-react';

export function FooterErrorAlert() {
  const { criticalErrors, dismissCriticalError } = useAlert();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  if (criticalErrors.length === 0) {
    return null;
  }

  const handleCopyDetails = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleRetry = async (id: string, action?: () => void | Promise<void>) => {
    if (!action) return;
    setRetryingId(id);
    try {
      await action();
      dismissCriticalError(id);
    } catch (e) {
      console.error('Falha na nova tentativa de gravação:', e);
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-xl z-50 flex flex-col gap-2.5 pointer-events-none">
      {criticalErrors.map((err) => {
        const isExpanded = expandedId === err.id;
        const detailsString = err.details 
          ? (typeof err.details === 'object' ? JSON.stringify(err.details, null, 2) : String(err.details)) 
          : (err.path ? `Caminho do documento: ${err.path}` : '');

        return (
          <div
            key={err.id}
            role="alert"
            className="pointer-events-auto bg-slate-900/95 border-2 border-red-500/80 shadow-2xl rounded-2xl p-4 text-white backdrop-blur-md animate-in slide-in-from-bottom-5 duration-300 transition-all"
          >
            {/* Header / Title row */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-red-600/30 border border-red-500 rounded-xl text-red-400 shrink-0 mt-0.5 animate-pulse">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase font-black tracking-wider bg-red-600 text-white px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Database size={10} />
                      Gravação Crítica no Banco
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {err.timestamp}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-red-200 mt-1 leading-snug">
                    {err.title}
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                    {err.message}
                  </p>
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => dismissCriticalError(err.id)}
                className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
                title="Fechar alerta"
              >
                <X size={16} />
              </button>
            </div>

            {/* Path indicator if available */}
            {err.path && (
              <div className="mt-2 text-[11px] text-amber-300 bg-amber-950/40 border border-amber-800/40 px-2.5 py-1 rounded-md font-mono flex items-center gap-1.5">
                <span className="font-semibold text-amber-400">Coleção / Documento:</span> {err.path}
              </div>
            )}

            {/* Expandable technical details */}
            {detailsString && (
              <div className="mt-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : err.id)}
                  className="text-[11px] text-red-400 hover:text-red-300 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {isExpanded ? 'Ocultar detalhes do erro' : 'Exibir detalhes técnicos (Firestore / Permissão)'}
                </button>

                {isExpanded && (
                  <div className="mt-2 bg-black/60 border border-slate-700/60 rounded-lg p-2.5 max-h-36 overflow-y-auto text-[10px] font-mono text-slate-300 relative group">
                    <pre className="whitespace-pre-wrap break-all leading-tight">
                      {detailsString}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Actions Bar */}
            <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-slate-800/80">
              {detailsString && (
                <button
                  type="button"
                  onClick={() => handleCopyDetails(err.id, `${err.title}\n${err.message}\n${detailsString}`)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                >
                  {copiedId === err.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {copiedId === err.id ? 'Copiado!' : 'Copiar Detalhes'}
                </button>
              )}

              {err.retryAction && (
                <button
                  type="button"
                  onClick={() => handleRetry(err.id, err.retryAction)}
                  disabled={retryingId === err.id}
                  className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RotateCw size={12} className={retryingId === err.id ? 'animate-spin' : ''} />
                  {retryingId === err.id ? 'Tentando...' : 'Tentar Novamente'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

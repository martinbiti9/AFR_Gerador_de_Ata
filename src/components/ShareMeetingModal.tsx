import React, { useState } from 'react';
import { 
  X, 
  Share2, 
  Copy, 
  Check, 
  UserPlus, 
  Globe, 
  Lock, 
  Loader2, 
  Users,
  Building2,
  Mail
} from 'lucide-react';
import { shareMeeting } from '../lib/db';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  meeting: {
    id: string;
    obraCodigo?: string;
    obraNome?: string;
    fornecedor?: string;
    assunto?: string;
    sharedWith?: string[];
    isPublicShare?: boolean;
    shareToken?: string;
  } | null;
  onShared?: () => void;
}

export function ShareMeetingModal({ isOpen, onClose, meeting, onShared }: Props) {
  const [emailInput, setEmailInput] = useState('');
  const [isPublic, setIsPublic] = useState(Boolean(meeting?.isPublicShare));
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen || !meeting) return null;

  const origin = window.location.origin;
  const token = meeting.shareToken || `share-${meeting.id}`;
  const shareLink = `${origin}/?meetingId=${meeting.id}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;

    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      await shareMeeting(meeting.id, {
        shareWithEmail: emailInput.trim(),
        isPublic
      });
      setSuccessMsg(`Acesso concedido para ${emailInput.trim()}`);
      setEmailInput('');
      if (onShared) onShared();
    } catch (err: any) {
      setError(err.message || 'Erro ao compartilhar reunião');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePublic = async (checked: boolean) => {
    setIsPublic(checked);
    setLoading(true);
    setError('');
    try {
      await shareMeeting(meeting.id, {
        isPublic: checked
      });
      if (onShared) onShared();
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar visibilidade');
      setIsPublic(!checked);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-60 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl">
              <Share2 size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Compartilhar Reunião</h3>
              <p className="text-xs text-slate-500">
                {meeting.obraCodigo ? `${meeting.obraCodigo} - ${meeting.obraNome || ''}` : meeting.assunto || 'Reunião de Alinhamento'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Shareable Link Box */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Link de Acesso Direto
            </label>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 pr-2">
              <input
                type="text"
                readOnly
                value={shareLink}
                className="w-full bg-transparent px-3 py-1.5 text-xs text-slate-700 font-mono focus:outline-none select-all"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shrink-0 shadow-2xs cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check size={14} className="text-white" />
                    Copiado!
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    Copiar
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Share with specific email */}
          <form onSubmit={handleAddEmail} className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Convidar Colega por E-mail
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="email"
                  placeholder="exemplo@afonsofranca.com.br"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={!emailInput.trim() || loading}
                className="flex items-center gap-1 px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 cursor-pointer shrink-0"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Adicionar
              </button>
            </div>
          </form>

          {/* Visibility toggle */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isPublic ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                {isPublic ? <Globe size={18} /> : <Lock size={18} />}
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">
                  {isPublic ? 'Acesso Público Compartilhado' : 'Acesso Restrito'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {isPublic 
                    ? 'Qualquer usuário autenticado com o link pode visualizar esta ata.' 
                    : 'Apenas você e os usuários autorizados explicitamente têm acesso.'}
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={isPublic} 
                onChange={(e) => handleTogglePublic(e.target.checked)}
                className="sr-only peer" 
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* List of authorized users */}
          {meeting.sharedWith && meeting.sharedWith.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Users size={13} />
                Usuários com Acesso Concedido ({meeting.sharedWith.length})
              </span>
              <div className="max-h-28 overflow-y-auto space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
                {meeting.sharedWith.map((em, i) => (
                  <div key={i} className="flex items-center justify-between text-slate-700 font-medium">
                    <span className="truncate">{em}</span>
                    <span className="text-[10px] bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded border border-blue-200">
                      Visualizador
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">{error}</p>}
          {successMsg && <p className="text-xs text-emerald-700 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">{successMsg}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Concluído
          </button>
        </div>

      </div>
    </div>
  );
}

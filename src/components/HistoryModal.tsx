import { useState, useEffect } from 'react';
import { 
  X, 
  Clock, 
  Download, 
  Loader2, 
  Search, 
  Trash2, 
  CheckCircle2, 
  FileText, 
  AlertCircle, 
  RefreshCw,
  Building2,
  Calendar,
  Layers,
  Sparkles,
  ArrowRight,
  User,
  Shield
} from 'lucide-react';
import { loadMeetings, deleteMeeting } from '../lib/db';
import { useAuth } from '../contexts/AuthContext';
import { safeFetchBlob } from '../utils/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onLoadMeeting: (id: string) => void;
}

export function HistoryModal({ isOpen, onClose, onLoadMeeting }: Props) {
  const { role, user } = useAuth();
  const isAdmin = role === 'admin';

  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'PRE_ATA_GENERATED' | 'FINAL_ATA_GENERATED'>('ALL');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      const data = await loadMeetings(searchTerm);
      setMeetings(data);
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMeetings();
    }
  }, [isOpen]);

  const formatTime = (ts: any) => {
    if (!ts) return 'Recente';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      if (isNaN(d.getTime())) return 'Recente';
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' às ' + 
             d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'Recente';
    }
  };

  const handleDownload = async (m: any, type: 'PRE' | 'FINAL') => {
    setDownloadingId(m.id + type);
    try {
      const endpoint = type === 'PRE' ? '/api/generate-pre-ata' : '/api/generate-final-ata';
      const body = {
        abertura: {
          obraCodigo: m.obraCodigo || '',
          obraNome: m.obraNome || '',
          assunto: m.assunto || '',
          fornecedor: m.fornecedor || '',
          servico: m.servico || '',
          rm: m.rm || '',
          cot: m.cot || '',
        },
        analysisResult: m.aiContext || null,
        divergences: m.aiDivergences || [],
        finalAtaData: m.finalAtaData || null,
        transcript: m.meetingTranscript || ''
      };

      const blob = await safeFetchBlob(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = type === 'PRE' 
        ? `Pre_Ata_${m.obraCodigo || 'Reuniao'}.docx`
        : `Ata_Final_${m.obraCodigo || 'Reuniao'}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Erro ao baixar ${type === 'PRE' ? 'Pré-Ata' : 'Ata Final'}: ${err.message || 'Certifique-se de que os dados foram processados.'}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteMeeting(id);
      setMeetings(prev => prev.filter(m => m.id !== id));
      setDeleteConfirmId(null);
    } catch (err) {
      alert("Erro ao excluir reunião do histórico.");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredMeetings = meetings.filter((m) => {
    const term = searchTerm.toLowerCase().trim();
    const matchesSearch = !term || (
      (m.fornecedor || '').toLowerCase().includes(term) ||
      (m.obraCodigo || '').toLowerCase().includes(term) ||
      (m.obraNome || '').toLowerCase().includes(term) ||
      (m.assunto || '').toLowerCase().includes(term) ||
      (m.servico || '').toLowerCase().includes(term) ||
      (m.ownerName || '').toLowerCase().includes(term) ||
      (m.ownerEmail || '').toLowerCase().includes(term)
    );

    const matchesStatus = statusFilter === 'ALL' || m.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Clock size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-800">Histórico de Reuniões e Atas</h2>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-200">
                    <Shield size={11} /> Visão Geral Admin (Todas as Obras)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {isAdmin 
                  ? 'Exibindo reuniões de todos os usuários do departamento com controle de autoria.' 
                  : 'Reuniões, checklists e atas criadas por você salvas com segurança na nuvem.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={fetchMeetings} 
              title="Atualizar lista"
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw size={18} className={loading ? "animate-spin text-blue-600" : ""} />
            </button>
            <button 
              onClick={onClose} 
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <X size={22} />
            </button>
          </div>
        </div>
        
        {/* Filter and Search Bar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder={isAdmin ? "Buscar por código, obra, fornecedor, serviço ou criador..." : "Buscar por código, obra, fornecedor ou serviço..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-xs transition-all"
            />
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-lg text-xs font-semibold text-slate-600 w-full md:w-auto overflow-x-auto">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap cursor-pointer ${statusFilter === 'ALL' ? 'bg-white text-blue-600 shadow-xs' : 'hover:text-slate-900'}`}
            >
              Todas ({meetings.length})
            </button>
            <button
              onClick={() => setStatusFilter('FINAL_ATA_GENERATED')}
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap cursor-pointer ${statusFilter === 'FINAL_ATA_GENERATED' ? 'bg-white text-emerald-700 shadow-xs' : 'hover:text-slate-900'}`}
            >
              Ata Final ({meetings.filter(m => m.status === 'FINAL_ATA_GENERATED').length})
            </button>
            <button
              onClick={() => setStatusFilter('PRE_ATA_GENERATED')}
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap cursor-pointer ${statusFilter === 'PRE_ATA_GENERATED' ? 'bg-white text-indigo-700 shadow-xs' : 'hover:text-slate-900'}`}
            >
              Pré-Ata ({meetings.filter(m => m.status === 'PRE_ATA_GENERATED').length})
            </button>
            <button
              onClick={() => setStatusFilter('DRAFT')}
              className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap cursor-pointer ${statusFilter === 'DRAFT' ? 'bg-white text-slate-800 shadow-xs' : 'hover:text-slate-900'}`}
            >
              Rascunhos ({meetings.filter(m => m.status === 'DRAFT').length})
            </button>
          </div>
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-100/50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 space-y-3">
              <Loader2 size={32} className="animate-spin text-blue-600" />
              <p className="text-sm font-medium">Sincronizando histórico de reuniões...</p>
            </div>
          ) : filteredMeetings.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center max-w-md mx-auto space-y-3 shadow-xs my-8">
              <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <FileText size={24} />
              </div>
              <h3 className="text-base font-bold text-slate-700">Nenhum registro encontrado</h3>
              <p className="text-xs text-slate-500">
                {meetings.length === 0 
                  ? 'Você ainda não possui reuniões salvas no histórico. Ao preencher a Abertura e avançar nos passos de análise, elas aparecerão aqui automaticamente.' 
                  : 'Nenhuma reunião corresponde aos filtros ou termo de busca informado.'}
              </p>
            </div>
          ) : (
            filteredMeetings.map((m) => {
              const topicCount = m.aiContext?.topics?.length || 0;
              const divCount = m.aiDivergences?.length || 0;
              const isFinal = m.status === 'FINAL_ATA_GENERATED';
              const isPre = m.status === 'PRE_ATA_GENERATED' || isFinal;
              const creatorLabel = m.ownerName || m.ownerEmail || (m.ownerUid === '__legacy__' ? 'Acervo Legado' : 'Membro Suprimentos');

              return (
                <div 
                  key={m.id} 
                  className="bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col gap-4"
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-base">
                          {m.obraCodigo ? `${m.obraCodigo} - ` : ''}{m.obraNome || 'Reunião sem título'}
                        </span>
                        
                        {/* Status Badge */}
                        {isFinal ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={12} /> ATA FINAL GERADA
                          </span>
                        ) : isPre ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Sparkles size={12} /> PRÉ-ATA GERADA
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                            <Layers size={12} /> RASCUNHO (ETAPA {m.step || 1})
                          </span>
                        )}

                        {/* Creator Badge for Admins */}
                        {isAdmin && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            <User size={10} className="text-slate-500" />
                            {creatorLabel}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1 text-xs text-slate-600 pt-1">
                        <div>
                          <span className="font-semibold text-slate-400 uppercase text-[10px] block">Fornecedor</span>
                          <span className="font-medium text-slate-800">{m.fornecedor || 'Não especificado'}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-400 uppercase text-[10px] block">Assunto / Serviço</span>
                          <span className="font-medium text-slate-800">{m.assunto || m.servico || 'Não especificado'}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-400 uppercase text-[10px] block">RM / COT</span>
                          <span className="font-medium text-slate-800">
                            {m.rm ? `RM: ${m.rm}` : ''}{m.rm && m.cot ? ' | ' : ''}{m.cot ? `COT: ${m.cot}` : (m.rm ? '' : 'N/A')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col md:items-end text-xs text-slate-400 shrink-0">
                      <span className="flex items-center gap-1">
                        <Clock size={12} /> {formatTime(m.updatedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Summary badges */}
                  <div className="flex items-center gap-2 flex-wrap text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${topicCount > 0 ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'}`}>
                      {topicCount > 0 ? `${topicCount} tópicos de checklist` : 'Sem checklist'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${divCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'}`}>
                      {divCount > 0 ? `${divCount} divergências apontadas` : 'Sem divergências'}
                    </span>
                    {m.meetingTranscript && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-100 text-purple-800">
                        Transcrição inclusa
                      </span>
                    )}
                    {m.sonnetAnalysis && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800">
                        Extração Sonnet
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-2 flex-wrap">
                      {(topicCount > 0 || isPre) && (
                        <button 
                          onClick={() => handleDownload(m, 'PRE')}
                          disabled={downloadingId === m.id + 'PRE'}
                          className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
                        >
                          {downloadingId === m.id + 'PRE' ? <Loader2 size={13} className="animate-spin text-blue-600" /> : <Download size={13} className="text-indigo-600" />}
                          Baixar Pré-Ata (.docx)
                        </button>
                      )}

                      {(isFinal || m.meetingTranscript) && (
                        <button 
                          onClick={() => handleDownload(m, 'FINAL')}
                          disabled={downloadingId === m.id + 'FINAL'}
                          className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
                        >
                          {downloadingId === m.id + 'FINAL' ? <Loader2 size={13} className="animate-spin text-blue-600" /> : <Download size={13} className="text-emerald-600" />}
                          Baixar Ata Final (.docx)
                        </button>
                      )}

                      {deleteConfirmId === m.id ? (
                        <div className="flex items-center gap-1.5 bg-red-50 p-1 rounded-lg border border-red-200 animate-in fade-in">
                          <span className="text-[11px] text-red-700 font-medium px-1">Excluir?</span>
                          <button
                            onClick={() => handleDelete(m.id)}
                            disabled={deletingId === m.id}
                            className="px-2 py-0.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded transition-colors cursor-pointer"
                          >
                            {deletingId === m.id ? <Loader2 size={12} className="animate-spin" /> : 'Sim'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setDeleteConfirmId(m.id)}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-600 px-2 py-1.5 rounded hover:bg-red-50 transition-colors cursor-pointer"
                          title="Excluir reunião"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>

                    <button 
                      onClick={() => onLoadMeeting(m.id)}
                      className="flex items-center gap-1.5 text-xs font-bold bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm tracking-wide cursor-pointer"
                    >
                      Carregar Sessão
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-white flex items-center justify-between text-xs text-slate-500">
          <span>{filteredMeetings.length} reunião(ões) exibida(s)</span>
          <button 
            onClick={onClose}
            className="px-4 py-1.5 font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
}

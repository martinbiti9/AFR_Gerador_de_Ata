import React, { useState, useEffect, useCallback } from 'react';
import { AuditLog } from '../../types';
import { 
  Terminal, 
  RefreshCw, 
  Trash2, 
  Download, 
  Search, 
  AlertCircle, 
  Info, 
  AlertTriangle, 
  Bug, 
  ChevronDown, 
  ChevronRight, 
  Database, 
  CloudCheck, 
  CheckCircle2,
  ShieldCheck
} from 'lucide-react';
import { 
  syncAuditLogsWithFirestore, 
  loadAuditLogsFromFirestore, 
  clearAuditLogsFromFirestore, 
  saveAuditLogsBatchInFirestore 
} from '../../lib/db';

export function LogsTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingFirestore, setSyncingFirestore] = useState(false);
  const [firestoreCount, setFirestoreCount] = useState<number>(0);
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchAndSyncLogs = useCallback(async () => {
    try {
      // 1. Sync backend in-memory logs with Firestore
      const allSyncedLogs = await syncAuditLogsWithFirestore(300);
      setFirestoreCount(allSyncedLogs.length);

      // 2. Apply filters locally for instantaneous responsiveness
      let filtered = allSyncedLogs;
      if (levelFilter !== 'ALL') {
        filtered = filtered.filter(l => l.level === levelFilter);
      }
      if (categoryFilter !== 'ALL') {
        filtered = filtered.filter(l => l.category === categoryFilter);
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        filtered = filtered.filter(l => 
          l.message.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q) ||
          (l.details ? JSON.stringify(l.details).toLowerCase().includes(q) : false)
        );
      }

      setLogs(filtered);
    } catch (err) {
      console.error('Erro ao sincronizar logs de auditoria:', err);
    } finally {
      setLoading(false);
    }
  }, [levelFilter, categoryFilter, searchTerm]);

  useEffect(() => {
    fetchAndSyncLogs();
  }, [fetchAndSyncLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchAndSyncLogs();
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAndSyncLogs]);

  const handleManualSync = async () => {
    setSyncingFirestore(true);
    try {
      await fetchAndSyncLogs();
      setToastMessage('Logs de auditoria sincronizados e persistidos no Firestore com sucesso.');
      setTimeout(() => setToastMessage(null), 3500);
    } catch (e) {
      console.error(e);
    } finally {
      setSyncingFirestore(false);
    }
  };

  const handleClearLogs = async () => {
    if (!confirm('Deseja realmente limpar todos os logs de auditoria permanentemente do Firestore e do servidor?')) return;
    setLoading(true);
    try {
      // 1. Clear in Firestore
      await clearAuditLogsFromFirestore();
      
      // 2. Clear on backend
      await fetch('/api/admin/logs', { method: 'DELETE' });
      
      setLogs([]);
      setFirestoreCount(0);
      setToastMessage('Todos os logs de auditoria foram limpos permanentemente.');
      setTimeout(() => setToastMessage(null), 3500);
    } catch (err) {
      console.error('Erro ao limpar logs:', err);
      alert('Erro ao limpar logs.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportLogs = () => {
    const jsonStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-firestore-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'ERROR':
        return <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200"><AlertCircle size={12} /> ERRO</span>;
      case 'WARN':
        return <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200"><AlertTriangle size={12} /> AVISO</span>;
      case 'DEBUG':
        return <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200"><Bug size={12} /> DEBUG</span>;
      default:
        return <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200"><Info size={12} /> INFO</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header com Ações e Filtros */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Terminal className="text-slate-800" size={20} />
              Console de Logs & Transações de Auditoria
            </h3>
            <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-full">
              <Database size={12} className="text-emerald-600" />
              Persistido no Firestore ({firestoreCount})
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Rastreamento e auditoria persistente de chamadas de IA (Gemini/Sonnet), extrações de arquivos e operações contratuais.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer bg-slate-100 px-2.5 py-1.5 rounded border border-slate-200">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span className="font-semibold text-[11px]">Auto-Sync (4s)</span>
          </label>

          <button
            onClick={handleManualSync}
            disabled={loading || syncingFirestore}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold rounded transition-colors"
            title="Sincronizar com a coleção 'logs' do Firestore"
          >
            <RefreshCw size={13} className={loading || syncingFirestore ? 'animate-spin text-blue-600' : ''} />
            Sincronizar Nuvem
          </button>

          <button
            onClick={handleExportLogs}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded transition-colors disabled:opacity-50"
            title="Exportar Logs em JSON"
          >
            <Download size={13} />
            Exportar
          </button>

          <button
            onClick={handleClearLogs}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold rounded transition-colors disabled:opacity-50"
            title="Limpar todos os logs permanentemente do Firestore"
          >
            <Trash2 size={13} />
            Limpar
          </button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="bg-emerald-600 text-white text-xs px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm animate-in fade-in">
          <CheckCircle2 size={15} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Barra de Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por mensagem ou detalhes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-medium"
          >
            <option value="ALL">Todos os Níveis</option>
            <option value="INFO">Apenas INFO</option>
            <option value="WARN">Apenas AVISOS</option>
            <option value="ERROR">Apenas ERROS</option>
            <option value="DEBUG">Apenas DEBUG</option>
          </select>
        </div>

        <div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-medium"
          >
            <option value="ALL">Todas as Categorias</option>
            <option value="AI">AI / Modelos</option>
            <option value="CHECKLIST">Checklist</option>
            <option value="PROPOSAL">Propostas</option>
            <option value="DOCX">Geração DOCX</option>
            <option value="AUTH">Autenticação</option>
            <option value="ADMIN">Administração</option>
            <option value="SYSTEM">Sistema</option>
          </select>
        </div>
      </div>

      {/* Lista de Logs estilo Terminal/Auditoria */}
      <div className="bg-slate-900 text-slate-100 rounded-xl overflow-hidden shadow-inner border border-slate-800 font-mono text-xs">
        <div className="bg-slate-950 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{logs.length} eventos carregados ({firestoreCount} persistidos na nuvem)</span>
          </span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <ShieldCheck size={13} className="text-emerald-400" />
            Coleção: <code className="text-slate-300">/logs</code>
          </span>
        </div>

        <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-800/80 p-2 space-y-1">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              Nenhum evento encontrado com os filtros selecionados.
            </div>
          ) : (
            logs.map((log) => {
              const isExpanded = expandedId === log.id;
              const hasDetails = log.details && Object.keys(log.details).length > 0;

              return (
                <div key={log.id} className="p-2 hover:bg-slate-800/50 rounded transition-colors">
                  <div
                    className={`flex items-start justify-between gap-3 ${hasDetails ? 'cursor-pointer' : ''}`}
                    onClick={() => hasDetails && toggleExpand(log.id)}
                  >
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      {hasDetails ? (
                        <button className="text-slate-400 hover:text-white mt-0.5">
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      ) : (
                        <span className="w-3.5 inline-block" />
                      )}

                      <span className="text-[10px] text-slate-400 flex-shrink-0 pt-0.5">
                        {new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour12: false })}
                      </span>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {getLevelBadge(log.level)}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold uppercase">
                          {log.category}
                        </span>
                      </div>

                      <p className={`text-slate-200 break-words flex-1 ${log.level === 'ERROR' ? 'text-red-400 font-semibold' : ''}`}>
                        {log.message}
                      </p>
                    </div>
                  </div>

                  {isExpanded && hasDetails && (
                    <div className="mt-2.5 ml-6 p-3 bg-slate-950/80 border border-slate-800 rounded-lg text-[11px] text-slate-300 overflow-x-auto">
                      <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Payload / Detalhes do Evento:</p>
                      <pre className="text-slate-300 font-mono whitespace-pre-wrap">
                        {typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useRef } from 'react';
import { AppState, Divergence, AberturaData } from '../types';
import { UploadCloud, ArrowRight, Loader2, AlertTriangle, Info, AlertOctagon, Check } from 'lucide-react';
import { safeFetchJson } from '../utils/api';

interface Props {
  state: AppState;
  updateState: (updates: Partial<AppState>) => void;
  onMetadataDetected?: (data: Partial<AberturaData>) => void;
}

export function Step3Complementos({ state, updateState, onMetadataDetected }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleAnalyze = async () => {
    if (files.length === 0) return;
    
    setLoading(true);
    setError('');
    
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    formData.append('checklist', JSON.stringify(state.analysisResult));

    try {
      const [result, metaJson] = await Promise.all([
        safeFetchJson<Divergence[]>('/api/analyze-proposal', {
          method: 'POST',
          body: formData
        }),
        safeFetchJson<{ metadata?: Partial<AberturaData> }>('/api/extract-metadata', {
          method: 'POST',
          body: formData
        }).catch(() => null)
      ]);
      
      updateState({ divergences: result });

      // Check if metadata was found
      if (metaJson && metaJson.metadata) {
        const meta = metaJson.metadata;
        const hasData = Boolean(meta.obraCodigo || meta.fornecedor || meta.assunto || meta.servico);
        if (hasData && onMetadataDetected) {
          onMetadataDetected(meta);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao processar proposta');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch(severity) {
      case 'ALTA': return <AlertOctagon size={16} className="text-red-500" />;
      case 'MEDIA': return <AlertTriangle size={16} className="text-amber-500" />;
      default: return <Info size={16} className="text-blue-500" />;
    }
  };

  const hasAnalyzed = state.divergences.length > 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800">Complementos (Opcional)</h2>
          <p className="text-sm text-slate-500 mt-1">Análise de propostas do fornecedor e identificação de divergências.</p>
        </div>
        <button
          onClick={() => updateState({ step: 4 })}
          className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-4 py-2 bg-white border border-blue-200 rounded-lg transition-colors uppercase tracking-tight"
        >
          Pular etapa
        </button>
      </div>

      {!hasAnalyzed ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-6 shadow-sm">
          <div 
            className="border-2 border-dashed border-slate-300 rounded-xl p-10 hover:border-blue-400 hover:bg-slate-50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud className="mx-auto h-12 w-12 text-slate-400 mb-4" />
            <p className="text-slate-600 font-medium">Anexar Proposta Comercial ou Documentos Extras</p>
            <p className="text-xs text-slate-400 mt-2">Suporta .pdf, .xlsx, .docx, .txt, .md, .csv</p>
            <input 
              type="file" multiple accept=".pdf,.xlsx,.xls,.docx,.txt,.md,.csv" 
              className="hidden" ref={fileInputRef} onChange={handleFileSelect}
            />
          </div>

          {files.length > 0 && (
            <div className="text-left bg-slate-50 p-4 rounded-lg border border-slate-200">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Arquivos selecionados:</p>
              <ul className="space-y-1">
                {files.map(f => (
                  <li key={f.name} className="text-sm text-slate-700 flex items-center gap-2">
                    <Check size={14} className="text-green-500" />
                    {f.name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200">{error}</p>}

          <div className="flex gap-4">
            <button
              onClick={handleAnalyze}
              disabled={files.length === 0 || loading}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 uppercase tracking-tight shadow-md shadow-blue-200 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none transition-colors"
            >
              {loading ? <><Loader2 size={18} className="animate-spin" /> Processando Proposta...</> : 'Analisar Proposta'}
            </button>
            <button
              onClick={() => updateState({ step: 4 })}
              className="px-6 py-3 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 uppercase tracking-tight transition-colors"
            >
              Pular Etapa
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-sm font-semibold text-slate-700">
              Divergências Identificadas ({state.divergences.length})
            </span>
            <button
              onClick={() => updateState({ step: 4 })}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 uppercase tracking-tight shadow-md shadow-blue-200 transition-colors"
            >
              Avançar para Pré-Ata
              <ArrowRight size={16} />
            </button>
          </div>

          <div className="space-y-3">
            {state.divergences.map((div) => (
              <div key={div.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-start gap-4">
                <div className="mt-0.5">{getSeverityIcon(div.severity)}</div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">
                      Severidade {div.severity}
                    </span>
                    <span className="text-[10px] text-slate-400">Origem: {div.source}</span>
                  </div>
                  <p className="text-xs text-slate-700 font-medium">{div.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

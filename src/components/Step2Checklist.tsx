import React, { useState, useRef } from 'react';
import { AppState, AnalysisResult, TopicCard, AberturaData } from '../types';
import { UploadCloud, ArrowRight, Loader2, Edit3, Save, Check, Sparkles } from 'lucide-react';

interface Props {
  state: AppState;
  updateState: (updates: Partial<AppState>) => void;
  onMetadataDetected?: (data: Partial<AberturaData>) => void;
}

export function Step2Checklist({ state, updateState, onMetadataDetected }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingCard, setEditingCard] = useState<string | null>(null);
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

    try {
      // 1. Analyze checklist rules
      const [resChecklist, resMeta] = await Promise.all([
        fetch('/api/analyze-checklist', {
          method: 'POST',
          body: formData
        }),
        // Also extract metadata if abertura is missing or user jumped straight to checklist
        fetch('/api/extract-metadata', {
          method: 'POST',
          body: formData
        }).catch(() => null)
      ]);
      
      if (!resChecklist.ok) {
        const errorText = await resChecklist.text();
        if (errorText.trim().startsWith('<')) {
          throw new Error('Servidor indisponível ou reiniciando. Tente novamente em alguns segundos.');
        }
        throw new Error(errorText);
      }
      
      const contentType = resChecklist.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Servidor retornou um formato inválido (HTML). O servidor pode estar reiniciando.');
      }
      
      const result: AnalysisResult = await resChecklist.json();
      updateState({ analysisResult: result });

      // 2. Check if metadata was found
      if (resMeta && resMeta.ok) {
        const metaJson = await resMeta.json();
        if (metaJson.metadata) {
          const meta = metaJson.metadata;
          const hasData = Boolean(meta.obraCodigo || meta.fornecedor || meta.assunto || meta.servico);
          if (hasData && onMetadataDetected) {
            onMetadataDetected(meta);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao processar documentos');
    } finally {
      setLoading(false);
    }
  };

  const updateTopic = (id: string, updates: Partial<TopicCard>) => {
    if (!state.analysisResult) return;
    
    const newTopics = state.analysisResult.topics.map(t => 
      t.id === id ? { ...t, ...updates } : t
    );
    
    updateState({ 
      analysisResult: { ...state.analysisResult, topics: newTopics } 
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-semibold text-slate-800">Check List da Obra</h2>
        <p className="text-sm text-slate-500 mt-1">Faça upload do PDF e Excel para Análise de Aderência automática e identificação de metadados.</p>
      </div>

      {!state.analysisResult ? (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center space-y-6 shadow-sm">
          <div 
            className="border-2 border-dashed border-slate-300 rounded-xl p-10 hover:border-blue-400 hover:bg-slate-50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud className="mx-auto h-12 w-12 text-slate-400 mb-4" />
            <p className="text-slate-600 font-medium">Clique para selecionar os documentos do Check List</p>
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

          <button
            onClick={handleAnalyze}
            disabled={files.length === 0 || loading}
            className="flex items-center justify-center gap-2 w-full px-6 py-3 text-xs font-bold text-white bg-blue-600 rounded hover:bg-blue-700 uppercase tracking-tight shadow-lg shadow-blue-200 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none transition-colors"
          >
            {loading ? <><Loader2 size={18} className="animate-spin" /> Analisando Documentos e Identificando Obra...</> : 'Analisar e Gerar Check List'}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-4 flex justify-between items-center shadow-sm">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tipo de Fornecimento</span>
              <p className="text-lg font-bold text-blue-600">{state.analysisResult.tipoFornecimento}</p>
            </div>
            <button
              onClick={() => updateState({ step: 3 })}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-blue-600 rounded hover:bg-blue-700 uppercase tracking-tight shadow-md shadow-blue-200 transition-colors"
            >
              Avançar para Complementos
              <ArrowRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {state.analysisResult.topics.map(topic => (
              <div key={topic.id} className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold text-slate-800 text-base">{topic.title}</h3>
                  <button 
                    onClick={() => setEditingCard(editingCard === topic.id ? null : topic.id)}
                    className="text-slate-400 hover:text-blue-600 p-1"
                  >
                    <Edit3 size={16} />
                  </button>
                </div>

                {editingCard === topic.id ? (
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Regra da Obra</label>
                      <textarea 
                        className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                        value={topic.regraObra}
                        onChange={(e) => updateTopic(topic.id, { regraObra: e.target.value })}
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ponto de Atenção</label>
                      <textarea 
                        className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                        value={topic.pontoAtencao}
                        onChange={(e) => updateTopic(topic.id, { pontoAtencao: e.target.value })}
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pergunta ao Fornecedor</label>
                      <textarea 
                        className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                        value={topic.perguntaFornecedor}
                        onChange={(e) => updateTopic(topic.id, { perguntaFornecedor: e.target.value })}
                        rows={2}
                      />
                    </div>
                    <button
                      onClick={() => setEditingCard(null)}
                      className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded hover:bg-blue-100"
                    >
                      <Save size={14} /> Salvar Edição
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="font-semibold text-slate-500 block">Regra da Obra:</span>
                      <p className="text-slate-800">{topic.regraObra}</p>
                    </div>
                    {topic.excecaoAdmitida && (
                      <div>
                        <span className="font-semibold text-slate-500 block">Exceção Admitida:</span>
                        <p className="text-slate-800">{topic.excecaoAdmitida}</p>
                      </div>
                    )}
                    <div>
                      <span className="font-semibold text-amber-600 block">Ponto de Atenção:</span>
                      <p className="text-slate-800">{topic.pontoAtencao}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-blue-600 block">Pergunta ao Fornecedor:</span>
                      <p className="text-slate-800">{topic.perguntaFornecedor}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

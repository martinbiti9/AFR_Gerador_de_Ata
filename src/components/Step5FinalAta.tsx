import React, { useState, useRef, useEffect } from 'react';
import { AppState, FinalAtaData, AberturaData } from '../types';
import { FileDown, Loader2, CheckCircle2, MessageSquareText, UploadCloud, Edit3, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { safeFetchJson } from '../utils/api';
import { TemplateWarningModal } from './TemplateWarningModal';

interface Props {
  state: AppState;
  updateState: (updates: Partial<AppState>) => void;
  onMetadataDetected?: (data: Partial<AberturaData>) => void;
  onNavigateToTemplates?: () => void;
}

export function Step5FinalAta({ state, updateState, onMetadataDetected, onNavigateToTemplates }: Props) {
  const [transcript, setTranscript] = useState(state.finalAtaText || '');
  const [isTextareaExpanded, setIsTextareaExpanded] = useState(false);
  const [loadingExtract, setLoadingExtract] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [loadingDocx, setLoadingDocx] = useState(false);
  const [error, setError] = useState('');
  
  // Template status
  const [hasTemplate, setHasTemplate] = useState<boolean | null>(null);
  const [activeTemplateName, setActiveTemplateName] = useState<string>('');
  const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);

  // Local state for the editable draft and accordion collapse
  const [draftData, setDraftData] = useState<FinalAtaData | null>(state.finalAtaData || null);
  const [isDraftExpanded, setIsDraftExpanded] = useState(true);

  const checkTemplateStatus = async () => {
    try {
      const res = await fetch('/api/admin/templates');
      const data = await res.json();
      if (res.ok) {
        setHasTemplate(Boolean(data.hasTemplate));
        setActiveTemplateName(data.activeTemplate?.name || data.activeTemplate?.originalFileName || '');
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    checkTemplateStatus();
  }, []);

  // Synchronize internal state whenever state from parent changes
  useEffect(() => {
    if (state.finalAtaText !== undefined && state.finalAtaText !== transcript) {
      setTranscript(state.finalAtaText || '');
    }
  }, [state.finalAtaText]);

  useEffect(() => {
    if (state.finalAtaData !== undefined) {
      setDraftData(state.finalAtaData || null);
    }
  }, [state.finalAtaData]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    
    setLoadingExtract(true);
    setError('');
    
    const formData = new FormData();
    Array.from(e.target.files).forEach((file: File) => {
      formData.append('files', file);
    });

    try {
      const data = await safeFetchJson<{ text: string }>('/api/extract-text', {
        method: 'POST',
        body: formData
      });
      
      const newText = data.text || '';
      setTranscript(newText);
      updateState({ finalAtaText: newText });

      // If abertura has blank fields, attempt to extract metadata
      if (onMetadataDetected) {
        safeFetchJson<{ metadata?: Partial<AberturaData> }>('/api/extract-metadata', { method: 'POST', body: formData })
          .then(resJson => {
            if (resJson?.metadata) {
              const meta = resJson.metadata;
              if (meta.obraCodigo || meta.fornecedor || meta.assunto || meta.servico) {
                onMetadataDetected(meta);
              }
            }
          })
          .catch(() => {});
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao extrair texto do arquivo');
    } finally {
      setLoadingExtract(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const draftFinalAta = async () => {
    if (!transcript.trim()) {
      setError('Por favor, insira a transcrição ou anotações da reunião.');
      return;
    }

    setLoadingDraft(true);
    setError('');
    
    try {
      const data = await safeFetchJson<FinalAtaData>('/api/draft-final-ata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abertura: state.abertura,
          analysisResult: state.analysisResult,
          divergences: state.divergences,
          transcript
        })
      });
      
      setDraftData(data);
      setIsDraftExpanded(true);
      updateState({ finalAtaData: data, finalAtaText: transcript });
    } catch (err: any) {
      setError(err.message || 'Erro ao rascunhar Ata Final');
    } finally {
      setLoadingDraft(false);
    }
  };

  const generateFinalDocx = async () => {
    if (hasTemplate === false) {
      setIsWarningModalOpen(true);
      return;
    }

    if (!draftData) {
      setError('Por favor, analise a transcrição antes de gerar o documento.');
      return;
    }

    setLoadingDocx(true);
    setError('');
    
    try {
      const res = await fetch('/api/generate-final-ata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abertura: state.abertura,
          analysisResult: state.analysisResult,
          divergences: state.divergences,
          transcript,
          finalAtaData: draftData
        })
      });
      
      if (!res.ok) {
        const text = await res.text();
        let errMsg = 'Falha ao gerar o arquivo DOCX da Ata Final';
        try {
          const errObj = JSON.parse(text);
          if (errObj?.error) {
            errMsg = errObj.error;
            if (errMsg.includes('Template DOCX') || errMsg.includes('template')) {
              setIsWarningModalOpen(true);
            }
          }
        } catch {
          // not json
        }
        throw new Error(errMsg);
      }
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Ata_Final_${state.abertura?.obraCodigo || 'Reuniao'}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      updateState({ finalAtaGenerated: true, finalAtaData: draftData });
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar Ata Final');
    } finally {
      setLoadingDocx(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-semibold text-slate-800">Ata Final</h2>
        <p className="text-sm text-slate-500 mt-1">
          Cole a transcrição da reunião ou anexe documentos. A IA integrará os contextos de Checklist, Propostas e Transcrição para estruturar a Ata oficial no formato do Template DOCX sem quebrar a formatação.
        </p>
      </div>

      <div className="space-y-4">
        {/* Importar Transcrição / Áudio / Documentos */}
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <UploadCloud size={16} className="text-blue-600" />
              Importar Transcrição ou Ata da Reunião
            </span>
            <span className="text-[10px] text-slate-400 font-medium">PDF, DOCX, TXT</span>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Carregue o arquivo com a ata bruta ou transcrição da reunião de negociação realizada com o fornecedor.
          </p>

          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileSelect} 
            multiple 
            accept=".pdf,.docx,.doc,.txt"
            className="hidden" 
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loadingExtract}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-slate-300 hover:border-blue-500 hover:bg-blue-50/30 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-all disabled:opacity-50"
          >
            {loadingExtract ? (
              <>
                <Loader2 size={16} className="animate-spin text-blue-600" />
                Extraindo Conteúdo do Arquivo...
              </>
            ) : (
              <>
                <UploadCloud size={16} className="text-blue-600" />
                Selecionar Arquivo de Transcrição
              </>
            )}
          </button>
        </div>

        {/* Textarea da Transcrição com Collapse/Expand */}
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
          <div className="space-y-0">
            <button
              type="button"
              onClick={() => setIsTextareaExpanded(!isTextareaExpanded)}
              className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100/80 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Texto da Transcrição / Registro da Reunião
                </span>
                {transcript.trim() ? (
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                    {transcript.length.toLocaleString('pt-BR')} caracteres
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">
                    (Vazio - nenhum documento anexado)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-xs font-semibold text-blue-600">
                <span>{isTextareaExpanded ? 'Recolher' : 'Expandir'}</span>
                {isTextareaExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>

            {isTextareaExpanded && (
              <div className="p-3 border-t border-slate-200 bg-white space-y-2">
                <textarea 
                  value={transcript}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTranscript(val);
                    updateState({ finalAtaText: val });
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors min-h-[180px] resize-y font-sans leading-relaxed shadow-inner"
                  placeholder="Cole aqui o texto da transcrição gerada na reunião ou faça o upload acima para preencher automaticamente..."
                />
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200">{error}</p>}

        {/* Revisão Estruturada da Ata Final */}
        {draftData && (
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white transition-all duration-200 animate-in fade-in slide-in-from-top-4">
            <button
              type="button"
              onClick={() => setIsDraftExpanded(!isDraftExpanded)}
              className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100/80 transition-colors text-left border-b border-slate-200"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex items-center justify-center bg-blue-600 text-white font-bold rounded-full w-6 h-6 text-xs shadow-xs">2</span>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Revisão Estruturada dos Campos do Template
                  </h3>
                  <p className="text-xs text-slate-500">
                    {draftData.agreedItems?.length || 0} itens acordados • {draftData.pendingItems?.length || 0} pendentes
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors">
                <span>{isDraftExpanded ? 'Recolher Revisão' : 'Expandir Revisão'}</span>
                {isDraftExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </button>
            
            {isDraftExpanded && (
              <div className="p-5 space-y-4 bg-white">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-green-600" /> Itens Acordados / Deliberações
                    </label>
                    <textarea 
                      value={draftData.agreedItems.join('\n')}
                      onChange={(e) => setDraftData({...draftData, agreedItems: e.target.value.split('\n')})}
                      className="w-full bg-white border border-slate-200 rounded p-3 text-sm focus:outline-none focus:border-blue-500 min-h-[140px] resize-y"
                    />
                  </div>

                  <div className="space-y-2 bg-red-50/40 p-4 rounded-lg border border-red-200">
                    <label className="text-xs font-bold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                      <Edit3 size={14} className="text-red-600" /> Pendências e Prazos (Destacados em Vermelho no .docx)
                    </label>
                    <textarea 
                      value={draftData.pendingItems.join('\n')}
                      onChange={(e) => setDraftData({...draftData, pendingItems: e.target.value.split('\n')})}
                      className="w-full bg-white border border-red-200 rounded p-3 text-sm text-red-800 focus:outline-none focus:border-red-500 min-h-[140px] resize-y"
                      placeholder="Itens pendentes inseridos aqui serão destacados com fonte vermelha no documento DOCX..."
                    />
                  </div>
                </div>

                <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquareText size={14} className="text-blue-600" /> Resumo Executivo / Anotações Gerais
                  </label>
                  <textarea 
                    value={draftData.notes}
                    onChange={(e) => setDraftData({...draftData, notes: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded p-3 text-sm focus:outline-none focus:border-blue-500 min-h-[110px] resize-y"
                  />
                </div>

                {state.finalAtaGenerated && (
                  <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-lg border border-green-200">
                    <CheckCircle2 size={16} />
                    Ata Final gerada com sucesso no formato oficial do template!
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bloco de Ações Principais: Analisar Transcrição e (Abaixo) Gerar e Baixar Ata Final */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {transcript.trim() ? (
              <span className="text-emerald-700 font-medium flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-emerald-600" />
                Transcrição pronta ({transcript.length.toLocaleString('pt-BR')} caracteres)
              </span>
            ) : (
              <span className="text-slate-400">Anexe ou digite a transcrição para habilitar a análise</span>
            )}
          </div>

          <button
            type="button"
            onClick={draftFinalAta}
            disabled={loadingDraft || !transcript.trim()}
            className="flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg uppercase tracking-tight shadow-md hover:shadow-lg disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none transition-all ml-auto"
            title="Analisa a transcrição integrando o contexto do Checklist, Propostas e Divergências no padrão do template"
          >
            {loadingDraft ? (
              <>
                <Loader2 size={16} className="animate-spin text-white" />
                Analisando Transcrição e Contextos...
              </>
            ) : (
              <>
                <Sparkles size={16} className="text-blue-300" />
                {draftData ? 'Reanalisar Transcrição' : 'Analisar Transcrição'}
              </>
            )}
          </button>
        </div>

        {/* SOMENTE APÓS a transcrição ser analisada (draftData existente): Botão de Gerar e Baixar Ata Final renderizado diretamente ABAIXO */}
        {draftData && (
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-blue-50/60 p-4 rounded-xl border border-blue-100 animate-in fade-in slide-in-from-top-2">
            <div className="text-xs text-slate-600 space-y-0.5">
              <p className="font-bold text-slate-800 flex items-center gap-1.5">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                Transcrição e Contextos Analisados com Sucesso
              </p>
              <p className="text-[11px] text-slate-500">
                Os dados de Checklist, Divergências/Complementos e Transcrição foram estruturados e estão prontos para preencher o Template DOCX {activeTemplateName ? `("${activeTemplateName}")` : ''} com fidelidade total de layout.
              </p>
            </div>

            <button
              type="button"
              onClick={generateFinalDocx}
              disabled={loadingDocx}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg uppercase tracking-tight shadow-lg shadow-blue-200 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none transition-all shrink-0"
              title="Gera e baixa o arquivo DOCX final preenchido a partir do template"
            >
              {loadingDocx ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Gerando Documento DOCX...
                </>
              ) : (
                <>
                  <FileDown size={18} />
                  Gerar e Baixar Ata Final (.docx)
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Warning Modal if no template is saved */}
      <TemplateWarningModal
        isOpen={isWarningModalOpen}
        onClose={() => setIsWarningModalOpen(false)}
        onNavigateToTemplates={() => {
          setIsWarningModalOpen(false);
          onNavigateToTemplates?.();
        }}
        onTemplateUploaded={() => {
          checkTemplateStatus();
        }}
      />
    </div>
  );
}

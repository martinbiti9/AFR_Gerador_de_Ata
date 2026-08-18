import React, { useState, useRef, useEffect } from 'react';
import { AppState, FinalAtaData, FinalAtaItem, AberturaData } from '../types';
import { 
  FileDown, 
  Loader2, 
  CheckCircle2, 
  MessageSquareText, 
  UploadCloud, 
  Edit3, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  Plus, 
  Trash2, 
  Calendar, 
  User, 
  AlignLeft, 
  LayoutList,
  AlertCircle
} from 'lucide-react';
import { safeFetchJson, safeFetchBlob } from '../utils/api';
import { TemplateWarningModal } from './TemplateWarningModal';
import { FinalAtaValidationModal } from './FinalAtaValidationModal';

interface Props {
  state: AppState;
  updateState: (updates: Partial<AppState>) => void;
  onMetadataDetected?: (data: Partial<AberturaData>) => void;
  onNavigateToTemplates?: () => void;
}

// Normalize any item (string or object) to a structured FinalAtaItem
function toItemObject(item: string | FinalAtaItem, index: number, defaultResp: string = 'Contratada'): FinalAtaItem {
  if (typeof item === 'object' && item !== null) {
    return {
      num: item.num || String(index + 1).padStart(2, '0'),
      titulo: item.titulo || `Item ${index + 1}`,
      descricao: item.descricao || (item as any).text || item.titulo || '',
      responsavel: item.responsavel || defaultResp,
      prazo: item.prazo || 'Conforme cronograma',
      blocos: item.blocos
    };
  }

  const str = String(item || '').trim();
  return {
    num: String(index + 1).padStart(2, '0'),
    titulo: str.length > 50 ? `${str.slice(0, 47)}...` : (str || `Item ${index + 1}`),
    descricao: str,
    responsavel: defaultResp,
    prazo: 'Conforme cronograma'
  };
}

// Convert an item to a human-readable text line
function itemToPlainText(item: string | FinalAtaItem): string {
  if (!item) return '';
  if (typeof item === 'string') return item;

  const parts: string[] = [];
  if (item.titulo) parts.push(item.titulo);
  if (item.descricao && item.descricao !== item.titulo) parts.push(item.descricao);

  let main = parts.join(' - ');
  const meta: string[] = [];
  if (item.responsavel) meta.push(`Resp: ${item.responsavel}`);
  if (item.prazo) meta.push(`Prazo: ${item.prazo}`);

  if (meta.length > 0) {
    main = main ? `${main} (${meta.join(' | ')})` : meta.join(' | ');
  }

  return main || '';
}

// Convert multi-line text to structured items
function plainTextToItems(text: string, defaultResp: string = 'Contratada'): FinalAtaItem[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  return lines.map((line, idx) => toItemObject(line, idx, defaultResp));
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
  const [editMode, setEditMode] = useState<'cards' | 'raw'>('cards');
  const [isValidatingModalOpen, setIsValidatingModalOpen] = useState(false);

  const checkTemplateStatus = async () => {
    try {
      const data = await safeFetchJson('/api/admin/templates');
      if (data) {
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
      setIsTextareaExpanded(true);
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

    setIsValidatingModalOpen(true);
  };

  const handleSaveAndGenerateValidation = async (updated: {
    abertura: AberturaData | null;
    finalAtaData: FinalAtaData;
  }) => {
    setLoadingDocx(true);
    setError('');

    try {
      setDraftData(updated.finalAtaData);
      updateState({
        abertura: updated.abertura,
        finalAtaData: updated.finalAtaData
      });

      const blob = await safeFetchBlob('/api/generate-final-ata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abertura: updated.abertura,
          analysisResult: state.analysisResult,
          divergences: state.divergences,
          transcript,
          finalAtaData: updated.finalAtaData
        })
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Ata_Final_${updated.abertura?.obraCodigo || 'Reuniao'}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      updateState({ finalAtaGenerated: true, finalAtaData: updated.finalAtaData });
      setIsValidatingModalOpen(false);
    } catch (err: any) {
      const errMsg = err.message || 'Erro ao gerar Ata Final';
      if (errMsg.includes('Template DOCX') || errMsg.includes('template')) {
        setIsWarningModalOpen(true);
      }
      setError(errMsg);
    } finally {
      setLoadingDocx(false);
    }
  };

  // Structured Item Manipulation Handlers
  const updateAgreedItem = (index: number, field: keyof FinalAtaItem, value: string) => {
    if (!draftData) return;
    const currentList = [...(draftData.agreedItems || [])];
    const currentObj = toItemObject(currentList[index], index, state.abertura?.fornecedor || 'Contratada');
    currentList[index] = { ...currentObj, [field]: value };
    const nextData = { ...draftData, agreedItems: currentList };
    setDraftData(nextData);
    updateState({ finalAtaData: nextData });
  };

  const removeAgreedItem = (index: number) => {
    if (!draftData) return;
    const currentList = draftData.agreedItems.filter((_, idx) => idx !== index);
    const nextData = { ...draftData, agreedItems: currentList };
    setDraftData(nextData);
    updateState({ finalAtaData: nextData });
  };

  const addAgreedItem = () => {
    if (!draftData) return;
    const currentList = [...(draftData.agreedItems || [])];
    const newIdx = currentList.length;
    currentList.push({
      num: String(newIdx + 1).padStart(2, '0'),
      titulo: 'Novo Acordo / Deliberação',
      descricao: '',
      responsavel: state.abertura?.fornecedor || 'Contratada',
      prazo: 'Conforme cronograma'
    });
    const nextData = { ...draftData, agreedItems: currentList };
    setDraftData(nextData);
    updateState({ finalAtaData: nextData });
  };

  const updatePendingItem = (index: number, field: keyof FinalAtaItem, value: string) => {
    if (!draftData) return;
    const currentList = [...(draftData.pendingItems || [])];
    const currentObj = toItemObject(currentList[index], index, 'Fornecedor / Engenharia');
    currentList[index] = { ...currentObj, [field]: value };
    const nextData = { ...draftData, pendingItems: currentList };
    setDraftData(nextData);
    updateState({ finalAtaData: nextData });
  };

  const removePendingItem = (index: number) => {
    if (!draftData) return;
    const currentList = draftData.pendingItems.filter((_, idx) => idx !== index);
    const nextData = { ...draftData, pendingItems: currentList };
    setDraftData(nextData);
    updateState({ finalAtaData: nextData });
  };

  const addPendingItem = () => {
    if (!draftData) return;
    const currentList = [...(draftData.pendingItems || [])];
    const newIdx = currentList.length;
    currentList.push({
      num: String(newIdx + 1).padStart(2, '0'),
      titulo: 'Nova Pendência de Documento / Prazo',
      descricao: '',
      responsavel: state.abertura?.fornecedor || 'Fornecedor / Engenharia',
      prazo: 'A definir'
    });
    const nextData = { ...draftData, pendingItems: currentList };
    setDraftData(nextData);
    updateState({ finalAtaData: nextData });
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
            <div className="w-full flex items-center justify-between p-4 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <span className="flex items-center justify-center bg-blue-600 text-white font-bold rounded-full w-6 h-6 text-xs shadow-xs">2</span>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Revisão Estruturada dos Campos do Template
                  </h3>
                  <p className="text-xs text-slate-500">
                    {draftData.agreedItems?.length || 0} itens acordados • {draftData.pendingItems?.length || 0} pendências
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* View Switcher: Cards vs Text */}
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setEditMode('cards')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all ${
                      editMode === 'cards' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <LayoutList size={13} />
                    Cards
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditMode('raw')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-all ${
                      editMode === 'raw' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <AlignLeft size={13} />
                    Texto Rápido
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsDraftExpanded(!isDraftExpanded)}
                  className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg border border-blue-200 transition-colors"
                >
                  <span>{isDraftExpanded ? 'Recolher' : 'Expandir'}</span>
                  {isDraftExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
            </div>
            
            {isDraftExpanded && (
              <div className="p-5 space-y-6 bg-white">
                {editMode === 'cards' ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* ITENS ACORDADOS / DELIBERAÇÕES */}
                    <div className="space-y-3 bg-emerald-50/30 p-4 rounded-xl border border-emerald-200/80">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                          <CheckCircle2 size={15} className="text-emerald-600" />
                          Itens Acordados / Deliberações ({draftData.agreedItems?.length || 0})
                        </label>
                        <button
                          type="button"
                          onClick={addAgreedItem}
                          className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 hover:bg-emerald-200/80 px-2 py-1 rounded-md transition-colors"
                        >
                          <Plus size={13} />
                          Adicionar Acordo
                        </button>
                      </div>

                      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                        {(!draftData.agreedItems || draftData.agreedItems.length === 0) ? (
                          <div className="p-6 text-center text-xs text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
                            Nenhum item de acordo registrado. Clique em "+ Adicionar Acordo" para inserir.
                          </div>
                        ) : (
                          draftData.agreedItems.map((rawItem, idx) => {
                            const item = toItemObject(rawItem, idx, state.abertura?.fornecedor || 'Contratada');
                            return (
                              <div 
                                key={`agreed-${idx}`}
                                className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs space-y-2.5 transition-all hover:border-emerald-300"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-1">
                                    <span className="text-[11px] font-mono font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                                      #{item.num || String(idx + 1).padStart(2, '0')}
                                    </span>
                                    <input 
                                      type="text"
                                      value={item.titulo || ''}
                                      onChange={(e) => updateAgreedItem(idx, 'titulo', e.target.value)}
                                      placeholder="Título da deliberação / assunto..."
                                      className="flex-1 text-xs font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-emerald-500 focus:outline-none px-1 py-0.5"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeAgreedItem(idx)}
                                    className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors"
                                    title="Remover este item"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>

                                <textarea 
                                  value={item.descricao || ''}
                                  onChange={(e) => updateAgreedItem(idx, 'descricao', e.target.value)}
                                  placeholder="Descrição detalhada do acordo e deliberação técnica/comercial..."
                                  rows={2}
                                  className="w-full text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 focus:outline-none focus:border-emerald-500 focus:bg-white resize-y"
                                />

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded">
                                    <User size={12} className="text-slate-400 shrink-0" />
                                    <input 
                                      type="text"
                                      value={item.responsavel || ''}
                                      onChange={(e) => updateAgreedItem(idx, 'responsavel', e.target.value)}
                                      placeholder="Responsável"
                                      className="w-full text-[11px] text-slate-700 bg-transparent focus:outline-none"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded">
                                    <Calendar size={12} className="text-slate-400 shrink-0" />
                                    <input 
                                      type="text"
                                      value={item.prazo || ''}
                                      onChange={(e) => updateAgreedItem(idx, 'prazo', e.target.value)}
                                      placeholder="Prazo"
                                      className="w-full text-[11px] text-slate-700 bg-transparent focus:outline-none"
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* PENDÊNCIAS E PRAZOS */}
                    <div className="space-y-3 bg-red-50/40 p-4 rounded-xl border border-red-200">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-red-700 uppercase tracking-wider flex items-center gap-1.5">
                          <Edit3 size={15} className="text-red-600" />
                          Pendências e Prazos ({draftData.pendingItems?.length || 0})
                        </label>
                        <button
                          type="button"
                          onClick={addPendingItem}
                          className="flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-100 hover:bg-red-200/80 px-2 py-1 rounded-md transition-colors"
                        >
                          <Plus size={13} />
                          Adicionar Pendência
                        </button>
                      </div>

                      <p className="text-[11px] text-red-600/90 leading-tight">
                        Itens pendentes serão destacados em fonte vermelha no documento DOCX gerado.
                      </p>

                      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                        {(!draftData.pendingItems || draftData.pendingItems.length === 0) ? (
                          <div className="p-6 text-center text-xs text-slate-400 bg-white rounded-lg border border-dashed border-red-200">
                            Nenhuma pendência em aberto. Clique em "+ Adicionar Pendência" se houver entregas pendentes.
                          </div>
                        ) : (
                          draftData.pendingItems.map((rawItem, idx) => {
                            const item = toItemObject(rawItem, idx, 'Fornecedor / Engenharia');
                            return (
                              <div 
                                key={`pending-${idx}`}
                                className="bg-white p-3.5 rounded-lg border border-red-200 shadow-2xs space-y-2.5 transition-all hover:border-red-400"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-1">
                                    <span className="text-[11px] font-mono font-bold bg-red-100 text-red-800 px-1.5 py-0.5 rounded">
                                      #{item.num || String(idx + 1).padStart(2, '0')}
                                    </span>
                                    <input 
                                      type="text"
                                      value={item.titulo || ''}
                                      onChange={(e) => updatePendingItem(idx, 'titulo', e.target.value)}
                                      placeholder="Título da pendência / documento..."
                                      className="flex-1 text-xs font-bold text-red-900 bg-transparent border-b border-transparent hover:border-red-200 focus:border-red-500 focus:outline-none px-1 py-0.5"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removePendingItem(idx)}
                                    className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors"
                                    title="Remover esta pendência"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>

                                <textarea 
                                  value={item.descricao || ''}
                                  onChange={(e) => updatePendingItem(idx, 'descricao', e.target.value)}
                                  placeholder="Descrição da obrigação ou documento pendente de entrega..."
                                  rows={2}
                                  className="w-full text-xs text-red-900 bg-red-50/30 border border-red-200 rounded p-2 focus:outline-none focus:border-red-500 focus:bg-white resize-y"
                                />

                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded">
                                    <User size={12} className="text-slate-400 shrink-0" />
                                    <input 
                                      type="text"
                                      value={item.responsavel || ''}
                                      onChange={(e) => updatePendingItem(idx, 'responsavel', e.target.value)}
                                      placeholder="Responsável"
                                      className="w-full text-[11px] text-slate-700 bg-transparent focus:outline-none"
                                    />
                                  </div>
                                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded">
                                    <Calendar size={12} className="text-slate-400 shrink-0" />
                                    <input 
                                      type="text"
                                      value={item.prazo || ''}
                                      onChange={(e) => updatePendingItem(idx, 'prazo', e.target.value)}
                                      placeholder="Prazo"
                                      className="w-full text-[11px] text-slate-700 bg-transparent focus:outline-none"
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Modo Texto Rápido com conversão limpa */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 size={14} className="text-green-600" /> 
                        Itens Acordados / Deliberações (Edição Rápida de Texto)
                      </label>
                      <textarea 
                        value={(draftData.agreedItems || []).map(itemToPlainText).join('\n')}
                        onChange={(e) => {
                          const items = plainTextToItems(e.target.value, state.abertura?.fornecedor || 'Contratada');
                          const nextData = { ...draftData, agreedItems: items };
                          setDraftData(nextData);
                          updateState({ finalAtaData: nextData });
                        }}
                        placeholder="Cada linha será um item acordado na Ata Final..."
                        className="w-full bg-white border border-slate-200 rounded p-3 text-xs focus:outline-none focus:border-blue-500 min-h-[220px] resize-y leading-relaxed font-mono"
                      />
                    </div>

                    <div className="space-y-2 bg-red-50/40 p-4 rounded-lg border border-red-200">
                      <label className="text-xs font-bold text-red-600 uppercase tracking-wider flex items-center gap-1.5">
                        <Edit3 size={14} className="text-red-600" /> 
                        Pendências e Prazos (Edição Rápida de Texto)
                      </label>
                      <textarea 
                        value={(draftData.pendingItems || []).map(itemToPlainText).join('\n')}
                        onChange={(e) => {
                          const items = plainTextToItems(e.target.value, 'Fornecedor / Engenharia');
                          const nextData = { ...draftData, pendingItems: items };
                          setDraftData(nextData);
                          updateState({ finalAtaData: nextData });
                        }}
                        placeholder="Cada linha será destacada em vermelho no DOCX final..."
                        className="w-full bg-white border border-red-200 rounded p-3 text-xs text-red-800 focus:outline-none focus:border-red-500 min-h-[220px] resize-y leading-relaxed font-mono"
                      />
                    </div>
                  </div>
                )}

                {/* Resumo Executivo / Anotações Gerais */}
                <div className="space-y-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquareText size={14} className="text-blue-600" /> Resumo Executivo / Anotações Gerais da Reunião
                  </label>
                  <textarea 
                    value={draftData.notes || ''}
                    onChange={(e) => {
                      const nextData = { ...draftData, notes: e.target.value };
                      setDraftData(nextData);
                      updateState({ finalAtaData: nextData });
                    }}
                    placeholder="Resumo executivo dos pontos acordados e encaminhamentos gerais..."
                    rows={3}
                    className="w-full bg-white border border-slate-200 rounded p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 min-h-[90px] resize-y leading-relaxed"
                  />
                </div>

                {state.finalAtaGenerated && (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 p-3.5 rounded-lg border border-green-200">
                    <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                    Ata Final gerada com sucesso e formatada com fidelidade ao template oficial!
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

      {/* Validation Modal before generating Final DOCX */}
      {draftData && (
        <FinalAtaValidationModal
          isOpen={isValidatingModalOpen}
          onClose={() => setIsValidatingModalOpen(false)}
          abertura={state.abertura}
          draftData={draftData}
          activeTemplateName={activeTemplateName}
          onSaveAndGenerate={handleSaveAndGenerateValidation}
          loading={loadingDocx}
        />
      )}

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

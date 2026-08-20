import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Wand2, 
  ArrowRight, 
  ArrowLeft, 
  UploadCloud, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  Sparkles, 
  Download, 
  AlertTriangle,
  Building2,
  FileCheck,
  Check,
  Zap,
  Edit3,
  ChevronDown,
  ChevronUp,
  Layers,
  HelpCircle
} from 'lucide-react';
import { AppState, AberturaData, AnalysisResult, Divergence, FinalAtaData } from '../types';
import { saveMeeting } from '../lib/db';
import { safeFetchJson, safeFetchBlob } from '../utils/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  updateState: (updates: Partial<AppState>) => void;
}

export function WizardModal({ isOpen, onClose, state, updateState }: Props) {
  // 3-Step Streamlined Express Wizard
  const [currentStep, setCurrentStep] = useState<number>(1);
  
  // Metadata / Abertura state
  const [abertura, setAbertura] = useState<AberturaData>(() => state.abertura || {
    obraCodigo: '',
    obraNome: '',
    assunto: '',
    fornecedor: '',
    servico: '',
    rm: '',
    cot: '',
  });

  const [showMetadataEditor, setShowMetadataEditor] = useState(false);
  const [autoExtracted, setAutoExtracted] = useState(false);
  const [extractingMetadata, setExtractingMetadata] = useState(false);

  // Files state
  const [checklistFiles, setChecklistFiles] = useState<File[]>([]);
  const [proposalFiles, setProposalFiles] = useState<File[]>([]);
  const [transcriptFiles, setTranscriptFiles] = useState<File[]>([]);
  const [transcriptText, setTranscriptText] = useState<string>(state.finalAtaText || '');

  // Progress & Execution States
  const [analyzingDocuments, setAnalyzingDocuments] = useState(false);
  const [processingSonnet, setProcessingSonnet] = useState(false);
  const [draftingAta, setDraftingAta] = useState(false);
  const [generatingPreAtaDocx, setGeneratingPreAtaDocx] = useState(false);
  const [generatingFinalAtaDocx, setGeneratingFinalAtaDocx] = useState(false);
  const [sonnetResult, setSonnetResult] = useState<string>(state.sonnetAnalysis || '');
  const [error, setError] = useState<string>('');

  // Refs for inputs
  const checklistInputRef = useRef<HTMLInputElement>(null);
  const proposalInputRef = useRef<HTMLInputElement>(null);
  const transcriptInputRef = useRef<HTMLInputElement>(null);

  // Sync with global state when opening, resetting if empty
  useEffect(() => {
    if (isOpen) {
      setAbertura(state.abertura || {
        obraCodigo: '',
        obraNome: '',
        assunto: '',
        fornecedor: '',
        servico: '',
        rm: '',
        cot: '',
      });
      setTranscriptText(state.finalAtaText || '');
      setSonnetResult(state.sonnetAnalysis || '');
      setChecklistFiles([]);
      setProposalFiles([]);
      setTranscriptFiles([]);
      setCurrentStep(1);
    }
  }, [isOpen, state.abertura, state.finalAtaText, state.sonnetAnalysis]);

  if (!isOpen) return null;

  // Auto-detect metadata from uploaded files (Checklist, Proposal or Transcript)
  const triggerAutoMetadataExtraction = async (filesToScan?: File[]) => {
    const allFiles = filesToScan || [...checklistFiles, ...proposalFiles, ...transcriptFiles];
    if (allFiles.length === 0 && !transcriptText.trim()) return;

    setExtractingMetadata(true);
    setError('');

    try {
      const formData = new FormData();
      allFiles.forEach((f: File) => formData.append('files', f));
      if (transcriptText.trim()) {
        formData.append('text', transcriptText);
      }

      const data = await safeFetchJson<{ metadata?: Partial<AberturaData> }>('/api/extract-metadata', {
        method: 'POST',
        body: formData
      });
      
      if (data && data.metadata) {
        const meta = data.metadata;
        const merged: AberturaData = {
          obraCodigo: meta.obraCodigo || abertura.obraCodigo || '',
          obraNome: meta.obraNome || abertura.obraNome || '',
          fornecedor: meta.fornecedor || abertura.fornecedor || '',
          assunto: meta.assunto || abertura.assunto || '',
          servico: meta.servico || abertura.servico || '',
          rm: meta.rm || abertura.rm || '',
          cot: meta.cot || abertura.cot || '',
        };
        setAbertura(merged);
        setAutoExtracted(true);
        setShowMetadataEditor(true);
        updateState({ abertura: merged });
      }
    } catch (err: any) {
      console.warn('Aviso na extração de metadados:', err);
    } finally {
      setExtractingMetadata(false);
    }
  };

  const handleChecklistFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    setChecklistFiles(files);
    // Trigger smart auto-metadata extraction if fields are empty
    if (!abertura.obraCodigo || !abertura.fornecedor) {
      triggerAutoMetadataExtraction([...files, ...proposalFiles]);
    }
  };

  const handleProposalFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    setProposalFiles(files);
    // Trigger smart auto-metadata extraction if fields are empty
    if (!abertura.obraCodigo || !abertura.fornecedor) {
      triggerAutoMetadataExtraction([...checklistFiles, ...files]);
    }
  };

  const handleTranscriptFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const fileList = Array.from(e.target.files);
    setTranscriptFiles(fileList);
    setError('');

    const formData = new FormData();
    fileList.forEach((f: File) => formData.append('files', f));

    try {
      const data = await safeFetchJson<{ text: string }>('/api/extract-text', {
        method: 'POST',
        body: formData
      });
      
      const extracted = (typeof data === 'string' ? data : (data?.text || (data as any)?.result || (data as any)?.data || '')).trim();
      const newText = transcriptText ? transcriptText + '\n\n' + extracted : extracted;
      setTranscriptText(newText);
      updateState({ finalAtaText: newText });

      if (!abertura.obraCodigo || !abertura.fornecedor) {
        triggerAutoMetadataExtraction();
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao extrair transcrição');
    }
  };

  const handleNextStep = async () => {
    setError('');
    
    // STEP 1 -> Process Checklist and Divergences with IA
    if (currentStep === 1) {
      if (checklistFiles.length === 0 && !state.analysisResult && !transcriptText.trim()) {
        setError('Por favor, faça o upload de ao menos um arquivo de Checklist ou Transcrição para continuar.');
        return;
      }

      setAnalyzingDocuments(true);
      try {
        let currentAnalysis = state.analysisResult;
        let currentDivergences = state.divergences;

        // 1. Process Checklist
        if (checklistFiles.length > 0 && !currentAnalysis) {
          const checklistFormData = new FormData();
          checklistFiles.forEach((f: File) => checklistFormData.append('files', f));
          currentAnalysis = await safeFetchJson<AnalysisResult>('/api/analyze-checklist', {
            method: 'POST',
            body: checklistFormData
          });
        }

        // 2. Process Proposal Divergences
        if (proposalFiles.length > 0 && currentDivergences.length === 0 && currentAnalysis) {
          const propFormData = new FormData();
          proposalFiles.forEach((f: File) => propFormData.append('files', f));
          propFormData.append('checklist', JSON.stringify(currentAnalysis));
          try {
            currentDivergences = await safeFetchJson<Divergence[]>('/api/analyze-proposal', {
              method: 'POST',
              body: propFormData
            });
          } catch (propErr) {
            console.warn('Erro na proposta:', propErr);
          }
        }

        updateState({
          abertura,
          analysisResult: currentAnalysis,
          divergences: currentDivergences,
          step: 3
        });

        setCurrentStep(2);
      } catch (err: any) {
        setError(err.message || 'Erro ao processar documentos com IA');
      } finally {
        setAnalyzingDocuments(false);
      }
      return;
    }

    // STEP 2 -> Advance to Finalize Step
    if (currentStep === 2) {
      setCurrentStep(3);
      return;
    }

    // STEP 3 -> Finalize and Save
    if (currentStep === 3) {
      if (transcriptText.trim() && !state.finalAtaData) {
        setDraftingAta(true);
        try {
          const data = await safeFetchJson<FinalAtaData>('/api/draft-final-ata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              abertura,
              analysisResult: state.analysisResult,
              divergences: state.divergences,
              transcript: transcriptText
            })
          });
          updateState({ finalAtaData: data });
        } catch (err: any) {
          console.warn('Aviso ao gerar rascunho de Ata Final:', err);
        } finally {
          setDraftingAta(false);
        }
      }

      await saveMeeting({
        ...state,
        abertura,
        finalAtaText: transcriptText,
        sonnetAnalysis: sonnetResult,
        step: 5,
        preAtaGenerated: true,
        finalAtaGenerated: !!state.finalAtaData
      });

      onClose();
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
      setError('');
    }
  };

  // Process Sonnet 5
  const handleSonnetExtract = async () => {
    if (!transcriptText.trim()) {
      setError('Insira a transcrição ou anotações para processar com Sonnet 5.');
      return;
    }
    setProcessingSonnet(true);
    setError('');
    try {
      const data = await safeFetchJson<{ resultado: string }>('/api/process-sonnet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textoAta: transcriptText })
      });
      setSonnetResult(data.resultado);
      updateState({ sonnetAnalysis: data.resultado });
    } catch (err: any) {
      setError(err.message || 'Falha ao processar com Sonnet 5');
    } finally {
      setProcessingSonnet(false);
    }
  };

  // Download Pré-Ata
  const downloadPreAta = async () => {
    setGeneratingPreAtaDocx(true);
    try {
      const blob = await safeFetchBlob('/api/generate-pre-ata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abertura,
          analysisResult: state.analysisResult,
          divergences: state.divergences
        })
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Pre_Ata_${abertura.obraCodigo || 'Obra'}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      updateState({ preAtaGenerated: true });
    } catch (err: any) {
      alert('Erro ao baixar Pré-Ata DOCX: ' + err.message);
    } finally {
      setGeneratingPreAtaDocx(false);
    }
  };

  // Download Ata Final
  const downloadFinalAta = async () => {
    setGeneratingFinalAtaDocx(true);
    try {
      const blob = await safeFetchBlob('/api/generate-final-ata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abertura,
          analysisResult: state.analysisResult,
          divergences: state.divergences,
          transcript: transcriptText,
          finalAtaData: state.finalAtaData
        })
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Ata_Final_${abertura.obraCodigo || 'Obra'}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      updateState({ finalAtaGenerated: true });
    } catch (err: any) {
      alert('Erro ao baixar Ata Final DOCX: ' + err.message);
    } finally {
      setGeneratingFinalAtaDocx(false);
    }
  };

  const stepsList = [
    { num: 1, label: '1. Uploads & Auto-Identificação' },
    { num: 2, label: '2. Regras & Divergências' },
    { num: 3, label: '3. Transcrição & Artefatos' },
  ];

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-xl backdrop-blur-xs">
              <Wand2 size={22} className="text-blue-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight">Modo Wizard Express (3 Etapas)</h2>
                <span className="text-[10px] bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                  <Zap size={11} /> Auto-Extração Ativa
                </span>
              </div>
              <p className="text-xs text-blue-100/80">Upload rápido dos arquivos com identificação automática dos dados da obra e geração de atas.</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Stepper Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3">
          <div className="flex items-center justify-between">
            {stepsList.map((st) => {
              const isActive = currentStep === st.num;
              const isDone = currentStep > st.num;

              return (
                <div key={st.num} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isDone 
                      ? 'bg-emerald-600 text-white shadow-xs' 
                      : isActive 
                        ? 'bg-blue-600 text-white ring-4 ring-blue-100 shadow-xs' 
                        : 'bg-slate-200 text-slate-500'
                  }`}>
                    {isDone ? <Check size={14} /> : st.num}
                  </div>
                  <span className={`text-xs font-semibold ${
                    isActive ? 'text-blue-700' : isDone ? 'text-slate-700' : 'text-slate-400'
                  }`}>
                    {st.label}
                  </span>
                  {st.num < 3 && <div className="w-8 sm:w-16 h-0.5 bg-slate-200 mx-2 hidden xs:block" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-100/30">
          
          {error && (
            <div className="flex items-center gap-2 p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs animate-in fade-in">
              <AlertTriangle size={16} className="shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {/* ================= STEP 1: UPLOADS & AUTO-EXTRACTION ================= */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-in fade-in">
              
              {/* Quick Explanation Banner */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-xl p-4 flex items-start justify-between gap-3 shadow-2xs">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-blue-600 text-white rounded-lg shrink-0 mt-0.5">
                    <Zap size={18} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-blue-950 uppercase tracking-wide">
                      Upload Rápido com Auto-Identificação Inteligente
                    </h3>
                    <p className="text-xs text-blue-800/90 mt-0.5">
                      Faça o upload dos documentos abaixo. A IA lerá o código da obra, fornecedor e assunto diretamente dos arquivos, sem exigir digitação prévia manual.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => triggerAutoMetadataExtraction()}
                  disabled={extractingMetadata || (checklistFiles.length === 0 && proposalFiles.length === 0 && !transcriptText.trim())}
                  className="shrink-0 flex items-center gap-1.5 text-xs font-bold bg-white text-blue-700 hover:bg-blue-50 border border-blue-300 px-3 py-1.5 rounded-lg shadow-2xs transition-all disabled:opacity-40"
                  title="Detectar metadados dos arquivos anexados"
                >
                  {extractingMetadata ? <Loader2 size={13} className="animate-spin text-blue-600" /> : <Sparkles size={13} className="text-indigo-600" />}
                  Auto-Detectar Dados
                </button>
              </div>

              {/* Upload Slots Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* 1. Checklist Slot */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <FileCheck size={16} className="text-indigo-600" /> 1. Check List / Regras
                      </span>
                      <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Obrigatório</span>
                    </div>
                    <p className="text-[11px] text-slate-500">Caderno de Encargos, Matriz de Responsabilidade ou Planilha Excel.</p>
                  </div>

                  <div 
                    onClick={() => checklistInputRef.current?.click()}
                    className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/40 hover:bg-indigo-50/80 rounded-lg p-4 text-center cursor-pointer transition-colors"
                  >
                    <UploadCloud size={24} className="mx-auto text-indigo-500 mb-1" />
                    <span className="text-xs font-bold text-indigo-700 block">Selecionar Checklist</span>
                    <span className="text-[10px] text-slate-400">.pdf, .xlsx, .docx</span>
                    <input 
                      type="file" 
                      multiple 
                      accept=".pdf,.xlsx,.xls,.docx,.txt,.csv,.md"
                      className="hidden" 
                      ref={checklistInputRef} 
                      onChange={handleChecklistFilesChange}
                    />
                  </div>

                  {checklistFiles.length > 0 && (
                    <div className="text-[11px] text-slate-600 space-y-0.5 bg-slate-50 p-2 rounded border border-slate-200">
                      {checklistFiles.map(f => (
                        <div key={f.name} className="truncate flex items-center gap-1 font-medium">
                          <Check size={12} className="text-emerald-600 shrink-0" /> {f.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Proposal Slot */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <Layers size={16} className="text-amber-600" /> 2. Proposta Comercial
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Opcional</span>
                    </div>
                    <p className="text-[11px] text-slate-500">Proposta técnica/comercial enviada pelo fornecedor para cruzar divergências.</p>
                  </div>

                  <div 
                    onClick={() => proposalInputRef.current?.click()}
                    className="border-2 border-dashed border-amber-200 hover:border-amber-400 bg-amber-50/40 hover:bg-amber-50/80 rounded-lg p-4 text-center cursor-pointer transition-colors"
                  >
                    <UploadCloud size={24} className="mx-auto text-amber-500 mb-1" />
                    <span className="text-xs font-bold text-amber-700 block">Anexar Proposta</span>
                    <span className="text-[10px] text-slate-400">.pdf, .docx, .xlsx</span>
                    <input 
                      type="file" 
                      multiple 
                      accept=".pdf,.xlsx,.xls,.docx,.txt,.csv,.md"
                      className="hidden" 
                      ref={proposalInputRef} 
                      onChange={handleProposalFilesChange}
                    />
                  </div>

                  {proposalFiles.length > 0 && (
                    <div className="text-[11px] text-slate-600 space-y-0.5 bg-slate-50 p-2 rounded border border-slate-200">
                      {proposalFiles.map(f => (
                        <div key={f.name} className="truncate flex items-center gap-1 font-medium">
                          <Check size={12} className="text-emerald-600 shrink-0" /> {f.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Transcript Slot */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <Sparkles size={16} className="text-purple-600" /> 3. Transcrição / Documentos
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Opcional</span>
                    </div>
                    <p className="text-[11px] text-slate-500">Anotações ou transcrição textual da reunião.</p>
                  </div>

                  <div 
                    onClick={() => transcriptInputRef.current?.click()}
                    className="border-2 border-dashed border-purple-200 hover:border-purple-400 bg-purple-50/40 hover:bg-purple-50/80 rounded-lg p-4 text-center cursor-pointer transition-colors"
                  >
                    <UploadCloud size={24} className="mx-auto text-purple-500 mb-1" />
                    <span className="text-xs font-bold text-purple-700 block">Upload Transcrição</span>
                    <span className="text-[10px] text-slate-400">.docx, .pdf, .txt</span>
                    <input 
                      type="file" 
                      multiple 
                      accept=".docx,.pdf,.txt,.md" 
                      className="hidden" 
                      ref={transcriptInputRef} 
                      onChange={handleTranscriptFileUpload}
                    />
                  </div>

                  {transcriptFiles.length > 0 && (
                    <div className="text-[11px] text-slate-600 space-y-0.5 bg-slate-50 p-2 rounded border border-slate-200">
                      {transcriptFiles.map(f => (
                        <div key={f.name} className="truncate flex items-center gap-1 font-medium">
                          <Check size={12} className="text-emerald-600 shrink-0" /> {f.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* Collapsible / Editable Identified Metadata Card */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div 
                  onClick={() => setShowMetadataEditor(!showMetadataEditor)}
                  className="px-5 py-3.5 bg-slate-50/80 hover:bg-slate-100 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Building2 size={16} className="text-blue-600" />
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Identificação da Reunião e Obra
                    </span>
                    {autoExtracted && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 size={10} /> Auto-Detectado pela IA
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                    <span>
                      {abertura.obraCodigo ? `${abertura.obraCodigo} • ${abertura.fornecedor || 'Fornecedor'}` : 'Clique para revisar/editar'}
                    </span>
                    {showMetadataEditor ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* Metadata Editor Body */}
                {showMetadataEditor && (
                  <div className="p-5 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 bg-white animate-in fade-in duration-150">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Código da Obra
                      </label>
                      <input
                        type="text"
                        value={abertura.obraCodigo}
                        onChange={(e) => setAbertura({ ...abertura, obraCodigo: e.target.value })}
                        placeholder="Ex: 0048"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Nome da Obra
                      </label>
                      <input
                        type="text"
                        value={abertura.obraNome}
                        onChange={(e) => setAbertura({ ...abertura, obraNome: e.target.value })}
                        placeholder="Ex: Residencial Bela Vista"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Fornecedor
                      </label>
                      <input
                        type="text"
                        value={abertura.fornecedor}
                        onChange={(e) => setAbertura({ ...abertura, fornecedor: e.target.value })}
                        placeholder="Ex: Construtora Alfa Ltda"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Assunto
                      </label>
                      <input
                        type="text"
                        value={abertura.assunto}
                        onChange={(e) => setAbertura({ ...abertura, assunto: e.target.value })}
                        placeholder="Ex: Alinhamento de Escopo"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Serviço / Pacote
                      </label>
                      <input
                        type="text"
                        value={abertura.servico}
                        onChange={(e) => setAbertura({ ...abertura, servico: e.target.value })}
                        placeholder="Ex: Instalações Hidráulicas"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          RM
                        </label>
                        <input
                          type="text"
                          value={abertura.rm}
                          onChange={(e) => setAbertura({ ...abertura, rm: e.target.value })}
                          placeholder="RM-102"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          COT
                        </label>
                        <input
                          type="text"
                          value={abertura.cot}
                          onChange={(e) => setAbertura({ ...abertura, cot: e.target.value })}
                          placeholder="COT-88"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ================= STEP 2: REGRAS & DIVERGÊNCIAS CONSOLIDADAS ================= */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Resultado da Análise de Suprimentos (IA)</h3>
                    <p className="text-xs text-slate-500">
                      Regras de obra extraídas e divergências comerciais identificadas.
                    </p>
                  </div>

                  {state.analysisResult?.tipoFornecimento && (
                    <span className="text-xs bg-indigo-50 text-indigo-700 font-bold px-3 py-1 rounded-full border border-indigo-200">
                      {state.analysisResult.tipoFornecimento}
                    </span>
                  )}
                </div>

                {/* Topics Accordion / Summary */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Checklist Topics */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                      Tópicos do Check List ({state.analysisResult?.topics?.length || 0})
                    </span>
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                      {state.analysisResult?.topics?.map((t, idx) => (
                        <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                          <p className="font-bold text-slate-900">{t.title}</p>
                          <p className="text-slate-600"><span className="font-semibold text-slate-500">Regra:</span> {t.regraObra}</p>
                          <p className="text-amber-800"><span className="font-semibold text-amber-700">Atenção:</span> {t.pontoAtencao}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Divergences */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                      Divergências de Proposta ({state.divergences?.length || 0})
                    </span>
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                      {state.divergences && state.divergences.length > 0 ? (
                        state.divergences.map((d, idx) => (
                          <div key={idx} className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-amber-950">Divergência #{idx + 1}</span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${d.severity === 'ALTA' ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>
                                {d.severity}
                              </span>
                            </div>
                            <p className="text-slate-800">{d.description}</p>
                            <p className="text-[10px] text-slate-400">{d.source}</p>
                          </div>
                        ))
                      ) : (
                        <div className="p-6 bg-slate-50 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-400">
                          Nenhuma divergência crítica identificada na proposta.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================= STEP 3: TRANSCRIÇÃO, SONNET & ARTEFATOS FINAIS ================= */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-in fade-in">
              
              {/* Transcript & Sonnet Box */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Transcrição & Anotações de Negociação
                  </h4>
                  
                  <button
                    onClick={handleSonnetExtract}
                    disabled={processingSonnet || !transcriptText.trim()}
                    className="flex items-center gap-1.5 text-xs font-bold bg-purple-100 text-purple-800 hover:bg-purple-200 border border-purple-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {processingSonnet ? <Loader2 size={13} className="animate-spin text-purple-600" /> : <Sparkles size={13} className="text-purple-600" />}
                    Extrair Ações com Sonnet 5
                  </button>
                </div>

                <textarea
                  value={transcriptText}
                  onChange={(e) => setTranscriptText(e.target.value)}
                  placeholder="Cole aqui a transcrição da reunião, pontos acordados e deliberações..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-800 focus:outline-none focus:border-purple-500 focus:bg-white transition-all min-h-[90px] resize-y"
                />

                {sonnetResult && (
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs space-y-1">
                    <p className="font-bold text-purple-900 flex items-center gap-1.5">
                      <Sparkles size={13} className="text-purple-600" /> Ações e Prazos Extraídos (Sonnet 5):
                    </p>
                    <p className="text-slate-700 whitespace-pre-wrap max-h-28 overflow-y-auto">{sonnetResult}</p>
                  </div>
                )}
              </div>

              {/* Artifacts Download Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Pré-Ata */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
                  <div>
                    <span className="flex items-center gap-1.5 font-bold text-slate-800 text-xs uppercase tracking-wide">
                      <FileText size={16} className="text-indigo-600" /> Pré-Ata de Alinhamento
                    </span>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Checklist formatado com regras da obra e pontos de atenção para enviar ao fornecedor.
                    </p>
                  </div>

                  <button
                    onClick={downloadPreAta}
                    disabled={generatingPreAtaDocx}
                    className="w-full flex items-center justify-center gap-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 py-2 rounded-lg transition-colors shadow-2xs disabled:opacity-50"
                  >
                    {generatingPreAtaDocx ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    Baixar Pré-Ata (.docx)
                  </button>
                </div>

                {/* Ata Final */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between space-y-3">
                  <div>
                    <span className="flex items-center gap-1.5 font-bold text-slate-800 text-xs uppercase tracking-wide">
                      <CheckCircle2 size={16} className="text-emerald-600" /> Ata Final de Negociação
                    </span>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Documento final com deliberações, acordos firmados e pontos de atenção destacados em vermelho.
                    </p>
                  </div>

                  <button
                    onClick={downloadFinalAta}
                    disabled={generatingFinalAtaDocx}
                    className="w-full flex items-center justify-center gap-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                  >
                    {generatingFinalAtaDocx ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                    Baixar Ata Final (.docx)
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer Next-Next-Finish Controls */}
        <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between">
          <div>
            {currentStep > 1 && (
              <button
                onClick={handlePrevStep}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 px-3.5 py-2 rounded-lg transition-colors border border-slate-200"
              >
                <ArrowLeft size={14} />
                Voltar
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 px-3 py-2"
            >
              Cancelar
            </button>
            
            <button
              onClick={handleNextStep}
              disabled={analyzingDocuments || draftingAta || extractingMetadata}
              className="flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-5 py-2.5 rounded-lg shadow-sm transition-all disabled:bg-slate-300 uppercase tracking-tight"
            >
              {analyzingDocuments ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  Processando com IA...
                </>
              ) : currentStep === 1 ? (
                <>
                  Processar e Analisar
                  <ArrowRight size={15} />
                </>
              ) : currentStep === 2 ? (
                <>
                  Avançar para Artefatos
                  <ArrowRight size={15} />
                </>
              ) : (
                <>
                  Concluir & Salvar Sessão
                  <CheckCircle2 size={15} />
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

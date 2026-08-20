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
  Wand2,
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
import { validateUploadFiles } from '../utils/fileValidation';
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

// Helper to build initial structured Ata Final data from Checklist + Divergences
function buildInitialDraftData(state: AppState): FinalAtaData {
  const fornecedorNome = state.abertura?.fornecedor || 'Contratada';
  const obraIdentificacao = `${state.abertura?.obraCodigo || 'S/N'} - ${state.abertura?.obraNome || 'Obra'}`;
  
  const topics: any[] = Array.isArray(state.analysisResult)
    ? state.analysisResult
    : (Array.isArray(state.analysisResult?.topics) ? state.analysisResult.topics : []);
  
  const divergences: any[] = Array.isArray(state.divergences) ? state.divergences : [];

  let agreedItems: FinalAtaItem[] = [];
  if (topics.length > 0) {
    agreedItems = topics.map((t: any, idx: number) => {
      const numStr = String(idx + 1).padStart(2, '0');
      const title = t.title || t.titulo || t.section || `Item ${idx + 1} do Check List`;
      const reqList = Array.isArray(t.requirements) 
        ? t.requirements.join('; ') 
        : (t.requirements || t.description || t.descricao || 'Atendimento integral às especificações técnicas da obra.');
      return {
        num: numStr,
        titulo: title,
        descricao: `Fica acordado o atendimento integral ao item "${title}": ${reqList}`,
        responsavel: fornecedorNome,
        prazo: 'Conforme cronograma da obra'
      };
    });
  } else {
    agreedItems = [
      {
        num: '01',
        titulo: 'Escopo Técnico e Conformidade dos Serviços',
        descricao: `O fornecedor ${fornecedorNome} compromete-se a executar o pacote ${state.abertura?.servico || 'contratado'} em conformidade total com os projetos executivos e normas técnicas da Afonso França.`,
        responsavel: fornecedorNome,
        prazo: 'Durante toda a vigência da obra'
      },
      {
        num: '02',
        titulo: 'Segurança do Trabalho e Normas Regulamentadoras',
        descricao: 'Fornecimento diário de EPIs com CA válido e cumprimento rigoroso das NRs (NR-06, NR-18 e NR-35) e integração prévia de equipe.',
        responsavel: fornecedorNome,
        prazo: 'Imediato e contínuo'
      },
      {
        num: '03',
        titulo: 'Critérios de Medição e Pagamento',
        descricao: 'Medições mensais avaliando exclusivamente serviços 100% executados e aprovados pela fiscalização da Afonso França Engenharia.',
        responsavel: 'Afonso França / Fornecedor',
        prazo: 'Mensal (até dia 25)'
      }
    ];
  }

  let pendingItems: FinalAtaItem[] = [];
  if (divergences.length > 0) {
    pendingItems = divergences.map((d: any, idx: number) => {
      const numStr = String(idx + 1).padStart(2, '0');
      const desc = d.description || d.descricao || d.divergencia || `Pendência ${idx + 1}`;
      const sev = d.severity || d.severidade || 'MEDIA';
      return {
        num: numStr,
        titulo: `Ajuste de Divergência [Severidade ${sev}]`,
        descricao: `Regularizar item apontado na proposta comercial: ${desc}`,
        responsavel: fornecedorNome,
        prazo: sev === 'ALTA' ? 'Em até 48 horas' : 'Em até 5 dias úteis'
      };
    });
  }

  const topicSummary = topics.length > 0 
    ? `Foram validados e deliberados ${topics.length} tópicos técnicos e operacionais do Check List de Suprimentos da Obra.` 
    : 'Foram alinhadas as premissas técnicas, operacionais e de segurança do trabalho.';

  const divSummary = divergences.length > 0
    ? `Foram registradas ${divergences.length} pendências/divergências comerciais para envio de retificação pelo fornecedor.`
    : 'As condições comerciais e tributárias foram alinhadas em conformidade com as diretrizes da construtora.';

  const notes = `Reunião de alinhamento e deliberações finais realizada para a contratação da Obra ${obraIdentificacao} com o fornecedor ${fornecedorNome}, referente ao pacote ${state.abertura?.servico || 'de engenharia'} (RM: ${state.abertura?.rm || 'S/N'} • Cotação: ${state.abertura?.cot || 'S/N'}).\n\n${topicSummary} ${divSummary}\n\nFica acordado que todos os itens deliberados integram o instrumento contratual, com início das mobilizações condicionado à entrega dos documentos de SST e regularidade cadastral exigidos pela Afonso França Engenharia.`;

  return { agreedItems, pendingItems, notes };
}

export function Step5FinalAta({ state, updateState, onMetadataDetected, onNavigateToTemplates }: Props) {
  const [transcript, setTranscript] = useState(state.finalAtaText || '');
  const [isTextareaExpanded, setIsTextareaExpanded] = useState(false);
  const [loadingExtract, setLoadingExtract] = useState(false);
  const [loadingExtractMetadata, setLoadingExtractMetadata] = useState(false);
  const [extractSuccessMsg, setExtractSuccessMsg] = useState('');
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [loadingDocx, setLoadingDocx] = useState(false);
  const [error, setError] = useState('');
  
  // Template status
  const [hasTemplate, setHasTemplate] = useState<boolean | null>(null);
  const [activeTemplateName, setActiveTemplateName] = useState<string>('');
  const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);

  // Local state for the editable draft and accordion collapse - only set when synthesized or previously saved
  const [draftData, setDraftData] = useState<FinalAtaData | null>(() => {
    if (state.finalAtaData && (state.finalAtaData.agreedItems?.length > 0 || state.finalAtaData.pendingItems?.length > 0 || state.finalAtaData.notes)) {
      return state.finalAtaData;
    }
    return null;
  });
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
    if (state.finalAtaData !== undefined && state.finalAtaData !== null) {
      if (state.finalAtaData.agreedItems?.length > 0 || state.finalAtaData.pendingItems?.length > 0 || state.finalAtaData.notes) {
        setDraftData(state.finalAtaData);
      }
    }
  }, [state.finalAtaData]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const selectedFiles = Array.from(e.target.files);
    const validation = validateUploadFiles(selectedFiles);
    if (!validation.valid) {
      setError(validation.error || 'Arquivos selecionados inválidos.');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }
    
    setLoadingExtract(true);
    setError('');
    
    const formData = new FormData();
    selectedFiles.forEach((file: File) => {
      formData.append('files', file);
    });

    try {
      const data = await safeFetchJson<{ text: string }>('/api/extract-text', {
        method: 'POST',
        body: formData
      });
      
      const newText = (typeof data === 'string' ? data : (data?.text || (data as any)?.result || (data as any)?.data || '')).trim();
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

  const handleExtractMetadataFromTranscript = async () => {
    if (!transcript.trim()) {
      setError('Cole ou anexe um texto de transcrição para identificar os dados cadastrais.');
      return;
    }

    setLoadingExtractMetadata(true);
    setError('');
    setExtractSuccessMsg('');

    try {
      const resJson = await safeFetchJson<{ metadata?: Partial<AberturaData> }>('/api/extract-metadata-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript })
      });

      if (resJson?.metadata && Object.keys(resJson.metadata).length > 0) {
        const meta = resJson.metadata;
        if (onMetadataDetected) {
          onMetadataDetected(meta);
        }

        // Se houver participantes ou dados detectados, mescla com abertura
        if (state.abertura) {
          const updatedAbertura: AberturaData = {
            ...state.abertura,
            obraCodigo: meta.obraCodigo || state.abertura.obraCodigo,
            obraNome: meta.obraNome || state.abertura.obraNome,
            fornecedor: meta.fornecedor || state.abertura.fornecedor,
            assunto: meta.assunto || state.abertura.assunto,
            servico: meta.servico || state.abertura.servico,
            rm: meta.rm || state.abertura.rm,
            cot: meta.cot || state.abertura.cot,
            ataNumero: meta.ataNumero || state.abertura.ataNumero,
            dataReuniao: meta.dataReuniao || state.abertura.dataReuniao,
            horario: meta.horario || state.abertura.horario,
            local: meta.local || state.abertura.local,
            linkReuniao: meta.linkReuniao || state.abertura.linkReuniao,
            folha: meta.folha || state.abertura.folha,
            valoresComerciais: meta.valoresComerciais || state.abertura.valoresComerciais,
            prazosCronograma: meta.prazosCronograma || state.abertura.prazosCronograma,
            participantes: (meta.participantes && meta.participantes.length > 0) ? meta.participantes : state.abertura.participantes,
            resumoExecutivo: meta.resumoExecutivo || state.abertura.resumoExecutivo
          };
          updateState({ abertura: updatedAbertura });
        }

        setExtractSuccessMsg('Dados cadastrais e participantes extraídos com sucesso a partir da transcrição!');
        setTimeout(() => setExtractSuccessMsg(''), 6000);
      } else {
        setError('Nenhum dado cadastral ou participante novo foi detectado na transcrição informada.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao extrair metadados da transcrição.');
    } finally {
      setLoadingExtractMetadata(false);
    }
  };

  const draftFinalAta = async () => {
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
          transcript: transcript || 'Reunião de alinhamento realizada com validação do Check List e deliberações comerciais.'
        })
      });
      
      setDraftData(data);
      setIsDraftExpanded(true);
      
      const rawParts = data?.participantes && Array.isArray(data.participantes) && data.participantes.length > 0
        ? data.participantes
        : (state.abertura?.participantes || []);

      const mappedParticipantes = rawParts.map((p: any, idx: number) => ({
        id: p.id || `p-${idx + 1}`,
        nome: p.nome || '',
        cargoDepto: p.cargoDepto || p.cargo || '',
        empresa: p.empresa || '',
        email: p.email || '',
        visto: p.visto || ''
      }));

      const execResumo = data.resumo || data.notes || state.abertura?.resumoExecutivo || '';

      const updatedAbertura = state.abertura ? {
        ...state.abertura,
        participantes: mappedParticipantes,
        resumoExecutivo: execResumo
      } : null;

      updateState({ 
        finalAtaData: {
          ...data,
          participantes: mappedParticipantes,
          notes: execResumo,
          resumo: execResumo
        }, 
        finalAtaText: transcript,
        ...(updatedAbertura ? { abertura: updatedAbertura } : {})
      });
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
    finalData: FinalAtaData;
  }) => {
    setLoadingDocx(true);
    setError('');

    try {
      setDraftData(updated.finalData);
      updateState({
        abertura: updated.abertura,
        finalAtaData: updated.finalData
      });

      const blob = await safeFetchBlob('/api/generate-final-ata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abertura: updated.abertura,
          analysisResult: state.analysisResult,
          divergences: state.divergences,
          transcript,
          finalAtaData: updated.finalData
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

      updateState({ finalAtaGenerated: true, finalAtaData: updated.finalData });
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
        {/* Importar Transcrição / Documentos */}
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
            <div className="w-full flex items-center justify-between p-3 bg-slate-50 border-b border-slate-200">
              <button
                type="button"
                onClick={() => setIsTextareaExpanded(!isTextareaExpanded)}
                className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
              >
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
              </button>

              <div className="flex items-center gap-2">
                {/* Botão de Varinha Mágica para coletar dados cadastrais e participantes isoladamente */}
                <button
                  type="button"
                  onClick={handleExtractMetadataFromTranscript}
                  disabled={loadingExtractMetadata || !transcript.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100/90 text-purple-700 hover:text-purple-800 border border-purple-200 rounded-lg text-xs font-bold transition-all shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Detectar com IA dados pendentes da obra e participantes diretamente do texto da transcrição (sem reprocessar o restante)"
                >
                  {loadingExtractMetadata ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-purple-600" />
                      <span>Identificando Dados...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 size={13} className="text-purple-600" />
                      <span>Coletar Dados via IA</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsTextareaExpanded(!isTextareaExpanded)}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 px-2 py-1"
                >
                  <span>{isTextareaExpanded ? 'Recolher' : 'Expandir'}</span>
                  {isTextareaExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
            </div>

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

        {extractSuccessMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800 flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
            {extractSuccessMsg}
          </div>
        )}

        {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200 whitespace-pre-wrap">{error}</p>}

        {/* Revisão Estruturada da Ata Final */}
        {draftData ? (
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white transition-all duration-200 animate-in fade-in slide-in-from-top-4">
            <div className="w-full flex items-center justify-between p-4 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <span className="flex items-center justify-center bg-blue-600 text-white font-bold rounded-full w-6 h-6 text-xs shadow-xs">2</span>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    Revisão Estruturada dos Campos do Template
                  </h3>
                  <p className="text-xs text-slate-500">
                    {draftData.agreedItems?.length || 0} itens acordados • {draftData.pendingItems?.length || 0} pendências • {(state.abertura?.participantes || draftData.participantes || []).length} participantes identificados
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
                      const nextData = { ...draftData, notes: e.target.value, resumo: e.target.value };
                      setDraftData(nextData);
                      updateState({ 
                        finalAtaData: nextData,
                        abertura: state.abertura ? {
                          ...state.abertura,
                          resumoExecutivo: e.target.value
                        } : state.abertura
                      });
                    }}
                    placeholder="Resumo executivo dos pontos acordados e encaminhamentos gerais..."
                    rows={4}
                    className="w-full bg-white border border-slate-200 rounded p-3 text-xs text-slate-800 focus:outline-none focus:border-blue-500 min-h-[100px] resize-y leading-relaxed font-sans"
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
        ) : (
          <div className="border border-dashed border-slate-300 rounded-xl p-6 bg-slate-50/70 text-center space-y-3 animate-in fade-in">
            <div className="mx-auto w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
              <Sparkles size={20} />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h4 className="text-sm font-bold text-slate-800">
                Aguardando Síntese das Deliberações
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Clique no botão <strong>"Sintetizar com IA"</strong> abaixo para cruzar o Checklist da Obra, as Divergências da Proposta e a Transcrição da Reunião. Os campos estruturados de acordos, pendências e resumo executivo serão habilitados aqui após a síntese.
              </p>
            </div>
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
              <span className="text-slate-600 font-medium flex items-center gap-1.5">
                <CheckCircle2 size={15} className="text-blue-600" />
                Deliberações e pendências consolidadas a partir do Check List e Proposta
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={draftFinalAta}
            disabled={loadingDraft}
            className="flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg uppercase tracking-tight shadow-md hover:shadow-lg disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none transition-all ml-auto cursor-pointer"
            title="Consolida a Ata Final cruzando o Check List da Obra, Divergências da Proposta e Transcrição"
          >
            {loadingDraft ? (
              <>
                <Loader2 size={16} className="animate-spin text-white" />
                Sintetizando Deliberações com IA...
              </>
            ) : (
              <>
                <Sparkles size={16} className="text-blue-300" />
                {transcript.trim() ? 'Sintetizar com IA (Checklist + Transcrição)' : 'Sintetizar Deliberações com IA'}
              </>
            )}
          </button>
        </div>

        {/* SOMENTE APÓS a transcrição ser analisada (draftData existente): Botão de Gerar e Baixar Ata Final renderizado diretamente ABAIXO */}
        {draftData && (
          <div className={`pt-4 border-t border-slate-100 space-y-3 p-4 rounded-xl border animate-in fade-in slide-in-from-top-2 ${state.finalAtaGenerated ? 'bg-emerald-50/70 border-emerald-200' : 'bg-blue-50/60 border-blue-100'}`}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="text-xs text-slate-600 space-y-0.5">
                <p className="font-bold text-slate-800 flex items-center gap-1.5">
                  <CheckCircle2 size={16} className={`shrink-0 ${state.finalAtaGenerated ? 'text-emerald-600' : 'text-blue-600'}`} />
                  {state.finalAtaGenerated
                    ? 'Arquivo Word da Ata Final gerado com sucesso!'
                    : 'Insumos para a versão final da Ata gerados com sucesso'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {state.finalAtaGenerated
                    ? 'O documento oficial .docx foi exportado. Você pode baixar novamente ou revisar os campos sempre que desejar.'
                    : 'Os dados foram estruturados e revisados. Clique no botão ao lado para gerar e baixar a Ata Final (.docx).'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={generateFinalDocx}
                  disabled={loadingDocx || loadingDraft}
                  className="flex items-center justify-center gap-2 px-5 py-3 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg uppercase tracking-tight shadow-md shadow-blue-200 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none transition-all shrink-0"
                  title="Gera a ata final preenchida no formato DOCX"
                >
                  {loadingDocx ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Gerando DOCX...
                    </>
                  ) : (
                    <>
                      <FileDown size={16} />
                      {state.finalAtaGenerated ? 'Baixar Novamente (.docx)' : 'Baixar Ata Final (.docx)'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Validation Modal before generating Final DOCX */}
      {draftData && (
        <FinalAtaValidationModal
          isOpen={isValidatingModalOpen}
          onClose={() => setIsValidatingModalOpen(false)}
          abertura={state.abertura}
          finalData={draftData}
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

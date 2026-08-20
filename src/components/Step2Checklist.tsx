import React, { useState, useRef } from 'react';
import { AppState, AnalysisResult, TopicCard, AberturaData } from '../types';
import { 
  UploadCloud, 
  ArrowRight, 
  Loader2, 
  Edit3, 
  Save, 
  Check, 
  Sparkles, 
  Plus, 
  Trash2, 
  AlertTriangle, 
  FileText, 
  HelpCircle, 
  RefreshCw,
  Layers,
  FileCheck2
} from 'lucide-react';
import { safeFetchJson } from '../utils/api';
import { validateUploadFiles } from '../utils/fileValidation';

interface Props {
  state: AppState;
  updateState: (updates: Partial<AppState>) => void;
  onMetadataDetected?: (data: Partial<AberturaData>) => void;
}

export function Step2Checklist({ state, updateState, onMetadataDetected }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [progressInfo, setProgressInfo] = useState<{ message: string; progressPercent: number } | null>(null);
  const [error, setError] = useState('');
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [showUploaderAgain, setShowUploaderAgain] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      const validation = validateUploadFiles(selected);
      if (!validation.valid) {
        setError(validation.error || 'Arquivos selecionados inválidos.');
        setFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      setError('');
      setFiles(selected);
    }
  };

  const handleAnalyze = async () => {
    if (files.length === 0) return;

    const validation = validateUploadFiles(files);
    if (!validation.valid) {
      setError(validation.error || 'Erro na validação dos arquivos.');
      return;
    }
    
    setLoading(true);
    setError('');
    setProgressInfo({ message: 'Iniciando análise do Check List em lotes...', progressPercent: 5 });
    
    const meetingId = state.meetingId || `analysis-${Date.now()}`;
    const checklistFormData = new FormData();
    files.forEach(f => checklistFormData.append('files', f));
    checklistFormData.append('meetingId', meetingId);

    const metaFormData = new FormData();
    files.forEach(f => metaFormData.append('files', f));

    // Polling incremental de progresso
    const pollTimer = setInterval(async () => {
      try {
        const status = await safeFetchJson<{ stage: string; message: string; progressPercent: number }>(
          `/api/meetings/${meetingId}/analysis-status`
        );
        if (status && status.message) {
          setProgressInfo({
            message: status.message,
            progressPercent: status.progressPercent || 15
          });
        }
      } catch {
        // silent polling catch
      }
    }, 800);

    try {
      // 1. Analyze checklist rules framed into template
      const [result, metaJson] = await Promise.all([
        safeFetchJson<AnalysisResult>('/api/analyze-checklist', {
          method: 'POST',
          body: checklistFormData
        }),
        // Also extract metadata if abertura is missing or user jumped straight to checklist
        safeFetchJson<{ metadata?: Partial<AberturaData> }>('/api/extract-metadata', {
          method: 'POST',
          body: metaFormData
        }).catch(() => null)
      ]);
      
      const normalizedResult: AnalysisResult = {
        tipoFornecimento: result?.tipoFornecimento || 'Subempreitada de Serviços e Materiais',
        topics: Array.isArray(result?.topics) ? result.topics : []
      };

      updateState({ analysisResult: normalizedResult });
      setShowUploaderAgain(false);

      // 2. Check if metadata was found
      if (metaJson && metaJson.metadata) {
        const meta = metaJson.metadata;
        const hasData = Boolean(meta.obraCodigo || meta.fornecedor || meta.assunto || meta.servico);
        if (hasData && onMetadataDetected) {
          onMetadataDetected(meta);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao processar documentos do Check List');
    } finally {
      clearInterval(pollTimer);
      setLoading(false);
      setProgressInfo(null);
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

  const removeTopic = (id: string) => {
    if (!state.analysisResult) return;
    const newTopics = state.analysisResult.topics.filter(t => t.id !== id);
    updateState({
      analysisResult: { ...state.analysisResult, topics: newTopics }
    });
  };

  const addTopic = () => {
    const currentTopics = state.analysisResult?.topics || [];
    const newId = `topic-${currentTopics.length + 1}`;
    const newTopic: TopicCard = {
      id: newId,
      title: 'Nova Regra / Premissa da Obra',
      regraObra: 'Descrever a exigência técnica, prazo ou critério estabelecido pelo canteiro...',
      excecaoAdmitida: 'N/A',
      pontoAtencao: 'Nenhum',
      perguntaFornecedor: 'Confirmar atendimento integral',
      source: 'Check List da Obra'
    };

    const updated = [...currentTopics, newTopic];
    updateState({
      analysisResult: {
        tipoFornecimento: state.analysisResult?.tipoFornecimento || 'Subempreitada de Serviços e Materiais',
        topics: updated
      }
    });
    setEditingCard(newId);
  };

  const loadDefaultStandardTopics = () => {
    const defaultTaxonomy: TopicCard[] = [
      {
        id: 'topic-1',
        title: 'Escopo e Especificações Técnicas dos Serviços',
        regraObra: 'Execução estrita conforme projetos executivos e memoriais da Construtora.',
        excecaoAdmitida: 'N/A',
        pontoAtencao: 'Verificar interferências e compatibilização em campo antes do início.',
        perguntaFornecedor: 'Foram identificadas divergências entre projeto e memorial?',
        source: 'Padrão Engenharia'
      },
      {
        id: 'topic-2',
        title: 'Critério de Medição e Pagamento',
        regraObra: 'Medição mensal dos serviços efetivamente executados e aprovados pela fiscalização.',
        excecaoAdmitida: 'N/A',
        pontoAtencao: 'Faturamento condicionado à apresentação das guias trabalhistas e ART quitada.',
        perguntaFornecedor: 'Concordam com o fechamento de medição até o dia 25 de cada mês?',
        source: 'Padrão Engenharia'
      },
      {
        id: 'topic-3',
        title: 'Segurança do Trabalho e EPIs',
        regraObra: 'Atendimento integral à NR-18 e NR-35 com fornecimento de EPIs e integração prévia.',
        excecaoAdmitida: 'N/A',
        pontoAtencao: 'Tolerância zero para trabalho em altura sem linha de vida e trava-quedas.',
        perguntaFornecedor: 'Equipe possui treinamento NR-35 e exames ASO atualizados?',
        source: 'Padrão Engenharia'
      },
      {
        id: 'topic-4',
        title: 'Logística de Canteiro, Carga e Descarga',
        regraObra: 'Descarga e estocagem em local indicado pela obra nos horários autorizados.',
        excecaoAdmitida: 'N/A',
        pontoAtencao: 'Agendamento prévio com 48h de antecedência com o setor de logística.',
        perguntaFornecedor: 'Entregas serão realizadas com caminhão munck próprio?',
        source: 'Padrão Engenharia'
      },
      {
        id: 'topic-5',
        title: 'Retenções Contratuais e Garantias',
        regraObra: 'Retenção técnica de 5% sobre as faturas para garantia do período de testes/desmobilização.',
        excecaoAdmitida: 'Substituição por Carta de Fiança Bancária ou Seguro Garantia.',
        pontoAtencao: 'Liberação após emissão do Termo de Recebimento Provisório.',
        perguntaFornecedor: 'Optam por retenção contratual ou emissão de apólice de seguro garantia?',
        source: 'Padrão Engenharia'
      },
      {
        id: 'topic-6',
        title: 'Penalidades e Multas por Atraso',
        regraObra: 'Multa de 0,5% por dia de atraso sobre o valor contratual até o limite de 10%.',
        excecaoAdmitida: 'N/A',
        pontoAtencao: 'Atrasos injustificados impactarão no índice de qualificação de fornecedores.',
        perguntaFornecedor: 'Cronograma proposto atende integralmente os marcos contratuais da obra?',
        source: 'Padrão Engenharia'
      }
    ];

    updateState({
      analysisResult: {
        tipoFornecimento: state.analysisResult?.tipoFornecimento || 'Subempreitada de Serviços e Materiais',
        topics: defaultTaxonomy
      }
    });
  };

  const topics = state.analysisResult?.topics || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-semibold text-slate-800">Check List da Obra</h2>
        <p className="text-sm text-slate-500 mt-1">
          Faça upload do PDF e Excel para extração automática de premissas, enquadradas de acordo com a estrutura do template DOCX ativo.
        </p>
      </div>

      {!state.analysisResult || showUploaderAgain ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-6 shadow-sm">
          <div 
            className="border-2 border-dashed border-slate-300 rounded-xl p-10 hover:border-blue-400 hover:bg-slate-50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud className="mx-auto h-12 w-12 text-blue-500 mb-4" />
            <p className="text-slate-700 font-bold text-sm">Clique para selecionar os documentos do Check List</p>
            <p className="text-xs text-slate-400 mt-2">Suporta .pdf, .xlsx, .xls, .docx, .txt, .csv</p>
            <input 
              type="file" multiple accept=".pdf,.xlsx,.xls,.docx,.txt,.md,.csv" 
              className="hidden" ref={fileInputRef} onChange={handleFileSelect}
            />
          </div>

          {files.length > 0 && (
            <div className="text-left bg-slate-50 p-4 rounded-xl border border-slate-200">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Arquivos selecionados para análise:</p>
              <ul className="space-y-1">
                {files.map(f => (
                  <li key={f.name} className="text-xs text-slate-700 flex items-center gap-2 font-medium">
                    <Check size={14} className="text-green-600 shrink-0" />
                    {f.name} ({(f.size / 1024).toFixed(1)} KB)
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p className="text-red-600 text-xs bg-red-50 p-3 rounded-lg border border-red-200">{error}</p>}

          {loading && progressInfo && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2 max-w-md mx-auto animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-blue-600" />
                  {progressInfo.message}
                </span>
                <span>{progressInfo.progressPercent}%</span>
              </div>
              <div className="w-full bg-blue-200/60 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out" 
                  style={{ width: `${Math.max(5, Math.min(100, progressInfo.progressPercent))}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            {showUploaderAgain && (
              <button
                type="button"
                onClick={() => setShowUploaderAgain(false)}
                className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg uppercase tracking-tight transition-colors"
              >
                Cancelar e Voltar aos Dados Existentes
              </button>
            )}

            <button
              onClick={handleAnalyze}
              disabled={files.length === 0 || loading}
              className="flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 uppercase tracking-tight shadow-lg shadow-blue-200 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Enquadrando Premissas no Template DOCX...
                </>
              ) : (
                <>
                  <FileCheck2 size={18} />
                  Analisar e Estruturar Check List
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Control Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-600">
                <Layers size={22} />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Tipo de Fornecimento Identificado
                </span>
                <input
                  type="text"
                  value={state.analysisResult.tipoFornecimento}
                  onChange={(e) => updateState({
                    analysisResult: {
                      ...state.analysisResult!,
                      tipoFornecimento: e.target.value
                    }
                  })}
                  className="text-base font-bold text-blue-700 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none px-1 py-0.5"
                  title="Clique para editar o Tipo de Fornecimento"
                />
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Sparkles size={11} />
                    {topics.length} premissas enquadradas no template
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={addTopic}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors shadow-2xs"
              >
                <Plus size={14} />
                Adicionar Premissa
              </button>

              <button
                type="button"
                onClick={() => setShowUploaderAgain(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                title="Fazer novo upload de documentos"
              >
                <RefreshCw size={13} />
                Reanalisar
              </button>

              <button
                onClick={() => updateState({ step: 3 })}
                className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 uppercase tracking-tight shadow-md shadow-blue-200 transition-colors"
              >
                Avançar para Complementos
                <ArrowRight size={16} />
              </button>
            </div>
          </div>

          {/* Topics Grid */}
          {topics.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center space-y-4 shadow-sm">
              <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
              <div className="space-y-1 max-w-md mx-auto">
                <h4 className="text-sm font-bold text-slate-800">Nenhuma premissa identificada automaticamente</h4>
                <p className="text-xs text-slate-500">
                  Os arquivos enviados não continham regras mapeáveis ou houve uma leitura parcial. Você pode adicionar premissas manualmente ou reanalisar os arquivos com instruções específicas.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={loadDefaultStandardTopics}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-sm hover:bg-emerald-700 transition-colors"
                >
                  <Sparkles size={14} />
                  Carregar Tópicos Padrão da Construtora
                </button>
                <button
                  type="button"
                  onClick={addTopic}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-sm hover:bg-blue-700 transition-colors"
                >
                  <Plus size={14} />
                  Inserir Premissa Manualmente
                </button>
                <button
                  type="button"
                  onClick={() => setShowUploaderAgain(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
                >
                  <RefreshCw size={14} />
                  Fazer Novo Upload
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topics.map((topic, idx) => (
                <div 
                  key={topic.id || idx} 
                  className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-3.5 hover:border-blue-300 transition-all group"
                >
                  <div className="flex justify-between items-start gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-[11px] font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                        #{String(idx + 1).padStart(2, '0')}
                      </span>
                      <h3 className="font-bold text-slate-800 text-sm leading-snug">
                        {topic.title}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => setEditingCard(editingCard === topic.id ? null : topic.id)}
                        className={`p-1.5 rounded transition-colors ${
                          editingCard === topic.id 
                            ? 'bg-blue-100 text-blue-700' 
                            : 'text-slate-400 hover:text-blue-600 hover:bg-slate-50'
                        }`}
                        title="Editar premissa"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => removeTopic(topic.id)}
                        className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Remover premissa"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {editingCard === topic.id ? (
                    <div className="space-y-3 pt-1 animate-in fade-in">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Título da Premissa / Regra</label>
                        <input
                          type="text"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 font-semibold focus:outline-none focus:border-blue-500 focus:bg-white"
                          value={topic.title}
                          onChange={(e) => updateTopic(topic.id, { title: e.target.value })}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Regra da Obra (Exigência Técnica)</label>
                        <textarea 
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                          value={topic.regraObra}
                          onChange={(e) => updateTopic(topic.id, { regraObra: e.target.value })}
                          rows={2}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Exceção / Flexibilização Admitida</label>
                        <input 
                          type="text"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                          value={topic.excecaoAdmitida || ''}
                          onChange={(e) => updateTopic(topic.id, { excecaoAdmitida: e.target.value })}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-red-600 uppercase tracking-wider flex items-center gap-1">
                          <AlertTriangle size={12} />
                          Ponto de Atenção (Destaque em Vermelho no DOCX)
                        </label>
                        <textarea 
                          className="w-full bg-red-50/30 border border-red-200 rounded-lg p-2 text-xs text-red-900 font-medium focus:outline-none focus:border-red-500 focus:bg-white"
                          value={topic.pontoAtencao}
                          onChange={(e) => updateTopic(topic.id, { pontoAtencao: e.target.value })}
                          rows={2}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Pergunta ao Fornecedor</label>
                        <textarea 
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                          value={topic.perguntaFornecedor}
                          onChange={(e) => updateTopic(topic.id, { perguntaFornecedor: e.target.value })}
                          rows={2}
                        />
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => setEditingCard(null)}
                          className="flex items-center gap-1 text-xs font-bold text-white bg-blue-600 px-4 py-1.5 rounded-lg hover:bg-blue-700 shadow-xs transition-colors"
                        >
                          <Save size={14} /> Salvar Edição
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5 text-xs">
                      <div>
                        <span className="font-semibold text-slate-500 block text-[11px] mb-0.5">Regra da Obra:</span>
                        <p className="text-slate-800 leading-relaxed bg-slate-50/70 p-2 rounded-lg border border-slate-100">
                          {topic.regraObra}
                        </p>
                      </div>

                      {topic.excecaoAdmitida && topic.excecaoAdmitida !== 'N/A' && (
                        <div>
                          <span className="font-semibold text-slate-500 block text-[11px] mb-0.5">Exceção Admitida:</span>
                          <p className="text-slate-700 text-xs italic">{topic.excecaoAdmitida}</p>
                        </div>
                      )}

                      {topic.pontoAtencao && topic.pontoAtencao !== 'Nenhum' && topic.pontoAtencao !== 'N/A' && (
                        <div className="bg-red-50/60 border border-red-200/80 p-2.5 rounded-lg">
                          <span className="font-bold text-red-700 flex items-center gap-1 text-[11px] mb-0.5">
                            <AlertTriangle size={12} />
                            Ponto de Atenção:
                          </span>
                          <p className="text-red-900 font-medium text-xs">{topic.pontoAtencao}</p>
                        </div>
                      )}

                      {topic.perguntaFornecedor && topic.perguntaFornecedor !== 'N/A' && (
                        <div className="bg-blue-50/50 border border-blue-100 p-2.5 rounded-lg">
                          <span className="font-semibold text-blue-700 flex items-center gap-1 text-[11px] mb-0.5">
                            <HelpCircle size={12} />
                            Pergunta ao Fornecedor:
                          </span>
                          <p className="text-slate-800 text-xs">{topic.perguntaFornecedor}</p>
                        </div>
                      )}

                      {topic.source && (
                        <div className="pt-1 flex justify-end">
                          <span className="text-[10px] text-slate-400 italic">
                            Fonte: {topic.source}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

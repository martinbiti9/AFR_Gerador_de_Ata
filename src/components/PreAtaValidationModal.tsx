import React, { useState } from 'react';
import { AberturaData, AnalysisResult, Divergence, TopicCard } from '../types';
import { 
  X, 
  FileDown, 
  CheckCircle2, 
  AlertTriangle, 
  Building2, 
  Plus, 
  Trash2, 
  FileText, 
  Sparkles,
  Loader2
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  abertura: AberturaData | null;
  analysisResult: AnalysisResult | null;
  divergences: Divergence[];
  activeTemplateName?: string;
  onSaveAndGenerate: (updatedData: {
    abertura: AberturaData | null;
    analysisResult: AnalysisResult | null;
    divergences: Divergence[];
  }) => Promise<void>;
  loading: boolean;
}

export function PreAtaValidationModal({
  isOpen,
  onClose,
  abertura: initialAbertura,
  analysisResult: initialAnalysis,
  divergences: initialDivergences,
  activeTemplateName = '',
  onSaveAndGenerate,
  loading
}: Props) {
  const [abertura, setAbertura] = useState<AberturaData>(
    initialAbertura || {
      obraCodigo: '',
      obraNome: '',
      fornecedor: '',
      assunto: '',
      servico: '',
      rm: '',
      cot: ''
    }
  );

  const [topics, setTopics] = useState<TopicCard[]>(initialAnalysis?.topics || []);
  const [tipoFornecimento, setTipoFornecimento] = useState<string>(
    initialAnalysis?.tipoFornecimento || 'Subempreitada de Serviços e Materiais'
  );
  const [divergences, setDivergences] = useState<Divergence[]>(initialDivergences || []);
  const [activeTab, setActiveTab] = useState<'topics' | 'divergences' | 'header'>('topics');

  // Synchronize when modal opens
  React.useEffect(() => {
    if (isOpen) {
      if (initialAbertura) setAbertura(initialAbertura);
      if (initialAnalysis?.topics) setTopics(initialAnalysis.topics);
      if (initialAnalysis?.tipoFornecimento) setTipoFornecimento(initialAnalysis.tipoFornecimento);
      if (initialDivergences) setDivergences(initialDivergences);
    }
  }, [isOpen, initialAbertura, initialAnalysis, initialDivergences]);

  if (!isOpen) return null;

  const updateTopic = (index: number, field: keyof TopicCard, value: any) => {
    const updated = [...topics];
    updated[index] = { ...updated[index], [field]: value };
    setTopics(updated);
  };

  const removeTopic = (index: number) => {
    setTopics(topics.filter((_, idx) => idx !== index));
  };

  const addTopic = () => {
    const newIdx = topics.length + 1;
    setTopics([
      ...topics,
      {
        id: `topic-${newIdx}`,
        title: 'Nova Regra / Requisito da Obra',
        regraObra: 'Descrever a especificação técnica ou operacional exigida pela obra...',
        excecaoAdmitida: 'N/A',
        pontoAtencao: 'Nenhum',
        perguntaFornecedor: 'Confirmar atendimento integral',
        source: 'Check List da Obra'
      }
    ]);
  };

  const updateDivergence = (index: number, field: keyof Divergence, value: any) => {
    const updated = [...divergences];
    updated[index] = { ...updated[index], [field]: value };
    setDivergences(updated);
  };

  const removeDivergence = (index: number) => {
    setDivergences(divergences.filter((_, idx) => idx !== index));
  };

  const addDivergence = () => {
    const newIdx = divergences.length + 1;
    setDivergences([
      ...divergences,
      {
        id: `div-${newIdx}`,
        description: 'Nova divergência ou condição comercial a deliberar...',
        severity: 'MEDIA',
        source: 'Proposta Comercial'
      }
    ]);
  };

  const handleConfirm = async () => {
    await onSaveAndGenerate({
      abertura,
      analysisResult: {
        tipoFornecimento,
        topics
      },
      divergences
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/30 border border-blue-400/40 rounded-xl text-blue-300">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Validação de Conteúdo da Pré-Ata
                <span className="text-[11px] font-normal px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  Etapa de Revisão Prévia
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Revise os dados antes de mesclar no Template DOCX {activeTemplateName ? `("${activeTemplateName}")` : ''}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-between px-6 bg-slate-50 border-b border-slate-200">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('topics')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
                activeTab === 'topics'
                  ? 'border-blue-600 text-blue-600 bg-white shadow-2xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 size={15} className={activeTab === 'topics' ? 'text-blue-600' : 'text-slate-400'} />
              Tópicos e Regras da Obra ({topics.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('divergences')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
                activeTab === 'divergences'
                  ? 'border-blue-600 text-blue-600 bg-white shadow-2xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlertTriangle size={15} className={activeTab === 'divergences' ? 'text-amber-500' : 'text-slate-400'} />
              Divergências da Proposta ({divergences.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('header')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
                activeTab === 'header'
                  ? 'border-blue-600 text-blue-600 bg-white shadow-2xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 size={15} className={activeTab === 'header' ? 'text-blue-600' : 'text-slate-400'} />
              Dados da Obra & Fornecedor
            </button>
          </div>

          <div className="text-[11px] text-slate-500 hidden sm:block">
            {topics.filter(t => t.pontoAtencao && t.pontoAtencao !== 'Nenhum' && t.pontoAtencao !== 'N/A').length} pontos destacados em vermelho
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
          {/* TAB 1: TÓPICOS DA OBRA */}
          {activeTab === 'topics' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-900">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-blue-600 shrink-0" />
                  <span>
                    Estes itens alimentarão a tabela principal do template DOCX. O campo <strong>Ponto de Atenção</strong> receberá formatação em fonte vermelha no documento gerado.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={addTopic}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shrink-0 shadow-xs"
                >
                  <Plus size={14} />
                  Adicionar Tópico
                </button>
              </div>

              <div className="space-y-3">
                {topics.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300 text-slate-400 text-xs">
                    Nenhum tópico gerado. Clique em "+ Adicionar Tópico" para inserir manualmente.
                  </div>
                ) : (
                  topics.map((t, idx) => (
                    <div
                      key={t.id || idx}
                      className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-xs font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                            #{String(idx + 1).padStart(2, '0')}
                          </span>
                          <input
                            type="text"
                            value={t.title || ''}
                            onChange={(e) => updateTopic(idx, 'title', e.target.value)}
                            placeholder="Título da Regra ou Requisito..."
                            className="flex-1 font-bold text-xs text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none px-1 py-0.5"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeTopic(idx)}
                          className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors"
                          title="Remover tópico"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-600">Regra da Obra (Exigência Técnica):</label>
                          <textarea
                            value={t.regraObra || ''}
                            onChange={(e) => updateTopic(idx, 'regraObra', e.target.value)}
                            rows={2}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                            placeholder="Descreva a regra da obra..."
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold text-slate-600">Exceção / Flexibilização Admitida:</label>
                          <textarea
                            value={t.excecaoAdmitida || ''}
                            onChange={(e) => updateTopic(idx, 'excecaoAdmitida', e.target.value)}
                            rows={2}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                            placeholder="Exceção admitida ou N/A..."
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-1 border-t border-slate-100">
                        <div className="space-y-1 bg-red-50/40 p-2.5 rounded-lg border border-red-200/80">
                          <label className="text-[11px] font-bold text-red-700 flex items-center gap-1">
                            <AlertTriangle size={12} />
                            Ponto de Atenção (Destaque em Vermelho no DOCX):
                          </label>
                          <input
                            type="text"
                            value={t.pontoAtencao || ''}
                            onChange={(e) => updateTopic(idx, 'pontoAtencao', e.target.value)}
                            className="w-full bg-white border border-red-200 rounded p-1.5 text-xs text-red-800 font-medium focus:border-red-500 focus:outline-none"
                            placeholder="Ponto de atenção ou risco..."
                          />
                        </div>

                        <div className="space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                          <label className="text-[11px] font-semibold text-slate-700">Pergunta / Alinhamento para a Reunião:</label>
                          <input
                            type="text"
                            value={t.perguntaFornecedor || ''}
                            onChange={(e) => updateTopic(idx, 'perguntaFornecedor', e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                            placeholder="Pergunta objetiva a ser feita..."
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 2: DIVERGÊNCIAS DA PROPOSTA */}
          {activeTab === 'divergences' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                  <span>
                    Divergências detectadas entre a proposta do fornecedor e o Check List da Obra para pauta de negociação.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={addDivergence}
                  className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 transition-colors shrink-0 shadow-xs"
                >
                  <Plus size={14} />
                  Adicionar Divergência
                </button>
              </div>

              <div className="space-y-3">
                {divergences.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300 text-slate-400 text-xs">
                    Nenhuma divergência identificada na proposta.
                  </div>
                ) : (
                  divergences.map((d, idx) => (
                    <div
                      key={d.id || idx}
                      className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-2.5 hover:border-amber-300 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            d.severity === 'ALTA' ? 'bg-red-100 text-red-800' :
                            d.severity === 'MEDIA' ? 'bg-amber-100 text-amber-800' :
                            'bg-slate-100 text-slate-800'
                          }`}>
                            {d.severity || 'MEDIA'}
                          </span>
                          <input
                            type="text"
                            value={d.source || ''}
                            onChange={(e) => updateDivergence(idx, 'source', e.target.value)}
                            placeholder="Origem (ex: Proposta Comercial pág. 3)..."
                            className="text-xs font-semibold text-slate-500 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-amber-500 focus:outline-none px-1"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDivergence(idx)}
                          className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors"
                          title="Remover divergência"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <textarea
                        value={d.description || ''}
                        onChange={(e) => updateDivergence(idx, 'description', e.target.value)}
                        rows={2}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:bg-white focus:border-amber-500 focus:outline-none"
                        placeholder="Descreva a divergência encontrada..."
                      />

                      <div className="flex items-center gap-3 text-xs">
                        <label className="text-[11px] text-slate-500 font-semibold">Severidade:</label>
                        <select
                          value={d.severity || 'MEDIA'}
                          onChange={(e) => updateDivergence(idx, 'severity', e.target.value as any)}
                          className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-amber-500"
                        >
                          <option value="BAIXA">Baixa</option>
                          <option value="MEDIA">Média</option>
                          <option value="ALTA">Alta (Crítica)</option>
                        </select>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DADOS DA OBRA & FORNECEDOR */}
          {activeTab === 'header' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 size={15} className="text-blue-600" />
                Informações de Cabeçalho do Documento
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Código da Obra:</label>
                  <input
                    type="text"
                    value={abertura.obraCodigo || ''}
                    onChange={(e) => setAbertura({ ...abertura, obraCodigo: e.target.value })}
                    placeholder="Ex: OB-2026-04"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Nome do Empreendimento / Obra:</label>
                  <input
                    type="text"
                    value={abertura.obraNome || ''}
                    onChange={(e) => setAbertura({ ...abertura, obraNome: e.target.value })}
                    placeholder="Ex: Edifício Horizonte Azul"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Razão Social do Fornecedor:</label>
                  <input
                    type="text"
                    value={abertura.fornecedor || ''}
                    onChange={(e) => setAbertura({ ...abertura, fornecedor: e.target.value })}
                    placeholder="Ex: Alpha Engenharia & Serviços Ltda"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Pacote / Serviço:</label>
                  <input
                    type="text"
                    value={abertura.servico || ''}
                    onChange={(e) => setAbertura({ ...abertura, servico: e.target.value })}
                    placeholder="Ex: Estruturas Metálicas e Cobertura"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Assunto da Reunião:</label>
                  <input
                    type="text"
                    value={abertura.assunto || ''}
                    onChange={(e) => setAbertura({ ...abertura, assunto: e.target.value })}
                    placeholder="Ex: Alinhamento Técnico e Comercial Pré-Contratual"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">RM / COT:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={abertura.rm || ''}
                      onChange={(e) => setAbertura({ ...abertura, rm: e.target.value })}
                      placeholder="RM (ex: RM-1029)"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white focus:border-blue-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={abertura.cot || ''}
                      onChange={(e) => setAbertura({ ...abertura, cot: e.target.value })}
                      placeholder="COT (ex: COT-450)"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 focus:bg-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <FileText size={14} className="text-blue-600" />
            <span>Documento pré-visualizado e pronto para injeção no template oficial.</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg shadow-blue-200 uppercase tracking-tight transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Gerando Word (.docx)...
                </>
              ) : (
                <>
                  <FileDown size={16} />
                  Confirmar e Gerar Pré-Ata (.docx)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

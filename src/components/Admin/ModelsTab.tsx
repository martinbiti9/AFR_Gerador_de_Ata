import React, { useState } from 'react';
import { AIModelsConfig, ModelStageConfig } from '../../types';
import { 
  Cpu, 
  CheckCircle2, 
  Save, 
  AlertCircle, 
  RefreshCw, 
  Sliders, 
  Brain, 
  Gauge, 
  Hash, 
  Zap,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  Flame
} from 'lucide-react';

interface Props {
  models: AIModelsConfig;
  onSave: (updated: AIModelsConfig) => Promise<void>;
}

const AVAILABLE_GEMINI_MODELS = [
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash (Recomendado - Rápido, Inteligente e Preciso)' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview (Raciocínio Complexo / Atas Extensas)' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Alta Precisão e Capacidade)' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Equilíbrio Custo/Performance)' },
];

const DEFAULT_PARAMS: Record<string, ModelStageConfig> = {
  checklistParams: {
    model: 'gemini-3.1-pro-preview',
    temperature: 0.1,
    topP: 0.95,
    maxOutputTokens: 65536,
    thinkingBudget: 32768,
  },
  proposalParams: {
    model: 'gemini-3.1-pro-preview',
    temperature: 0.1,
    topP: 0.95,
    maxOutputTokens: 65536,
    thinkingBudget: 32768,
  },
  preAtaParams: {
    model: 'gemini-3.1-pro-preview',
    temperature: 0.2,
    topP: 0.95,
    maxOutputTokens: 65536,
    thinkingBudget: 32768,
  },
  finalAtaParams: {
    model: 'gemini-3.1-pro-preview',
    temperature: 0.2,
    topP: 0.95,
    maxOutputTokens: 65536,
    thinkingBudget: 32768,
  },
  chatbotParams: {
    model: 'gemini-3.5-flash',
    temperature: 0.7,
    topP: 0.95,
    maxOutputTokens: 16384,
    thinkingBudget: 8192,
  },
};

export function ModelsTab({ models, onSave }: Props) {
  const [formData, setFormData] = useState<AIModelsConfig>(() => {
    return {
      checklistModel: models.checklistModel || DEFAULT_PARAMS.checklistParams.model,
      proposalModel: models.proposalModel || DEFAULT_PARAMS.proposalParams.model,
      preAtaModel: models.preAtaModel || DEFAULT_PARAMS.preAtaParams.model,
      finalAtaModel: models.finalAtaModel || DEFAULT_PARAMS.finalAtaParams.model,
      chatbotModel: models.chatbotModel || DEFAULT_PARAMS.chatbotParams.model,
      checklistParams: { ...DEFAULT_PARAMS.checklistParams, ...(models.checklistParams || {}), model: models.checklistModel || DEFAULT_PARAMS.checklistParams.model },
      proposalParams: { ...DEFAULT_PARAMS.proposalParams, ...(models.proposalParams || {}), model: models.proposalModel || DEFAULT_PARAMS.proposalParams.model },
      preAtaParams: { ...DEFAULT_PARAMS.preAtaParams, ...(models.preAtaParams || {}), model: models.preAtaModel || DEFAULT_PARAMS.preAtaParams.model },
      finalAtaParams: { ...DEFAULT_PARAMS.finalAtaParams, ...(models.finalAtaParams || {}), model: models.finalAtaModel || DEFAULT_PARAMS.finalAtaParams.model },
      chatbotParams: { ...DEFAULT_PARAMS.chatbotParams, ...(models.chatbotParams || {}), model: models.chatbotModel || DEFAULT_PARAMS.chatbotParams.model },
    };
  });

  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [activeAccordion, setActiveAccordion] = useState<string | null>('checklistParams');

  const toggleAccordion = (stageKey: string) => {
    setActiveAccordion(prev => prev === stageKey ? null : stageKey);
  };

  const handleModelChange = (
    modelKey: keyof AIModelsConfig,
    paramsKey: keyof AIModelsConfig,
    newModel: string
  ) => {
    setFormData(prev => {
      const currentParam = (prev[paramsKey] as ModelStageConfig) || DEFAULT_PARAMS[paramsKey as string];
      return {
        ...prev,
        [modelKey]: newModel,
        [paramsKey]: {
          ...currentParam,
          model: newModel,
        },
      };
    });
  };

  const handleParamChange = (
    paramsKey: keyof AIModelsConfig,
    field: keyof ModelStageConfig,
    val: number | string
  ) => {
    setFormData(prev => {
      const currentParam = (prev[paramsKey] as ModelStageConfig) || DEFAULT_PARAMS[paramsKey as string];
      return {
        ...prev,
        [paramsKey]: {
          ...currentParam,
          [field]: typeof val === 'string' && field !== 'model' ? Number(val) : val,
        },
      };
    });
  };

  const applyStagePreset = (paramsKey: keyof AIModelsConfig, preset: 'max' | 'balanced' | 'fast') => {
    setFormData(prev => {
      const current = (prev[paramsKey] as ModelStageConfig) || DEFAULT_PARAMS[paramsKey as string];
      let updates: Partial<ModelStageConfig> = {};
      if (preset === 'max') {
        updates = { maxOutputTokens: 65536, thinkingBudget: 32768, temperature: 0.1, topP: 0.95 };
      } else if (preset === 'balanced') {
        updates = { maxOutputTokens: 32768, thinkingBudget: 16384, temperature: 0.3, topP: 0.95 };
      } else if (preset === 'fast') {
        updates = { maxOutputTokens: 8192, thinkingBudget: 0, temperature: 0.7, topP: 0.9 };
      }
      return {
        ...prev,
        [paramsKey]: {
          ...current,
          ...updates,
        },
      };
    });
  };

  const applyGlobalMaxPreset = () => {
    setFormData(prev => ({
      ...prev,
      checklistParams: { ...prev.checklistParams, maxOutputTokens: 65536, thinkingBudget: 32768, temperature: 0.1, topP: 0.95 },
      proposalParams: { ...prev.proposalParams, maxOutputTokens: 65536, thinkingBudget: 32768, temperature: 0.1, topP: 0.95 },
      preAtaParams: { ...prev.preAtaParams, maxOutputTokens: 65536, thinkingBudget: 32768, temperature: 0.2, topP: 0.95 },
      finalAtaParams: { ...prev.finalAtaParams, maxOutputTokens: 65536, thinkingBudget: 32768, temperature: 0.2, topP: 0.95 },
      chatbotParams: { ...prev.chatbotParams, maxOutputTokens: 16384, thinkingBudget: 8192, temperature: 0.7, topP: 0.95 },
    }));
    setStatusMsg('Todas as etapas foram ajustadas para a Capacidade Máxima (65.536 Tokens de Saída e 32.768 Tokens de Raciocínio)!');
    setTimeout(() => setStatusMsg(''), 4500);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      await onSave(formData);
      setStatusMsg('Modelos e parâmetros (Máximo de Tokens de Saída e Raciocínio Profundo) salvos com sucesso!');
      setTimeout(() => setStatusMsg(''), 4500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar configuração de modelos e parâmetros.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setFormData({
      checklistModel: 'gemini-3.1-pro-preview',
      proposalModel: 'gemini-3.1-pro-preview',
      preAtaModel: 'gemini-3.1-pro-preview',
      finalAtaModel: 'gemini-3.1-pro-preview',
      chatbotModel: 'gemini-3.5-flash',
      checklistParams: { ...DEFAULT_PARAMS.checklistParams },
      proposalParams: { ...DEFAULT_PARAMS.proposalParams },
      preAtaParams: { ...DEFAULT_PARAMS.preAtaParams },
      finalAtaParams: { ...DEFAULT_PARAMS.finalAtaParams },
      chatbotParams: { ...DEFAULT_PARAMS.chatbotParams },
    });
    setStatusMsg('Valores restaurados para o padrão de Máxima Capacidade (65k Tokens / 32k Raciocínio).');
    setTimeout(() => setStatusMsg(''), 4000);
  };

  const stages = [
    {
      id: 'checklist',
      title: 'Etapa 2: Leitura e Análise do Check List',
      desc: 'Extração exaustiva de todas as premissas, exigências de SST, canteiro, penalidades e enquadramento no template.',
      modelKey: 'checklistModel' as keyof AIModelsConfig,
      paramsKey: 'checklistParams' as keyof AIModelsConfig,
      recommended: 'gemini-3.1-pro-preview',
    },
    {
      id: 'proposal',
      title: 'Etapa 3: Análise da Proposta Comercial',
      desc: 'Confronto minucioso de divergências técnicas, tributárias, BDI e valores com o Check List da Obra.',
      modelKey: 'proposalModel' as keyof AIModelsConfig,
      paramsKey: 'proposalParams' as keyof AIModelsConfig,
      recommended: 'gemini-3.1-pro-preview',
    },
    {
      id: 'preAta',
      title: 'Etapa 4: Geração da Pré-Ata DOCX',
      desc: 'Estruturação da mesa de negociação, pontos críticos em vermelho e perguntas estratégicas de alinhamento.',
      modelKey: 'preAtaModel' as keyof AIModelsConfig,
      paramsKey: 'preAtaParams' as keyof AIModelsConfig,
      recommended: 'gemini-3.1-pro-preview',
    },
    {
      id: 'finalAta',
      title: 'Etapa 5: Transcrição e Minuta da Ata Final DOCX',
      desc: 'Extração integral de deliberações, acordos comerciais, pendências com prazos e responsáveis estritos.',
      modelKey: 'finalAtaModel' as keyof AIModelsConfig,
      paramsKey: 'finalAtaParams' as keyof AIModelsConfig,
      recommended: 'gemini-3.1-pro-preview',
    },
    {
      id: 'chatbot',
      title: 'Chatbot & Suporte Geral',
      desc: 'Assistente consultivo de contratações e suprimentos.',
      modelKey: 'chatbotModel' as keyof AIModelsConfig,
      paramsKey: 'chatbotParams' as keyof AIModelsConfig,
      recommended: 'gemini-3.5-flash',
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner / Global Preset */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white rounded-2xl p-6 shadow-xl border border-indigo-800/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="p-2 bg-blue-500/30 border border-blue-400/40 rounded-xl text-blue-300">
                <Flame size={20} className="text-amber-400 animate-pulse" />
              </span>
              <h2 className="text-lg font-bold">Configuração de Capacidade Máxima das LLMs</h2>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Defina o <strong>valor máximo de Tokens de Saída (65.536)</strong> e <strong>Tokens de Raciocínio (32.768)</strong> para garantir que as análises de Check List, Propostas Comerciais e Atas de Reunião contenham riqueza máxima de detalhes, sem cortes ou truncamentos.
            </p>
          </div>

          <button
            type="button"
            onClick={applyGlobalMaxPreset}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-bold text-xs rounded-xl uppercase tracking-wider shadow-lg shadow-orange-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] shrink-0"
          >
            <Sparkles size={16} />
            Aplicar Máximo em Todas as Etapas
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 text-xs font-semibold flex items-center gap-2 animate-in slide-in-from-top-2">
          <CheckCircle2 size={16} className="text-green-600 shrink-0" />
          {statusMsg}
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-semibold flex items-center gap-2 animate-in slide-in-from-top-2">
          <AlertCircle size={16} className="text-red-600 shrink-0" />
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 gap-5">
          {stages.map((stage) => {
            const currentParam = (formData[stage.paramsKey] as ModelStageConfig) || DEFAULT_PARAMS[stage.paramsKey as string];
            const isExpanded = activeAccordion === stage.paramsKey;
            const isMaxTokens = currentParam.maxOutputTokens >= 65536;
            const isMaxThinking = currentParam.thinkingBudget >= 32768;

            return (
              <div
                key={stage.id}
                className={`bg-white border rounded-2xl transition-all shadow-sm ${
                  isExpanded ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Header Row */}
                <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-800">{stage.title}</h3>
                      {isMaxTokens && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Flame size={10} className="text-amber-600" /> 65k Saída Máx
                        </span>
                      )}
                      {isMaxThinking && (
                        <span className="text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Brain size={10} className="text-indigo-600" /> 32k Raciocínio
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">{stage.desc}</p>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                    {/* Model Select */}
                    <div className="w-full sm:w-80">
                      <select
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                        value={formData[stage.modelKey] as string}
                        onChange={(e) => handleModelChange(stage.modelKey, stage.paramsKey, e.target.value)}
                      >
                        {AVAILABLE_GEMINI_MODELS.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Accordion Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleAccordion(stage.paramsKey)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                        isExpanded
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <Sliders size={14} />
                      <span>Parâmetros</span>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Parameters Panel */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/80 p-5 rounded-b-2xl space-y-5 animate-in fade-in">
                    {/* Stage Presets */}
                    <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-200">
                      <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <Zap size={13} className="text-amber-500" /> Presets Rápidos para esta Etapa:
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => applyStagePreset(stage.paramsKey, 'max')}
                          className="text-xs px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg transition-colors shadow-2xs"
                        >
                          🔥 Máximo (65k Tokens / 32k Raciocínio)
                        </button>
                        <button
                          type="button"
                          onClick={() => applyStagePreset(stage.paramsKey, 'balanced')}
                          className="text-xs px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-lg transition-colors"
                        >
                          ⚡ Equilibrado (32k Tokens)
                        </button>
                        <button
                          type="button"
                          onClick={() => applyStagePreset(stage.paramsKey, 'fast')}
                          className="text-xs px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-lg transition-colors"
                        >
                          🎯 Rápido (8k Tokens)
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                      {/* 1. Max Output Tokens */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <Hash size={14} className="text-blue-600" />
                            Tokens de Saída
                          </label>
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-mono">
                            {currentParam.maxOutputTokens}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1024"
                          max="65536"
                          step="1024"
                          className="w-full accent-blue-600 cursor-pointer"
                          value={currentParam.maxOutputTokens}
                          onChange={(e) => handleParamChange(stage.paramsKey, 'maxOutputTokens', Number(e.target.value))}
                        />
                        <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                          <span>1.024</span>
                          <span>32.768</span>
                          <span className="text-blue-600 font-bold">65.536 (Máx)</span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-tight pt-1">
                          Define o limite máximo da resposta gerada. O valor de 65.536 garante respostas detalhadas e documentos completos.
                        </p>
                      </div>

                      {/* 2. Thinking Budget */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <Brain size={14} className="text-indigo-600" />
                            Raciocínio Profundo
                          </label>
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                            {currentParam.thinkingBudget === 0 ? 'Desativado' : `${currentParam.thinkingBudget} tokens`}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="32768"
                          step="1024"
                          className="w-full accent-indigo-600 cursor-pointer"
                          value={currentParam.thinkingBudget}
                          onChange={(e) => handleParamChange(stage.paramsKey, 'thinkingBudget', Number(e.target.value))}
                        />
                        <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                          <span>0 (Off)</span>
                          <span>16.384</span>
                          <span className="text-indigo-600 font-bold">32.768 (Máx)</span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-tight pt-1">
                          Budget de reflexão da IA antes de gerar a resposta. 32.768 tokens permitem analisar minuciosamente cláusulas e regras.
                        </p>
                      </div>

                      {/* 3. Temperature */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <Gauge size={14} className="text-emerald-600" />
                            Temperatura
                          </label>
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                            {currentParam.temperature.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.05"
                          className="w-full accent-emerald-600 cursor-pointer"
                          value={currentParam.temperature}
                          onChange={(e) => handleParamChange(stage.paramsKey, 'temperature', Number(e.target.value))}
                        />
                        <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                          <span>0.0 (Preciso)</span>
                          <span>1.0 (Balanceado)</span>
                          <span>2.0 (Criativo)</span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-tight pt-1">
                          0.1 a 0.2 é o ideal para análise técnica contratual e extração rigorosa sem alucinações.
                        </p>
                      </div>

                      {/* 4. Top P */}
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <Layers size={14} className="text-purple-600" />
                            Top P (Sampling)
                          </label>
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-mono">
                            {currentParam.topP.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="1.0"
                          step="0.05"
                          className="w-full accent-purple-600 cursor-pointer"
                          value={currentParam.topP}
                          onChange={(e) => handleParamChange(stage.paramsKey, 'topP', Number(e.target.value))}
                        />
                        <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                          <span>0.1 (Focado)</span>
                          <span>0.5</span>
                          <span>1.0 (Abrangente)</span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-tight pt-1">
                          0.95 assegura amostragem completa de vocabulário técnico de engenharia civil.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors flex items-center justify-center gap-2 uppercase tracking-tight"
          >
            <RefreshCw size={14} />
            Restaurar Padrão Máximo
          </button>

          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Salvando Parâmetros...
              </>
            ) : (
              <>
                <Save size={16} />
                Salvar Parâmetros das LLMs
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

import React, { useState } from 'react';
import { AIModelsConfig, ModelStageConfig } from '../../types';
import { Cpu, CheckCircle2, Save, AlertCircle, RefreshCw, Sliders, Brain, Gauge, Hash, Zap } from 'lucide-react';

interface Props {
  models: AIModelsConfig;
  onSave: (updated: AIModelsConfig) => Promise<void>;
}

const AVAILABLE_GEMINI_MODELS = [
  { id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash (Recomendado - Rápido, Inteligente e Preciso)' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview (Raciocínio Complexo / Atas Extensas)' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Alta Precisão)' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Equilíbrio Custo/Performance)' },
];

const DEFAULT_PARAMS: Record<string, ModelStageConfig> = {
  checklistParams: {
    model: 'gemini-3.1-pro-preview',
    temperature: 0.1,
    topP: 0.95,
    maxOutputTokens: 8192,
    thinkingBudget: 2048,
  },
  proposalParams: {
    model: 'gemini-3.1-pro-preview',
    temperature: 0.1,
    topP: 0.95,
    maxOutputTokens: 8192,
    thinkingBudget: 2048,
  },
  preAtaParams: {
    model: 'gemini-3.1-pro-preview',
    temperature: 0.2,
    topP: 0.95,
    maxOutputTokens: 8192,
    thinkingBudget: 2048,
  },
  finalAtaParams: {
    model: 'gemini-3.1-pro-preview',
    temperature: 0.2,
    topP: 0.95,
    maxOutputTokens: 8192,
    thinkingBudget: 4096,
  },
  chatbotParams: {
    model: 'gemini-3.5-flash',
    temperature: 0.7,
    topP: 0.95,
    maxOutputTokens: 4096,
    thinkingBudget: 0,
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
  const [activeAccordion, setActiveAccordion] = useState<string | null>(null);

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

  const applyPreset = (paramsKey: keyof AIModelsConfig, preset: 'strict' | 'balanced' | 'creative') => {
    setFormData(prev => {
      const current = (prev[paramsKey] as ModelStageConfig) || DEFAULT_PARAMS[paramsKey as string];
      let updates: Partial<ModelStageConfig> = {};
      if (preset === 'strict') {
        updates = { temperature: 0.1, topP: 0.9, thinkingBudget: 4096 };
      } else if (preset === 'balanced') {
        updates = { temperature: 0.4, topP: 0.95, thinkingBudget: 2048 };
      } else if (preset === 'creative') {
        updates = { temperature: 0.8, topP: 0.95, thinkingBudget: 0 };
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      await onSave(formData);
      setStatusMsg('Modelos e parâmetros (Criatividade, TOP P, Raciocínio, Tamanho) salvos com sucesso!');
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
  };

  // Helper renderer for stage configuration card
  const renderStageCard = (
    stageNumber: string,
    title: string,
    description: string,
    modelKey: keyof AIModelsConfig,
    paramsKey: keyof AIModelsConfig,
    availableModels: { id: string; name: string }[]
  ) => {
    const params = (formData[paramsKey] as ModelStageConfig) || DEFAULT_PARAMS[paramsKey as string];
    const isOpen = activeAccordion === paramsKey;

    return (
      <div className="p-5 rounded-2xl border transition-all bg-slate-50/80 border-slate-200">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-2 text-slate-800">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black bg-blue-100 text-blue-700">
                {stageNumber}
              </span>
              {title}
            </label>
            <p className="text-[11px] text-slate-500 mt-1">{description}</p>
          </div>
          <span className="text-[10px] text-slate-400 font-mono font-semibold px-2 py-0.5 bg-white rounded border border-slate-200">
            {stageNumber.startsWith('C') ? stageNumber : `Etapa ${stageNumber}`}
          </span>
        </div>

        {/* Seleção do Modelo Principal */}
        <div className="mt-3">
          <select
            value={formData[modelKey] as string}
            onChange={(e) => handleModelChange(modelKey, paramsKey, e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-medium shadow-xs"
          >
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Botão de Toggle para Parâmetros Avançados */}
        <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2.5">
          <button
            type="button"
            onClick={() => toggleAccordion(paramsKey as string)}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Sliders size={13} />
            {isOpen ? 'Ocultar Parâmetros Avançados' : 'Ajustar Criatividade, TOP P & Raciocínio'}
          </button>
          
          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
            <span>Temp: {params.temperature}</span>
            <span>•</span>
            <span>TopP: {params.topP}</span>
          </div>
        </div>

        {/* Accordion de Parâmetros Avançados */}
        {isOpen && (
          <div className="mt-3 p-3.5 bg-white rounded-xl border border-slate-200 shadow-inner space-y-4 animate-in fade-in duration-200">
            {/* Presets Rápidos */}
            <div className="flex items-center justify-between gap-1 pb-2 border-b border-slate-100">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight flex items-center gap-1">
                <Zap size={11} className="text-amber-500" /> Presets Rápidos:
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => applyPreset(paramsKey, 'strict')}
                  className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
                  title="Temperatura 0.1, TopP 0.9, Raciocínio Alto - Foco em precisão estrita"
                >
                  Rigoroso
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(paramsKey, 'balanced')}
                  className="px-2 py-0.5 text-[10px] font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded transition-colors"
                  title="Temperatura 0.4, TopP 0.95, Raciocínio Equilibrado"
                >
                  Equilibrado
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset(paramsKey, 'creative')}
                  className="px-2 py-0.5 text-[10px] font-semibold bg-purple-50 hover:bg-purple-100 text-purple-700 rounded transition-colors"
                  title="Temperatura 0.8, TopP 0.95 - Maior flexibilidade e redação fluida"
                >
                  Fluido
                </button>
              </div>
            </div>

            {/* 1. Criatividade (Temperature) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <Gauge size={12} className="text-blue-500" /> Criatividade (Temperature)
                </span>
                <span className="font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded text-[10px]">
                  {params.temperature}
                </span>
              </div>
              <input
                type="range"
                min="0.0"
                max="2.0"
                step="0.05"
                value={params.temperature}
                onChange={(e) => handleParamChange(paramsKey, 'temperature', e.target.value)}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[9px] text-slate-400">
                <span>0.0 (Determinístico / Auditoria)</span>
                <span>1.0 (Padrão)</span>
                <span>2.0 (Criativo)</span>
              </div>
            </div>

            {/* 2. Diversidade de Amostragem (Top P) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <Sliders size={12} className="text-emerald-500" /> Diversidade (Top P)
                </span>
                <span className="font-mono font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">
                  {params.topP}
                </span>
              </div>
              <input
                type="range"
                min="0.05"
                max="1.0"
                step="0.05"
                value={params.topP}
                onChange={(e) => handleParamChange(paramsKey, 'topP', e.target.value)}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />
              <div className="flex justify-between text-[9px] text-slate-400">
                <span>0.1 (Focado)</span>
                <span>0.95 (Recomendado)</span>
                <span>1.0 (Total)</span>
              </div>
            </div>

            {/* 3. Orçamento de Raciocínio (Thinking Budget) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <Brain size={12} className="text-indigo-500" /> Raciocínio / Pensamento Profundo
                </span>
                <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px]">
                  {params.thinkingBudget === 0 ? 'Automático / Padrão' : `${params.thinkingBudget} tokens`}
                </span>
              </div>
              <select
                value={params.thinkingBudget}
                onChange={(e) => handleParamChange(paramsKey, 'thinkingBudget', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              >
                <option value={0}>0 (Automático / Desativado pelo modelo)</option>
                <option value={1024}>1.024 tokens (Raciocínio Rápido)</option>
                <option value={2048}>2.048 tokens (Recomendado para Suprimentos)</option>
                <option value={4096}>4.096 tokens (Raciocínio Profundo para Cláusulas)</option>
                <option value={8192}>8.192 tokens (Auditoria Extrema de Minutas)</option>
              </select>
              <p className="text-[9px] text-slate-400">
                Habilita cadeia de pensamento antes de gerar o parecer contratual.
              </p>
            </div>

            {/* 4. Limite Máximo de Tokens na Saída */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <Hash size={12} className="text-slate-500" /> Tamanho Máximo de Resposta
                </span>
                <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                  {params.maxOutputTokens} tokens
                </span>
              </div>
              <select
                value={params.maxOutputTokens}
                onChange={(e) => handleParamChange(paramsKey, 'maxOutputTokens', e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              >
                <option value={1024}>1.024 tokens (~750 palavras)</option>
                <option value={2048}>2.048 tokens (~1.500 palavras)</option>
                <option value={4096}>4.096 tokens (~3.000 palavras)</option>
                <option value={8192}>8.192 tokens (~6.000 palavras - Padrão)</option>
                <option value={16384}>16.384 tokens (~12.000 palavras - Documentos Longos)</option>
              </select>
              <p className="text-[9px] text-slate-400">
                Limite máximo de tokens gerados na saída para não truncar relatórios extensos.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Cpu className="text-blue-600" size={20} />
            Gerenciador de Modelos e Hiperparâmetros de IA
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Configure individualmente para cada etapa o modelo de IA e seus parâmetros (Criatividade, TOP P, Raciocínio e Tamanho de Resposta).
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetDefaults}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors self-start md:self-auto"
        >
          <RefreshCw size={12} />
          Restaurar Padrões
        </button>
      </div>

      {statusMsg && (
        <div className="p-3.5 bg-green-50 border border-green-200 text-green-700 text-xs font-medium rounded-lg flex items-center gap-2 animate-in fade-in duration-200 shadow-sm">
          <CheckCircle2 size={16} />
          {statusMsg}
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-lg flex items-center gap-2 animate-in fade-in duration-200 shadow-sm">
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Etapa 2: Checklist */}
          {renderStageCard(
            '2',
            'Análise de Checklist (Aderência)',
            'Classificação de fornecimento e extração de regras, exceções e pontos de atenção da obra.',
            'checklistModel',
            'checklistParams',
            AVAILABLE_GEMINI_MODELS
          )}

          {/* Etapa 3: Proposta */}
          {renderStageCard(
            '3',
            'Análise de Propostas e Divergências',
            'Cruzamento da proposta do fornecedor com checklist e categorização de severidade.',
            'proposalModel',
            'proposalParams',
            AVAILABLE_GEMINI_MODELS
          )}

          {/* Etapa 4: Pré-Ata */}
          {renderStageCard(
            '4',
            'Geração de Pré-Ata',
            'Estruturação da pauta prévia de negociação com perguntas estratégicas e alertas.',
            'preAtaModel',
            'preAtaParams',
            AVAILABLE_GEMINI_MODELS
          )}

          {/* Etapa 5: Ata Final */}
          {renderStageCard(
            '5',
            'Análise de Transcrição & Ata Final',
            'Raciocínio sobre atas/transcrições para extração dos itens acordados e pendentes.',
            'finalAtaModel',
            'finalAtaParams',
            AVAILABLE_GEMINI_MODELS
          )}

          {/* Chatbot */}
          {renderStageCard(
            'Chat',
            'Chatbot Assistente de Suprimentos',
            'Modelo conversacional para tirar dúvidas rápidas sobre as etapas e contratos.',
            'chatbotModel',
            'chatbotParams',
            AVAILABLE_GEMINI_MODELS
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <p className="text-[11px] text-slate-500">
            * As alterações entram em vigor imediatamente para todas as próximas chamadas de IA.
          </p>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold uppercase tracking-tight shadow-md disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Save size={16} />
            {saving ? 'Salvando Configurações...' : 'Salvar Modelos & Parâmetros'}
          </button>
        </div>
      </form>
    </div>
  );
}

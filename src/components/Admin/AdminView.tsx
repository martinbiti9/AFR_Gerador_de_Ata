import React, { useState, useEffect } from 'react';
import { AIModelsConfig, CustomPromptsConfig } from '../../types';
import { ModelsTab } from './ModelsTab';
import { PromptsTab } from './PromptsTab';
import { TemplatesTab } from './TemplatesTab';
import { LogsTab } from './LogsTab';
import { Shield, Cpu, MessageSquareCode, FileText, Terminal, ArrowLeft, RefreshCw } from 'lucide-react';

interface Props {
  onBackToApp: () => void;
  initialTab?: TabType;
}

type TabType = 'models' | 'prompts' | 'templates' | 'logs';

export function AdminView({ onBackToApp, initialTab = 'models' }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [models, setModels] = useState<AIModelsConfig>({
    checklistModel: 'gemini-3.1-pro-preview',
    proposalModel: 'gemini-3.1-pro-preview',
    preAtaModel: 'gemini-3.1-pro-preview',
    finalAtaModel: 'gemini-3.1-pro-preview',
    chatbotModel: 'gemini-3.5-flash',
    sonnetModel: 'claude-sonnet-5',
  });
  const [prompts, setPrompts] = useState<CustomPromptsConfig>({
    checklistInstructions: '',
    proposalInstructions: '',
    preAtaInstructions: '',
    finalAtaInstructions: '',
    chatbotInstructions: '',
  });
  const [loading, setLoading] = useState(true);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/config');
      const data = await res.json();
      if (res.ok) {
        if (data.models) setModels(data.models);
        if (data.prompts) setPrompts(data.prompts);
      }
    } catch (err) {
      console.error('Erro ao carregar configurações do Admin:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSaveModels = async (updated: AIModelsConfig) => {
    const res = await fetch('/api/admin/config/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar modelos.');
    setModels(data.models);
  };

  const handleSavePrompts = async (updated: CustomPromptsConfig) => {
    const res = await fetch('/api/admin/config/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar instruções de prompt.');
    setPrompts(data.prompts);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900">
      {/* Top Header */}
      <header className="bg-slate-900 text-white h-16 px-6 flex items-center justify-between shadow-md flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-600 rounded-lg text-white">
            <Shield size={20} />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight uppercase">Painel Administrativo do Sistema</h1>
            <p className="text-[11px] text-slate-400">Configurações Avançadas de IA, Prompts, Templates e Logs de Auditoria</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={onBackToApp}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold uppercase tracking-tight transition-colors border border-slate-700"
          >
            <ArrowLeft size={14} />
            Voltar para o App
          </button>
        </div>
      </header>

      {/* Main Admin Content Container */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-8 flex flex-col">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-slate-300 pb-3 mb-6">
          <button
            onClick={() => setActiveTab('models')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-tight transition-all ${
              activeTab === 'models'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Cpu size={16} />
            Modelos de IA
          </button>

          <button
            onClick={() => setActiveTab('prompts')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-tight transition-all ${
              activeTab === 'prompts'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <MessageSquareCode size={16} />
            Instruções de Prompt
          </button>

          <button
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-tight transition-all ${
              activeTab === 'templates'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <FileText size={16} />
            Templates & Versionamento
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-tight transition-all ${
              activeTab === 'logs'
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Terminal size={16} />
            Logs do Console & Auditoria
          </button>
        </div>

        {/* Tab Content Box */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8 flex-1">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-slate-500 gap-3">
              <RefreshCw className="animate-spin text-blue-600" size={24} />
              <span className="text-sm font-semibold">Carregando configurações administrativas...</span>
            </div>
          ) : (
            <>
              {activeTab === 'models' && <ModelsTab models={models} onSave={handleSaveModels} />}
              {activeTab === 'prompts' && <PromptsTab prompts={prompts} onSave={handleSavePrompts} />}
              {activeTab === 'templates' && <TemplatesTab />}
              {activeTab === 'logs' && <LogsTab />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

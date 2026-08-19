import React, { useState, useEffect } from 'react';
import { AIModelsConfig, CustomPromptsConfig } from '../../types';
import { ModelsTab } from './ModelsTab';
import { PromptsTab } from './PromptsTab';
import { TemplatesTab } from './TemplatesTab';
import { LogsTab } from './LogsTab';
import { Shield, Cpu, MessageSquareCode, FileText, Terminal, ArrowLeft, RefreshCw, AlertCircle, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { safeFetchJson } from '../../utils/api';
import { emitCriticalDbError } from '../../contexts/AlertContext';

interface Props {
  onBackToApp: () => void;
  initialTab?: TabType;
}

type TabType = 'models' | 'prompts' | 'templates' | 'logs';

export function AdminView({ onBackToApp, initialTab = 'models' }: Props) {
  const { role, profile, logout } = useAuth();
  const isAdmin = role === 'admin';

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [models, setModels] = useState<AIModelsConfig>({
    checklistModel: 'gemini-3.1-pro-preview',
    proposalModel: 'gemini-3.1-pro-preview',
    preAtaModel: 'gemini-3.1-pro-preview',
    finalAtaModel: 'gemini-3.1-pro-preview',
    chatbotModel: 'gemini-3.5-flash',
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
      const data = await safeFetchJson('/api/admin/config');
      if (data) {
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
    if (isAdmin) {
      fetchConfig();
    }
  }, [isAdmin]);

  const handleSaveModels = async (updated: AIModelsConfig) => {
    try {
      const data = await safeFetchJson<{ success: boolean; models: AIModelsConfig }>('/api/admin/config/models', {
        method: 'POST',
        body: JSON.stringify(updated),
      });
      setModels(data.models);
    } catch (apiErr: any) {
      emitCriticalDbError({
        title: 'Erro Crítico ao Salvar Modelos de IA',
        message: 'Não foi possível gravar as configurações de modelos de IA no servidor.',
        details: apiErr.message || apiErr,
        path: 'config/ai_models'
      });
      throw apiErr;
    }
  };

  const handleSavePrompts = async (updated: CustomPromptsConfig) => {
    try {
      const data = await safeFetchJson<{ success: boolean; prompts: CustomPromptsConfig }>('/api/admin/config/prompts', {
        method: 'POST',
        body: JSON.stringify(updated),
      });
      setPrompts(data.prompts);
    } catch (apiErr: any) {
      emitCriticalDbError({
        title: 'Erro Crítico ao Salvar Prompts Customizados',
        message: 'Não foi possível gravar as instruções de prompt customizadas no servidor.',
        details: apiErr.message || apiErr,
        path: 'config/custom_prompts'
      });
      throw apiErr;
    }
  };

  // If user is not an administrator
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center space-y-4 shadow-2xl border border-slate-200">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle size={26} />
          </div>
          <h2 className="text-lg font-bold text-slate-800">Acesso Restrito a Administradores</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Esta área é exclusiva para administradores da equipe Biti9 (@biti9.com.br). Seu usuário ({profile?.email}) possui perfil de membro de Suprimentos.
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={onBackToApp}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Voltar ao Gerador de Atas
            </button>
            <button
              onClick={logout}
              className="w-full py-2 text-slate-500 hover:text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
            >
              Trocar de Conta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900">
      {/* Top Header */}
      <header className="bg-slate-900 text-white h-16 px-6 flex items-center justify-between shadow-md flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-600 rounded-lg text-white">
            <Shield size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight uppercase">Painel Administrativo do Sistema</h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-600 text-white uppercase tracking-wider">
                Biti9 Admin
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Configurações Avançadas de IA, Prompts, Templates e Logs de Auditoria</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onBackToApp}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold uppercase tracking-tight transition-colors border border-slate-700 cursor-pointer"
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
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-tight transition-all cursor-pointer ${
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
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-tight transition-all cursor-pointer ${
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
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-tight transition-all cursor-pointer ${
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
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-tight transition-all cursor-pointer ${
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

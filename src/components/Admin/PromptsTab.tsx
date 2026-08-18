import React, { useState } from 'react';
import { CustomPromptsConfig } from '../../types';
import { MessageSquareCode, CheckCircle2, Save, AlertCircle, RefreshCw, Sparkles, HelpCircle } from 'lucide-react';

interface Props {
  prompts: CustomPromptsConfig;
  onSave: (updated: CustomPromptsConfig) => Promise<void>;
}

export function PromptsTab({ prompts, onSave }: Props) {
  const [formData, setFormData] = useState<CustomPromptsConfig>(prompts);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (key: keyof CustomPromptsConfig, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      await onSave(formData);
      setStatusMsg('Instruções de Prompt atualizadas com sucesso! Serão injetadas em todas as próximas análises.');
      setTimeout(() => setStatusMsg(''), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar instruções de prompt.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setFormData({
      checklistInstructions: 'Priorize regras de segurança, retenções contratuais, ART, cronogramas de mobilização e escopos de fornecimento da obra.',
      proposalInstructions: 'Verifique com rigor desvios de BDI, impostos inclusos/exclusos, reajustes, validade da proposta e condições de pagamento.',
      preAtaInstructions: 'Destaque pontos de atenção em vermelho e elabore perguntas estratégicas para direcionar a mesa de negociação.',
      finalAtaInstructions: 'Estruture acordos e pendências com clareza executiva, identificando responsáveis e prazos estritos.',
      chatbotInstructions: 'Você é um assistente especialista em suprimentos e atas de reunião de uma construtora.'
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <MessageSquareCode className="text-indigo-600" size={20} />
            Instruções de Prompt Personalizadas
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Inclua diretrizes e regras corporativas que devem ser injetadas antes da execução da IA ao gerar a Pré-Ata e a Ata Final.
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetDefaults}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 hover:bg-slate-50 px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors self-start md:self-auto"
        >
          <RefreshCw size={12} />
          Restaurar Instruções Padrão
        </button>
      </div>

      {statusMsg && (
        <div className="p-3.5 bg-green-50 border border-green-200 text-green-700 text-xs font-medium rounded-lg flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 size={16} />
          {statusMsg}
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-lg flex items-center gap-2 animate-in fade-in duration-200">
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Diretrizes da Pré-Ata e Checklist */}
        <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              Instruções de Negociação para a Pré-Ata (Etapas 2 e 4)
            </label>
            <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-bold">Pré-Ata • Template DOCX</span>
          </div>
          <p className="text-xs text-slate-500">
            Regras para orientar as perguntas da mesa de negociação, pontos críticos de atenção em vermelho e exigências mínimas da construtora. Essas instruções alimentam as seções e variáveis <code className="text-blue-700 font-mono font-semibold">{'{topics}'}</code>, <code className="text-blue-700 font-mono font-semibold">{'{divergences}'}</code> e <code className="text-blue-700 font-mono font-semibold">{'{resumo}'}</code> do template DOCX.
          </p>
          <textarea
            value={formData.preAtaInstructions}
            onChange={(e) => handleChange('preAtaInstructions', e.target.value)}
            rows={4}
            className="w-full bg-white border border-slate-300 rounded-lg p-3 text-xs text-slate-800 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none leading-relaxed resize-y"
            placeholder="Ex: Exigir obrigatoriamente prazo de entrega em 15 dias, garantia mínima de 5 anos..."
          />
        </div>

        {/* Diretrizes da Ata Final */}
        <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-600"></span>
              Instruções de Auditoria para a Ata Final (Etapa 5)
            </label>
            <span className="text-[10px] bg-green-100 text-green-800 px-2 py-0.5 rounded font-bold">Ata Final • Template DOCX</span>
          </div>
          <p className="text-xs text-slate-500">
            Critérios para validação dos itens acordados e pendentes extraídos da transcrição, prazos de envio de ART e aprovações de diretoria. Alimenta diretamente as seções <code className="text-emerald-700 font-mono font-semibold">{'{agreedItems}'}</code>, <code className="text-emerald-700 font-mono font-semibold">{'{pendingItems}'}</code> e <code className="text-emerald-700 font-mono font-semibold">{'{actionPoints}'}</code> do template DOCX.
          </p>
          <textarea
            value={formData.finalAtaInstructions}
            onChange={(e) => handleChange('finalAtaInstructions', e.target.value)}
            rows={4}
            className="w-full bg-white border border-slate-300 rounded-lg p-3 text-xs text-slate-800 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none leading-relaxed resize-y"
            placeholder="Ex: Todo item de medição deve citar a data limite do dia 25 de cada mês..."
          />
        </div>

        {/* Diretrizes de Checklist / Aderência */}
        <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-600"></span>
              Instruções para Leitura do Checklist da Obra (Etapa 2)
            </label>
            <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">Checklist</span>
          </div>
          <textarea
            value={formData.checklistInstructions}
            onChange={(e) => handleChange('checklistInstructions', e.target.value)}
            rows={3}
            className="w-full bg-white border border-slate-300 rounded-lg p-3 text-xs text-slate-800 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none leading-relaxed resize-y"
          />
        </div>

        {/* Diretrizes de Comparação de Propostas */}
        <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-600"></span>
              Instruções para Comparativo de Proposta & Divergências (Etapa 3)
            </label>
            <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded font-bold">Propostas</span>
          </div>
          <textarea
            value={formData.proposalInstructions}
            onChange={(e) => handleChange('proposalInstructions', e.target.value)}
            rows={3}
            className="w-full bg-white border border-slate-300 rounded-lg p-3 text-xs text-slate-800 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none leading-relaxed resize-y"
          />
        </div>

        {/* Instruções do Chatbot */}
        <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Sparkles size={14} className="text-blue-600" />
              Instrução do Sistema para o Chatbot (System Prompt)
            </label>
            <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold">Chatbot</span>
          </div>
          <textarea
            value={formData.chatbotInstructions}
            onChange={(e) => handleChange('chatbotInstructions', e.target.value)}
            rows={3}
            className="w-full bg-white border border-slate-300 rounded-lg p-3 text-xs text-slate-800 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none leading-relaxed resize-y"
          />
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold uppercase tracking-tight shadow-md disabled:opacity-50 transition-colors"
          >
            <Save size={16} />
            {saving ? 'Salvando Instruções...' : 'Salvar Instruções de Prompt'}
          </button>
        </div>
      </form>
    </div>
  );
}

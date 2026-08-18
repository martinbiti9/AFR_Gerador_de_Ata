import React, { useState, useEffect } from 'react';
import { Sparkles, Building2, Check, X, ShieldCheck, FileCheck, Layers } from 'lucide-react';
import { AberturaData } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  suggestedData: Partial<AberturaData> | null;
  onConfirm: (confirmed: AberturaData) => void;
}

export function MetadataSuggestionModal({ isOpen, onClose, suggestedData, onConfirm }: Props) {
  const [formData, setFormData] = useState<AberturaData>({
    obraCodigo: '',
    obraNome: '',
    assunto: '',
    servico: '',
    fornecedor: '',
    rm: '',
    cot: ''
  });

  useEffect(() => {
    if (suggestedData) {
      setFormData({
        obraCodigo: suggestedData.obraCodigo || '',
        obraNome: suggestedData.obraNome || '',
        assunto: suggestedData.assunto || '',
        servico: suggestedData.servico || '',
        fornecedor: suggestedData.fornecedor || '',
        rm: suggestedData.rm || '',
        cot: suggestedData.cot || ''
      });
    }
  }, [suggestedData]);

  if (!isOpen || !suggestedData) return null;

  const handleChange = (field: keyof AberturaData, val: string) => {
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  const handleAccept = () => {
    onConfirm(formData);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/15 rounded-xl backdrop-blur-xs">
              <Sparkles size={22} className="text-yellow-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight">Identificação da Obra Detectada pela IA</h3>
              </div>
              <p className="text-xs text-blue-100/90 mt-0.5">
                Localizamos os dados da obra nos documentos submetidos. Confirme para salvar no banco.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content & Form */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto bg-slate-50/50">
          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
            <Building2 size={16} className="text-blue-600 shrink-0 mt-0.5" />
            <p>
              Você pode revisar e ajustar os campos abaixo antes de confirmar. Ao confirmar, os dados de abertura serão atualizados e persistidos diretamente no <strong>Firestore</strong>.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Código da Obra
              </label>
              <input
                type="text"
                value={formData.obraCodigo}
                onChange={(e) => handleChange('obraCodigo', e.target.value)}
                placeholder="Ex: 0048"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Nome da Obra / Empreendimento
              </label>
              <input
                type="text"
                value={formData.obraNome}
                onChange={(e) => handleChange('obraNome', e.target.value)}
                placeholder="Ex: Residencial Bela Vista"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Fornecedor / Empresa Contratada
              </label>
              <input
                type="text"
                value={formData.fornecedor}
                onChange={(e) => handleChange('fornecedor', e.target.value)}
                placeholder="Ex: Construtora Alfa Ltda"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Assunto da Reunião
              </label>
              <input
                type="text"
                value={formData.assunto}
                onChange={(e) => handleChange('assunto', e.target.value)}
                placeholder="Ex: Alinhamento de Escopo e Minuta"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Serviço / Pacote
              </label>
              <input
                type="text"
                value={formData.servico}
                onChange={(e) => handleChange('servico', e.target.value)}
                placeholder="Ex: Instalações Hidráulicas"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                RM (Requisição)
              </label>
              <input
                type="text"
                value={formData.rm}
                onChange={(e) => handleChange('rm', e.target.value)}
                placeholder="Ex: RM-102"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                COT (Cotação)
              </label>
              <input
                type="text"
                value={formData.cot}
                onChange={(e) => handleChange('cot', e.target.value)}
                placeholder="Ex: COT-88"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
              />
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Descartar Sugestão
          </button>

          <button
            onClick={handleAccept}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md shadow-blue-200 transition-all uppercase tracking-tight"
          >
            <Check size={16} />
            Confirmar e Salvar no Banco
          </button>
        </div>

      </div>
    </div>
  );
}

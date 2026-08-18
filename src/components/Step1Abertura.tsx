import React, { useState, useEffect } from 'react';
import { AppState, AberturaData } from '../types';
import { ArrowRight } from 'lucide-react';

interface Props {
  state: AppState;
  updateState: (updates: Partial<AppState>) => void;
  onMetadataDetected?: (data: Partial<AberturaData>) => void;
}

const EMPTY_ABERTURA: AberturaData = {
  obraCodigo: '',
  obraNome: '',
  assunto: '',
  servico: '',
  fornecedor: '',
  rm: '',
  cot: ''
};

export function Step1Abertura({ state, updateState }: Props) {
  const [data, setData] = useState<AberturaData>(state.abertura || EMPTY_ABERTURA);

  // Synchronize internal form data whenever state.abertura changes (e.g. session reset or AI metadata auto-detection)
  useEffect(() => {
    setData(state.abertura || EMPTY_ABERTURA);
  }, [state.abertura]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const updated = { ...data, [e.target.name]: e.target.value };
    setData(updated);
    updateState({ abertura: updated });
  };

  const handleNext = () => {
    updateState({ abertura: data, step: 2 });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-800">Abertura da Reunião</h2>
          <p className="text-sm text-slate-500 mt-1">
            Preencha os dados básicos da reunião. Caso os campos fiquem em branco, a IA tentará preenchê-los automaticamente a cada processamento de documentos nas etapas seguintes.
          </p>
        </div>
        <button
          onClick={() => updateState({ step: 2 })}
          className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-4 py-2 bg-white border border-blue-200 rounded-lg transition-colors uppercase tracking-tight shadow-2xs"
        >
          Pular para Check List
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Código da Obra</label>
            <input 
              name="obraCodigo" value={data.obraCodigo} onChange={handleChange}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors font-semibold"
              placeholder="Ex: 0048 ou OB-1234"
            />
          </div>
          
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nome da Obra</label>
            <input 
              name="obraNome" value={data.obraNome} onChange={handleChange}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              placeholder="Ex: Residencial Bela Vista"
            />
          </div>
          
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assunto da Reunião</label>
            <input 
              name="assunto" value={data.assunto} onChange={handleChange}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              placeholder="Ex: Alinhamento de escopo e minuta contratual"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Serviço/Material</label>
            <input 
              name="servico" value={data.servico} onChange={handleChange}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              placeholder="Ex: Concreto Usinado / Instalações"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Fornecedor / Razão Social</label>
            <input 
              name="fornecedor" value={data.fornecedor} onChange={handleChange}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors font-semibold"
              placeholder="Ex: Construtora Alfa Ltda."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">RM (Requisição de Material)</label>
            <input 
              name="rm" value={data.rm} onChange={handleChange}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              placeholder="Ex: 987654"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">COT (Cotação)</label>
            <input 
              name="cot" value={data.cot} onChange={handleChange}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              placeholder="Ex: COT-88"
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-blue-600 rounded hover:bg-blue-700 uppercase tracking-tight shadow-md shadow-blue-200 transition-colors"
          >
            Avançar para Check List
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

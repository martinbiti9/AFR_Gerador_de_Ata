import React, { useState } from 'react';
import { AberturaData, FinalAtaData, FinalAtaItem } from '../types';
import { 
  X, 
  FileDown, 
  CheckCircle2, 
  Edit3, 
  Building2, 
  Calendar, 
  User, 
  Plus, 
  Trash2, 
  FileText, 
  MessageSquareText,
  Loader2,
  Sparkles,
  AlertCircle
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  abertura: AberturaData | null;
  draftData: FinalAtaData;
  activeTemplateName?: string;
  onSaveAndGenerate: (updatedData: {
    abertura: AberturaData | null;
    finalAtaData: FinalAtaData;
  }) => Promise<void>;
  loading: boolean;
}

function normalizeItem(item: string | FinalAtaItem, index: number, defaultResp: string): FinalAtaItem {
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

export function FinalAtaValidationModal({
  isOpen,
  onClose,
  abertura: initialAbertura,
  draftData: initialDraftData,
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

  const [agreedItems, setAgreedItems] = useState<FinalAtaItem[]>([]);
  const [pendingItems, setPendingItems] = useState<FinalAtaItem[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'agreed' | 'pending' | 'notes' | 'header'>('agreed');

  // Synchronize when modal opens
  React.useEffect(() => {
    if (isOpen) {
      if (initialAbertura) setAbertura(initialAbertura);
      const defaultResp = initialAbertura?.fornecedor || 'Contratada';
      
      const normAgreed = (initialDraftData?.agreedItems || []).map((it, idx) => 
        normalizeItem(it, idx, defaultResp)
      );
      setAgreedItems(normAgreed);

      const normPending = (initialDraftData?.pendingItems || []).map((it, idx) => 
        normalizeItem(it, idx, 'Fornecedor / Engenharia')
      );
      setPendingItems(normPending);

      setNotes(initialDraftData?.notes || '');
    }
  }, [isOpen, initialAbertura, initialDraftData]);

  if (!isOpen) return null;

  const updateAgreed = (index: number, field: keyof FinalAtaItem, value: any) => {
    const updated = [...agreedItems];
    updated[index] = { ...updated[index], [field]: value };
    setAgreedItems(updated);
  };

  const removeAgreed = (index: number) => {
    setAgreedItems(agreedItems.filter((_, idx) => idx !== index));
  };

  const addAgreed = () => {
    const newIdx = agreedItems.length + 1;
    setAgreedItems([
      ...agreedItems,
      {
        num: String(newIdx).padStart(2, '0'),
        titulo: 'Nova Deliberação Acordada',
        descricao: 'Texto detalhado do acordo firmado na reunião...',
        responsavel: abertura.fornecedor || 'Contratada',
        prazo: 'Conforme cronograma'
      }
    ]);
  };

  const updatePending = (index: number, field: keyof FinalAtaItem, value: any) => {
    const updated = [...pendingItems];
    updated[index] = { ...updated[index], [field]: value };
    setPendingItems(updated);
  };

  const removePending = (index: number) => {
    setPendingItems(pendingItems.filter((_, idx) => idx !== index));
  };

  const addPending = () => {
    const newIdx = pendingItems.length + 1;
    setPendingItems([
      ...pendingItems,
      {
        num: String(newIdx).padStart(2, '0'),
        titulo: 'Nova Pendência de Documento / Prazo',
        descricao: 'Obrigação ou entrega pendente a ser realizada...',
        responsavel: abertura.fornecedor || 'Fornecedor / Engenharia',
        prazo: 'A definir'
      }
    ]);
  };

  const handleConfirm = async () => {
    await onSaveAndGenerate({
      abertura,
      finalAtaData: {
        agreedItems,
        pendingItems,
        notes
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600/30 border border-emerald-400/40 rounded-xl text-emerald-300">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Validação de Conteúdo da Ata Final
                <span className="text-[11px] font-normal px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Validação Prévia ao DOCX
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Revise os acordos, prazos e pendências antes da compilação no Template {activeTemplateName ? `("${activeTemplateName}")` : ''}.
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
              onClick={() => setActiveTab('agreed')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
                activeTab === 'agreed'
                  ? 'border-emerald-600 text-emerald-700 bg-white shadow-2xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 size={15} className={activeTab === 'agreed' ? 'text-emerald-600' : 'text-slate-400'} />
              Itens Acordados / Deliberações ({agreedItems.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
                activeTab === 'pending'
                  ? 'border-red-600 text-red-600 bg-white shadow-2xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Edit3 size={15} className={activeTab === 'pending' ? 'text-red-600' : 'text-slate-400'} />
              Pendências e Prazos ({pendingItems.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('notes')}
              className={`px-4 py-3 text-xs font-bold border-b-2 flex items-center gap-2 transition-all ${
                activeTab === 'notes'
                  ? 'border-blue-600 text-blue-600 bg-white shadow-2xs'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquareText size={15} className={activeTab === 'notes' ? 'text-blue-600' : 'text-slate-400'} />
              Resumo Executivo
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
              Dados da Obra
            </button>
          </div>

          <div className="text-[11px] text-slate-500 hidden sm:block">
            {pendingItems.length > 0 ? (
              <span className="text-red-600 font-semibold">{pendingItems.length} pendências serão destacadas em vermelho</span>
            ) : (
              <span className="text-emerald-700 font-semibold">Sem pendências abertas</span>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
          {/* TAB 1: ITENS ACORDADOS */}
          {activeTab === 'agreed' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-900">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-emerald-600 shrink-0" />
                  <span>
                    Deliberações formais que serão inseridas na tabela principal do template DOCX com numeração sequencial.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={addAgreed}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-700 text-white rounded-lg font-bold hover:bg-emerald-800 transition-colors shrink-0 shadow-xs"
                >
                  <Plus size={14} />
                  Adicionar Deliberação
                </button>
              </div>

              <div className="space-y-3">
                {agreedItems.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300 text-slate-400 text-xs">
                    Nenhum item de acordo registrado. Clique em "+ Adicionar Deliberação" para inserir.
                  </div>
                ) : (
                  agreedItems.map((item, idx) => (
                    <div
                      key={`modal-agreed-${idx}`}
                      className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3 hover:border-emerald-300 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-xs font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                            #{item.num || String(idx + 1).padStart(2, '0')}
                          </span>
                          <input
                            type="text"
                            value={item.titulo || ''}
                            onChange={(e) => updateAgreed(idx, 'titulo', e.target.value)}
                            placeholder="Título do Acordo ou Assunto..."
                            className="flex-1 font-bold text-xs text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-emerald-500 focus:outline-none px-1 py-0.5"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAgreed(idx)}
                          className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors"
                          title="Remover deliberação"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <textarea
                        value={item.descricao || ''}
                        onChange={(e) => updateAgreed(idx, 'descricao', e.target.value)}
                        rows={2}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-none resize-y"
                        placeholder="Texto claro e conclusivo do que foi deliberado na reunião..."
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1 border-t border-slate-100">
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                          <User size={13} className="text-slate-400 shrink-0" />
                          <div className="flex-1">
                            <span className="text-[10px] text-slate-400 block leading-tight">Responsável:</span>
                            <input
                              type="text"
                              value={item.responsavel || ''}
                              onChange={(e) => updateAgreed(idx, 'responsavel', e.target.value)}
                              className="w-full text-xs text-slate-700 bg-transparent focus:outline-none font-medium"
                              placeholder="Nome ou Empresa do Responsável"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                          <Calendar size={13} className="text-slate-400 shrink-0" />
                          <div className="flex-1">
                            <span className="text-[10px] text-slate-400 block leading-tight">Prazo:</span>
                            <input
                              type="text"
                              value={item.prazo || ''}
                              onChange={(e) => updateAgreed(idx, 'prazo', e.target.value)}
                              className="w-full text-xs text-slate-700 bg-transparent focus:outline-none font-medium"
                              placeholder="Prazo acordado"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 2: PENDÊNCIAS E PRAZOS */}
          {activeTab === 'pending' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-red-50/80 border border-red-200 rounded-xl p-3.5 text-xs text-red-900">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="text-red-600 shrink-0" />
                  <span>
                    Pendências e prazos críticos. <strong>Todos os itens desta seção receberão destaque em cor vermelha no documento DOCX final.</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={addPending}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors shrink-0 shadow-xs"
                >
                  <Plus size={14} />
                  Adicionar Pendência
                </button>
              </div>

              <div className="space-y-3">
                {pendingItems.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-xl border border-dashed border-red-200 text-slate-400 text-xs">
                    Nenhuma pendência pendente. Clique em "+ Adicionar Pendência" caso haja documentos ou entregas a cobrar.
                  </div>
                ) : (
                  pendingItems.map((item, idx) => (
                    <div
                      key={`modal-pending-${idx}`}
                      className="bg-white border border-red-200 rounded-xl p-4 shadow-2xs space-y-3 hover:border-red-400 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-xs font-mono font-bold bg-red-100 text-red-800 px-2 py-0.5 rounded">
                            #{item.num || String(idx + 1).padStart(2, '0')}
                          </span>
                          <input
                            type="text"
                            value={item.titulo || ''}
                            onChange={(e) => updatePending(idx, 'titulo', e.target.value)}
                            placeholder="Título da Pendência / Obrigação..."
                            className="flex-1 font-bold text-xs text-red-900 bg-transparent border-b border-transparent hover:border-red-200 focus:border-red-500 focus:outline-none px-1 py-0.5"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removePending(idx)}
                          className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors"
                          title="Remover pendência"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <textarea
                        value={item.descricao || ''}
                        onChange={(e) => updatePending(idx, 'descricao', e.target.value)}
                        rows={2}
                        className="w-full bg-red-50/20 border border-red-200 rounded-lg p-2.5 text-xs text-red-950 focus:bg-white focus:border-red-500 focus:outline-none resize-y font-medium"
                        placeholder="Descreva a pendência e o motivo do destaque..."
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1 border-t border-red-100">
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                          <User size={13} className="text-slate-400 shrink-0" />
                          <div className="flex-1">
                            <span className="text-[10px] text-slate-400 block leading-tight">Responsável:</span>
                            <input
                              type="text"
                              value={item.responsavel || ''}
                              onChange={(e) => updatePending(idx, 'responsavel', e.target.value)}
                              className="w-full text-xs text-slate-700 bg-transparent focus:outline-none font-medium"
                              placeholder="Responsável pela pendência"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 bg-red-50/50 border border-red-200 rounded-lg px-2.5 py-1.5">
                          <Calendar size={13} className="text-red-500 shrink-0" />
                          <div className="flex-1">
                            <span className="text-[10px] text-red-600 font-semibold block leading-tight">Prazo Limite:</span>
                            <input
                              type="text"
                              value={item.prazo || ''}
                              onChange={(e) => updatePending(idx, 'prazo', e.target.value)}
                              className="w-full text-xs text-red-900 bg-transparent focus:outline-none font-bold"
                              placeholder="Data limite de entrega"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: RESUMO EXECUTIVO */}
          {activeTab === 'notes' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquareText size={15} className="text-blue-600" />
                  Resumo Executivo / Anotações Gerais da Reunião
                </h3>
                <p className="text-xs text-slate-500">
                  Este texto alimentará a seção introdutória ou sumário de deliberações no documento final.
                </p>
              </div>

              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={6}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none resize-y leading-relaxed font-sans"
                placeholder="Insira o resumo executivo dos principais pontos tratados na reunião..."
              />
            </div>
          )}

          {/* TAB 4: DADOS DA OBRA */}
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
                    placeholder="Ex: Ata de Negociação Final e Fechamento de Contrato"
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
            <FileText size={14} className="text-emerald-600" />
            <span>Layout verificado e validado para injeção no template oficial.</span>
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
              className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-lg shadow-emerald-200 uppercase tracking-tight transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Gerando Ata Final (.docx)...
                </>
              ) : (
                <>
                  <FileDown size={16} />
                  Confirmar e Baixar Ata Final (.docx)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

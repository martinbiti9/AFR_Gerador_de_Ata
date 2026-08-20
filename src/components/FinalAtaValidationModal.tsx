import React, { useState } from 'react';
import { 
  AberturaData, 
  FinalAtaData, 
  FinalAtaItem, 
  ParticipanteItem, 
  ValoresComerciais, 
  PrazosCronograma,
  TopicCard
} from '../types';
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
  Loader2, 
  Users, 
  DollarSign, 
  Clock, 
  ListOrdered, 
  HelpCircle, 
  Calendar, 
  CheckSquare, 
  AlertCircle
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  abertura: AberturaData | null;
  finalData: FinalAtaData | null;
  activeTemplateName?: string;
  serverError?: string;
  onSaveAndGenerate: (updatedData: {
    abertura: AberturaData | null;
    finalData: FinalAtaData;
  }) => Promise<void>;
  loading: boolean;
}

export function FinalAtaValidationModal({
  isOpen,
  onClose,
  abertura: initialAbertura,
  finalData: initialFinalData,
  activeTemplateName = '',
  serverError,
  onSaveAndGenerate,
  loading
}: Props) {
  const modalBodyRef = React.useRef<HTMLDivElement>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [abertura, setAbertura] = useState<AberturaData>(() => ({
    obraCodigo: initialAbertura?.obraCodigo || '0590',
    obraNome: initialAbertura?.obraNome || 'Hospital Sabará',
    fornecedor: initialAbertura?.fornecedor || 'Construmódulo Sistemas Internos Ltda.',
    assunto: initialAbertura?.assunto || 'REUNIÃO DE Checklist de Contratação e Condições Gerais de Fornecimento',
    servico: initialAbertura?.servico || 'Drywall, forros e divisórias internas',
    rm: initialAbertura?.rm || '982366',
    cot: initialAbertura?.cot || 'COT-590-095',
    ataNumero: initialAbertura?.ataNumero || '01',
    dataReuniao: initialAbertura?.dataReuniao || '09/01/2025',
    horario: initialAbertura?.horario || '10:30h',
    local: initialAbertura?.local || 'Online - Teams',
    linkReuniao: initialAbertura?.linkReuniao || '',
    folha: initialAbertura?.folha || '02',
    resumoExecutivo: initialAbertura?.resumoExecutivo || initialFinalData?.notes || initialFinalData?.resumo || '',
    participantes: initialAbertura?.participantes?.length ? initialAbertura.participantes : [
      {
        id: 'p-1',
        nome: 'Thais Louise Barroso',
        cargoDepto: 'SUPRIMENTOS',
        empresa: 'Afonso França',
        email: 'thais.barroso@afonsofranca.com.br',
        visto: 'Visto'
      }
    ],
    valoresComerciais: initialAbertura?.valoresComerciais || {
      valorTotal: 'R$ 2.782.400,00',
      valorServicos: '',
      valorIndustrializacao: '',
      valorVendaMercantil: '',
      valorLocacao: '',
      valorFretes: '',
      valorGerenciamento: '',
      valorFaturamentoDireto: 'Mesma condição de pagamento da contratação inicial',
      sinalMobilizacao: 'Via recibo ou NF? Como será descontado',
      condicaoPagamento: '35% Projeto; 35% contra o aviso de liberação do material; 30% 14 dias após o aviso; pagamento dias 10, 20 ou 30 exclusivamente via crédito em conta.',
      retencaoGarantia: '5% sobre o valor total da contratação. Liberação 180 dias após o Termo de Encerramento Definitivo e entrega integral da documentação.',
      riscoSacado: 'Risco sacado a 120 dias – aplicável apenas ao faturamento da Afonso França. Taxa a.m. de 1,311%.',
      reajuste: 'Fixo por 12 meses / fixo até o término da prestação dos serviços.'
    },
    prazosCronograma: initialAbertura?.prazosCronograma || {
      mobilizacao: 'Início da mobilização de colaboradores conforme alinhado',
      elaboracaoProjeto: 'xx dias após aprovação do pedido',
      aprovacaoProjeto: 'xx dias após envio do projeto',
      entregaMaterial: 'dias a partir do pedido',
      medidasDefinitivas: 'dias após o envio do pedido',
      fabricacao: 'xx dias após aprovação do projeto',
      execucao: 'xx dias após mobilização',
      comissionamento: 'Conforme cronograma',
      operacaoAssistida: 'Conforme cronograma'
    }
  }));

  const parseToStructuredItems = (items: (string | FinalAtaItem)[]): FinalAtaItem[] => {
    return items.map((it, idx) => {
      if (typeof it === 'string') {
        return {
          num: String(idx + 1).padStart(2, '0'),
          titulo: `Item ${idx + 1}`,
          descricao: it,
          responsavel: 'Informativo / Contratada',
          prazo: 'Conforme cronograma'
        };
      }
      return {
        num: it.num || String(idx + 1).padStart(2, '0'),
        titulo: it.titulo || `Item ${idx + 1}`,
        descricao: it.descricao || '',
        responsavel: it.responsavel || 'Informativo / Contratada',
        prazo: it.prazo || 'Conforme cronograma',
        blocos: it.blocos
      };
    });
  };

  const [agreedItems, setAgreedItems] = useState<FinalAtaItem[]>(() =>
    parseToStructuredItems(initialFinalData?.agreedItems || [])
  );
  const [pendingItems, setPendingItems] = useState<FinalAtaItem[]>(() =>
    parseToStructuredItems(initialFinalData?.pendingItems || [])
  );
  const [notes, setNotes] = useState<string>(initialFinalData?.notes || initialFinalData?.resumo || initialAbertura?.resumoExecutivo || '');
  const [activeTab, setActiveTab] = useState<'agreed' | 'pending' | 'participantes' | 'resumo' | 'header' | 'commercial' | 'prazos'>('agreed');

  React.useEffect(() => {
    if (isOpen) {
      const execSummary = initialAbertura?.resumoExecutivo || initialFinalData?.notes || initialFinalData?.resumo || '';
      const rawParts = (initialFinalData?.participantes && initialFinalData.participantes.length > 0)
        ? initialFinalData.participantes
        : (initialAbertura?.participantes || []);

      const validParts = rawParts.map((p: any, idx: number) => ({
        id: p.id || `p-${idx + 1}`,
        nome: p.nome || '',
        cargoDepto: p.cargoDepto || p.cargo || '',
        empresa: p.empresa || '',
        email: p.email || '',
        visto: p.visto || ''
      }));

      if (initialAbertura) {
        setAbertura(prev => ({
          ...prev,
          ...initialAbertura,
          resumoExecutivo: execSummary || prev.resumoExecutivo,
          participantes: validParts.length > 0 ? validParts : prev.participantes,
          valoresComerciais: { ...prev.valoresComerciais, ...(initialAbertura.valoresComerciais || {}) },
          prazosCronograma: { ...prev.prazosCronograma, ...(initialAbertura.prazosCronograma || {}) }
        }));
      } else if (validParts.length > 0) {
        setAbertura(prev => ({ ...prev, participantes: validParts }));
      }

      if (initialFinalData) {
        setAgreedItems(parseToStructuredItems(initialFinalData.agreedItems || []));
        setPendingItems(parseToStructuredItems(initialFinalData.pendingItems || []));
        setNotes(initialFinalData.notes || initialFinalData.resumo || execSummary);
      }
    }
  }, [isOpen, initialAbertura, initialFinalData]);

  if (!isOpen) return null;

  const updateAbertura = (field: keyof AberturaData, value: any) => {
    setAbertura(prev => ({ ...prev, [field]: value }));
  };

  const updateValores = (field: keyof ValoresComerciais, value: string) => {
    setAbertura(prev => ({
      ...prev,
      valoresComerciais: {
        ...(prev.valoresComerciais || {}),
        [field]: value
      }
    }));
  };

  const updatePrazos = (field: keyof PrazosCronograma, value: string) => {
    setAbertura(prev => ({
      ...prev,
      prazosCronograma: {
        ...(prev.prazosCronograma || {}),
        [field]: value
      }
    }));
  };

  const addParticipante = () => {
    const newP: ParticipanteItem = {
      id: `p-${(abertura.participantes || []).length + 1}`,
      nome: '',
      cargoDepto: '',
      empresa: '',
      email: '',
      visto: ''
    };
    setAbertura(prev => ({
      ...prev,
      participantes: [...(prev.participantes || []), newP]
    }));
  };

  const updateParticipante = (index: number, field: keyof ParticipanteItem, value: string) => {
    const list = [...(abertura.participantes || [])];
    list[index] = { ...list[index], [field]: value };
    setAbertura(prev => ({ ...prev, participantes: list }));
  };

  const removeParticipante = (index: number) => {
    const list = (abertura.participantes || []).filter((_, idx) => idx !== index);
    setAbertura(prev => ({ ...prev, participantes: list }));
  };

  const updateAgreed = (index: number, field: keyof FinalAtaItem, value: string) => {
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
        num: String(newIdx),
        titulo: `Item Acordado ${newIdx}`,
        descricao: 'Condição técnica ou comercial alinhada e aprovada durante a reunião...',
        responsavel: 'Informativo / Contratada',
        prazo: 'Conforme cronograma'
      }
    ]);
  };

  const updatePending = (index: number, field: keyof FinalAtaItem, value: string) => {
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
        num: String(newIdx),
        titulo: `Pendência ${newIdx}`,
        descricao: 'Ação pendente, aprovação necessária ou documento a enviar com prazo estipulado...',
        responsavel: 'Fornecedor / Suprimentos',
        prazo: 'Até data estipulada'
      }
    ]);
  };

  React.useEffect(() => {
    if (serverError) {
      setErrorMsg(serverError);
      if (modalBodyRef.current) {
        modalBodyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [serverError]);

  const handleConfirm = async () => {
    setErrorMsg('');
    try {
      const finalSummary = notes || abertura.resumoExecutivo || '';
      const syncedAbertura: AberturaData = {
        ...abertura,
        resumoExecutivo: finalSummary
      };
      await onSaveAndGenerate({
        abertura: syncedAbertura,
        finalData: {
          agreedItems,
          pendingItems,
          notes: finalSummary,
          resumo: finalSummary
        }
      });
    } catch (err: any) {
      const msg = err?.message || 'Erro ao processar e validar o documento DOCX da Ata Final.';
      setErrorMsg(msg);
      if (modalBodyRef.current) {
        modalBodyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const hasHeaderIssues = !abertura.obraCodigo || !abertura.fornecedor || !abertura.servico || !abertura.assunto;
  const hasCommercialIssues = !abertura.valoresComerciais?.valorTotal;
  const hasParticipantIssues = !(abertura.participantes && abertura.participantes.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600/30 border border-emerald-400/40 rounded-xl text-emerald-300">
              <FileCheck2Icon />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Validação de Conteúdo da Ata Final (Template DOCX)
                <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  Estrutura Afonso França
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Revise os itens acordados, pendências em vermelho, dados da reunião e valores antes de gerar o DOCX final.
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
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 gap-2 shrink-0 overflow-x-auto text-xs font-bold uppercase tracking-wider text-slate-600">
          <button
            type="button"
            onClick={() => setActiveTab('agreed')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'agreed'
                ? 'border-emerald-600 text-emerald-700 bg-white'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <CheckSquare size={15} className="text-emerald-600" />
            1. Itens Acordados ({agreedItems.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'pending'
                ? 'border-red-600 text-red-700 bg-white'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <AlertCircle size={15} className="text-red-500" />
            2. Pendências Críticas ({pendingItems.length})
            {pendingItems.length > 0 && (
              <span className="ml-1 w-2 h-2 rounded-full bg-red-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('participantes')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'participantes'
                ? 'border-indigo-600 text-indigo-700 bg-white'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Users size={15} className="text-indigo-600" />
            3. Participantes ({(abertura.participantes || []).length})
            {hasParticipantIssues && (
              <span className="ml-1 w-2 h-2 rounded-full bg-amber-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('resumo')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'resumo'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <FileText size={15} />
            4. Resumo Executivo
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('header')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'header'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Building2 size={15} />
            5. Obra & Cabeçalho
            {hasHeaderIssues && (
              <span className="ml-1 w-2 h-2 rounded-full bg-amber-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('commercial')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'commercial'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <DollarSign size={15} />
            6. Valores Comerciais
            {hasCommercialIssues && (
              <span className="ml-1 w-2 h-2 rounded-full bg-amber-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('prazos')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'prazos'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Clock size={15} />
            7. Cronograma & Prazos
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div ref={modalBodyRef} className="flex-1 overflow-y-auto p-6 bg-slate-50/50 space-y-6">
          {/* Detailed Error / Quality Verification Report Alert Card */}
          {errorMsg && (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 shadow-sm animate-in fade-in slide-in-from-top-2 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-red-100 border border-red-200 rounded-lg text-red-600 shrink-0 mt-0.5">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-red-900 flex items-center gap-2">
                      Ajustes Necessários para a Geração da Ata Final
                    </h3>
                    <div className="text-xs text-red-700 mt-1 whitespace-pre-line font-medium leading-relaxed">
                      {errorMsg}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMsg('')}
                  className="text-red-400 hover:text-red-700 p-1 rounded-md transition-colors shrink-0"
                  title="Ocultar aviso de erro"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Action Buttons to Switch to the Tab Requiring Fixes */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-red-200">
                <span className="text-[11px] font-bold uppercase tracking-wider text-red-800">
                  Navegar para Ajustar:
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('header')}
                  className="px-2.5 py-1 text-xs font-semibold bg-white text-red-700 hover:bg-red-100 border border-red-200 rounded-md transition-colors flex items-center gap-1 shadow-2xs"
                >
                  <Building2 size={13} /> Obra & Cabeçalho
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('commercial')}
                  className="px-2.5 py-1 text-xs font-semibold bg-white text-red-700 hover:bg-red-100 border border-red-200 rounded-md transition-colors flex items-center gap-1 shadow-2xs"
                >
                  <DollarSign size={13} /> Valores Comerciais
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('prazos')}
                  className="px-2.5 py-1 text-xs font-semibold bg-white text-red-700 hover:bg-red-100 border border-red-200 rounded-md transition-colors flex items-center gap-1 shadow-2xs"
                >
                  <Clock size={13} /> Cronograma & Prazos
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('pending')}
                  className="px-2.5 py-1 text-xs font-semibold bg-white text-red-700 hover:bg-red-100 border border-red-200 rounded-md transition-colors flex items-center gap-1 shadow-2xs"
                >
                  <AlertCircle size={13} /> Pendências Críticas
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('agreed')}
                  className="px-2.5 py-1 text-xs font-semibold bg-white text-red-700 hover:bg-red-100 border border-red-200 rounded-md transition-colors flex items-center gap-1 shadow-2xs"
                >
                  <CheckSquare size={13} /> Itens Acordados
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('participantes')}
                  className="px-2.5 py-1 text-xs font-semibold bg-white text-red-700 hover:bg-red-100 border border-red-200 rounded-md transition-colors flex items-center gap-1 shadow-2xs"
                >
                  <Users size={13} /> Participantes
                </button>
              </div>
            </div>
          )}
          {/* TAB 1: ITENS ACORDADOS */}
          {activeTab === 'agreed' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <CheckSquare size={16} className="text-emerald-600" />
                    Itens Deliberados e Acordados ({agreedItems.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Cláusulas, alinhamentos e responsabilidades consolidados durante a reunião de fechamento.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addAgreed}
                  className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3.5 py-2 rounded-lg transition-colors shadow-2xs"
                >
                  <Plus size={14} /> Adicionar Item Acordado
                </button>
              </div>

              <div className="space-y-3">
                {agreedItems.map((item, idx) => (
                  <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          className="w-12 bg-emerald-50 border border-emerald-200 rounded p-1 text-xs font-bold text-emerald-800 text-center"
                          value={item.num || String(idx + 1)}
                          onChange={(e) => updateAgreed(idx, 'num', e.target.value)}
                          title="Número do Item"
                        />
                        <input
                          type="text"
                          className="flex-1 bg-slate-50 border border-slate-200 rounded p-1.5 text-xs font-bold text-slate-800"
                          value={item.titulo || ''}
                          onChange={(e) => updateAgreed(idx, 'titulo', e.target.value)}
                          placeholder="Título do Item Acordado"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAgreed(idx)}
                        className="text-slate-400 hover:text-red-600 p-1.5 rounded transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          Descrição / Deliberação Acordada
                        </label>
                        <textarea
                          rows={2}
                          className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-800"
                          value={item.descricao || ''}
                          onChange={(e) => updateAgreed(idx, 'descricao', e.target.value)}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                            Responsável
                          </label>
                          <input
                            type="text"
                            className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-slate-800"
                            value={item.responsavel || ''}
                            onChange={(e) => updateAgreed(idx, 'responsavel', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                            Prazo
                          </label>
                          <input
                            type="text"
                            className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-slate-800"
                            value={item.prazo || ''}
                            onChange={(e) => updateAgreed(idx, 'prazo', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: PENDÊNCIAS CRÍTICAS */}
          {activeTab === 'pending' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <AlertCircle size={16} className="text-red-600" />
                    Pendências e Ações Críticas (Destaque em Vermelho no DOCX) ({pendingItems.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ações condicionantes para início das atividades que requerem acompanhamento estrito de prazos e responsáveis.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addPending}
                  className="flex items-center gap-1.5 text-xs font-bold text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 px-3.5 py-2 rounded-lg transition-colors shadow-2xs"
                >
                  <Plus size={14} /> Adicionar Pendência
                </button>
              </div>

              <div className="space-y-3">
                {pendingItems.map((item, idx) => (
                  <div key={idx} className="bg-red-50/30 border border-red-200 rounded-xl p-4 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-red-100 pb-2">
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          className="w-12 bg-red-100 border border-red-300 rounded p-1 text-xs font-bold text-red-900 text-center"
                          value={item.num || String(idx + 1)}
                          onChange={(e) => updatePending(idx, 'num', e.target.value)}
                          title="Número da Pendência"
                        />
                        <input
                          type="text"
                          className="flex-1 bg-white border border-red-200 rounded p-1.5 text-xs font-bold text-red-900"
                          value={item.titulo || ''}
                          onChange={(e) => updatePending(idx, 'titulo', e.target.value)}
                          placeholder="Título da Pendência"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removePending(idx)}
                        className="text-slate-400 hover:text-red-600 p-1.5 rounded transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <label className="text-[10px] font-bold text-red-700 uppercase tracking-wider block mb-1">
                          Descrição da Pendência / Ação Exigida
                        </label>
                        <textarea
                          rows={2}
                          className="w-full bg-white border border-red-200 rounded p-2 text-xs text-red-900 font-medium"
                          value={item.descricao || ''}
                          onChange={(e) => updatePending(idx, 'descricao', e.target.value)}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-red-700 uppercase tracking-wider block mb-1">
                            Responsável
                          </label>
                          <input
                            type="text"
                            className="w-full bg-white border border-red-200 rounded p-1.5 text-xs text-red-900"
                            value={item.responsavel || ''}
                            onChange={(e) => updatePending(idx, 'responsavel', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-red-700 uppercase tracking-wider block mb-1">
                            Prazo Estipulado
                          </label>
                          <input
                            type="text"
                            className="w-full bg-white border border-red-200 rounded p-1.5 text-xs text-red-900"
                            value={item.prazo || ''}
                            onChange={(e) => updatePending(idx, 'prazo', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: PARTICIPANTES DA REUNIÃO */}
          {activeTab === 'participantes' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <Users size={16} className="text-indigo-600" />
                      Tabela de Participantes da Reunião ({(abertura.participantes || []).length})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Identificação dos presentes extraídos da transcrição, dados de abertura e propostas.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addParticipante}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3.5 py-2 rounded-lg transition-colors shadow-2xs w-fit"
                  >
                    <Plus size={14} /> Adicionar Participante
                  </button>
                </div>

                <div className="bg-indigo-50/70 border border-indigo-100 rounded-lg p-3 text-xs text-indigo-900 flex items-start gap-2.5">
                  <Sparkles size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>Leitura Automática pela IA:</strong> Os participantes foram detectados com base na transcrição das falas e apresentações da reunião. Revise e complete os campos de <em>Nome</em>, <em>Cargo/Departamento</em>, <em>Empresa</em> e <em>E-mail</em> antes de emitir a versão final da Ata.
                  </p>
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-3 w-10 text-center">#</th>
                        <th className="p-3 min-w-[180px]">Nome Completo</th>
                        <th className="p-3 min-w-[160px]">Cargo / Departamento</th>
                        <th className="p-3 min-w-[160px]">Empresa</th>
                        <th className="p-3 min-w-[180px]">E-mail Corporativo</th>
                        <th className="p-3 min-w-[100px]">Visto / Presença</th>
                        <th className="p-3 text-center w-12">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {(abertura.participantes || []).length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-slate-400 text-xs italic">
                            Nenhum participante cadastrado. Clique em "Adicionar Participante" acima.
                          </td>
                        </tr>
                      ) : (
                        (abertura.participantes || []).map((p, idx) => (
                          <tr key={p.id || idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-2.5 text-center text-slate-400 font-bold text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                placeholder="Nome do Participante"
                                className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs font-semibold text-slate-800 focus:bg-white focus:border-indigo-500"
                                value={p.nome}
                                onChange={(e) => updateParticipante(idx, 'nome', e.target.value)}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                placeholder="Ex: Eng. Coordenador"
                                className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-slate-800 focus:bg-white focus:border-indigo-500"
                                value={p.cargoDepto || ''}
                                onChange={(e) => updateParticipante(idx, 'cargoDepto', e.target.value)}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                placeholder="Ex: Afonso França / Fornecedor"
                                className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-slate-800 focus:bg-white focus:border-indigo-500"
                                value={p.empresa}
                                onChange={(e) => updateParticipante(idx, 'empresa', e.target.value)}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="email"
                                placeholder="email@empresa.com.br"
                                className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-slate-800 focus:bg-white focus:border-indigo-500"
                                value={p.email}
                                onChange={(e) => updateParticipante(idx, 'email', e.target.value)}
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="text"
                                placeholder="Presente"
                                className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-slate-800 focus:bg-white focus:border-indigo-500"
                                value={p.visto || ''}
                                onChange={(e) => updateParticipante(idx, 'visto', e.target.value)}
                              />
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeParticipante(idx)}
                                title="Remover participante"
                                className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: CABEÇALHO & DADOS DA OBRA */}
          {activeTab === 'header' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Building2 size={16} className="text-blue-600" />
                    Identificação da Reunião e Obra (Template DOCX)
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('participantes')}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                  >
                    <Users size={14} /> Ver Participantes ({(abertura.participantes || []).length})
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Código da Obra</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold"
                      value={abertura.obraCodigo}
                      onChange={(e) => updateAbertura('obraCodigo', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-1 md:col-span-2">
                    <label className="font-bold text-slate-500 block mb-1">Nome da Obra / Empreendimento</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold"
                      value={abertura.obraNome}
                      onChange={(e) => updateAbertura('obraNome', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Ata nº</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold"
                      value={abertura.ataNumero || '01'}
                      onChange={(e) => updateAbertura('ataNumero', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2 md:col-span-3">
                    <label className="font-bold text-slate-500 block mb-1">Fornecedor / Razão Social</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold"
                      value={abertura.fornecedor}
                      onChange={(e) => updateAbertura('fornecedor', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Folha</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold"
                      value={abertura.folha || '02'}
                      onChange={(e) => updateAbertura('folha', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2 md:col-span-4">
                    <label className="font-bold text-slate-500 block mb-1">Assunto / Tipo de Reunião</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold"
                      value={abertura.assunto}
                      onChange={(e) => updateAbertura('assunto', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="font-bold text-slate-500 block mb-1">Pacote / Escopo de Serviço</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold"
                      value={abertura.servico}
                      onChange={(e) => updateAbertura('servico', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">RM (Requisição)</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold"
                      value={abertura.rm}
                      onChange={(e) => updateAbertura('rm', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">COT (Cotação)</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold"
                      value={abertura.cot}
                      onChange={(e) => updateAbertura('cot', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Data da Reunião</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold"
                      value={abertura.dataReuniao || ''}
                      onChange={(e) => updateAbertura('dataReuniao', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Horário</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold"
                      value={abertura.horario || ''}
                      onChange={(e) => updateAbertura('horario', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Local</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold"
                      value={abertura.local || ''}
                      onChange={(e) => updateAbertura('local', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Link da Reunião</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold"
                      value={abertura.linkReuniao || ''}
                      onChange={(e) => updateAbertura('linkReuniao', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: RESUMO EXECUTIVO */}
          {activeTab === 'resumo' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <FileText size={16} className="text-blue-600" />
                  Resumo Executivo da Ata / Fechamento da Reunião
                </h3>
                <textarea
                  rows={8}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-xs text-slate-800 leading-relaxed focus:bg-white focus:outline-none focus:border-blue-500"
                  value={abertura.resumoExecutivo || notes}
                  onChange={(e) => {
                    updateAbertura('resumoExecutivo', e.target.value);
                    setNotes(e.target.value);
                  }}
                  placeholder="Ex: A reunião consolidou com sucesso o fechamento comercial e técnico para a execução do escopo..."
                />
              </div>
            </div>
          )}

          {/* TAB 5: VALORES & CONDIÇÕES */}
          {activeTab === 'commercial' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <DollarSign size={16} className="text-emerald-600" />
                  Abertura de Valores Comerciais da Contratação (Template DOCX)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div className="sm:col-span-2 md:col-span-3 bg-emerald-50/50 p-3 rounded-lg border border-emerald-200">
                    <label className="font-bold text-emerald-900 block mb-1">Valor Negociado Total</label>
                    <input
                      type="text"
                      className="w-full bg-white border border-emerald-300 rounded p-2 text-sm font-bold text-emerald-800"
                      value={abertura.valoresComerciais?.valorTotal || ''}
                      onChange={(e) => updateValores('valorTotal', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Valor Prestação de Serviços</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.valoresComerciais?.valorServicos || ''}
                      onChange={(e) => updateValores('valorServicos', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Valor Industrialização</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.valoresComerciais?.valorIndustrializacao || ''}
                      onChange={(e) => updateValores('valorIndustrializacao', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Valor Venda Mercantil</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.valoresComerciais?.valorVendaMercantil || ''}
                      onChange={(e) => updateValores('valorVendaMercantil', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Valor Locação de Equipamentos</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.valoresComerciais?.valorLocacao || ''}
                      onChange={(e) => updateValores('valorLocacao', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Valor de Fretes</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.valoresComerciais?.valorFretes || ''}
                      onChange={(e) => updateValores('valorFretes', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Valor de Gerenciamento / Projetos</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.valoresComerciais?.valorGerenciamento || ''}
                      onChange={(e) => updateValores('valorGerenciamento', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2 md:col-span-3">
                    <label className="font-bold text-slate-500 block mb-1">Valor de Faturamento Direto</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.valoresComerciais?.valorFaturamentoDireto || ''}
                      onChange={(e) => updateValores('valorFaturamentoDireto', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2 md:col-span-3">
                    <label className="font-bold text-slate-500 block mb-1">Sinal ou Mobilização</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.valoresComerciais?.sinalMobilizacao || ''}
                      onChange={(e) => updateValores('sinalMobilizacao', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2 md:col-span-3">
                    <label className="font-bold text-slate-500 block mb-1">Condição de Pagamento</label>
                    <textarea
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.valoresComerciais?.condicaoPagamento || ''}
                      onChange={(e) => updateValores('condicaoPagamento', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2 md:col-span-3">
                    <label className="font-bold text-slate-500 block mb-1">Garantia Contratual / Retenção</label>
                    <textarea
                      rows={2}
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.valoresComerciais?.retencaoGarantia || ''}
                      onChange={(e) => updateValores('retencaoGarantia', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2 md:col-span-3">
                    <label className="font-bold text-slate-500 block mb-1">Risco Sacado (AF / 120 dias)</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.valoresComerciais?.riscoSacado || ''}
                      onChange={(e) => updateValores('riscoSacado', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2 md:col-span-3">
                    <label className="font-bold text-slate-500 block mb-1">Reajuste Contratual</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.valoresComerciais?.reajuste || ''}
                      onChange={(e) => updateValores('reajuste', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: CRONOGRAMA & PRAZOS */}
          {activeTab === 'prazos' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Clock size={16} className="text-blue-600" />
                  Marcos Contratuais e Cronograma de Prazos (Item 21 do Template)
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Início da Mobilização</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.prazosCronograma?.mobilizacao || ''}
                      onChange={(e) => updatePrazos('mobilizacao', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Elaboração / Entrega Projeto</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.prazosCronograma?.elaboracaoProjeto || ''}
                      onChange={(e) => updatePrazos('elaboracaoProjeto', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Aprovação do Projeto</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.prazosCronograma?.aprovacaoProjeto || ''}
                      onChange={(e) => updatePrazos('aprovacaoProjeto', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Entrega do Material</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.prazosCronograma?.entregaMaterial || ''}
                      onChange={(e) => updatePrazos('entregaMaterial', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Confirmação Medidas Definitivas</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.prazosCronograma?.medidasDefinitivas || ''}
                      onChange={(e) => updatePrazos('medidasDefinitivas', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Prazo para Fabricação</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.prazosCronograma?.fabricacao || ''}
                      onChange={(e) => updatePrazos('fabricacao', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Prazo de Execução</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.prazosCronograma?.execucao || ''}
                      onChange={(e) => updatePrazos('execucao', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Prazo de Comissionamento</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.prazosCronograma?.comissionamento || ''}
                      onChange={(e) => updatePrazos('comissionamento', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Operação Assistida</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                      value={abertura.prazosCronograma?.operacaoAssistida || ''}
                      onChange={(e) => updatePrazos('operacaoAssistida', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <CheckCircle2 size={16} className="text-emerald-600" />
            <span>Todos os acordos e pendências em vermelho serão inseridos com precisão na Ata Final DOCX.</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg uppercase tracking-tight transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="w-full sm:w-auto px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg uppercase tracking-tight shadow-md shadow-emerald-200 flex items-center justify-center gap-2 transition-colors disabled:bg-slate-400"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Gerando Ata Final DOCX...
                </>
              ) : (
                <>
                  <FileDown size={16} />
                  Confirmar e Gerar Ata Final (.DOCX)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FileCheck2Icon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

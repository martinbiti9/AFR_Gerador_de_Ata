import React, { useState } from 'react';
import { 
  AberturaData, 
  AnalysisResult, 
  Divergence, 
  TopicCard, 
  ParticipanteItem, 
  ValoresComerciais, 
  PrazosCronograma 
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
  Link as LinkIcon,
  ShieldAlert,
  Edit3
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
  error?: string;
}

export function PreAtaValidationModal({
  isOpen,
  onClose,
  abertura: initialAbertura,
  analysisResult: initialAnalysis,
  divergences: initialDivergences,
  activeTemplateName = '',
  onSaveAndGenerate,
  loading,
  error
}: Props) {
  const [abertura, setAbertura] = useState<AberturaData>(() => {
    const defaultResumo = initialAbertura?.resumoExecutivo || [
      `1. OBJETO E ESCOPO DA CONTRATAÇÃO:`,
      `   • Fornecedor: ${initialAbertura?.fornecedor || 'A Definir'}`,
      `   • Obra: ${initialAbertura?.obraCodigo || '0000'} - ${initialAbertura?.obraNome || 'Obra'}`,
      `   • Pacote / Serviço: ${initialAbertura?.servico || 'Serviços de Engenharia'} (RM: ${initialAbertura?.rm || 'S/N'} • Cotação: ${initialAbertura?.cot || 'S/N'})`,
      ``,
      `2. CONDIÇÃO COMERCIAL & NEGOCIAÇÃO:`,
      `   • Valor Global Negociado: ${initialAbertura?.valoresComerciais?.valorTotal || 'Conforme Proposta Comercial'}`,
      `   • Condição de Pagamento: ${initialAbertura?.valoresComerciais?.condicaoPagamento || 'Medições mensais com pagamento 30 dias após emissão da NF'}`,
      `   • Retenção de Garantia: ${initialAbertura?.valoresComerciais?.retencaoGarantia || '5% sobre cada medição, liberada 180 dias após encerramento'}`,
      ``,
      `3. CRONOGRAMA & MOBILIZAÇÃO:`,
      `   • Início da Mobilização: ${initialAbertura?.prazosCronograma?.mobilizacao || 'Imediato após aprovação cadastral e documental'}`,
      `   • Prazo de Execução: ${initialAbertura?.prazosCronograma?.execucao || 'Conforme cronograma físico da obra'}`,
      ``,
      `4. DIRETRIZES DE SST E LOGÍSTICA DE CANTEIRO:`,
      `   • Cumprimento rigoroso das NRs (NR-06, NR-18, NR-35) e integração prévia de 100% da equipe.`,
      `   • Fornecimento de EPIs com CA válido e liberação de acesso com documentação de SST regularizada.`,
      ``,
      `5. DELIBERAÇÕES & PRÓXIMOS PASSOS:`,
      `   • Envio das minutas contratuais e cumprimento das pendências registradas para assinatura do contrato.`
    ].join('\n');

    return {
      obraCodigo: initialAbertura?.obraCodigo || '',
      obraNome: initialAbertura?.obraNome || '',
      fornecedor: initialAbertura?.fornecedor || '',
      assunto: initialAbertura?.assunto || 'Reunião de Alinhamento Técnico, Comercial e Minuta Contratual',
      servico: initialAbertura?.servico || '',
      rm: initialAbertura?.rm || '',
      cot: initialAbertura?.cot || '',
      ataNumero: initialAbertura?.ataNumero || '01',
      dataReuniao: initialAbertura?.dataReuniao || new Date().toLocaleDateString('pt-BR'),
      horario: initialAbertura?.horario || '10:00h',
      local: initialAbertura?.local || 'Online / Teams',
      linkReuniao: initialAbertura?.linkReuniao || '',
      folha: initialAbertura?.folha || '01',
      resumoExecutivo: defaultResumo,
      participantes: initialAbertura?.participantes?.length ? initialAbertura.participantes : [],
      valoresComerciais: initialAbertura?.valoresComerciais || {
        valorTotal: '',
        valorServicos: '',
        valorIndustrializacao: '',
        valorVendaMercantil: '',
        valorLocacao: '',
        valorFretes: '',
        valorGerenciamento: '',
        valorFaturamentoDireto: '',
        sinalMobilizacao: '',
        condicaoPagamento: 'Medições mensais com pagamento 30 dias após aprovação e emissão da NF.',
        retencaoGarantia: '5% sobre o valor total da contratação (liberação 180 dias após Termo de Encerramento).',
        riscoSacado: '',
        reajuste: 'Fixo e irreajustável pelo período contratual.'
      },
      prazosCronograma: initialAbertura?.prazosCronograma || {
        mobilizacao: 'Imediata após liberação de SST e homologação contratual',
        elaboracaoProjeto: '',
        aprovacaoProjeto: '',
        entregaMaterial: '',
        medidasDefinitivas: '',
        fabricacao: '',
        execucao: 'Conforme cronograma da obra',
        comissionamento: '',
        operacaoAssistida: ''
      }
    };
  });

  const [topics, setTopics] = useState<TopicCard[]>(initialAnalysis?.topics || []);
  const [tipoFornecimento, setTipoFornecimento] = useState<string>(
    initialAnalysis?.tipoFornecimento || 'Subempreitada de Serviços e Materiais'
  );
  const [divergences, setDivergences] = useState<Divergence[]>(initialDivergences || []);
  const [activeTab, setActiveTab] = useState<'header' | 'resumo' | 'topics' | 'commercial' | 'prazos' | 'divergences'>('header');

  React.useEffect(() => {
    if (isOpen) {
      if (initialAbertura) {
        setAbertura(prev => ({
          ...prev,
          ...initialAbertura,
          participantes: initialAbertura.participantes?.length ? initialAbertura.participantes : prev.participantes,
          valoresComerciais: { ...prev.valoresComerciais, ...(initialAbertura.valoresComerciais || {}) },
          prazosCronograma: { ...prev.prazosCronograma, ...(initialAbertura.prazosCronograma || {}) }
        }));
      }
      if (initialAnalysis?.topics) setTopics(initialAnalysis.topics);
      if (initialAnalysis?.tipoFornecimento) setTipoFornecimento(initialAnalysis.tipoFornecimento);
      if (initialDivergences) setDivergences(initialDivergences);
    }
  }, [isOpen, initialAbertura, initialAnalysis, initialDivergences]);

  if (!isOpen) return null;

  // Header and Metadata Updates
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

  // Participantes Updates
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

  // Topics Updates
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
        num: String(newIdx),
        title: 'Novo Tópico / Regra da Obra',
        regraObra: 'Descrever a especificação técnica ou operacional exigida pela obra...',
        excecaoAdmitida: 'N/A',
        pontoAtencao: 'Nenhum',
        perguntaFornecedor: 'Confirmar atendimento integral',
        responsavel: 'Fornecedor / Suprimentos',
        prazo: 'Conforme cronograma',
        source: 'Check List da Obra'
      }
    ]);
  };

  // Divergences Updates
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[94vh] flex flex-col overflow-hidden animate-in zoom-in-95">
        {/* Modal Top Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/30 border border-blue-400/40 rounded-xl text-blue-300">
              <FileText size={22} />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Validação de Conteúdo da Pré-Ata (Template DOCX)
                <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  Estrutura Afonso França
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Revise todos os atributos, tabelas e valores enquadrados no template antes de compilar o arquivo DOCX final.
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
            onClick={() => setActiveTab('header')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'header'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Building2 size={15} />
            1. Cabeçalho & Participantes
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
            2. Resumo Executivo
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('topics')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'topics'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <ListOrdered size={15} />
            3. Tópicos & Diretrizes ({topics.length})
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
            4. Proposta Comercial & Valores
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
            5. Cronograma & Prazos
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('divergences')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'divergences'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <AlertTriangle size={15} className="text-amber-500" />
            6. Divergências ({divergences.length})
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 space-y-6">
          {/* TAB 1: CABEÇALHO & PARTICIPANTES */}
          {activeTab === 'header' && (
            <div className="space-y-6 animate-in fade-in">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Building2 size={16} className="text-blue-600" />
                  Identificação da Reunião e Obra
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Código da Obra</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold focus:outline-none focus:border-blue-500"
                      value={abertura.obraCodigo}
                      onChange={(e) => updateAbertura('obraCodigo', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-1 md:col-span-2">
                    <label className="font-bold text-slate-500 block mb-1">Nome da Obra / Empreendimento</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold focus:outline-none focus:border-blue-500"
                      value={abertura.obraNome}
                      onChange={(e) => updateAbertura('obraNome', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Ata nº</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold focus:outline-none focus:border-blue-500"
                      value={abertura.ataNumero || '01'}
                      onChange={(e) => updateAbertura('ataNumero', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2 md:col-span-3">
                    <label className="font-bold text-slate-500 block mb-1">Fornecedor / Razão Social</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold focus:outline-none focus:border-blue-500"
                      value={abertura.fornecedor}
                      onChange={(e) => updateAbertura('fornecedor', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Folha</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold focus:outline-none focus:border-blue-500"
                      value={abertura.folha || '01'}
                      onChange={(e) => updateAbertura('folha', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2 md:col-span-4">
                    <label className="font-bold text-slate-500 block mb-1">Assunto / Tipo de Reunião</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold focus:outline-none focus:border-blue-500"
                      value={abertura.assunto}
                      onChange={(e) => updateAbertura('assunto', e.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="font-bold text-slate-500 block mb-1">Pacote / Escopo de Serviço</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold focus:outline-none focus:border-blue-500"
                      value={abertura.servico}
                      onChange={(e) => updateAbertura('servico', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">RM (Requisição)</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold focus:outline-none focus:border-blue-500"
                      value={abertura.rm}
                      onChange={(e) => updateAbertura('rm', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">COT (Cotação)</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold focus:outline-none focus:border-blue-500"
                      value={abertura.cot}
                      onChange={(e) => updateAbertura('cot', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Data da Reunião</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold focus:outline-none focus:border-blue-500"
                      value={abertura.dataReuniao || ''}
                      onChange={(e) => updateAbertura('dataReuniao', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Horário</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold focus:outline-none focus:border-blue-500"
                      value={abertura.horario || ''}
                      onChange={(e) => updateAbertura('horario', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Local</label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold focus:outline-none focus:border-blue-500"
                      value={abertura.local || ''}
                      onChange={(e) => updateAbertura('local', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-500 block mb-1">Link da Reunião</label>
                    <input
                      type="text"
                      placeholder="Ex: https://teams.microsoft.com/..."
                      className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800 font-semibold focus:outline-none focus:border-blue-500"
                      value={abertura.linkReuniao || ''}
                      onChange={(e) => updateAbertura('linkReuniao', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Tabela de Participantes */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Users size={16} className="text-indigo-600" />
                    Tabela de Participantes da Reunião
                  </h3>
                  <button
                    type="button"
                    onClick={addParticipante}
                    className="flex items-center gap-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus size={14} /> Adicionar Participante
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-2.5 rounded-l">Nome / Cargo</th>
                        <th className="p-2.5">Empresa</th>
                        <th className="p-2.5">E-mail</th>
                        <th className="p-2.5">Visto</th>
                        <th className="p-2.5 rounded-r w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(abertura.participantes || []).map((p, idx) => (
                        <tr key={p.id || idx} className="hover:bg-slate-50">
                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="Nome do Participante"
                              className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs font-medium text-slate-800"
                              value={p.nome}
                              onChange={(e) => updateParticipante(idx, 'nome', e.target.value)}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="Empresa / Departamento"
                              className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-slate-800"
                              value={p.empresa}
                              onChange={(e) => updateParticipante(idx, 'empresa', e.target.value)}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="email"
                              placeholder="email@empresa.com.br"
                              className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-slate-800"
                              value={p.email}
                              onChange={(e) => updateParticipante(idx, 'email', e.target.value)}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="Visto / Assinatura"
                              className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-slate-800"
                              value={p.visto || ''}
                              onChange={(e) => updateParticipante(idx, 'visto', e.target.value)}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeParticipante(idx)}
                              className="text-slate-400 hover:text-red-600 p-1"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RESUMO EXECUTIVO */}
          {activeTab === 'resumo' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <FileText size={16} className="text-blue-600" />
                    Resumo Executivo da Ata / Alinhamento Geral
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      const formatted = [
                        `1. OBJETO E ESCOPO DA CONTRATAÇÃO:`,
                        `   • Fornecedor: ${abertura.fornecedor || 'A Definir'}`,
                        `   • Obra: ${abertura.obraCodigo || '0000'} - ${abertura.obraNome || 'Obra'}`,
                        `   • Pacote / Serviço: ${abertura.servico || 'Serviços de Engenharia'} (RM: ${abertura.rm || 'S/N'} • Cotação: ${abertura.cot || 'S/N'})`,
                        ``,
                        `2. CONDIÇÃO COMERCIAL & NEGOCIAÇÃO:`,
                        `   • Valor Global Negociado: ${abertura.valoresComerciais?.valorTotal || 'Conforme Proposta Comercial'}`,
                        `   • Condição de Pagamento: ${abertura.valoresComerciais?.condicaoPagamento || 'Medições mensais com pagamento 30 dias após emissão da NF'}`,
                        `   • Retenção de Garantia: ${abertura.valoresComerciais?.retencaoGarantia || '5% sobre cada medição, liberada 180 dias após encerramento'}`,
                        ``,
                        `3. CRONOGRAMA & MOBILIZAÇÃO:`,
                        `   • Início da Mobilização: ${abertura.prazosCronograma?.mobilizacao || 'Imediato após liberação de SST e aprovação cadastral'}`,
                        `   • Prazo de Execução: ${abertura.prazosCronograma?.execucao || 'Conforme cronograma físico da obra'}`,
                        ``,
                        `4. DIRETRIZES DE SST E LOGÍSTICA DE CANTEIRO:`,
                        `   • Cumprimento rigoroso das NRs (NR-06, NR-18, NR-35) e integração prévia de 100% da equipe.`,
                        `   • Fornecimento diário de EPIs com CA válido e acesso condicionado à homologação de SST.`,
                        ``,
                        `5. DELIBERAÇÕES & PRÓXIMOS PASSOS:`,
                        `   • Envio das minutas contratuais e saneamento das pendências registradas para assinatura do contrato.`
                      ].join('\n');
                      updateAbertura('resumoExecutivo', formatted);
                    }}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-1 rounded-md transition-colors"
                  >
                    Auto-organizar com Dados da Reunião
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Resumo executivo organizado e indentado consolidando o objeto, valores negociados, marcos de cronograma, diretrizes de SST e responsabilidades imediatas.
                </p>
                <textarea
                  rows={14}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3.5 text-xs text-slate-800 font-mono leading-relaxed focus:bg-white focus:outline-none focus:border-blue-500 shadow-inner"
                  value={abertura.resumoExecutivo || ''}
                  onChange={(e) => updateAbertura('resumoExecutivo', e.target.value)}
                  placeholder="1. OBJETO E ESCOPO DA CONTRATAÇÃO:&#10;   • Fornecedor: ...&#10;   • Obra: ..."
                />
              </div>
            </div>
          )}

          {/* TAB 3: TÓPICOS & DIRETRIZES DO TEMPLATE */}
          {activeTab === 'topics' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Tipo de Fornecimento
                  </label>
                  <input
                    type="text"
                    className="text-sm font-bold text-blue-700 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none px-1 py-0.5"
                    value={tipoFornecimento}
                    onChange={(e) => setTipoFornecimento(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={addTopic}
                  className="flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3.5 py-2 rounded-lg transition-colors shadow-2xs"
                >
                  <Plus size={14} /> Adicionar Novo Tópico
                </button>
              </div>

              <div className="space-y-3">
                {topics.map((topic, idx) => (
                  <div key={topic.id || idx} className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          className="w-12 bg-blue-50 border border-blue-200 rounded p-1 text-xs font-bold text-blue-800 text-center"
                          value={topic.num || String(idx + 1)}
                          onChange={(e) => updateTopic(idx, 'num', e.target.value)}
                          title="Número do Item"
                        />
                        <input
                          type="text"
                          className="flex-1 bg-slate-50 border border-slate-200 rounded p-1.5 text-xs font-bold text-slate-800"
                          value={topic.title}
                          onChange={(e) => updateTopic(idx, 'title', e.target.value)}
                          placeholder="Título do Tópico / Regra"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeTopic(idx)}
                        className="text-slate-400 hover:text-red-600 p-1.5 rounded transition-colors"
                        title="Remover tópico"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="md:col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          Regra da Obra / Especificação Técnica
                        </label>
                        <textarea
                          rows={2}
                          className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-800"
                          value={topic.regraObra}
                          onChange={(e) => updateTopic(idx, 'regraObra', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          Exceção / Flexibilização Admitida
                        </label>
                        <input
                          type="text"
                          className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-800"
                          value={topic.excecaoAdmitida || ''}
                          onChange={(e) => updateTopic(idx, 'excecaoAdmitida', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-red-600 uppercase tracking-wider flex items-center gap-1 mb-1">
                          <AlertTriangle size={11} /> Ponto de Atenção (Destaque em Vermelho)
                        </label>
                        <input
                          type="text"
                          className="w-full bg-red-50/40 border border-red-200 rounded p-2 text-xs text-red-900 font-medium"
                          value={topic.pontoAtencao || ''}
                          onChange={(e) => updateTopic(idx, 'pontoAtencao', e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block mb-1">
                          Pergunta ao Fornecedor
                        </label>
                        <input
                          type="text"
                          className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-800"
                          value={topic.perguntaFornecedor || ''}
                          onChange={(e) => updateTopic(idx, 'perguntaFornecedor', e.target.value)}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                            Responsável
                          </label>
                          <input
                            type="text"
                            className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-800"
                            value={topic.responsavel || 'Fornecedor'}
                            onChange={(e) => updateTopic(idx, 'responsavel', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                            Prazo
                          </label>
                          <input
                            type="text"
                            className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-800"
                            value={topic.prazo || 'N/A'}
                            onChange={(e) => updateTopic(idx, 'prazo', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: PROPOSTA COMERCIAL & VALORES */}
          {activeTab === 'commercial' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <DollarSign size={16} className="text-emerald-600" />
                  Abertura de Valores Comerciais da Contratação
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div className="sm:col-span-2 md:col-span-3 bg-emerald-50/50 p-3 rounded-lg border border-emerald-200">
                    <label className="font-bold text-emerald-900 block mb-1">Valor Negociado Total</label>
                    <input
                      type="text"
                      className="w-full bg-white border border-emerald-300 rounded p-2 text-sm font-bold text-emerald-800 focus:outline-none focus:border-emerald-600"
                      value={abertura.valoresComerciais?.valorTotal || ''}
                      onChange={(e) => updateValores('valorTotal', e.target.value)}
                      placeholder="Ex: R$ 2.782.400,00"
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

          {/* TAB 5: CRONOGRAMA & PRAZOS */}
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

          {/* TAB 6: DIVERGÊNCIAS */}
          {activeTab === 'divergences' && (
            <div className="space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <AlertTriangle size={15} className="text-amber-600" />
                    Divergências da Proposta Comercial ({divergences.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pontos de desalinhamento comercial e técnico identificados para a pauta da reunião.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addDivergence}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3.5 py-2 rounded-lg transition-colors shadow-2xs"
                >
                  <Plus size={14} /> Adicionar Divergência
                </button>
              </div>

              <div className="space-y-3">
                {divergences.map((div, idx) => (
                  <div key={div.id || idx} className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2 flex-1">
                        <select
                          className={`text-xs font-bold px-2 py-1 rounded border ${
                            div.severity === 'ALTA'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : div.severity === 'MEDIA'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}
                          value={div.severity}
                          onChange={(e) => updateDivergence(idx, 'severity', e.target.value as any)}
                        >
                          <option value="ALTA">Severidade ALTA</option>
                          <option value="MEDIA">Severidade MÉDIA</option>
                          <option value="BAIXA">Severidade BAIXA</option>
                        </select>
                        <span className="text-xs font-bold text-slate-500">Divergência #{idx + 1}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDivergence(idx)}
                        className="text-slate-400 hover:text-red-600 p-1.5 rounded transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          Descrição da Divergência / Condição Comercial
                        </label>
                        <textarea
                          rows={2}
                          className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-800"
                          value={div.description}
                          onChange={(e) => updateDivergence(idx, 'description', e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                          Fonte / Origem
                        </label>
                        <input
                          type="text"
                          className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-slate-800"
                          value={div.source || 'Proposta Comercial'}
                          onChange={(e) => updateDivergence(idx, 'source', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-1">
            {error ? (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-200 w-full sm:w-auto font-medium">
                <AlertTriangle size={16} className="shrink-0" />
                <span className="whitespace-pre-wrap text-left">{error}</span>
              </div>
            ) : (
              <>
                <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                <span>Todos os atributos validados serão mesclados com precisão no template DOCX.</span>
              </>
            )}
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
              className="w-full sm:w-auto px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg uppercase tracking-tight shadow-md shadow-blue-200 flex items-center justify-center gap-2 transition-colors disabled:bg-slate-400"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Gerando Pré-Ata DOCX...
                </>
              ) : (
                <>
                  <FileDown size={16} />
                  Confirmar e Gerar Pré-Ata (.DOCX)
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

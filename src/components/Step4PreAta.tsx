import { useState, useEffect } from 'react';
import { AppState } from '../types';
import { FileDown, ArrowRight, Loader2, CheckCircle2, AlertTriangle, UploadCloud, FileText } from 'lucide-react';
import { TemplateWarningModal } from './TemplateWarningModal';

interface Props {
  state: AppState;
  updateState: (updates: Partial<AppState>) => void;
  onNavigateToTemplates?: () => void;
}

export function Step4PreAta({ state, updateState, onNavigateToTemplates }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasTemplate, setHasTemplate] = useState<boolean | null>(null);
  const [activeTemplateName, setActiveTemplateName] = useState<string>('');
  const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);

  const checkTemplateStatus = async () => {
    try {
      const res = await fetch('/api/admin/templates');
      const data = await res.json();
      if (res.ok) {
        setHasTemplate(Boolean(data.hasTemplate));
        setActiveTemplateName(data.activeTemplate?.name || data.activeTemplate?.originalFileName || '');
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    checkTemplateStatus();
  }, []);

  const generateDocx = async () => {
    if (hasTemplate === false) {
      setIsWarningModalOpen(true);
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/generate-pre-ata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abertura: state.abertura,
          analysisResult: state.analysisResult,
          divergences: state.divergences
        })
      });
      
      if (!res.ok) {
        const text = await res.text();
        let errMsg = 'Falha ao gerar o documento DOCX da Pré-Ata';
        try {
          const jsonErr = JSON.parse(text);
          if (jsonErr?.error) {
            errMsg = jsonErr.error;
            if (errMsg.includes('Template DOCX') || errMsg.includes('template')) {
              setIsWarningModalOpen(true);
            }
          }
        } catch {
          // not json
        }
        throw new Error(errMsg);
      }
      
      // Handle file download
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Pre-Ata_${state.abertura?.obraCodigo || 'Reuniao'}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
      updateState({ preAtaGenerated: true });
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar Pré-Ata');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-semibold text-slate-800">Pré-Ata</h2>
        <p className="text-sm text-slate-500 mt-1">Gere o documento base para conduzir a reunião de negociação.</p>
      </div>

      {/* Template Status Banner */}
      {hasTemplate === false && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between gap-3 text-amber-900 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <AlertTriangle size={18} className="text-amber-600 shrink-0" />
            <div className="text-xs">
              <span className="font-bold">Atenção:</span> Nenhum Template DOCX foi cadastrado no sistema. É obrigatório ter um template salvo no banco de dados para gerar a Pré-Ata.
            </div>
          </div>
          <button
            onClick={() => setIsWarningModalOpen(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold uppercase tracking-tight shadow-xs transition-colors"
          >
            <UploadCloud size={13} />
            Cadastrar Template
          </button>
        </div>
      )}

      {hasTemplate === true && activeTemplateName && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-blue-900 text-xs">
          <div className="flex items-center gap-2">
            <FileText size={15} className="text-blue-600 shrink-0" />
            <span>
              Base DOCX: <strong>{activeTemplateName}</strong> (armazenado no banco de dados)
            </span>
          </div>
          <button
            onClick={() => onNavigateToTemplates?.()}
            className="text-[11px] font-bold text-blue-700 hover:underline uppercase tracking-tight"
          >
            Alterar Template
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-6 shadow-sm">
        <div className="max-w-md mx-auto space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
            <FileDown className="mx-auto h-12 w-12 text-blue-500 mb-4" />
            <h3 className="text-lg font-bold text-slate-800">Gerar Documento (.docx)</h3>
            <p className="text-sm text-slate-500 mt-2">
              O documento preencherá os dados da obra, o resumo executivo, a análise de aderência e todas as divergências diretamente no template oficial salvo, com <strong>pontos de atenção e orientações de negociação destacados em vermelho</strong>.
            </p>
          </div>

          {state.analysisResult?.topics && state.analysisResult.topics.length > 0 && (
            <div className="text-left bg-red-50/50 border border-red-200 rounded-lg p-4 space-y-2">
              <p className="text-xs font-bold text-red-700 uppercase tracking-wider flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-red-600 animate-pulse"></span>
                Pontos de Atenção Mapeados para o Documento:
              </p>
              <ul className="text-xs space-y-1 text-slate-700 max-h-40 overflow-y-auto pr-1">
                {state.analysisResult.topics
                  .filter(t => t.pontoAtencao && t.pontoAtencao !== 'N/A' && t.pontoAtencao !== 'Nenhum' && t.pontoAtencao !== 'Não identificado')
                  .map((t, idx) => (
                    <li key={t.id || idx} className="border-b border-red-100/60 pb-1">
                      <strong className="text-slate-800">{t.title}:</strong> <span className="text-red-700 font-semibold">{t.pontoAtencao}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-200">{error}</p>}
          
          {state.preAtaGenerated && (
            <div className="flex items-center justify-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-lg border border-green-200">
              <CheckCircle2 size={16} />
              Documento gerado com sucesso!
            </div>
          )}

          <button
            onClick={generateDocx}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 text-xs font-bold text-white bg-blue-600 rounded hover:bg-blue-700 uppercase tracking-tight shadow-lg shadow-blue-200 disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none transition-colors"
          >
            {loading ? <><Loader2 size={18} className="animate-spin" /> Gerando com Template...</> : 'Baixar Pré-Ata (.docx)'}
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => updateState({ step: 5 })}
          className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 uppercase tracking-tight transition-colors"
        >
          Avançar para Ata Final
          <ArrowRight size={18} />
        </button>
      </div>

      {/* Warning Modal if no template is saved */}
      <TemplateWarningModal
        isOpen={isWarningModalOpen}
        onClose={() => setIsWarningModalOpen(false)}
        onNavigateToTemplates={() => {
          setIsWarningModalOpen(false);
          onNavigateToTemplates?.();
        }}
        onTemplateUploaded={() => {
          checkTemplateStatus();
        }}
      />
    </div>
  );
}

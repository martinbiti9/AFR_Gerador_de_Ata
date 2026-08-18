import { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  FileText, 
  ClipboardList, 
  PenTool, 
  Printer, 
  RefreshCw, 
  Clock, 
  Wand2, 
  Check, 
  PanelLeftClose,
  PanelLeftOpen,
  Minus,
  LogOut,
  Shield,
  User,
  Sliders
} from 'lucide-react';
import { AfonsoFrancaLogo } from './AfonsoFrancaLogo';
import { AppState } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
  currentStep: number;
  setStep: (step: number) => void;
  onReset: () => void;
  onOpenHistory?: () => void;
  onOpenWizard?: () => void;
  onOpenAdmin?: () => void;
  state?: AppState;
}

const STEPS = [
  { id: 1, name: 'Abertura', icon: FileText, desc: 'Identificação da Obra', optional: false },
  { id: 2, name: 'Check List', icon: ClipboardList, desc: 'Regras de Suprimentos', optional: false },
  { id: 3, name: 'Complementos', icon: PenTool, desc: 'Propostas & Divergências', optional: false },
  { id: 4, name: 'Pré-Ata', icon: Printer, desc: 'Minuta Prévia', optional: true },
  { id: 5, name: 'Ata Final', icon: CheckCircle2, desc: 'Deliberações & Assinatura', optional: false },
];

export function Sidebar({ currentStep, setStep, onReset, onOpenHistory, onOpenWizard, onOpenAdmin, state }: SidebarProps) {
  const { profile, user, role, logout } = useAuth();

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('sidebar_collapsed');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const [logoAlignment] = useState<'left' | 'center'>('left');

  useEffect(() => {
    try {
      localStorage.setItem('sidebar_collapsed', String(isCollapsed));
    } catch {}
  }, [isCollapsed]);

  // ================= ACCURATE COMPLETION MEASUREMENT =================
  const isStep1Done = Boolean(
    (state?.abertura?.obraCodigo && state?.abertura?.fornecedor) ||
    currentStep > 1
  );

  const isStep2Done = Boolean(
    (state?.analysisResult && (state.analysisResult.topics?.length || 0) > 0) ||
    currentStep > 2
  );

  const isStep3Done = Boolean(
    (state?.divergences && state.divergences.length > 0) ||
    (state?.analysisResult && currentStep > 3)
  );

  const isStep4Done = Boolean(state?.preAtaGenerated);
  const isStep4Skipped = !isStep4Done && (currentStep === 5 || Boolean(state?.finalAtaGenerated || state?.finalAtaData));

  const isStep5Done = Boolean(state?.finalAtaGenerated || state?.finalAtaData);

  const mandatoryCompletedCount = [isStep1Done, isStep2Done, isStep3Done, isStep5Done].filter(Boolean).length;
  const percentage = Math.min(Math.round((mandatoryCompletedCount / 4) * 100), 100);
  const isAllCompleted = isStep5Done && isStep1Done && isStep2Done && isStep3Done;

  const displayName = profile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Usuário';
  const displayEmail = profile?.email || user?.email || '';
  const isAdmin = role === 'admin';

  return (
    <aside 
      className={`bg-slate-50 text-slate-900 border-r border-slate-200 flex flex-col h-full flex-shrink-0 transition-all duration-300 ease-in-out relative select-none ${
        isCollapsed ? 'w-[72px]' : 'w-[250px]'
      }`}
    >
      {/* Header with Company Logo & Collapse Toggle */}
      <div className={`p-4 border-b border-slate-200 flex items-center justify-between ${isCollapsed ? 'px-2 flex-col gap-2' : ''}`}>
        <div className="flex-1 min-w-0">
          <AfonsoFrancaLogo 
            collapsed={isCollapsed} 
            alignment={logoAlignment}
            className="transition-all duration-200"
          />
          {!isCollapsed && (
            <div className="mt-2.5 pt-2 border-t border-slate-200/70 flex items-center justify-between">
              <div>
                <h1 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800">
                  Agente de Atas
                </h1>
                <p className="text-[10px] text-slate-500 font-medium leading-none mt-0.5">Suprimentos & Contratos</p>
              </div>
            </div>
          )}
        </div>

        {/* Retractable Toggle Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors focus:outline-none shrink-0"
          title={isCollapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
          aria-label={isCollapsed ? "Expandir menu" : "Recolher menu"}
        >
          {isCollapsed ? <PanelLeftOpen size={17} className="text-slate-600" /> : <PanelLeftClose size={17} />}
        </button>
      </div>

      {/* User Profile Card */}
      <div className={`border-b border-slate-200/80 bg-white/70 ${isCollapsed ? 'p-2 flex flex-col items-center' : 'px-3.5 py-2.5'}`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs ${
            isAdmin ? 'bg-indigo-600 text-white' : 'bg-blue-600 text-white'
          }`}>
            {displayName.slice(0, 2).toUpperCase()}
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold text-slate-800 truncate block">
                  {displayName}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                  isAdmin 
                    ? 'bg-purple-100 text-purple-800 border border-purple-200' 
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}>
                  {isAdmin ? 'Administrador' : 'Suprimentos'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Wizard Fast-Track Button */}
      {onOpenWizard && (
        <div className={`pt-3 pb-1 ${isCollapsed ? 'px-2' : 'px-3.5'}`}>
          <button
            onClick={onOpenWizard}
            title="Modo Wizard Express (3 Etapas)"
            className={`w-full flex items-center justify-center gap-2 text-xs font-bold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-xl shadow-md shadow-indigo-200/60 transition-all uppercase tracking-tight group ${
              isCollapsed ? 'py-2.5 px-0' : 'px-3 py-2'
            }`}
          >
            <Wand2 size={15} className="text-yellow-300 shrink-0 animate-pulse" />
            {!isCollapsed && <span>Modo Wizard</span>}
          </button>
        </div>
      )}

      {/* Visual Progress Bar Section */}
      <div className={`mt-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs transition-all ${
        isCollapsed ? 'mx-2 p-2 flex flex-col items-center' : 'mx-3.5 px-3 py-2.5'
      }`}>
        {!isCollapsed ? (
          <>
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 mb-1.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                Progresso Real
              </span>
              <span className={`font-bold ${isAllCompleted ? 'text-emerald-600' : 'text-blue-600'}`}>
                {percentage}%
              </span>
            </div>

            {/* Progress Track */}
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
              <div 
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  isAllCompleted 
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500' 
                    : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1.5 font-medium">
              <span>
                {mandatoryCompletedCount === 0 
                  ? 'Nenhuma etapa concluída' 
                  : `${mandatoryCompletedCount} de 4 obrigatórias`}
              </span>
              {isAllCompleted ? (
                <span className="text-emerald-600 font-bold flex items-center gap-0.5">
                  <Check size={11} /> Concluído
                </span>
              ) : isStep4Done ? (
                <span className="text-indigo-600 font-semibold text-[9px]">
                  + Pré-Ata gerada
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1 w-full" title={`Progresso Concluído: ${percentage}% (${mandatoryCompletedCount} de 4 etapas obrigatórias)`}>
            <span className={`text-[10px] font-extrabold ${isAllCompleted ? 'text-emerald-600' : 'text-blue-600'}`}>
              {percentage}%
            </span>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  isAllCompleted ? 'bg-emerald-500' : 'bg-blue-600'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Navigation Steps */}
      <nav className={`flex-1 py-3 space-y-1.5 overflow-y-auto ${isCollapsed ? 'px-2' : 'px-3.5'}`}>
        {!isCollapsed && (
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 mb-1">
            Etapas Guiadas
          </p>
        )}
        {STEPS.map((step) => {
          const isActive = currentStep === step.id;
          
          let isConcluded = false;
          let isSkipped = false;

          if (step.id === 1) isConcluded = isStep1Done;
          else if (step.id === 2) isConcluded = isStep2Done;
          else if (step.id === 3) isConcluded = isStep3Done;
          else if (step.id === 4) {
            isConcluded = isStep4Done;
            isSkipped = isStep4Skipped;
          }
          else if (step.id === 5) isConcluded = isStep5Done;

          return (
            <button
              key={step.id}
              onClick={() => setStep(step.id)}
              title={`${step.id}. ${step.name} - ${step.desc}${step.optional ? ' (Opcional)' : ''}`}
              className={`w-full flex items-center gap-2.5 py-2 transition-all cursor-pointer rounded-lg ${
                isCollapsed ? 'justify-center px-1' : 'px-2.5 text-left'
              } ${
                isActive 
                  ? 'bg-blue-50/80 border border-blue-200/90 shadow-2xs text-blue-900' 
                  : 'hover:bg-slate-100/90 text-slate-600'
              }`}
            >
              <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0 transition-colors ${
                isConcluded
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : isSkipped
                    ? 'bg-slate-200 text-slate-500'
                    : isActive
                      ? 'border-2 border-blue-600 text-blue-600 bg-white shadow-2xs font-extrabold ring-2 ring-blue-100'
                      : 'border border-slate-300 text-slate-400 bg-slate-50'
              }`}>
                {isConcluded ? (
                  <Check size={13} strokeWidth={2.5} />
                ) : isSkipped ? (
                  <Minus size={12} strokeWidth={2} />
                ) : (
                  step.id
                )}
              </div>
              
              {!isCollapsed && (
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-xs uppercase tracking-tight leading-tight truncate ${
                      isActive 
                        ? 'font-bold text-blue-950' 
                        : isConcluded 
                          ? 'font-bold text-slate-800' 
                          : 'font-medium text-slate-500'
                    }`}>
                      {step.name}
                    </span>

                    {step.optional && (
                      <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase tracking-wider ${
                        isConcluded 
                          ? 'text-emerald-700 bg-emerald-50' 
                          : isSkipped 
                            ? 'text-slate-400 bg-slate-100' 
                            : 'text-amber-700 bg-amber-50'
                      }`}>
                        {isConcluded ? 'Gerada' : isSkipped ? 'Pulada' : 'Opcional'}
                      </span>
                    )}
                  </div>

                  <span className="text-[9px] text-slate-400 truncate leading-none mt-0.5">
                    {step.desc}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Controls */}
      <div className={`p-3 border-t border-slate-200 space-y-1.5 ${isCollapsed ? 'px-2' : 'px-3.5'}`}>
        {onOpenHistory && (
          <button
            onClick={onOpenHistory}
            title="Histórico de Reuniões"
            className={`flex items-center justify-center gap-2 w-full py-2 text-xs font-bold uppercase tracking-tight text-blue-700 bg-blue-50/80 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200 ${
              isCollapsed ? 'px-0' : 'px-3'
            }`}
          >
            <Clock size={15} className="shrink-0" />
            {!isCollapsed && <span>Histórico</span>}
          </button>
        )}

        {isAdmin && onOpenAdmin && (
          <button
            onClick={onOpenAdmin}
            title="Painel Administrativo"
            className={`flex items-center justify-center gap-2 w-full py-2 text-xs font-bold uppercase tracking-tight text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200 ${
              isCollapsed ? 'px-0' : 'px-3'
            }`}
          >
            <Shield size={14} className="shrink-0" />
            {!isCollapsed && <span>Painel Admin</span>}
          </button>
        )}

        <button
          onClick={onReset}
          title="Iniciar Nova Reunião"
          className={`flex items-center justify-center gap-2 w-full py-2 text-xs font-bold uppercase tracking-tight text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors ${
            isCollapsed ? 'px-0' : 'px-3'
          }`}
        >
          <RefreshCw size={14} className="shrink-0" />
          {!isCollapsed && <span>Nova Reunião</span>}
        </button>

        <button
          onClick={logout}
          title="Sair do Sistema"
          className={`flex items-center justify-center gap-2 w-full py-2 text-xs font-bold uppercase tracking-tight text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors ${
            isCollapsed ? 'px-0' : 'px-3'
          }`}
        >
          <LogOut size={14} className="shrink-0" />
          {!isCollapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );
}

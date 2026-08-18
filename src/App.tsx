import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Step1Abertura } from './components/Step1Abertura';
import { Step2Checklist } from './components/Step2Checklist';
import { Step3Complementos } from './components/Step3Complementos';
import { Step4PreAta } from './components/Step4PreAta';
import { Step5FinalAta } from './components/Step5FinalAta';
import { HistoryModal } from './components/HistoryModal';
import { WizardModal } from './components/WizardModal';
import { MetadataSuggestionModal } from './components/MetadataSuggestionModal';
import { Chatbot } from './components/Chatbot';
import { AdminView } from './components/Admin/AdminView';
import { LoginView } from './components/Auth/LoginView';
import { ChangePasswordView } from './components/Auth/ChangePasswordView';
import { AfonsoFrancaLogo } from './components/AfonsoFrancaLogo';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AppState, INITIAL_STATE, AberturaData } from './types';
import { saveMeeting, loadMeeting } from './lib/db';
import { CheckCircle2, Loader2, Save, Wand2, Shield, LogOut, User as UserIcon } from 'lucide-react';

function AppContent() {
  const { user, profile, role, loading: authLoading, mustChangePassword, logout } = useAuth();

  const [isAdminRoute, setIsAdminRoute] = useState(false);
  const [adminTab, setAdminTab] = useState<'models' | 'prompts' | 'templates' | 'logs'>('models');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [suggestedMetadata, setSuggestedMetadata] = useState<Partial<AberturaData> | null>(null);
  
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Check URL pathname for /admin routing
  useEffect(() => {
    const checkRoute = () => {
      const isAdm = window.location.pathname === '/admin';
      setIsAdminRoute(isAdm);
      if (isAdm) {
        const params = new URLSearchParams(window.location.search);
        const tab = params.get('tab');
        if (tab === 'templates' || tab === 'models' || tab === 'prompts' || tab === 'logs') {
          setAdminTab(tab);
        }
      }
    };
    checkRoute();
    window.addEventListener('popstate', checkRoute);
    return () => window.removeEventListener('popstate', checkRoute);
  }, []);

  const handleOpenAdmin = (tab: 'models' | 'prompts' | 'templates' | 'logs' = 'models') => {
    setAdminTab(tab);
    window.history.pushState({}, '', `/admin?tab=${tab}`);
    setIsAdminRoute(true);
  };

  const handleBackToApp = () => {
    window.history.pushState({}, '', '/');
    setIsAdminRoute(false);
  };

  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('ataState');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...INITIAL_STATE,
          ...parsed,
        };
      } catch (e) {
        console.error("Failed to parse saved state", e);
      }
    }
    return INITIAL_STATE;
  });

  // Debounced auto-save function to avoid spamming the backend/Firestore
  const persistCurrentState = useCallback(async (currentState: AppState) => {
    // Only persist if at least some step data exists
    if (!currentState.abertura && !currentState.analysisResult && currentState.step === 1 && !currentState.meetingId) {
      return;
    }
    setSaving(true);
    try {
      const id = await saveMeeting(currentState);
      if (!currentState.meetingId || currentState.meetingId !== id) {
        setState(prev => ({ ...prev, meetingId: id }));
      }
      const now = new Date();
      setLastSaved(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (error) {
      console.error("Erro ao salvar execução no histórico:", error);
    } finally {
      setSaving(false);
    }
  }, []);

  // Debounced auto-save on state change
  useEffect(() => {
    if (!user || mustChangePassword) return;

    localStorage.setItem('ataState', JSON.stringify(state));
    
    const timeout = setTimeout(() => {
      persistCurrentState(state);
    }, 1500);

    return () => clearTimeout(timeout);
  }, [state, persistCurrentState, user, mustChangePassword]);

  const updateState = (updates: Partial<AppState>) => {
    setState(prev => {
      const next = { ...prev, ...updates };
      return next;
    });
  };

  const handleManualSave = async () => {
    setSaving(true);
    try {
      const id = await saveMeeting(state);
      if (!state.meetingId) {
        setState(prev => ({ ...prev, meetingId: id }));
      }
      const now = new Date();
      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastSaved(timeStr);
      setSaveToast('Reunião e análises salvas no Histórico com sucesso!');
      setTimeout(() => setSaveToast(null), 3500);
    } catch (error) {
      console.error("Erro ao salvar manualmente:", error);
      alert("Erro ao salvar reunião no histórico.");
    } finally {
      setSaving(false);
    }
  };

  const requestReset = () => {
    setIsResetModalOpen(true);
  };

  const confirmReset = () => {
    localStorage.removeItem('ataState');
    setState({
      ...INITIAL_STATE,
      abertura: null,
      meetingId: null,
      analysisResult: null,
      divergences: [],
      preAtaGenerated: false,
      finalAtaText: '',
      finalAtaData: null,
      finalAtaGenerated: false,
      sonnetAnalysis: ''
    });
    setLastSaved(null);
    setIsResetModalOpen(false);
    setSaveToast('Sessão e dados de abertura reiniciados.');
    setTimeout(() => setSaveToast(null), 3500);
  };

  const handleLoadMeeting = async (id: string) => {
    try {
      const loaded = await loadMeeting(id);
      if (loaded) {
        setState(loaded);
        setIsHistoryOpen(false);
        setSaveToast(`Reunião "${loaded.abertura?.obraCodigo || 'S/N'}" carregada com sucesso!`);
        setTimeout(() => setSaveToast(null), 3500);
      }
    } catch (error) {
      console.error("Erro ao carregar reunião:", error);
      alert("Erro ao carregar reunião do histórico.");
    }
  };

  // Called when AI detects metadata from uploaded files across any step
  const handleMetadataDetected = (detected: Partial<AberturaData>) => {
    if (!detected) return;
    
    const hasMeaningful = Boolean(
      detected.obraCodigo?.trim() || 
      detected.fornecedor?.trim() || 
      detected.assunto?.trim() ||
      detected.servico?.trim() ||
      detected.obraNome?.trim() ||
      detected.rm?.trim() ||
      detected.cot?.trim()
    );

    if (!hasMeaningful) return;

    const current = state.abertura;
    
    const hasEmptyFields = !current || 
      !current.obraCodigo?.trim() || 
      !current.fornecedor?.trim() || 
      !current.assunto?.trim() || 
      !current.servico?.trim() ||
      !current.obraNome?.trim();

    const isDifferent = !current || 
      (detected.obraCodigo && detected.obraCodigo !== current.obraCodigo) ||
      (detected.fornecedor && detected.fornecedor !== current.fornecedor) ||
      (detected.obraNome && detected.obraNome !== current.obraNome);

    if (hasEmptyFields || isDifferent) {
      const merged: Partial<AberturaData> = {
        obraCodigo: current?.obraCodigo || detected.obraCodigo || '',
        obraNome: current?.obraNome || detected.obraNome || '',
        assunto: current?.assunto || detected.assunto || '',
        servico: current?.servico || detected.servico || '',
        fornecedor: current?.fornecedor || detected.fornecedor || '',
        rm: current?.rm || detected.rm || '',
        cot: current?.cot || detected.cot || ''
      };
      setSuggestedMetadata(merged);
      setIsMetadataModalOpen(true);
    }
  };

  // User confirmed the AI metadata suggestion
  const handleConfirmMetadata = async (confirmed: AberturaData) => {
    setIsMetadataModalOpen(false);
    setSuggestedMetadata(null);

    updateState({ abertura: confirmed });

    try {
      setSaving(true);
      setState(prev => {
        const nextState = { ...prev, abertura: confirmed };
        saveMeeting(nextState).then(id => {
          if (!prev.meetingId || prev.meetingId !== id) {
            setState(s => ({ ...s, meetingId: id }));
          }
        }).catch(err => console.error('Erro ao salvar metadados confirmados no Firestore:', err));
        return nextState;
      });
      const now = new Date();
      setLastSaved(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setSaveToast('Identificação da obra confirmada e salva no banco de dados!');
      setTimeout(() => setSaveToast(null), 4000);
    } catch (err) {
      console.error('Erro ao salvar metadados confirmados no Firestore:', err);
    } finally {
      setSaving(false);
    }
  };

  // 1. Loading Splash Screen with Afonso França Brand
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white select-none">
        <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center max-w-sm w-full border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
          <AfonsoFrancaLogo collapsed={false} alignment="center" />
          <div className="mt-6 flex flex-col items-center gap-3">
            <Loader2 size={28} className="animate-spin text-blue-600" />
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Inicializando Sessão Segura...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated State -> Show Login View
  if (!user || !profile) {
    return <LoginView />;
  }

  // 3. First Access / Password Change Requirement
  if (mustChangePassword) {
    return <ChangePasswordView />;
  }

  // 4. Admin View Route Guard
  if (isAdminRoute) {
    return <AdminView onBackToApp={handleBackToApp} initialTab={adminTab} />;
  }

  const displayName = profile.displayName || user.displayName || user.email?.split('@')[0] || 'Usuário';
  const isAdmin = role === 'admin';

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      <Sidebar 
        state={state}
        currentStep={state.step} 
        setStep={(step) => updateState({ step })} 
        onReset={requestReset} 
        onOpenHistory={() => setIsHistoryOpen(true)} 
        onOpenWizard={() => setIsWizardOpen(true)}
        onOpenAdmin={isAdmin ? () => handleOpenAdmin('models') : undefined}
      />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded tracking-wider uppercase">
              Sessão Ativa
            </span>
            <span className="text-slate-300">/</span>
            <span className="text-xs text-slate-600 font-medium truncate max-w-xs md:max-w-md">
              {state.abertura?.obraCodigo ? `${state.abertura.obraCodigo} • ` : ''}
              {state.abertura?.fornecedor || 'Fornecedor não definido'}
            </span>
            
            {/* Realtime Save Status Indicator */}
            <div className="flex items-center gap-1 text-[11px] text-slate-400 pl-2">
              {saving ? (
                <span className="flex items-center gap-1 text-blue-600 font-medium">
                  <Loader2 size={12} className="animate-spin" /> Salvando no banco...
                </span>
              ) : lastSaved ? (
                <span className="flex items-center gap-1 text-emerald-600 font-medium" title={`Última sincronização às ${lastSaved}`}>
                  <CheckCircle2 size={12} /> Salvo às {lastSaved}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Templates Quick Button */}
            {isAdmin && (
              <button
                onClick={() => handleOpenAdmin('templates')}
                className="flex items-center gap-1.5 text-xs font-semibold bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 px-3 py-1.5 rounded-lg transition-colors border border-slate-200 shadow-2xs cursor-pointer"
                title="Gerenciar Templates DOCX salvos no banco de dados"
              >
                <Save size={13} className="text-blue-600" />
                <span className="hidden sm:inline">Templates DOCX</span>
              </button>
            )}

            {/* Wizard Fast-Track Button in Header */}
            <button
              onClick={() => setIsWizardOpen(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 px-3.5 py-1.5 rounded-lg transition-all shadow-xs uppercase tracking-tight cursor-pointer"
              title="Abrir fluxo rápido passo a passo (Wizard)"
            >
              <Wand2 size={14} className="text-yellow-300" />
              <span>Modo Wizard</span>
            </button>

            {/* Quick Save Button */}
            <button
              onClick={handleManualSave}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-colors border border-slate-200 shadow-2xs cursor-pointer"
              title="Salvar reunião e dados no histórico agora"
            >
              <Save size={13} className={saving ? "animate-spin text-blue-600" : "text-slate-600"} />
              <span className="hidden sm:inline">Salvar</span>
            </button>

            <button 
              onClick={requestReset} 
              className="text-xs font-medium text-slate-400 hover:text-red-600 px-2 py-1.5 transition-colors cursor-pointer"
            >
              Limpar
            </button>

            {/* User Avatar & Logout */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div 
                className={`h-8 px-2.5 rounded-full flex items-center gap-1.5 text-xs font-bold shadow-2xs ${
                  isAdmin ? 'bg-indigo-50 text-indigo-800 border border-indigo-200' : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}
                title={`Logado como ${profile.email} (${isAdmin ? 'Administrador' : 'Membro'})`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white font-extrabold ${
                  isAdmin ? 'bg-indigo-600' : 'bg-blue-600'
                }`}>
                  {displayName.slice(0, 2).toUpperCase()}
                </div>
                <span className="max-w-[100px] truncate hidden md:inline">
                  {displayName}
                </span>
              </div>

              <button
                onClick={logout}
                title="Sair do sistema"
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        {/* Global Toast Notification */}
        {saveToast && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-medium flex items-center justify-between shadow-md transition-all animate-in slide-in-from-top-2">
            <span className="flex items-center gap-2">
              <CheckCircle2 size={14} />
              {saveToast}
            </span>
            <button onClick={() => setSaveToast(null)} className="text-white/80 hover:text-white cursor-pointer">
              ✕
            </button>
          </div>
        )}

        {/* Main Step Canvas */}
        <div className="flex-1 overflow-y-auto p-8 flex justify-center">
          <div className="max-w-4xl w-full">
            {state.step === 1 && (
              <Step1Abertura 
                state={state} 
                updateState={updateState} 
                onMetadataDetected={handleMetadataDetected}
              />
            )}
            {state.step === 2 && (
              <Step2Checklist 
                state={state} 
                updateState={updateState} 
                onMetadataDetected={handleMetadataDetected}
              />
            )}
            {state.step === 3 && (
              <Step3Complementos 
                state={state} 
                updateState={updateState} 
                onMetadataDetected={handleMetadataDetected}
              />
            )}
            {state.step === 4 && (
              <Step4PreAta 
                state={state} 
                updateState={updateState} 
                onNavigateToTemplates={() => handleOpenAdmin('templates')}
              />
            )}
            {state.step === 5 && (
              <Step5FinalAta 
                state={state} 
                updateState={updateState} 
                onMetadataDetected={handleMetadataDetected}
                onNavigateToTemplates={() => handleOpenAdmin('templates')}
              />
            )}
          </div>
        </div>
      </main>

      {/* History Modal */}
      <HistoryModal 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)} 
        onLoadMeeting={handleLoadMeeting}
      />

      {/* Express Wizard Modal */}
      <WizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        state={state}
        updateState={updateState}
      />

      {/* AI Metadata Detected Confirmation Modal */}
      <MetadataSuggestionModal
        isOpen={isMetadataModalOpen}
        onClose={() => setIsMetadataModalOpen(false)}
        suggestedData={suggestedMetadata}
        onConfirm={handleConfirmMetadata}
      />

      {/* Reset Confirmation Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
            <h2 className="text-lg font-bold text-slate-800 mb-2">Iniciar Nova Reunião?</h2>
            <p className="text-sm text-slate-600 mb-6">
              Tem certeza que deseja limpar a sessão ativa? Os dados de abertura e documentos serão zerados para uma nova reunião. O histórico anterior continua preservado no banco.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setIsResetModalOpen(false)}
                className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmReset}
                className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded transition-colors cursor-pointer"
              >
                Sim, Limpar Sessão
              </button>
            </div>
          </div>
        </div>
      )}

      <Chatbot />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

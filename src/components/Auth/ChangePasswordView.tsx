import React, { useState } from 'react';
import { AfonsoFrancaLogo } from '../AfonsoFrancaLogo';
import { useAuth } from '../../contexts/AuthContext';
import { Lock, KeyRound, Loader2, AlertCircle, CheckCircle2, ShieldCheck, ArrowRight } from 'lucide-react';

export function ChangePasswordView() {
  const { user, profile, changePassword, logout } = useAuth();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Strength rules validation
  const hasMinLength = newPassword.length >= 10;
  const hasUppercase = /[A-Z]/.test(newPassword);
  const hasLowercase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  const isFormValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) {
      if (!passwordsMatch) {
        setErrorMessage('As senhas digitadas não coincidem.');
      } else {
        setErrorMessage('A senha deve atender a todos os critérios de segurança abaixo.');
      }
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      await changePassword(newPassword);
    } catch (err: any) {
      console.error('Erro ao definir nova senha:', err);
      setErrorMessage(err.message || 'Erro ao atualizar senha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 font-sans text-slate-100">
      <div className="w-full max-w-md bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-8 pb-6 bg-slate-50 border-b border-slate-200/80 text-center flex flex-col items-center">
          <AfonsoFrancaLogo collapsed={false} alignment="center" />
          
          <div className="mt-4 flex items-center justify-center gap-2 text-amber-700 bg-amber-50 px-3 py-1 rounded-full border border-amber-200 text-xs font-bold uppercase tracking-wider">
            <KeyRound size={14} />
            <span>Primeiro Acesso Obrigatório</span>
          </div>

          <h1 className="text-base font-extrabold uppercase tracking-wider text-slate-800 mt-2">
            Defina sua Nova Senha
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-1">
            Olá, <strong>{profile?.displayName || user?.email}</strong>. Por motivos de segurança, crie sua senha pessoal definitiva para continuar.
          </p>
        </div>

        {/* Body Form */}
        <div className="p-8 space-y-6">
          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-xs text-red-700 animate-in fade-in">
              <AlertCircle size={16} className="shrink-0 text-red-600 mt-0.5" />
              <span className="font-medium leading-relaxed">{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Nova Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 10 caracteres..."
                  required
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Confirmar Nova Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha..."
                  required
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                />
              </div>
            </div>

            {/* Password Criteria Checklist */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5 text-xs text-slate-600">
              <span className="font-bold text-[11px] text-slate-700 uppercase tracking-wider block mb-1">
                Requisitos de Segurança:
              </span>
              <div className="grid grid-cols-1 gap-1">
                <div className={`flex items-center gap-2 ${hasMinLength ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                  <CheckCircle2 size={13} className={hasMinLength ? 'text-emerald-600' : 'text-slate-300'} />
                  <span>No mínimo 10 caracteres</span>
                </div>
                <div className={`flex items-center gap-2 ${hasUppercase ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                  <CheckCircle2 size={13} className={hasUppercase ? 'text-emerald-600' : 'text-slate-300'} />
                  <span>Pelo menos uma letra maiúscula (A-Z)</span>
                </div>
                <div className={`flex items-center gap-2 ${hasLowercase ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                  <CheckCircle2 size={13} className={hasLowercase ? 'text-emerald-600' : 'text-slate-300'} />
                  <span>Pelo menos uma letra minúscula (a-z)</span>
                </div>
                <div className={`flex items-center gap-2 ${hasNumber ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                  <CheckCircle2 size={13} className={hasNumber ? 'text-emerald-600' : 'text-slate-300'} />
                  <span>Pelo menos um número (0-9)</span>
                </div>
                <div className={`flex items-center gap-2 ${passwordsMatch ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                  <CheckCircle2 size={13} className={passwordsMatch ? 'text-emerald-600' : 'text-slate-300'} />
                  <span>Confirmação idêntica à nova senha</span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !isFormValid}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Salvando nova senha...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={16} />
                  <span>Salvar e Acessar o Sistema</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          <div className="text-center pt-1">
            <button
              type="button"
              onClick={logout}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium transition-colors"
            >
              Sair e trocar de conta
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200/80 text-center">
          <p className="text-[11px] text-slate-400 font-medium">
            A nova senha será exigida nos próximos acessos.
          </p>
        </div>
      </div>
    </div>
  );
}

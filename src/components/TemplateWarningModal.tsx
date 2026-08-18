import React, { useState, useRef } from 'react';
import { AlertTriangle, FileText, UploadCloud, ArrowRight, X, Loader2, CheckCircle2 } from 'lucide-react';
import { safeFetchJson } from '../utils/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToTemplates: () => void;
  onTemplateUploaded?: () => void;
}

export function TemplateWarningModal({ isOpen, onClose, onNavigateToTemplates, onTemplateUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.docx')) {
      setError('O arquivo deve ser obrigatoriamente um documento do Word (.docx).');
      return;
    }
    setError('');
    setFile(selectedFile);
  };

  const handleUploadQuick = async () => {
    if (!file) return;
    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('templateFile', file);
      formData.append('name', file.name.replace(/\.docx$/i, ''));
      formData.append('description', 'Template oficial carregado via assistente');
      formData.append('companyName', 'DEPARTAMENTO DE SUPRIMENTOS');

      const res = await fetch('/api/admin/templates', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar template DOCX.');

      setSuccess(true);
      onTemplateUploaded?.();
      setTimeout(() => {
        setSuccess(false);
        setFile(null);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar template.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white backdrop-blur-xs">
              <AlertTriangle size={22} className="animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">Template DOCX Obrigatório</h3>
              <p className="text-xs text-amber-100 font-medium">Nenhum template oficial cadastrado no sistema</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="text-xs text-slate-600 leading-relaxed space-y-2 bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5">
            <p className="font-semibold text-amber-900 flex items-center gap-1.5">
              <FileText size={15} className="text-amber-700 shrink-0" />
              O template salvo em DOCX é a única fonte usada na aplicação.
            </p>
            <p className="text-amber-800">
              Para garantir que a Pré-Ata e a Ata Final respeitem fielmente a identidade visual, cabeçalho, tabelas e cláusulas da sua empresa sem distorções, é necessário cadastrar o arquivo de <strong>Template DOCX</strong> no banco de dados.
            </p>
          </div>

          {/* Quick upload zone */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Upload Rápido do Template (.docx)
            </label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                file 
                  ? 'border-emerald-400 bg-emerald-50/50' 
                  : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                accept=".docx" 
                className="hidden" 
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }} 
              />

              {file ? (
                <div className="flex items-center justify-center gap-2 text-emerald-800 font-medium text-xs">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span className="truncate max-w-[260px]">{file.name}</span>
                  <span className="text-[10px] text-emerald-600">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <UploadCloud className="mx-auto h-6 w-6 text-slate-400" />
                  <p className="text-xs font-semibold text-slate-700">Clique para selecionar o arquivo .docx</p>
                  <p className="text-[10px] text-slate-400">Formatos aceitos: Microsoft Word (.docx)</p>
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5 font-medium">
              {error}
            </p>
          )}

          {success && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 font-semibold flex items-center gap-1.5">
              <CheckCircle2 size={15} />
              Template cadastrado e ativado com sucesso no banco de dados!
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={onNavigateToTemplates}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors border border-slate-200"
            >
              Gerenciar em Configurações
              <ArrowRight size={14} />
            </button>

            {file ? (
              <button
                type="button"
                onClick={handleUploadQuick}
                disabled={uploading}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-md disabled:bg-slate-300"
              >
                {uploading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Salvando no Banco...
                  </>
                ) : (
                  <>
                    <UploadCloud size={15} />
                    Salvar e Ativar Template
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={onNavigateToTemplates}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-all shadow-md"
              >
                <UploadCloud size={15} />
                Cadastrar Template DOCX
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

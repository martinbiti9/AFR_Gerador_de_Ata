import React, { useState, useEffect, useRef } from 'react';
import { TemplateConfig } from '../../types';
import { 
  FileText, Download, RotateCcw, UploadCloud, CheckCircle2, 
  AlertCircle, Clock, FileCode, Check, FileCheck, Info, X, Tag,
  Layers, Table as TableIcon, Sparkles, HelpCircle, ChevronDown, ChevronUp, Play, Trash2
} from 'lucide-react';
import { SchemaEditorModal } from './SchemaEditorModal';
import { safeFetchJson, safeFetchBlob } from '../../utils/api';
import { validateUploadFiles, ALLOWED_TEMPLATE_EXTENSIONS } from '../../utils/fileValidation';
import { emitCriticalDbError } from '../../contexts/AlertContext';

interface Props {
  onRefreshLogs?: () => void;
}

export function TemplatesTab({ onRefreshLogs }: Props) {
  const [versions, setVersions] = useState<TemplateConfig[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [savingNew, setSavingNew] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null);
  const [editingSchemaTemplate, setEditingSchemaTemplate] = useState<TemplateConfig | null>(null);

  // Form for new template version upload
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [companyName, setCompanyName] = useState('DEPARTAMENTO DE SUPRIMENTOS');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [templateToDelete, setTemplateToDelete] = useState<{ id: string; name: string; version: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const data = await safeFetchJson('/api/admin/templates');
      if (data) {
        setVersions(data.versions || []);
        setActiveId(data.activeId || '');
        if (data.activeId) {
          setExpandedDetailsId(data.activeId);
        }
      }
    } catch {
      setErrorMsg('Erro ao carregar templates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleFileSelect = (file: File) => {
    const validation = validateUploadFiles([file], ALLOWED_TEMPLATE_EXTENSIONS, 1, 15 * 1024 * 1024);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Arquivo de template inválido. Deve ser um documento Word (.docx) de até 15 MB.');
      setTemplateFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setErrorMsg('');
    setTemplateFile(file);
    if (!templateName) {
      setTemplateName(file.name.replace(/\.docx$/i, ''));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleCreateVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateFile) {
      setErrorMsg('Selecione obrigatoriamente um arquivo .docx para upload do novo template.');
      return;
    }

    const validation = validateUploadFiles([templateFile], ALLOWED_TEMPLATE_EXTENSIONS, 1, 15 * 1024 * 1024);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Arquivo de template inválido.');
      return;
    }

    setSavingNew(true);
    setErrorMsg('');
    setStatusMsg('');

    try {
      const formData = new FormData();
      formData.append('templateFile', templateFile);
      formData.append('name', templateName || templateFile.name.replace(/\.docx$/i, ''));
      formData.append('description', templateDescription);
      formData.append('companyName', companyName);

      const data = await safeFetchJson<{ template: { version: number } }>('/api/admin/templates', {
        method: 'POST',
        body: formData,
      });

      setStatusMsg(`Versão v${data.template.version} do Template DOCX analisada e salva no Firestore com sucesso!`);
      setIsUploading(false);
      setTemplateFile(null);
      setTemplateName('');
      setTemplateDescription('');
      await fetchTemplates();
      onRefreshLogs?.();
      setTimeout(() => setStatusMsg(''), 6000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao criar template.');
      emitCriticalDbError({
        title: 'Erro Crítico ao Salvar Template no Banco',
        message: 'Não foi possível fazer o upload e gravação do template DOCX no Firestore.',
        details: err.message || err,
        path: 'templates'
      });
    } finally {
      setSavingNew(false);
    }
  };

  const handleRollback = async (targetId: string, versionNum: number) => {
    if (!confirm(`Deseja realmente ativar a Versão v${versionNum} como template padrão?`)) {
      return;
    }

    try {
      await safeFetchJson(`/api/admin/templates/${targetId}/rollback`, {
        method: 'POST',
      });

      setStatusMsg(`Template v${versionNum} definido como ativo no Firestore.`);
      await fetchTemplates();
      onRefreshLogs?.();
      setTimeout(() => setStatusMsg(''), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao ativar versão.');
      emitCriticalDbError({
        title: 'Erro ao Alterar Template Ativo',
        message: `Falha ao ativar o template v${versionNum} no Firestore.`,
        details: err.message || err,
        path: `templates/${targetId}`
      });
    }
  };

  const confirmDeleteTemplate = async () => {
    if (!templateToDelete) return;
    const { id: targetId, name, version: versionNum } = templateToDelete;

    try {
      setIsDeleting(true);
      setErrorMsg('');
      await safeFetchJson(`/api/admin/templates/${targetId}`, {
        method: 'DELETE',
      });

      setStatusMsg(`Template v${versionNum} ("${name}") excluído com sucesso do Firestore!`);
      setTemplateToDelete(null);
      await fetchTemplates();
      onRefreshLogs?.();
      setTimeout(() => setStatusMsg(''), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao excluir template.');
      emitCriticalDbError({
        title: 'Erro Crítico ao Excluir Template',
        message: `Falha ao excluir o template v${versionNum} do banco de dados.`,
        details: err.message || err,
        path: `templates/${targetId}`
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteTemplate = (targetId: string, name: string, versionNum: number) => {
    setTemplateToDelete({ id: targetId, name, version: versionNum });
  };

  const handleDownload = async (templateId: string, templateFileName = 'template.docx') => {
    try {
      const blob = await safeFetchBlob(`/api/admin/templates/${templateId}/download`);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = templateFileName.endsWith('.docx') ? templateFileName : `${templateFileName}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Erro ao baixar arquivo do template: ' + (err.message || err));
    }
  };

  const activeTemplate = versions.find(v => v.id === activeId) || versions[0];
  const last3Versions = versions.slice(0, 3);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500 text-xs">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent mr-2"></div>
        Carregando templates do Firestore...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Schema Editor Modal */}
      {editingSchemaTemplate && (
        <SchemaEditorModal
          template={editingSchemaTemplate}
          isOpen={true}
          onClose={() => setEditingSchemaTemplate(null)}
          onSaved={() => {
            fetchTemplates();
            onRefreshLogs?.();
          }}
        />
      )}

      {/* Confirmation Modal for Template Deletion */}
      {templateToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 bg-red-100 rounded-full">
                <Trash2 size={24} />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">Excluir Template</h4>
                <p className="text-xs text-slate-500">Esta ação é permanente no banco de dados</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <p className="text-xs font-bold text-slate-800">
                Versão v{templateToDelete.version} - {templateToDelete.name}
              </p>
              <p className="text-[11px] text-slate-500">
                O arquivo Word (.docx) correspondente será removido do Firestore e do armazenamento local.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setTemplateToDelete(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg uppercase tracking-tight transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteTemplate}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-lg text-xs font-bold uppercase tracking-tight shadow transition-colors flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <>Excluindo do Banco...</>
                ) : (
                  <>
                    <Trash2 size={14} />
                    Confirmar Exclusão
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <FileText className="text-blue-600" size={20} />
            Gerenciamento de Templates DOCX (Persistência no Firestore)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Os templates são lidos diretamente do banco Firestore em cada geração. Todas as variáveis possuem validação estrita com schema tipado.
          </p>
        </div>

        <button
          onClick={() => {
            setIsUploading(true);
            setTemplateFile(null);
            setErrorMsg('');
          }}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold uppercase tracking-tight shadow-sm transition-all shrink-0"
        >
          <UploadCloud size={16} />
          Fazer Upload de Novo Template
        </button>
      </div>

      {/* Notifications */}
      {statusMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium rounded-lg flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          {statusMsg}
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-lg flex items-center gap-2 animate-in fade-in duration-200">
          <AlertCircle size={16} className="text-red-600 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Upload Interface for New DOCX Version */}
      {isUploading && (
        <form onSubmit={handleCreateVersion} className="p-6 bg-white border-2 border-blue-300 rounded-xl shadow-sm space-y-5 animate-in fade-in duration-300">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <UploadCloud size={18} className="text-blue-600" />
                Upload do Arquivo de Template DOCX
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Envie o modelo oficial em formato Microsoft Word (.docx). A IA inspecionará a estrutura, tabelas e tags XML dinamicamente gerando o schema base.
              </p>
            </div>
            <span className="text-[11px] bg-blue-100 text-blue-800 px-2.5 py-1 rounded font-bold uppercase">
              Firestore Persisted
            </span>
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-blue-500 bg-blue-50/70 scale-[1.01]'
                : templateFile
                ? 'border-emerald-400 bg-emerald-50/40'
                : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
              className="hidden"
            />

            {templateFile ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-xs">
                  <FileCheck size={26} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-slate-800">{templateFile.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {(templateFile.size / 1024).toFixed(1)} KB • Arquivo DOCX pronto para análise e persistência
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTemplateFile(null);
                  }}
                  className="mt-1 text-xs text-red-600 hover:underline font-semibold"
                >
                  Trocar arquivo
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shadow-xs">
                  <UploadCloud size={26} />
                </div>
                <p className="text-sm font-semibold text-slate-700">
                  Arraste e solte o arquivo <strong className="text-blue-600">.docx</strong> aqui ou clique para selecionar
                </p>
                <p className="text-xs text-slate-400">
                  Apenas arquivos com extensão .docx são processados
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 uppercase">Nome de Identificação do Template *</label>
              <input
                type="text"
                required
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="w-full mt-1 bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                placeholder="Ex: Template Oficial Ata de Suprimentos 2026"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 uppercase">Empresa / Departamento</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full mt-1 bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                placeholder="DEPARTAMENTO DE SUPRIMENTOS"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-bold text-slate-700 uppercase">Descrição / Finalidade (Opcional)</label>
              <input
                type="text"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                className="w-full mt-1 bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                placeholder="Ex: Modelo corporativo padrão para atas de negociação de subempreiteiros e materiais"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setIsUploading(false)}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg uppercase tracking-tight transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingNew || !templateFile}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-xs font-bold uppercase tracking-tight shadow transition-colors flex items-center gap-1.5"
            >
              {savingNew ? (
                <>Analisando Estrutura e Gravando no Firestore...</>
              ) : (
                <>
                  <Check size={15} />
                  Analisar e Salvar Versão
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Histórico das Versões com Schema, Rollback e Download */}
      <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Clock size={15} className="text-slate-500" />
            Templates Cadastrados no Banco de Dados (Firestore)
          </h4>
          <span className="text-[10px] text-slate-400 font-medium">Persistência permanente</span>
        </div>

        {versions.length === 0 ? (
          <div className="bg-amber-50/80 border-2 border-dashed border-amber-300 rounded-xl p-8 text-center space-y-3">
            <AlertCircle className="mx-auto h-10 w-10 text-amber-600 animate-bounce" />
            <h5 className="text-sm font-bold text-amber-900">Nenhum Template DOCX Cadastrado</h5>
            <p className="text-xs text-amber-800 max-w-md mx-auto">
              A aplicação não utiliza templates fixos. Para gerar a Pré-Ata e a Ata Final, faça o upload do seu arquivo .docx corporativo.
            </p>
            <button
              type="button"
              onClick={() => setIsUploading(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold uppercase tracking-tight shadow transition-colors"
            >
              <UploadCloud size={14} />
              Fazer Upload do Template Agora
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {last3Versions.map((v) => {
              const isActive = v.id === activeId;

              return (
                <div
                  key={v.id}
                  className={`p-4 rounded-xl border transition-all flex flex-col justify-between ${
                    isActive
                      ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-500'
                      : 'bg-white/80 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded uppercase ${
                          isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          Versão v{v.version} {isActive ? '• ATIVO' : ''}
                        </span>
                        <h5 className="text-sm font-bold text-slate-800 mt-1">{v.name}</h5>
                      </div>
                      <span className="text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded uppercase">
                        DOCX
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 line-clamp-2 mb-3">
                      {v.structureSummary || v.description || 'Template DOCX analisado.'}
                    </p>

                    {/* Detected XML tags / placeholders */}
                    {v.detectedPlaceholders && v.detectedPlaceholders.length > 0 && (
                      <div className="mb-3 p-2 bg-slate-50 rounded border border-slate-100">
                        <p className="text-[9px] font-bold text-slate-500 uppercase flex items-center gap-1 mb-1">
                          <Tag size={10} /> {v.detectedPlaceholders.length} Variáveis Mapeadas:
                        </p>
                        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                          {v.detectedPlaceholders.map((tag) => (
                            <span key={tag} className="text-[9px] font-mono bg-white border border-slate-200 px-1 rounded text-slate-700">
                              {`{${tag}}`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="text-[10px] text-slate-400 space-y-1 mb-4 border-t border-slate-100 pt-2">
                      <p><strong>Empresa:</strong> {v.companyName}</p>
                      {v.fileSizeBytes && (
                        <p><strong>Tamanho:</strong> {(v.fileSizeBytes / 1024).toFixed(1)} KB</p>
                      )}
                      <p><strong>Arquivo:</strong> {v.originalFileName || 'template.docx'}</p>
                      <p><strong>Criado em:</strong> {new Date(v.createdAt).toLocaleString('pt-BR')}</p>
                    </div>
                  </div>

                  <div className="space-y-2 pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setEditingSchemaTemplate(v)}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold rounded transition-colors border border-indigo-200"
                    >
                      <FileCode size={13} />
                      Editar Schema & Testar
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDownload(v.id || '')}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded transition-colors"
                        title="Baixar arquivo .DOCX deste template"
                      >
                        <Download size={13} />
                        Download
                      </button>

                      {!isActive && (
                        <button
                          onClick={() => handleRollback(v.id || '', v.version)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 text-[11px] font-bold rounded transition-colors"
                          title="Ativar esta versão como padrão"
                        >
                          <RotateCcw size={13} />
                          Ativar
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteTemplate(v.id || '', v.name, v.version)}
                        className="p-1.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 hover:text-red-700 rounded transition-colors"
                        title="Excluir este template do banco de dados"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dynamic Template Structure Guide */}
      <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-5 space-y-3">
        <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-2">
          <Info size={16} className="text-indigo-600" />
          Como Funciona o Preenchimento Dinâmico de Templates DOCX
        </h4>
        <p className="text-xs text-indigo-900 leading-relaxed">
          O motor de geração utiliza a biblioteca <strong>Docxtemplater + PizZip</strong> com normalização de XML runs e validação de schema. Os dados do checklist, propostas comerciais e transcrições de reunião são reconciliados de forma determinística antes da inserção no DOCX.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-white p-3 rounded-lg border border-indigo-100 space-y-1 font-mono text-[11px]">
            <p className="font-bold text-slate-800 font-sans">Variáveis de Obra e Identificação:</p>
            <p><span className="text-blue-700 font-bold">{'{obraCodigo}'}</span> ou <span className="text-blue-700 font-bold">{'{obra}'}</span> - Código da Obra</p>
            <p><span className="text-blue-700 font-bold">{'{obraNome}'}</span> ou <span className="text-blue-700 font-bold">{'{nomeObra}'}</span> - Nome do Empreendimento</p>
            <p><span className="text-blue-700 font-bold">{'{fornecedor}'}</span> ou <span className="text-blue-700 font-bold">{'{empresa}'}</span> - Razão Social do Fornecedor</p>
            <p><span className="text-blue-700 font-bold">{'{assunto}'}</span> - Assunto da Reunião</p>
            <p><span className="text-blue-700 font-bold">{'{servico}'}</span> ou <span className="text-blue-700 font-bold">{'{escopo}'}</span> - Pacote Contratado</p>
            <p><span className="text-blue-700 font-bold">{'{rm}'}</span> - Requisição de Materiais (RM)</p>
            <p><span className="text-blue-700 font-bold">{'{cot}'}</span> - Mapa de Cotação (COT)</p>
            <p><span className="text-blue-700 font-bold">{'{dataReuniao}'}</span> ou <span className="text-blue-700 font-bold">{'{data}'}</span> - Data da Reunião</p>
          </div>

          <div className="bg-white p-3 rounded-lg border border-indigo-100 space-y-1 font-mono text-[11px]">
            <p className="font-bold text-slate-800 font-sans">Tabelas e Seções Dinâmicas:</p>
            <p><span className="text-blue-700 font-bold">{'{#topics}'}</span> ... <span className="text-blue-700 font-bold">{'{/topics}'}</span> - Linhas da Análise de Aderência</p>
            <p><span className="text-blue-700 font-bold">{'{#divergences}'}</span> ... <span className="text-blue-700 font-bold">{'{/divergences}'}</span> - Linhas de Divergências</p>
            <p><span className="text-blue-700 font-bold">{'{#agreedItems}'}</span> ... <span className="text-blue-700 font-bold">{'{/agreedItems}'}</span> - Itens Acordados</p>
            <p><span className="text-blue-700 font-bold">{'{#pendingItems}'}</span> ... <span className="text-blue-700 font-bold">{'{/pendingItems}'}</span> - Pendências</p>
            <p><span className="text-blue-700 font-bold">{'{#participantes}'}</span> ... <span className="text-blue-700 font-bold">{'{/participantes}'}</span> - Tabela de Participantes</p>
            <p><span className="text-blue-700 font-bold">{'{resumo}'}</span> ou <span className="text-blue-700 font-bold">{'{corpoAta}'}</span> - Textos Completos</p>
          </div>
        </div>
      </div>
    </div>
  );
}

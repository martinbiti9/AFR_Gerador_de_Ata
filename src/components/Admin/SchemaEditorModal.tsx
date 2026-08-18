import React, { useState } from 'react';
import { TemplateConfig, TemplateSchema, TemplateField, TemplateLoop } from '../../types';
import { X, Plus, Trash2, Check, AlertCircle, Play, FileCode, CheckCircle2 } from 'lucide-react';

interface Props {
  template: TemplateConfig;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function SchemaEditorModal({ template, isOpen, onClose, onSaved }: Props) {
  const initialSchema: TemplateSchema = template.schema || {
    version: template.version || 1,
    templateId: template.id,
    fields: (template.detectedPlaceholders || []).map(p => ({
      name: p,
      path: `fields.${p}`,
      type: 'string' as const,
      required: ['obraCodigo', 'fornecedor', '[CÓDIGO DA OBRA]', '[FORNECEDOR]'].includes(p),
      description: `Variável ${p}`
    })),
    loops: [
      {
        tag: 'topics',
        description: 'Tópicos do Checklist e Análise de Aderência',
        itemFields: [
          { name: 'title', path: 'item.title', type: 'string', required: true, description: 'Título' },
          { name: 'regraObra', path: 'item.regraObra', type: 'string', required: false, description: 'Regra da Obra' }
        ]
      },
      {
        tag: 'divergences',
        description: 'Divergências da Proposta Comercial',
        itemFields: [
          { name: 'description', path: 'item.description', type: 'string', required: true, description: 'Descrição' },
          { name: 'severity', path: 'item.severity', type: 'string', required: false, description: 'Severidade' }
        ]
      }
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    generatedBy: 'admin'
  };

  const [schema, setSchema] = useState<TemplateSchema>(initialSchema);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [testResult, setTestResult] = useState<any>(null);

  if (!isOpen) return null;

  const handleAddField = () => {
    const fieldName = `campo_${schema.fields.length + 1}`;
    const newField: TemplateField = {
      name: fieldName,
      path: `fields.${fieldName}`,
      type: 'string',
      required: false,
      description: ''
    };
    setSchema({
      ...schema,
      fields: [...schema.fields, newField]
    });
  };

  const handleRemoveField = (index: number) => {
    const updated = [...schema.fields];
    updated.splice(index, 1);
    setSchema({ ...schema, fields: updated });
  };

  const handleFieldChange = (index: number, key: keyof TemplateField, val: any) => {
    const updated = [...schema.fields];
    updated[index] = { ...updated[index], [key]: val };
    setSchema({ ...schema, fields: updated });
  };

  const handleAddLoop = () => {
    const tag = `loop_${schema.loops.length + 1}`;
    const newLoop: TemplateLoop = {
      tag,
      description: 'Nova lista dinâmica',
      itemFields: [
        { name: 'item', path: 'item.text', type: 'string', required: true, description: 'Item' }
      ]
    };
    setSchema({
      ...schema,
      loops: [...schema.loops, newLoop]
    });
  };

  const handleRemoveLoop = (index: number) => {
    const updated = [...schema.loops];
    updated.splice(index, 1);
    setSchema({ ...schema, loops: updated });
  };

  const handleSaveSchema = async () => {
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`/api/admin/templates/${template.id}/schema`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar schema do template.');

      setSuccessMsg('Schema do template salvo e validado com sucesso no Firestore!');
      setTimeout(() => {
        onSaved();
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao salvar schema.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestRender = async () => {
    setTesting(true);
    setErrorMsg('');
    setTestResult(null);
    try {
      const res = await fetch(`/api/admin/templates/${template.id}/test-render`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Falha no teste de renderização.');
      }
      setTestResult(data.report);
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao testar renderização.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-xl">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Editor de Schema do Template (v{template.version})
              </h3>
              <p className="text-xs text-slate-500">{template.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700">
              <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center text-emerald-700">
              <Check className="w-4 h-4 mr-2 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Test Render Results Banner */}
          {testResult && (
            <div className={`p-4 rounded-lg border ${testResult.isVerified ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center font-semibold text-xs">
                  <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-600" />
                  Resultado do Teste Round-Trip: {testResult.isVerified ? 'SUCESSO TOTAL' : 'AVISO'} ({testResult.fileSizeBytes} bytes)
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 font-mono font-medium">
                  {testResult.foundFields.length} campos validados
                </span>
              </div>
              <div className="text-[11px] space-y-1">
                <div><strong>Campos Confirmados no Binário:</strong> {testResult.foundFields.join(', ') || 'Nenhum'}</div>
                {testResult.unresolvedPlaceholders?.length > 0 && (
                  <div className="text-amber-800"><strong>Placeholders pendentes:</strong> {testResult.unresolvedPlaceholders.join(', ')}</div>
                )}
                <div className="mt-2 text-slate-600 bg-white/60 p-2 rounded text-[10px] font-mono whitespace-pre-wrap">
                  {testResult.extractedTextSnippet}
                </div>
              </div>
            </div>
          )}

          {/* Fields Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-slate-800 text-xs">Campos Escalares ({schema.fields.length})</h4>
                <p className="text-slate-500 text-[11px]">Variáveis simples que são substituídas diretamente no DOCX.</p>
              </div>
              <button
                type="button"
                onClick={handleAddField}
                className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Adicionar Campo
              </button>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Nome da Tag</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2 text-center">Obrigatório</th>
                    <th className="px-3 py-2">Valor Padrão</th>
                    <th className="px-2 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {schema.fields.map((field, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) => handleFieldChange(idx, 'name', e.target.value)}
                          className="w-full text-xs px-2 py-1 border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 font-mono"
                          placeholder="tag_nome"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={field.type}
                          onChange={(e) => handleFieldChange(idx, 'type', e.target.value as any)}
                          className="w-full text-xs px-2 py-1 border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="string">Texto (String)</option>
                          <option value="number">Número</option>
                          <option value="date">Data</option>
                          <option value="boolean">Booleano</option>
                        </select>
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => handleFieldChange(idx, 'required', e.target.checked)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={typeof field.defaultValue === 'string' ? field.defaultValue : (field.defaultValue !== undefined ? String(field.defaultValue) : '')}
                          onChange={(e) => handleFieldChange(idx, 'defaultValue', e.target.value)}
                          className="w-full text-xs px-2 py-1 border border-slate-200 rounded focus:ring-1 focus:ring-indigo-500 text-slate-600"
                          placeholder="opcional..."
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveField(idx)}
                          className="p-1 text-slate-400 hover:text-red-600 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Loops Section */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-slate-800 text-xs">Loops e Tabelas ({schema.loops.length})</h4>
                <p className="text-slate-500 text-[11px]">Listas de itens renderizadas em linhas ou tabelas ({`{#loop}...{/loop}`}).</p>
              </div>
              <button
                type="button"
                onClick={handleAddLoop}
                className="inline-flex items-center px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Adicionar Loop
              </button>
            </div>

            <div className="space-y-3">
              {schema.loops.map((loop, lIdx) => (
                <div key={lIdx} className="p-3 border border-slate-200 rounded-lg bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={loop.tag}
                        onChange={(e) => {
                          const updated = [...schema.loops];
                          updated[lIdx].tag = e.target.value;
                          setSchema({ ...schema, loops: updated });
                        }}
                        className="text-xs px-2 py-1 border border-slate-200 rounded font-mono font-medium"
                        placeholder="tag_do_loop"
                      />
                      <input
                        type="text"
                        value={loop.description || ''}
                        onChange={(e) => {
                          const updated = [...schema.loops];
                          updated[lIdx].description = e.target.value;
                          setSchema({ ...schema, loops: updated });
                        }}
                        className="text-xs px-2 py-1 border border-slate-200 rounded w-64 text-slate-600"
                        placeholder="Descrição da tabela..."
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveLoop(lIdx)}
                      className="p-1 text-slate-400 hover:text-red-600 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block mb-1">Campos do item (separados por vírgula):</span>
                    <input
                      type="text"
                      value={loop.itemFields.map(f => f.name).join(', ')}
                      onChange={(e) => {
                        const updated = [...schema.loops];
                        const names = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                        updated[lIdx].itemFields = names.map(n => ({
                          name: n,
                          path: `item.${n}`,
                          type: 'string',
                          required: false,
                          description: n
                        }));
                        setSchema({ ...schema, loops: updated });
                      }}
                      className="w-full text-xs px-2 py-1 border border-slate-200 rounded font-mono text-slate-700 bg-white"
                      placeholder="item, title, responsavel, prazo"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl flex items-center justify-between">
          <button
            type="button"
            onClick={handleTestRender}
            disabled={testing}
            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg shadow-sm transition disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
            {testing ? 'Testando Renderização...' : 'Executar Teste Round-Trip'}
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveSchema}
              disabled={saving}
              className="inline-flex items-center px-4 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5 mr-1.5" />
              {saving ? 'Validando e Salvando...' : 'Salvar Schema'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

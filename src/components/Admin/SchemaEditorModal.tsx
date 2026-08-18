import React, { useState } from 'react';
import { TemplateConfig, TemplateSchema, TemplateField, TemplateLoop, LoopColumn } from '../../types';
import { X, Plus, Trash2, Check, AlertCircle, Play, FileCode, CheckCircle2, Table as TableIcon, Layers, Settings2 } from 'lucide-react';
import { safeFetchJson } from '../../utils/api';

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
      required: ['obraCodigo', 'fornecedor'].includes(p),
      description: `Variável ${p}`
    })),
    loops: [
      {
        tag: 'itens',
        description: 'Tabela principal de deliberações e acordos da reunião',
        tableIndex: 0,
        prototypeRowIndex: 1,
        removeOtherRows: true,
        columns: [
          { cellIndex: 0, key: 'num', label: 'Item' },
          { cellIndex: 1, key: '@corpoXml', label: 'Corpo Formatado (OOXML)' },
          { cellIndex: 2, key: 'responsavel', label: 'Responsável' },
          { cellIndex: 3, key: 'prazo', label: 'Prazo' }
        ],
        itemFields: [
          { name: 'num', path: 'item.num', type: 'string', required: false, description: 'Número' },
          { name: 'corpoXml', path: 'item.corpoXml', type: 'string', required: false, description: 'XML do Conteúdo' },
          { name: 'responsavel', path: 'item.responsavel', type: 'string', required: false, description: 'Responsável' },
          { name: 'prazo', path: 'item.prazo', type: 'string', required: false, description: 'Prazo' }
        ]
      }
    ],
    placeholderMap: {
      '[CÓDIGO DA OBRA]': 'obraCodigo',
      '[FORNECEDOR]': 'fornecedor',
      '[ASSUNTO]': 'assunto',
      '[SERVIÇO]': 'servico',
      '[EXTRAIR DO FIRE FLIES]': 'resumo',
      '[caminho da rede]': 'linkReuniao',
      'RM XXX COT XXX': 'RM {rm} COT {cot}'
    },
    removerRealceAmarelo: true,
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
  const [activeTab, setActiveTab] = useState<'fields' | 'loops' | 'placeholders'>('loops');

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
      description: 'Nova tabela com loop dinâmico',
      tableIndex: 0,
      prototypeRowIndex: 1,
      removeOtherRows: true,
      columns: [
        { cellIndex: 0, key: 'num', label: 'Item' },
        { cellIndex: 1, key: '@corpoXml', label: 'Corpo Formatado' },
        { cellIndex: 2, key: 'responsavel', label: 'Responsável' },
        { cellIndex: 3, key: 'prazo', label: 'Prazo' }
      ],
      itemFields: [
        { name: 'num', path: 'item.num', type: 'string', required: false, description: 'Número' },
        { name: 'corpoXml', path: 'item.corpoXml', type: 'string', required: false, description: 'Corpo' },
        { name: 'responsavel', path: 'item.responsavel', type: 'string', required: false, description: 'Responsável' },
        { name: 'prazo', path: 'item.prazo', type: 'string', required: false, description: 'Prazo' }
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

  const handleLoopChange = (index: number, key: keyof TemplateLoop, val: any) => {
    const updated = [...schema.loops];
    updated[index] = { ...updated[index], [key]: val };
    setSchema({ ...schema, loops: updated });
  };

  const handleAddColumnToLoop = (loopIndex: number) => {
    const updated = [...schema.loops];
    const loop = updated[loopIndex];
    const cols = loop.columns || [];
    const newCellIndex = cols.length;
    const newCol: LoopColumn = {
      cellIndex: newCellIndex,
      key: `col_${newCellIndex + 1}`,
      label: `Coluna ${newCellIndex + 1}`
    };
    updated[loopIndex] = {
      ...loop,
      columns: [...cols, newCol]
    };
    setSchema({ ...schema, loops: updated });
  };

  const handleRemoveColumnFromLoop = (loopIndex: number, colIndex: number) => {
    const updated = [...schema.loops];
    const loop = updated[loopIndex];
    const cols = [...(loop.columns || [])];
    cols.splice(colIndex, 1);
    updated[loopIndex] = { ...loop, columns: cols };
    setSchema({ ...schema, loops: updated });
  };

  const handleColumnChange = (loopIndex: number, colIndex: number, field: keyof LoopColumn, val: any) => {
    const updated = [...schema.loops];
    const loop = updated[loopIndex];
    const cols = [...(loop.columns || [])];
    cols[colIndex] = { ...cols[colIndex], [field]: val };
    updated[loopIndex] = { ...loop, columns: cols };
    setSchema({ ...schema, loops: updated });
  };

  const handleSaveSchema = async () => {
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await safeFetchJson(`/api/admin/templates/${template.id}/schema`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema })
      });

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
      const data = await safeFetchJson<{ success: boolean; report: any; error?: string }>(`/api/admin/templates/${template.id}/test-render`, {
        method: 'POST'
      });
      if (!data.success) {
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
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-xl">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Editor de Schema e Injeção de Loops DOCX (v{template.version})
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

        {/* Tab Navigation */}
        <div className="px-6 pt-3 border-b border-slate-200 bg-white flex items-center gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('loops')}
            className={`pb-2.5 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'loops'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <TableIcon size={14} />
            Tabelas & Injeção de Loops ({schema.loops.length})
          </button>
          <button
            onClick={() => setActiveTab('fields')}
            className={`pb-2.5 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'fields'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers size={14} />
            Campos Escalares ({schema.fields.length})
          </button>
          <button
            onClick={() => setActiveTab('placeholders')}
            className={`pb-2.5 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'placeholders'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Settings2 size={14} />
            Configurações & PlaceholderMap
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
                  {testResult.foundFields?.length || 0} campos validados
                </span>
              </div>
              <div className="text-[11px] space-y-1">
                <div><strong>Campos Confirmados no Binário:</strong> {testResult.foundFields?.join(', ') || 'Nenhum'}</div>
                {testResult.unresolvedPlaceholders?.length > 0 && (
                  <div className="text-amber-800"><strong>Placeholders pendentes:</strong> {testResult.unresolvedPlaceholders.join(', ')}</div>
                )}
                {testResult.loopVerification && (
                  <div><strong>Verificação de Loops/Tabelas:</strong> {testResult.loopVerification.foundRows} linhas detectadas</div>
                )}
                <div className="mt-2 text-slate-600 bg-white/60 p-2 rounded text-[10px] font-mono whitespace-pre-wrap">
                  {testResult.extractedTextSnippet}
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: LOOPS & TABLES */}
          {activeTab === 'loops' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-slate-800 text-xs">Mapeamento de Tabelas e Linhas de Repetição</h4>
                  <p className="text-slate-500 text-[11px]">
                    Define o índice da tabela XML, linha-protótipo modelo e o mapeamento de cada célula para injeção automática de tags.
                  </p>
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

              <div className="space-y-4">
                {schema.loops.map((loop, lIdx) => (
                  <div key={lIdx} className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="text-[10px] font-bold uppercase bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-mono">
                          {`{#${loop.tag}}`}
                        </span>
                        <input
                          type="text"
                          value={loop.tag}
                          onChange={(e) => handleLoopChange(lIdx, 'tag', e.target.value)}
                          className="text-xs px-2 py-1 border border-slate-200 rounded font-mono font-bold"
                          placeholder="tag_do_loop"
                        />
                        <input
                          type="text"
                          value={loop.description || ''}
                          onChange={(e) => handleLoopChange(lIdx, 'description', e.target.value)}
                          className="text-xs px-2 py-1 border border-slate-200 rounded w-72 text-slate-600"
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

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white p-3 rounded-lg border border-slate-200">
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase">Índice da Tabela (tableIndex)</label>
                        <input
                          type="number"
                          min="0"
                          value={loop.tableIndex ?? 0}
                          onChange={(e) => handleLoopChange(lIdx, 'tableIndex', parseInt(e.target.value) || 0)}
                          className="w-full mt-1 text-xs px-2 py-1 border border-slate-200 rounded font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-600 uppercase">Linha-Protótipo (prototypeRowIndex)</label>
                        <input
                          type="number"
                          min="0"
                          value={loop.prototypeRowIndex ?? 1}
                          onChange={(e) => handleLoopChange(lIdx, 'prototypeRowIndex', parseInt(e.target.value) || 0)}
                          className="w-full mt-1 text-xs px-2 py-1 border border-slate-200 rounded font-mono"
                        />
                      </div>
                      <div className="flex items-center pt-4">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={loop.removeOtherRows ?? false}
                            onChange={(e) => handleLoopChange(lIdx, 'removeOtherRows', e.target.checked)}
                            className="rounded text-indigo-600 h-4 w-4"
                          />
                          <span className="text-[11px] font-medium text-slate-700">Remover linhas estáticas da tabela</span>
                        </label>
                      </div>
                    </div>

                    {/* Columns Mapping */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Mapeamento de Células da Linha (Colunas):
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddColumnToLoop(lIdx)}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 px-2 py-0.5 rounded shadow-xs"
                        >
                          + Adicionar Coluna
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                        {(loop.columns || []).map((col, cIdx) => (
                          <div key={cIdx} className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5 relative group">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono text-slate-400 font-bold">Célula {col.cellIndex}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveColumnFromLoop(lIdx, cIdx)}
                                className="text-slate-300 hover:text-red-600"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                            <div>
                              <label className="text-[9px] text-slate-500 uppercase font-semibold">Chave da Tag:</label>
                              <input
                                type="text"
                                value={col.key}
                                onChange={(e) => handleColumnChange(lIdx, cIdx, 'key', e.target.value)}
                                className="w-full text-xs px-1.5 py-0.5 border border-slate-200 rounded font-mono text-indigo-900 font-bold"
                                placeholder="num, @corpoXml, prazo"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] text-slate-500 uppercase font-semibold">Rótulo / Título:</label>
                              <input
                                type="text"
                                value={col.label || ''}
                                onChange={(e) => handleColumnChange(lIdx, cIdx, 'label', e.target.value)}
                                className="w-full text-xs px-1.5 py-0.5 border border-slate-200 rounded text-slate-600"
                                placeholder="Descrição"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: SCALAR FIELDS */}
          {activeTab === 'fields' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-slate-800 text-xs">Campos Escalares ({schema.fields.length})</h4>
                  <p className="text-slate-500 text-[11px]">Variáveis simples substituídas diretamente nas tags do DOCX.</p>
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
          )}

          {/* TAB 3: CONFIG & PLACEHOLDER MAP */}
          {activeTab === 'placeholders' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <h4 className="font-semibold text-slate-800 text-xs flex items-center gap-2">
                  <Settings2 size={16} className="text-indigo-600" />
                  Opções Globais de Renderização
                </h4>
                
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={schema.removerRealceAmarelo ?? true}
                    onChange={(e) => setSchema({ ...schema, removerRealceAmarelo: e.target.checked })}
                    className="rounded text-indigo-600 h-4 w-4"
                  />
                  <div>
                    <p className="font-semibold text-slate-800 text-xs">Remover Realce Amarelo automaticamente no DOCX gerado</p>
                    <p className="text-[11px] text-slate-500">Remove tags &lt;w:highlight w:val="yellow"/&gt; sem alterar estilos ou cores originais do template.</p>
                  </div>
                </label>
              </div>

              {/* Placeholder Map Editor */}
              <div className="space-y-2">
                <h4 className="font-semibold text-slate-800 text-xs">Mapeamento de Colchetes e Tokens (PlaceholderMap)</h4>
                <p className="text-slate-500 text-[11px]">
                  Substituições literais aplicadas via split/join antes do renderizador (apenas em document, header e footer).
                </p>

                <div className="bg-slate-900 text-slate-100 p-3 rounded-lg font-mono text-[11px] max-h-48 overflow-y-auto">
                  <pre>{JSON.stringify(schema.placeholderMap || {}, null, 2)}</pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl flex items-center justify-between">
          <button
            type="button"
            onClick={handleTestRender}
            disabled={testing}
            className="inline-flex items-center px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg shadow-xs transition disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
            {testing ? 'Testando Renderização...' : 'Executar Teste Round-Trip'}
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveSchema}
              disabled={saving}
              className="inline-flex items-center px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition disabled:opacity-50"
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

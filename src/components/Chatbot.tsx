import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, User, Bot, Loader2, Database, Sparkles, HelpCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { safeFetchJson } from '../utils/api';

export function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: string, text: string}[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const quickPrompts = [
    'Quais atas estão gravadas no banco de dados?',
    'O que foi acordado e quais as pendências da última reunião?',
    'Buscar divergências encontradas nas negociações'
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (customMessage?: string) => {
    const textToSend = customMessage || input.trim();
    if (!textToSend || loading) return;
    
    if (!customMessage) {
      setInput('');
    }
    
    const newMessages = [...messages, { role: 'user', text: textToSend }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const data = await safeFetchJson<{ reply: string }>('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: messages, message: textToSend })
      });
      
      const replyText = data?.reply || 'Não foi possível gerar uma resposta para esta solicitação.';
      setMessages([...newMessages, { role: 'model', text: replyText }]);
    } catch (error: any) {
      console.error('Erro ao enviar mensagem:', error);
      const friendlyMessage = error?.message && !error.message.includes('JSON') && !error.message.includes('<!')
        ? `Ocorreu uma instabilidade na consulta: ${error.message}`
        : 'O assistente está temporariamente ocupado ou reconectando. Por favor, tente enviar sua pergunta novamente em instantes.';
      
      setMessages([...newMessages, { role: 'model', text: friendlyMessage }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-slate-900 text-white rounded-full shadow-2xl flex items-center justify-center hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all z-40 group"
        title="Assistente de Atas e Suprimentos com RAG"
      >
        <MessageSquare size={24} className="group-hover:rotate-6 transition-transform" />
        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full"></span>
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[450px] max-w-[calc(100vw-2rem)] h-[580px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col z-50 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-slate-900 text-white p-4 flex justify-between items-center border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400">
                <Bot size={18} />
              </div>
              <div>
                <h3 className="font-bold text-sm leading-tight flex items-center gap-1.5">
                  Assistente de Suprimentos
                  <span className="text-[10px] font-medium bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-500/30 flex items-center gap-1">
                    <Database size={10} /> RAG Ativo
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">Consulta direta ao Banco de Atas & Reuniões</p>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)} 
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
            {messages.length === 0 && (
              <div className="space-y-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-xs">
                    <Sparkles size={15} className="text-blue-600" />
                    Como posso te ajudar hoje?
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Tenho acesso direto ao <strong>Banco de Atas</strong>, propostas analisadas, divergências e itens acordados. Pergunte sobre qualquer reunião, fornecedor ou solicite auxílio na redação.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-1 flex items-center gap-1">
                    <HelpCircle size={12} /> Sugestões de Consulta
                  </p>
                  <div className="space-y-1.5">
                    {quickPrompts.map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSend(prompt)}
                        className="w-full text-left text-xs font-medium text-slate-700 bg-white hover:bg-blue-50/80 hover:text-blue-700 hover:border-blue-200 border border-slate-200/80 p-2.5 rounded-lg transition-colors shadow-2xs"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-blue-400'}`}>
                  {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                </div>
                <div className={`p-3.5 rounded-xl max-w-[88%] text-xs leading-relaxed ${
                  m.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none shadow-sm whitespace-pre-wrap' 
                    : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm prose-chat'
                }`}>
                  {m.role === 'user' ? (
                    m.text
                  ) : (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => <h1 className="text-sm font-bold text-slate-900 mt-2 mb-1.5 border-b border-slate-100 pb-1">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-xs font-bold text-slate-900 mt-2.5 mb-1">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-xs font-bold text-blue-900 mt-2 mb-1 flex items-center gap-1.5">{children}</h3>,
                        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed text-slate-700">{children}</p>,
                        strong: ({ children }) => <strong className="font-bold text-slate-900">{children}</strong>,
                        ul: ({ children }) => <ul className="space-y-1 my-1.5 pl-4 list-disc marker:text-blue-500">{children}</ul>,
                        ol: ({ children }) => <ol className="space-y-1 my-1.5 pl-4 list-decimal marker:text-slate-500 font-medium">{children}</ol>,
                        li: ({ children }) => <li className="text-slate-700 leading-snug pl-0.5">{children}</li>,
                        blockquote: ({ children }) => <blockquote className="border-l-3 border-blue-500 pl-2.5 my-1.5 text-slate-600 italic bg-blue-50/50 py-1 rounded-r">{children}</blockquote>,
                        code: ({ children }) => <code className="bg-slate-100 text-purple-700 font-mono text-[11px] px-1.5 py-0.5 rounded border border-slate-200">{children}</code>
                      }}
                    >
                      {m.text}
                    </ReactMarkdown>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5 flex-row">
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-slate-900 text-blue-400">
                  <Bot size={14} />
                </div>
                <div className="p-3 rounded-xl bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-blue-600" />
                  <span className="text-xs text-slate-500 font-medium">Consultando banco de atas e formulando resposta...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3.5 bg-white border-t border-slate-200 shrink-0">
            <div className="flex items-center gap-2 bg-slate-100/90 border border-slate-200/80 rounded-xl px-3.5 py-2 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-blue-500 transition-all">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Pergunte sobre atas, obras, acordos ou fornecedores..."
                className="flex-1 bg-transparent border-none focus:outline-none text-xs text-slate-800 placeholder-slate-400"
              />
              <button 
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                className="text-blue-600 hover:text-blue-700 disabled:text-slate-300 p-1 rounded transition-colors"
                title="Enviar mensagem"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

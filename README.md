# Gerador de Atas de Reunião de Suprimentos - Afonso França Engenharia

Aplicação completa para análise, extração de diretrizes contratuais e geração determinística de **Pré-Atas** e **Atas Finais de Negociação** (versão interna e versão limpa para fornecedor), com inteligência artificial multimodal Gemini e governança estrita de qualidade OpenXML (DOCX).

---

## 1. Arquitetura do Sistema

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React SPA + Vite)                    │
│  - Wizard em 5 Etapas (Abertura, Checklist, Complementos, Pré-Ata, Ata) │
│  - Painel Admin (Templates DOCX, Prompts Versionados, Modelos, Logs)   │
│  - Histórico de Atas com busca e download                              │
│  - Assistente RAG de Suprimentos (/api/chat)                           │
│  - Validação prévia de arquivos (15 MB máx, 5 arqs, extensões seguras) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST API (Express)
┌───────────────────────────────────▼────────────────────────────────────┐
│                        BACKEND (Express + TypeScript)                  │
│                                                                        │
│  ┌───────────────────────┐  ┌────────────────────────────────────────┐ │
│  │   Pipeline Gemini     │  │        Motor de Render DOCX             │ │
│  │ - Análise em lotes    │  │ - Substituição escalar docxtemplater   │ │
│  │ - Segmentação Flash   │  │ - Injeção determinística de XML / runs │ │
│  │ - Decisões Pro (V1-V3)│  │ - Reconciliação e destaque vermelho    │ │
│  │ - Prompts Semânticos  │  │ - Versão limpa (/api/...-clean) (V8)   │ │
│  └───────────────────────┘  └────────────────────────────────────────┘ │
│                                    │                                   │
│  ┌─────────────────────────────────▼─────────────────────────────────┐ │
│  │               Validador Bloqueante de Saída (V1..V8)              │ │
│  │ - Checagem estrutural OOXML (<w:tc> com <w:p>, XML parseável)     │ │
│  │ - Detecção de resíduos genéricos ({tag}, XXX, [A INFORMAR])       │ │
│  │ - Amostragem de loops e correspondência no texto gerado           │ │
│  │ - Reprovação com HTTP 422 JSON / Bypass admin com ?force=1        │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                      PERSISTÊNCIA & MEMÓRIA                            │
│  - Firestore: Templates DOCX versionados, Metadados, Prompts e Configs │
│  - Storage/Store: Atas, Estados de Execução e Sessões de Usuário       │
│  - Sistema Central de Logs e Auditoria com exportação para debug/     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Variáveis de Ambiente

As configurações são lidas do ambiente do servidor. Crie ou configure seu `.env`:

| Variável | Obrigatória | Padrão | Descrição |
| :--- | :---: | :---: | :--- |
| `GEMINI_API_KEY` | **Sim** | - | Chave de acesso à API Google Gemini. |
| `MODEL_FLASH` | Não | `gemini-2.5-flash` | Modelo padrão para tarefas rápidas, metadados e segmentação. |
| `MODEL_PRO` | Não | `gemini-2.5-pro` | Modelo avançado para análise de decisões e reconciliação contratual. |
| `MODEL_CHAT` | Não | `gemini-2.5-flash` | Modelo utilizado pelo Assistente RAG de Atas. |
| `PORT` | Não | `3000` | Porta em que o servidor Express escuta. |
| `DEBUG_MD` | Não | `1` | Ativa a gravação automática de relatórios em `debug/runtime/*.md`. |
| `STRICT` | Não | `0` | Modo de asserção estrita para validações em testes de regressão. |

---

## 3. Fluxo de Validação de Documentos (Regras V1 a V8)

O documento DOCX gerado passa por 8 validações rigorosas antes de ser liberado para download:

- **V1 (Âncora Obrigatória)**: Situação `ACORDADO` exige citação de fala da transcrição.
- **V2 (Correspondência Literal)**: A âncora deve existir na transcrição bruta.
- **V3 (Integridade Numérica)**: Valores (R$), datas e prazos devem constar nos documentos-fonte.
- **V4 (Schema Obrigatório)**: Campos de cabeçalho obrigatórios do template devem estar preenchidos.
- **V5 (Integridade OOXML)**: Nenhuma célula `<w:tc>` pode existir sem parágrafo `<w:p>`.
- **V6 (Resíduos Genéricos)**: Bloqueia tags residuais `{tag}`, `[A INFORMAR]`, `\bX{3,}\b`, `[xx]`, `R$ XXX`.
- **V7 (Amostragem de Loops)**: Pelo menos um título de tópico do `AtaState` deve estar presente no texto.
- **V8 (Higienização do Fornecedor)**: A versão limpa não pode conter pendências nem nenhum run de cor vermelha (`C00000`).

---

## 4. Fluxo de Depuração e Arquivos de Debug

Quando `DEBUG_MD=1` estiver ativo, o backend registra evidências detalhadas de execução:

1. **`debug/runtime/verificacoes.md`**:
   Registra todos os relatórios `VerificationReport` de aprovação ou reprovação de DOCX com tamanho, campos encontrados, placeholders não resolvidos e erros estruturais.
2. **`debug/runtime/ia_fallback.md`**:
   Registra qualquer payload de IA que necessitou de sanitização de sintaxe JSON ou acionamento de fallback.
3. **`debug/runtime/docx_runs.md`**:
   Rastreamento de mutações de runs e estilos XML em parágrafos durante reconciliação.
4. **Painel Admin -> Aba Logs**:
   Interface em tempo real com filtros por categoria (`SYSTEM`, `AUTH`, `DOCX`, `AI`, `VALIDATOR`) e severidade (`INFO`, `WARN`, `ERROR`, `DEBUG`).

---

## 5. Scripts Disponíveis

```bash
# Iniciar ambiente de desenvolvimento (Backend + Frontend)
npm run dev

# Executar testes unitários e de regressão completos com STRICT=1
STRICT=1 npm test

# Validação estática de tipos TypeScript
npm run lint

# Build de produção (Vite client + bundle Node.js)
npm run build

# Executar servidor de produção
npm start
```

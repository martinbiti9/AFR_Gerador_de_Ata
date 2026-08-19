# Mapeamento de Prompts Gemini por Etapa (Anexo A Implantado) - Prompt 07

**Data:** 2026-08-19  
**Módulo:** Injeção e Orquestração de Prompts com Versionamento Semântico e Lotes de Análise

---

## 1. Tabela de Etapas, Modelos, Versões e Schemas

| Etapa | Função / Módulo | Modelo Padrão / Variável de Ambiente | Versão Semântica | Temperatura | Schema de Resposta (Structured Output) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Check List (Lotes)** | `analyzeChecklist` | `gemini-2.5-pro` (`AI_CHECKLIST_MODEL`) | `checklist@2.0.0` | `0.2` | `checklistBatchResponseSchema` (`tipoFornecimento`, `topics: [{ id, title, regraObra, excecaoAdmitida, pontoAtencao, perguntaFornecedor, source }]`) |
| **2. Proposta Comercial** | `analyzeProposal` | `gemini-2.5-pro` (`AI_PROPOSAL_MODEL`) | `proposal@2.0.0` | `0.2` | `proposalResponseSchema` (`divergences: [{ description, severity, source }]`) |
| **3. Transcrição: Segmentação** | `segmentarTranscricao` | `gemini-2.5-flash` (`AI_SEGMENTATION_MODEL` / `AI_FLASH_MODEL`) | `segmentation@2.0.0` | `0.2` | `segmentationResponseSchema` (`segmentos: [{ topicoId, titulo, tipo: 'DELIBERACAO'\|'RUIDO', trecho }]`) |
| **4. Transcrição: Decisões** | `generateFinalAta` | `gemini-2.5-pro` (`AI_FINAL_ATA_MODEL` / `AI_PRO_MODEL`) | `decisions@2.0.0` | `0.2` | `finalAtaResponseSchema` (`topicos: TopicoEstado[]`, `participantes`, `resumo`, `itensDeAcao`) |
| **5. Metadados Cadastrais** | `extractDocumentMetadata` | `gemini-2.5-flash` (`AI_FLASH_MODEL`) | `metadata@2.0.0` | `0.2` | `metadataResponseSchema` (`metadata: { obraCodigo, obraNome, fornecedor, assunto, servico, ... }`) |

---

## 2. Exemplos de Request / Response Resumidos por Etapa

### Etapa 1: Análise de Check List em Lotes (`checklist@2.0.0`)
**Request (Lote 1 de 2 - 7 tópicos):**
```json
{
  "systemInstruction": "Você é um Engenheiro de Suprimentos Sênior... LOTE 1 de 2: 1. Escopo e Objeto; 2. Critério de Medição...",
  "contents": [
    { "inlineData": { "mimeType": "application/pdf", "data": "..." } },
    { "text": "Analise os documentos de Check List da Obra anexados e extraia as premissas para os tópicos do Lote 1..." }
  ]
}
```
**Response Resumido:**
```json
{
  "tipoFornecimento": "Subempreitada Global com Fornecimento de Materiais",
  "topics": [
    {
      "id": "topic-1",
      "title": "Critério de Medição e Fechamento",
      "regraObra": "Medições mensais acumuladas até o dia 25 de cada mês com conferência in loco pela fiscalização.",
      "excecaoAdmitida": "N/A",
      "pontoAtencao": "Notas fiscais emitidas após o dia 28 serão postergadas para o ciclo seguinte.",
      "perguntaFornecedor": "O fornecedor concorda com o corte de medição no dia 25 e faturamento direto?",
      "source": "Check List Técnico - Item 4.2"
    }
  ]
}
```

---

### Etapa 2: Análise de Proposta Comercial (`proposal@2.0.0`)
**Request:**
```json
{
  "systemInstruction": "Você é um Engenheiro Especialista em Análise de Propostas...",
  "contents": [
    { "inlineData": { "mimeType": "application/pdf", "data": "..." } },
    { "text": "Confronte as propostas comerciais anexadas com as regras do Check List..." }
  ]
}
```
**Response Resumido:**
```json
{
  "divergences": [
    {
      "description": "Proposta prevê medição quinzenal com pagamento em 14 dias, divergindo da regra de corte mensal no dia 25 e pagamento em 30 dias.",
      "severity": "ALTA",
      "source": "Proposta Comercial Alpha - Cláusula 6.1"
    }
  ]
}
```

---

### Etapa 3: Segmentação de Transcrição e Filtragem de Ruído (`segmentation@2.0.0` - Flash)
**Request:**
```json
{
  "systemInstruction": "Você é um Analista Técnico de Transcrições... rotule como DELIBERACAO ou RUIDO...",
  "contents": [
    { "text": "Transcreve e rotula os trechos da seguinte reunião em segmentos estruturados..." }
  ]
}
```
**Response Resumido:**
```json
{
  "segmentos": [
    {
      "tipo": "RUIDO",
      "trecho": "Bom dia a todos, estão me ouvindo bem? Vamos começar a gravação."
    },
    {
      "topicoId": "topic-1",
      "titulo": "Critério de Medição e Fechamento",
      "tipo": "DELIBERACAO",
      "trecho": "Quanto ao corte de medição, o fornecedor confirmou que aceita fazer a medição no dia 25 e emitir a NF até dia 28 sem ressalvas."
    }
  ]
}
```

---

### Etapa 4: Extração de Decisões e Consolidação do AtaState (`decisions@2.0.0` - Pro)
**Request:**
```json
{
  "systemInstruction": "Você é o Redator Técnico Oficial de Atas... Para qualquer item com situação 'ACORDADO', é OBRIGATÓRIO fornecer 'ancoraTranscricao'...",
  "contents": [
    { "text": "Consolide a Ata Final oficial da reunião..." }
  ]
}
```
**Response Resumido:**
```json
{
  "resumo": "Reunião de alinhamento técnico e comercial para contratação do pacote de estruturas metálicas.",
  "participantes": [
    { "nome": "Eng. Carlos Eduardo", "empresa": "Afonso França", "cargoDepto": "Suprimentos" },
    { "nome": "Marcos Oliveira", "empresa": "Fornecedor Alpha", "cargoDepto": "Comercial" }
  ],
  "topicos": [
    {
      "topicoId": "topic-1",
      "titulo": "Critério de Medição e Fechamento",
      "situacao": "ACORDADO",
      "textoAta": "Medição mensal com corte no dia 25 de cada mês e emissão da Nota Fiscal até o dia 28.",
      "camposADefinir": [],
      "ancoraTranscricao": "o fornecedor confirmou que aceita fazer a medição no dia 25 e emitir a NF até dia 28 sem ressalvas",
      "responsavel": "Fornecedor Alpha",
      "prazo": "25 de cada mês"
    }
  ],
  "itensDeAcao": [
    {
      "num": "01",
      "descricao": "Enviar ART de execução antes do início das obras.",
      "responsavel": "Fornecedor Alpha",
      "prazo": "5 dias úteis"
    }
  ]
}
```

---

## 3. Rastreamento e Polling de Progresso Incremental

Endpoint de Polling: `GET /api/meetings/:id/analysis-status`  
Resposta em tempo real:
```json
{
  "meetingId": "meet-2026-08-19",
  "stage": "CHECKLIST_BATCH",
  "totalBatches": 2,
  "currentBatch": 1,
  "progressPercent": 50,
  "message": "Processando lote 1 de 2 do Check List (7 tópicos)...",
  "updatedAt": "2026-08-19T03:13:00.000Z"
}
```

---

## 4. Proveniência Gravada no `AtaState`

```json
{
  "proveniencia": {
    "promptVersion": {
      "checklist": "checklist@2.0.0",
      "proposal": "proposal@2.0.0",
      "segmentation": "segmentation@2.0.0",
      "decisions": "decisions@2.0.0",
      "metadata": "metadata@2.0.0"
    },
    "modelo": "gemini-2.5-pro",
    "templateId": "template-afonso-franca-v1",
    "templateVersion": 1,
    "hashesFontes": []
  }
}
```

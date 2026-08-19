# Matriz de Validação e Qualidade do Documento (V1..V8) - Prompt 09

**Data:** 2026-08-19  
**Módulos Centrais:** `server/validators/ataValidators.ts`, `server/render/verify.ts`, `server/render/cleanVersion.ts`, `server/render/renderAta.ts`, `server/index.ts`

---

## 1. Matriz Regra -> Ação -> Localização no Código

| Código | Nome da Regra | Descrição da Regra | Ação em Caso de Violação | Onde Está Implementado |
| :--- | :--- | :--- | :--- | :--- |
| **V1** | **Âncora Obrigatória para ACORDADO** | Todo tópico com situação `ACORDADO` deve conter `ancoraTranscricao` não vazia extraída da fala da reunião. | Tópico é rebaixado automaticamente para `PENDENTE`, log registrado no `logger` e proveniência anotada. | `server/validators/ataValidators.ts` (`validarV1AncoraObrigatoria`)<br>`server/gemini.ts` (`generateFinalAta`) |
| **V2** | **Correspondência Literal da Âncora** | A `ancoraTranscricao` do tópico deve existir literalmente na transcrição bruta normalizada (tolerância de espaçamento/caixa). | Se a citação não constar na transcrição, o tópico é rebaixado para `PENDENTE`. | `server/validators/ataValidators.ts` (`validarV2AncoraNaTranscricao`)<br>`server/gemini.ts` (`generateFinalAta`) |
| **V3** | **Integridade de Valores e Datas** | Valores monetários (R$), prazos e datas numéricas citados no `textoAta` devem estar presentes nas fontes (Checklist, Proposta, Transcrição). | Identifica divergência numérica, emite warning detalhado e anota proveniência para auditoria. | `server/validators/ataValidators.ts` (`validarV3IntegridadeNumerica`)<br>`server/gemini.ts` (`generateFinalAta`) |
| **V4** | **Schema e Metadados Obrigatórios** | Campos de cabeçalho obrigatórios definidos no template (ex: `obraCodigo`, `fornecedor`) devem estar preenchidos. | Dispara `RenderValidationError` (HTTP 422) antes de processar o render do DOCX. | `server/render/renderAta.ts`<br>`server/types/template.ts` |
| **V5** | **Integridade Estrutural OOXML** | Toda célula `<w:tc>` de tabela deve conter ao menos um parágrafo `<w:p>`. Todos os arquivos XML de `word/` devem ser parseáveis e balanceados. | Registra erro em `structuralErrors`, reprova o documento (`isVerified: false`) e bloqueia o download com HTTP 422 (JSON). | `server/render/verify.ts` (`verificarEstruturaDocx`)<br>`server/index.ts` (rotas de render) |
| **V6** | **Eliminação de Resíduos Genéricos** | Detecção ampliada de tags residuais: `/\{[#\/^@]?[\w.\-]+\}/` (docxtemplater), `/\[A INFORMAR\]/`, `/\bX{3,}\b/`, `/\[x{2,}\]/`, `/R\$\s*X+/` e `[A DEFINIR NA REUNIÃO]` em atas sem tópicos pendentes. | Registra em `unresolvedPlaceholders`, reprova o documento (`isVerified: false`) e bloqueia a entrega do binário. | `server/render/verify.ts` (`verifyGeneratedDocx`)<br>`server/index.ts` (rotas de render) |
| **V7** | **Amostragem de Loops e Tópicos** | Pelo menos um título de tópico constante no `AtaState` deve ser encontrado no corpo textual do DOCX gerado. | Se nenhum for encontrado, marca `loopVerification.verified = false`, reprova o documento (`isVerified: false`). | `server/render/verify.ts` (`verifyGeneratedDocx`)<br>`server/index.ts` (rotas de render) |
| **V8** | **Higienização da Versão Limpa do Fornecedor** | A versão limpa para o fornecedor não pode conter nenhum resíduo de cor vermelha (`C00000`/`ff0000`) nem pendências em aberto. | Bloqueia exportação limpa se houver itens `PENDENTE`; elimina runs vermelhos e falha se qualquer resíduo `C00000` persistir. | `server/render/cleanVersion.ts` (`gerarVersaoLimpaDocx`, `validarAtaParaExportacaoLimpa`)<br>`server/index.ts` (`/api/generate-final-ata-clean`) |

---

## 2. Fluxo do Validador Bloqueante nas Rotas da API

### A) Resposta Padrão em Caso de Reprovação de Qualidade (HTTP 422)
Quando `report.isVerified === false`, o backend **não envia o binário**, retornando o relatório estruturado em formato JSON:
```json
{
  "error": "Documento reprovado no relatório de verificação de qualidade (V1-V8).",
  "code": "DOCUMENT_VERIFICATION_FAILED",
  "report": {
    "isVerified": false,
    "fileSizeBytes": 28360,
    "foundFields": ["obraCodigo"],
    "missingFields": ["fornecedor"],
    "unresolvedPlaceholders": [
      "{tagNaoResolvida}",
      "[A DEFINIR NA REUNIÃO] (presente em ata sem tópicos pendentes)"
    ],
    "structuralErrors": [],
    "loopVerification": {
      "expectedRows": 2,
      "foundRows": 0,
      "verified": false
    }
  }
}
```

### B) Parâmetro de Depuração Administrativa (`?force=1`)
Restrito exclusivamente a usuários com perfil de Administrador (`req.user?.role === 'admin'`):
- Permite que o administrador baixe o arquivo para inspeção forense mesmo se reprovado na validação.
- O arquivo é enviado com os headers:
  - `X-Document-Verified: false`
  - `X-Document-Force-Generated: true`
- Usuários não-administradores que tentarem usar `?force=1` continuarão recebendo o bloqueio HTTP 422.

---

## 3. Registro e Auditoria Contínua

- Todo relatório `VerificationReport` é registrado centralmente via `addLog('VALIDATOR', ...)`.
- Quando `process.env.DEBUG_MD === '1'`, o relatório completo com carimbo de data/hora é automaticamente anexado ao arquivo `debug/runtime/verificacoes.md`.

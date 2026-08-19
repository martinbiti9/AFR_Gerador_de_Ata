# Auditoria e Integridade do Motor AtaState (Prompt 06)

**Data de Validação:** 2026-08-19  
**Módulo:** Motor de Integridade `AtaState`, Remoção de Defaults e Validações V1..V3

---

## 1. Defaults Fabricados Removidos e Novo Comportamento

| Campo Anterior | Valor Fabricado Antigo | Novo Comportamento Estrito | Status |
| :--- | :--- | :--- | :--- |
| **`valorTotal`** | `R$ 2.782.400,00` | Retorna `null`; se ausente, assume marcador `[A DEFINIR NA REUNIÃO]` e integra `camposADefinir` | **Removido** |
| **`dataReuniao`** | `09/01/2025` | Retorna `null`; se ausente na abertura, `nullGetter` insere `[A DEFINIR NA REUNIÃO]` | **Removido** |
| **`horaReuniao` / `horario`** | `10:30h` | Retorna `null`; se ausente, insere `[A DEFINIR NA REUNIÃO]` | **Removido** |
| **`localReuniao`** | `Online - Teams` | Retorna `null`; se ausente, insere `[A DEFINIR NA REUNIÃO]` | **Removido** |
| **`condicaoPagamento`** | Textos plausíveis fixos | Retorna `null`; inserido marcador `[A DEFINIR NA REUNIÃO]` | **Removido** |
| **`retencaoGarantia`** | Textos plausíveis fixos | Retorna `null`; inserido marcador `[A DEFINIR NA REUNIÃO]` | **Removido** |
| **`riscoSacado`** | Textos plausíveis fixos | Retorna `null`; inserido marcador `[A DEFINIR NA REUNIÃO]` | **Removido** |
| **`reajuste`** | Textos plausíveis fixos | Retorna `null`; inserido marcador `[A DEFINIR NA REUNIÃO]` | **Removido** |
| **`responsavel` de tópicos** | `Fornecedor / Engenharia` | Retorna `null`; no render OOXML exibe `[A DEFINIR]` estilizado em alerta | **Removido** |
| **`prazo` de tópicos** | `Conforme cronograma` / `Em até 48 horas` | Retorna `null`; no render OOXML exibe `[A DEFINIR]` estilizado em alerta | **Removido** |
| **`obraNome` fallback** | `Hospital Sabará` | `obraNome || ''`; sem entidade hardcoded | **Removido** |
| **Transcript default** | `Reunião de alinhamento...` | Rota `/api/generate-final-ata` rejeita com código 422 caso a transcrição esteja ausente | **Removido** |
| **Sintetizador de contingência** | Blocos fabricando agreed/pending items | Removido integralmente; falha de LLM responde 502 com código `LLM_GATEWAY_ERROR` | **Removido** |

---

## 2. Validações Algorítmicas V1, V2 e V3

As validações de integridade foram implementadas em código (`server/validators/ataValidators.ts`):

### Validação V1 (Âncora Presente)
- **Regra:** Tópico marcado como `ACORDADO` sem `ancoraTranscricao` é imediatamente rebaixado para `PENDENTE`.
- **Log:** Alerta WARN com ID e título do tópico.

### Validação V2 (Âncora Comprovada na Transcrição)
- **Regra:** A citação em `ancoraTranscricao` é normalizada (espaços colapsados, minúsculas) e deve existir textualmente na transcrição fornecida. Caso não encontrada, é rebaixada para `PENDENTE`.
- **Log:** Alerta WARN com detalhes da âncora não encontrada.

### Validação V3 (Consistência Numérica e Financeira nas Fontes)
- **Regra:** Todo número, percentual, valor monetário (`R$`) e data presente em `textoAta` deve ter correspondência em ao menos um documento fonte (Checklist, Propostas, Transcrição ou Template).
- **Log:** Emite aviso de inconsistência caso valores não identificados sejam detectados.

### Tópicos Ausentes
- **Regra:** Itens do Checklist aplicáveis não retornados na resposta do LLM são convertidos em `MANTIDO_PADRAO`, utilizando a descrição padrão do template oficial extraída por `extrairTextosPadraoDoTemplate`.

---

## 3. Resultados dos Testes Sintéticos (`tests/validadores.test.ts`)

Execução dos testes com `node:test` e `tsx`:

```
TAP version 13
# Subtest: Validações V1, V2 e V3 do Motor AtaState
    # Subtest: V1: ACORDADO sem âncora deve ser rebaixado para PENDENTE
    ok 1 - V1: ACORDADO sem âncora deve ser rebaixado para PENDENTE
    # Subtest: V1: ACORDADO com âncora deve permanecer ACORDADO
    ok 2 - V1: ACORDADO com âncora deve permanecer ACORDADO
    # Subtest: V2: Âncora não encontrada literalmente na transcrição normalizada rebaixa para PENDENTE
    ok 3 - V2: Âncora não encontrada literalmente na transcrição normalizada rebaixa para PENDENTE
    # Subtest: V2: Âncora encontrada com variação de espaços e caixa mantém ACORDADO
    ok 4 - V2: Âncora encontrada com variação de espaços e caixa mantém ACORDADO
    # Subtest: V3: Detecta números/valores monetários/datas no textoAta ausentes nas fontes
    ok 5 - V3: Detecta números/valores monetários/datas no textoAta ausentes nas fontes
    # Subtest: V3: Aprova quando todos os valores constam nas fontes documentais
    ok 6 - V3: Aprova quando todos os valores constam nas fontes documentais
    # Subtest: Pipeline consolidado validarTopicosAtaState
    ok 7 - Pipeline consolidado validarTopicosAtaState
```

---

## 4. Persistência de `AtaState`

- O documento `AtaState` é gravado em `meetings/{id}/ataState` antes do pipeline de renderização DOCX.
- O renderizador (`renderAtaDocument`) consome o `AtaState` estruturado, garantindo desacoplamento e integridade auditável.

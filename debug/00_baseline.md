# Retrato de Defeitos Baseline - Pipeline de Renderização DOCX

Data de geração: 2026-08-18 (Ambiente de Testes Automatizados)
Execução: `npm test` (`tsx --test tests/render.regression.test.ts`)

---

## 1. Resumo da Execução

- **Status Geral**: Baseline capturado com sucesso. O test runner nativo do Node.js executou todas as suites.
- **Modo Padrão (`STRICT=0`)**: Asserções de defeitos conhecidos registradas e capturadas sem interrupção para orientar as etapas 03 a 05 da refatoração.
- **Modo Estrito (`STRICT=1`)**: Falha nas asserções não atendidas.

---

## 2. Inspeção do Template Oficial (`fixtures/ATA_MODELO.docx`)

| Validação | Resultado | Detalhes |
|---|---|---|
| Contagem de tabelas | **PASSOU** | 5 tabelas identificadas (`w:tbl`) |
| Tabela de corpo principal | **PASSOU** | 4 colunas, cabeçalho iniciando com "Item" e "Descrição / Deliberação" |
| Detecção de placeholders obrigatórios | **PASSOU** | `CÓDIGO DA OBRA`, `NOME DA OBRA`, `ASSUNTO`, `SERVIÇO`, `FORNECEDOR`, `EXTRAIR DO FIRE FLIES` identificados |

---

## 3. Retrato de Defeitos Atuais no DOCX Gerado (Alvo dos Prompts 03 a 05)

### Defeito A: Itens da Tabela Principal não renderizados no documento final
- **Asserção**: `DOCX contém título do primeiro item do payload`
- **Diagnóstico**: O mecanismo atual de injeção de loops OOXML (`injectLoop.ts`) e o mapeamento de tags no `reconcilePayload` não renderizam o título e a descrição dos itens (`agreedItems` / `topics`) na tabela de 4 colunas do template oficial.
- **Impacto**: O documento gerado mantém apenas a linha protótipo original ou linhas sem preenchimento correto dos dados da negociação.
- **Plano de correção**: Refatoração do `injectLoop.ts` e normalização OOXML nos Prompts 03 e 04.

### Defeito B: Permanência de marcadores de template genéricos (`XXX`, `[xx]`, `R$ XXXX`)
- **Asserção**: `DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX`
- **Diagnóstico**: O template oficial possui valores de exemplo como `R$ XXXX`, `[xx]` e `XXX` na seção de condições comerciais. O pipeline atual não limpa nem substitui integralmente esses termos quando não fornecidos explicitamente.
- **Impacto**: Viola a Regra Fixa #2 (Proibição de defaults plausíveis ou placeholders residuais).
- **Plano de correção**: Implementação de sanitização e placeholderMap estrito no Prompt 04.

---

## 4. Log Bruto das Falhas Capturadas

```text
[BASELINE DEFECT CAPTURED] DOCX contém título do primeiro item do payload: DOCX de saída deve conter o título do primeiro item do payload
[BASELINE DEFECT CAPTURED] DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
```

### [2026-08-19T02:08:51.490Z] Defeito: DOCX contém título do primeiro item do payload
- **Erro**: DOCX de saída deve conter o título do primeiro item do payload
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:08:51.492Z] Defeito: DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX
- **Erro**: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:09:56.630Z] Defeito: DOCX contém título do primeiro item do payload
- **Erro**: DOCX de saída deve conter o título do primeiro item do payload
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:09:56.631Z] Defeito: DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX
- **Erro**: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:12:08.791Z] Defeito: DOCX contém título do primeiro item do payload
- **Erro**: DOCX de saída deve conter o título do primeiro item do payload
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:12:08.792Z] Defeito: DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX
- **Erro**: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:20:56.274Z] Defeito: DOCX contém título do primeiro item do payload
- **Erro**: DOCX de saída deve conter o título do primeiro item do payload
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:20:56.274Z] Defeito: DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX
- **Erro**: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:22:11.646Z] Defeito: DOCX contém título do primeiro item do payload
- **Erro**: DOCX de saída deve conter o título do primeiro item do payload
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:22:11.647Z] Defeito: DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX
- **Erro**: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:25:32.024Z] Defeito: DOCX contém título do primeiro item do payload
- **Erro**: DOCX de saída deve conter o título do primeiro item do payload
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:25:32.025Z] Defeito: DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX
- **Erro**: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:27:07.777Z] Defeito: DOCX contém título do primeiro item do payload
- **Erro**: DOCX de saída deve conter o título do primeiro item do payload
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:27:07.779Z] Defeito: DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX
- **Erro**: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:29:02.798Z] Defeito: DOCX contém título do primeiro item do payload
- **Erro**: DOCX de saída deve conter o título do primeiro item do payload
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:29:02.800Z] Defeito: DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX
- **Erro**: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:44:01.603Z] Defeito: DOCX contém título do primeiro item do payload
- **Erro**: DOCX de saída deve conter o título do primeiro item do payload
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:44:01.604Z] Defeito: DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX
- **Erro**: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:45:14.788Z] Defeito: DOCX contém título do primeiro item do payload
- **Erro**: DOCX de saída deve conter o título do primeiro item do payload
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:45:14.789Z] Defeito: DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX
- **Erro**: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:51:17.647Z] Defeito: DOCX contém título do primeiro item do payload
- **Erro**: DOCX de saída deve conter o título do primeiro item do payload
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:51:17.647Z] Defeito: DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX
- **Erro**: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:51:39.913Z] Defeito: DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX
- **Erro**: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:52:14.815Z] Defeito: DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX
- **Erro**: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:52:14.816Z] Defeito: Tabela de cabeçalho intacta com suas linhas preservadas
- **Erro**: findBlocks is not defined
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:52:31.858Z] Defeito: DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX
- **Erro**: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:52:46.262Z] Defeito: DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX
- **Erro**: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:53:06.308Z] Defeito: DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX
- **Erro**: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:53:19.575Z] Defeito: DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX
- **Erro**: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-19T02:54:36.955Z] Defeito: DOCX NÃO contém marcadores XXX / [xx] / R$ XXXX
- **Erro**: DOCX de saída não deve conter marcadores não substituídos: XXX (true), [xx] (true), R$ XXXX (true)
- **Modo**: BASELINE (Capturado para refatoração nos prompts 03-05)


### [2026-08-20T02:37:23.133Z] Defeito: Participantes reais renderizados
- **Erro**: Participante informado no payload deve estar presente
- **Modo**: STRICT (Falha Real)


### [2026-08-20T02:37:37.839Z] Defeito: Participantes reais renderizados
- **Erro**: Participante informado no payload deve estar presente
- **Modo**: STRICT (Falha Real)


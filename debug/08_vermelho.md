# Auditoria de Render em Vermelho e Versão Limpa do Fornecedor - Prompt 08

**Data:** 2026-08-19  
**Módulo:** `server/render/richText.ts` + `server/render/reconcile.ts` + `server/render/cleanVersion.ts`

---

## 1. Regras Visuais de Criticidade Implementadas

1. **Tópicos com Situação `PENDENTE`**:
   - Todos os runs do bloco recebem o estilo `'alerta'` (`<w:color w:val="C00000"/>` e `<w:b/>`).
   - O primeiro run é prefixado obrigatoriamente com `'PENDENTE: '`.
2. **Marcadores `[A DEFINIR NA REUNIÃO]` e `[A DEFINIR]`**:
   - Sempre formatados no estilo `'alerta'` (`C00000`), mesmo quando inseridos em tópicos regulares em preto.
3. **Tópicos com Situação `MANTIDO_PADRAO`**:
   - Recebem o run final `'(condição padrão do modelo mantida)'` formatado no estilo `'nota'` (`<w:i/><w:color w:val="808080"/>`).
4. **Higienização da Versão Limpa do Fornecedor (`removerRunsVermelhos`)**:
   - Varre `word/document.xml`, cabeçalhos (`header*.xml`), rodapés (`footer*.xml`) e notas.
   - Elimina qualquer elemento `<w:r>` contendo `<w:color w:val="C00000"/>`.
   - Normaliza parágrafos esvaziados para `<w:p/>`.
5. **Validação V8 (Garantia de Não Contaminação)**:
   - Bloqueia a exportação com erro 422 caso o `AtaState` contenha itens `PENDENTE` ou marcadores `[A DEFINIR]`.
   - Inspeciona o DOCX binário final para atestar ausência total da cor `C00000`.

---

## 2. Comparativo Textual Extraído via Mammoth

### Caso de Teste: Tópico 03 - Retenção Contratual e Garantias

#### A) Versão Interna da Ata Final (`/api/generate-final-ata` - com Alerta em Vermelho)
```text
OBRA: 590 - HOSPITAL SABARA
FORNECEDOR: Alpha Estruturas Metálicas Ltda
DATA: 19/08/2026

--------------------------------------------------------------------------------
ITEM | DESCRIÇÃO DOS SERVIÇOS E DELIBERAÇÕES
--------------------------------------------------------------------------------
01   | Escopo e Objeto
     | Fornecimento e montagem de estrutura metálica da cobertura do bloco B.
     | Responsável: Alpha Estruturas | Prazo: 30 dias

02   | Segurança do Trabalho e NRs
     | Cumprimento integral das NRs 06, 18 e 35 e uso obrigatório de EPIs.
     | (condição padrão do modelo mantida)
     | Responsável: Alpha Estruturas | Prazo: Imediato e contínuo

03   | PENDENTE: Retenção Contratual de Garantia
     | PENDENTE: Fornecedor solicitou redução da retenção técnica de 10% para 5%. Obra aguarda parecer da Diretoria Financeira.
     | Responsável: [A DEFINIR NA REUNIÃO] | Prazo: [A DEFINIR NA REUNIÃO]
--------------------------------------------------------------------------------
```
*Destaque XML da Versão Interna:*
```xml
<w:p>
  <w:r><w:rPr><w:b/><w:color w:val="C00000"/></w:rPr><w:t>PENDENTE: Retenção Contratual de Garantia</w:t></w:r>
</w:p>
<w:p>
  <w:r><w:rPr><w:b/><w:color w:val="C00000"/></w:rPr><w:t>PENDENTE: Fornecedor solicitou redução da retenção técnica de 10% para 5%. Obra aguarda parecer da Diretoria Financeira.</w:t></w:r>
</w:p>
```

---

#### B) Versão Limpa do Fornecedor (`/api/generate-final-ata-clean` - Higienizada após Deliberação)
*Após a diretoria aprovar a retenção e o usuário resolver a pendência na lista de verificação (situação alterada para `ACORDADO`), o documento limpo é gerado:*
```text
OBRA: 590 - HOSPITAL SABARA
FORNECEDOR: Alpha Estruturas Metálicas Ltda
DATA: 19/08/2026

--------------------------------------------------------------------------------
ITEM | DESCRIÇÃO DOS SERVIÇOS E DELIBERAÇÕES
--------------------------------------------------------------------------------
01   | Escopo e Objeto
     | Fornecimento e montagem de estrutura metálica da cobertura do bloco B.
     | Responsável: Alpha Estruturas | Prazo: 30 dias

02   | Segurança do Trabalho e NRs
     | Cumprimento integral das NRs 06, 18 e 35 e uso obrigatório de EPIs.
     | (condição padrão do modelo mantida)
     | Responsável: Alpha Estruturas | Prazo: Imediato e contínuo

03   | Retenção Contratual de Garantia
     | Acordada retenção técnica de 5% sobre cada medição quinzenal liberada.
     | Responsável: Engenharia Afonso França | Prazo: Contratual
--------------------------------------------------------------------------------
```
*Destaque XML da Versão Limpa:*
```xml
<w:p>
  <w:r><w:rPr><w:b/></w:rPr><w:t>Retenção Contratual de Garantia</w:t></w:r>
</w:p>
<w:p>
  <w:r><w:t>Acordada retenção técnica de 5% sobre cada medição quinzenal liberada.</w:t></w:r>
</w:p>
```

---

## 3. Comportamento do Bloqueio de Exportação Limpa (422)

Quando uma tentativa de gerar a versão limpa é disparada com pendências residuais:
- **HTTP Status**: `422 Unprocessable Entity`
- **Response Body**:
```json
{
  "error": "A exportação limpa para o fornecedor está bloqueada porque existem pendências não resolvidas ou marcadores [A DEFINIR] no documento.",
  "code": "PENDENCIES_BLOCKING_CLEAN_EXPORT",
  "topicosPendentes": [
    {
      "topicoId": "t3",
      "titulo": "Retenção Contratual de Garantia"
    }
  ],
  "camposADefinir": []
}
```

---

## 4. Auditoria de Validação V8

- **Varredura de Cor Vermelha no Pacote Final**: `0` ocorrências de `C00000` ou `ff0000`.
- **Integridade OOXML**: Parágrafos esvaziados convertidos para `<w:p/>`, preservando a estrutura de tabelas e células do Word sem corrupção.

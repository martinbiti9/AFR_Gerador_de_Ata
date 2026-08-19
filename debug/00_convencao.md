# Convenção de Relatórios de Refatoração

Este documento estabelece o padrão obrigatório para todos os registros de execução de prompts (`debug/NN_nome.md`) gerados durante o processo de refatoração do sistema **AFR Gerador de Ata**.

---

## Estrutura Obrigatória de Cada Relatório

Cada arquivo gerado em `debug/NN_nome.md` deve conter obrigatoriamente as 5 seções estruturadas abaixo:

### ## Objetivo
Descrição clara e concisa do que foi solicitado no prompt, objetivos técnicos e metas de negócio da etapa.

### ## Arquivos alterados
Lista completa de todos os arquivos criados, alterados ou removidos durante a execução do prompt, com uma breve descrição do papel de cada um.

### ## Decisões
Detalhamento de decisões de arquitetura, escolhas de bibliotecas, estratégias de compatibilidade, tratamento de exceções e preservação de funcionalidades existentes.

### ## Testes executados e saída
Comandos de teste executados (ex.: `npm test`, `npx tsc --noEmit`, `compile_applet`), incluindo a saída resumida ou integral relevante, cobrindo testes de regressão e validações estáticas.

### ## Pendências e riscos
Identificação de itens pendentes para prompts seguintes, limitações conhecidas, riscos identificados e mitigações aplicadas.

---

## Regras Adicionais
1. **Numeração Sequencial**: Os arquivos devem seguir o padrão `NN_nome.md` (ex.: `00_fundacao_testes.md`, `01_...`).
2. **Sem Travessão**: Textos em português gerados devem utilizar vírgula, ponto ou dois-pontos, nunca travessões (`—` ou `--`).
3. **Registro Fiel**: Erros e asserções que falharem durante fases intermediárias devem ser registrados no relatório baseline e tratados nos prompts correspondentes.

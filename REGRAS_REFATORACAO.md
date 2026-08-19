# REGRAS FIXAS DESTA REFATORAÇÃO

Este documento contém as diretrizes mandatórias e fixas para todo o ciclo de refatoração do projeto. Deve ser consultado e seguido rigorosamente em todos os prompts.

---

### 1. Preservação Total de Funcionalidades
Nenhuma funcionalidade existente pode ser removida sem substituto equivalente:
- **Autenticação e Sessão**: Login (Google e senha com fluxo de `mustChangePassword`).
- **Fluxo do Wizard**: Wizard completo de 5 etapas (1. Abertura, 2. Checklist, 3. Complementos, 4. Pré-Ata, 5. Ata Final).
- **Painel Administrativo**: Gestão de Templates, Modelos, Prompts e Logs.
- **Histórico e Reuniões**: Histórico de reuniões, recuperação e gerenciamento de estados.
- **Geração e Documentos**: Geração de Pré-Ata e Ata Final, download em formato DOCX.

---

### 2. Tratamento Estrito de Valores Ausentes / Defaults
- **Proibido** inserir qualquer valor default plausível (dinheiro, data, percentual, nome, prazo fictício ou estimado).
- Todo campo sem origem/dado explícito deve receber `null` ou o marcador exato: `[A DEFINIR NA REUNIÃO]`.

---

### 3. Registro Obrigatório de Debug por Prompt
Todo prompt deve terminar gerando um arquivo de relatório dentro do diretório `debug/` nomeado sequencialmente no formato `debug/NN_nome.md` (ex.: `debug/01_inicializacao_regras.md`), contendo:
- **Objetivo**: Descrição do que foi solicitado e meta do prompt.
- **Arquivos alterados**: Lista detalhada dos arquivos criados ou modificados.
- **Decisões tomadas**: Justificativas técnicas e de arquitetura.
- **Comandos de teste executados e resultado**: Registro da verificação de tipos e compilação.
- **Pendências**: Itens em aberto ou próximos passos previstos.

---

### 4. Gestão de Modelos Gemini
- Nomes de modelo Gemini devem ser configurados e acessados **apenas via variável de ambiente** (ex.: `process.env.GEMINI_MODEL`, `import.meta.env.VITE_GEMINI_MODEL`), nunca hardcoded no código de produção.

---

### 5. Padrão de Pontuação em Textos PT-BR Gerados
- **Não usar travessão** (`—` ou `--`) em textos gerados em português brasileiro (PT-BR).
- Utilizar vírgula (`,`), ponto final (`.`) ou dois-pontos (`:`) para separação e pausas contextuais.

---

### 6. Verificação Estrita de Tipagem TypeScript
- Executar obrigatoriamente a validação de tipos (`npx tsc --noEmit` / compilação) ao final de cada prompt.
- Qualquer erro de tipagem bloqueia a entrega e deve ser corrigido imediatamente antes de concluir o prompt.

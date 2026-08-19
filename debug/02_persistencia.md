# Relatório de Execução - Prompt 02: Persistência Única e Fim da Memória de Processo

## Objetivo
Migrar a persistência de reuniões, configurações do sistema (modelos de IA e prompts) e snapshots de estado para o Firestore, eliminando o estado volátil em memória (`Map` e arquivos locais como fonte primária) e transformando o frontend em cliente exclusivo da API REST do backend.

---

## Mapa de Migração de Dados

| Dado / Recurso | Onde vivia antes | Onde vive agora (Fonte Única da Verdade) | Estratégia de Caching & Invalidação |
|---|---|---|---|
| **Reuniões (`meetings`)** | `Map<string, MeetingEntity>` na RAM do processo Node.js | Coleção Firestore `/meetings/{id}` | Persistência direta no Firestore via Admin SDK no backend; `ownerUid` extraído do token autenticado. |
| **Snapshots de Ata (`ataState`)** | Não existia versionamento formal de estados intermediários | Subcoleção Firestore `/meetings/{id}/ataState/{versao}` | Snapshot imutável gravado a cada avanço com `versao` autoincremental, `promptVersion`, `modelo` e `templateVersion`. |
| **Modelos de IA (`ai_models`)** | Variável global em memória com fallback em `admin_config.json` | Documento Firestore `/config/ai_models` | Cache de processo com TTL de 60 segundos; invalidado imediatamente ao salvar nova configuração. Disco vira apenas cache de cold-start. |
| **Prompts do Sistema (`custom_prompts`)** | Variável global em memória com fallback em `admin_config.json` | Documento Firestore `/config/custom_prompts` | Cache de processo com TTL de 60 segundos; invalidado imediatamente em mutações. Disco vira apenas cache de cold-start. |
| **Template Ativo (`activeTemplate`)** | Leitura mista de disco / Firestore sem controle de TTL | Documento Firestore `/config/activeTemplate` e `/templates/{id}` | Cache em processo com TTL de 60 segundos; invalidado em upload, rollback, edição de schema e deleção. |
| **Frontend (`src/lib/db.ts`)** | Acessos diretos mistos ao Firestore Client SDK e API | Chamadas REST exclusivas aos endpoints `/api/meetings` e `/api/admin/*` | Nenhuma escrita direta em `meetings` pelo cliente; segurança centralizada no backend. |

---

## Arquivos alterados
- `server/meetingStore.ts`: Substituição completa do `Map` em memória por operações assíncronas no Firestore (`meetings` e subcoleção versionada `meetings/{id}/ataState/{versao}`).
- `server/index.ts`: Ajuste dos handlers das rotas `/api/meetings` para `async/await` com resolução assíncrona do `meetingStore`.
- `src/lib/db.ts`: Eliminação de leituras e escritas diretas do Firestore no cliente; redirecionamento de todas as operações para `/api/meetings`.
- `src/components/Admin/AdminView.tsx`: Remoção de chamadas diretas a `setDoc(doc(db, 'config', ...))` no cliente, delegando aos endpoints administrativos da API.
- `server/configStore.ts`: Firestore como fonte de verdade primária; cache local em disco com try/catch silencioso e cache em memória com TTL de 60s.
- `server/templateRepository.ts`: Adição de cache em processo com TTL de 60s e invalidação automática em mutações de templates.
- `firestore.rules`: Adição da regra de bloqueio direto de cliente para a subcoleção `meetings/{id}/ataState/{versao}`.
- `firebase-blueprint.json`: Inclusão da entidade `AtaState` e schema da subcoleção `/meetings/{meetingId}/ataState/{versao}`.
- `debug/02_persistencia.md`: Este relatório de execução.

---

## Decisões
- O `ownerUid` de toda reunião é derivado unicamente do token JWT validado pelo backend, ignorando qualquer propriedade informada no payload do cliente.
- A subcoleção `ataState` recebe uma nova versão sequencial (1, 2, 3...) a cada persistência, mantendo a rastreabilidade completa do modelo de IA, versão de prompt e template DOCX utilizados.
- Todos os componentes do frontend continuam consumindo exatamente as mesmas assinaturas de `src/lib/db.ts` (`saveMeeting`, `loadMeetings`, `loadMeeting`, `deleteMeeting`), mantendo a experiência do usuário 100% inalterada.

---

## Roteiro de Teste de Persistência e Resiliência

### Teste 1: Criação e Persistência de Reunião
1. Fazer login no sistema e criar uma reunião através do Wizard (preencher código de obra `OBRA-TESTE-PERSISTENCIA`, fornecedor `Elevadores S/A`).
2. Concluir o Step 1 ou avançar etapas.
3. Verificar a gravação do documento em `/meetings/meet-...` no Firestore e a entrada `1` na subcoleção `ataState`.

### Teste 2: Resiliência a Reinício do Servidor
1. Reiniciar o servidor Node.js (`npm run start` ou reinício do container dev).
2. Abrir o Histórico de Reuniões no frontend (`/api/meetings`).
3. **Resultado Esperado**: A reunião criada anteriormente (`OBRA-TESTE-PERSISTENCIA`) permanece listada com todos os dados íntegros, confirmando que nenhum dado dependia da memória de processo.

### Teste 3: Acesso Multi-Instância
1. Simular duas instâncias ou abas simultâneas consumindo a API.
2. Ambas as instâncias leem os dados sincronizados diretamente da coleção Firestore `/meetings`.

---

## Testes executados e saída
- `npm test`: Executado com sucesso (3 testes passando).
- `npx tsc --noEmit`: Executado com 0 erros de compilação TypeScript.
- `deploy_firebase`: Regras atualizadas implantadas com sucesso.

## Pendências e riscos
- Nenhuma pendência. A camada de persistência agora é totalmente baseada em Firestore com cache controlado por TTL.

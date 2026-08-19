# Relatório de Execução - Prompt 01: Segurança de acesso e Firestore Rules

## Objetivo
Refatorar a camada de autenticação no backend (`server/auth.ts`) e as regras de segurança do Firestore (`firestore.rules`) para eliminar qualquer brecha de aceitação de tokens JWT não verificados, blindar coleções administrativas contra acesso direto de cliente e garantir validação estrita de domínios corporativos (@biti9.com.br e @afonsofranca.com.br).

---

## Tabela Antes / Depois de Regras de Segurança

| Recurso / Caminho | Regra Anterior | Nova Regra (Hardened) | Justificativa de Segurança |
|---|---|---|---|
| **Verificação de Token (Backend)** | `verifyIdToken` com fallback para `decodeJwtPayload` (aceitava JWT sem assinatura) | Se `verifyIdToken` falhar, retorna `401 Unauthorized` imediatamente. `decodeJwtPayload` removido. | Elimina possibilidade de assinatura forjada ou bypass de autenticação por cabeçalho manipulado. |
| **Checagem de Domínio** | `email.includes('biti9.com.br')` | `email.endsWith('@' + ALLOWED_ADMIN_DOMAIN)` | Impede bypass com e-mails do tipo `malicioso@biti9.com.br.evil.com` ou subdomínios fraudulentos. |
| **Variáveis de Ambiente** | Fallback hardcoded silencioso no código | Obrigatórias via env; encerra com `process.exit(1)` no boot se ausentes. | Impede que o servidor suba em estado vulnerável ou apontando para banco incorreto. |
| **`users/{uid}`** | `allow read, write: if signedIn();` | `allow read: if signedIn() && request.auth.uid == uid; allow write: if false;` | Impede que usuários alterem seus próprios perfis/roles (`role: admin`), tornando `users` confiável para o backend. |
| **`meetings/{id}`** | `allow read, create, update, delete: if signedIn();` | `read/update/delete: if resource.data.ownerUid == request.auth.uid; create: if request.resource.data.ownerUid == request.auth.uid;` | Garante isolamento estrito entre usuários; um membro não pode ler nem alterar reuniões de outro usuário. |
| **`templates/{id}`** | `allow read, write: if signedIn();` | `allow read, write: if false;` | Acesso exclusivo ao backend (Firebase Admin SDK), impedindo adulteração de templates DOCX pelo cliente. |
| **`templateBlobs/**`** | `allow read, write: if signedIn();` | `allow read, write: if false;` | Chunks binários protegidos contra download ou injeção arbitrária direta. |
| **`config/{id}`** | `allow read, write: if signedIn();` | `allow read, write: if false;` | Modelos de IA e prompts do sistema inacessíveis a escrita direta pelo cliente. |
| **`logs/{id}`** | `allow read, write: if signedIn();` | `allow read, write: if false;` | Logs de auditoria imutáveis e gravados apenas pelo backend. |
| **`GET /api/admin/templates`** | Middleware `requireAuth` apenas | `requireAuth, requireAdmin` | Garante que membros comuns não listem ou acessem configurações administrativas de templates. |

---

## Arquivos alterados
- `server/auth.ts`: Remoção de `decodeJwtPayload`, validação estrita de tokens no `requireAuth`, checagem de domínio via `endsWith('@' + domain)`, obrigatoriedade de env vars no boot com `process.exit(1)` em caso de ausência.
- `server/index.ts`: Adição do middleware `requireAdmin` à rota `GET /api/admin/templates`.
- `firestore.rules`: Reescrita completa do esqueleto de regras com negação de escrita para `users`, isolamento por `ownerUid` em `meetings` e negação de cliente para `templates`, `templateBlobs`, `config` e `logs`.
- `.env`: Criação do arquivo de variáveis locais espelhado em `.env.example`.
- `debug/01_seguranca.md`: Este relatório de auditoria e validação de segurança.

---

## Decisões
- Remoção categórica de decodificação de JWT sem validação criptográfica de chave pública. Qualquer falha na verificação de assinatura agora rejeita a requisição com status HTTP 401.
- Todas as operações em coleções sensíveis (`templates`, `templateBlobs`, `config`, `logs`, escrita em `users`) foram delegadas com exclusividade ao Firebase Admin SDK no Node.js.
- O fluxo de primeiro acesso com `mustChangePassword` foi mantido integralmente funcional através da rota `/api/auth/change-password` executada via Admin SDK.

---

## Passo a Passo de Teste Manual e Validação

### Teste 1: Login Válido e Hidratação de Sessão
1. Acessar o sistema com usuário do domínio `@biti9.com.br` ou `@afonsofranca.com.br`.
2. Fazer requisição para `GET /api/auth/session` com header `Authorization: Bearer <ID_TOKEN_VALIDO>`.
3. **Resultado Esperado**: Retorno HTTP 200 contendo `{ uid, email, role, domain, mustChangePassword }`.

### Teste 2: Rejeição de Token Adulterado ou Inválido (401)
1. Fazer requisição para `GET /api/auth/session` com `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidPayload.signature`.
2. **Resultado Esperado**: Retorno HTTP 401 Unauthorized com `{ "error": "Sessão inválida, não autenticada ou expirada...", "code": "UNAUTHORIZED" }`.

### Teste 3: Isolamento de Permissões de Administrador
1. Fazer requisição para `GET /api/admin/templates` ou `GET /api/admin/config` usando token de usuário com perfil `@afonsofranca.com.br` (membro).
2. **Resultado Esperado**: Retorno HTTP 403 Forbidden com `{ "error": "Acesso restrito a administradores do sistema (@biti9.com.br)." }`.

### Teste 4: Isolamento de Reuniões no Firestore
1. Usuário A tenta ler documento `meetings/reuniao-do-usuario-B` diretamente pelo client SDK.
2. **Resultado Esperado**: Erro `PERMISSION_DENIED` do Firestore rules devido à asserção `resource.data.ownerUid == request.auth.uid`.

---

## Testes executados e saída
- `npm test`: Executado com sucesso (suite de regressão operacional).
- `npx tsc --noEmit`: Executado com 0 erros de tipagem.
- `deploy_firebase`: Regras publicadas com sucesso no Firestore.

## Pendências e riscos
- Nenhuma pendência de segurança de acesso. As regras do Firestore estão ativas e publicadas.

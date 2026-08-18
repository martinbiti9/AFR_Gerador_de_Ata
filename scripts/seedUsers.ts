import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, cert, applicationDefault, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';

dotenv.config();

const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-495e4a2f-bc01-4197-9d3d-8b17577710a2';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID || 'biti9-performevaluationsummary';

interface UserSeedEntry {
  nome: string;
  email: string;
  senha: string;
}

async function runSeed() {
  console.log('--- Iniciando Script de Seed de Usuários (Afonso França) ---');
  console.log(`Projeto Firebase: ${PROJECT_ID}`);
  console.log(`Banco Firestore: ${FIRESTORE_DATABASE_ID}`);

  // 1. Initialize Firebase Admin
  let adminApp: App;
  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0];
  } else {
    let credential = applicationDefault();
    const saKey = process.env.GCP_SERVICE_ACCOUNT_KEY;
    if (saKey && saKey.trim().startsWith('{') && saKey.trim() !== '{}') {
      try {
        const parsed = JSON.parse(saKey);
        if (parsed.client_email && parsed.private_key) {
          credential = cert(parsed);
        }
      } catch (e) {
        console.warn('Aviso ao analisar GCP_SERVICE_ACCOUNT_KEY:', e);
      }
    }

    adminApp = initializeApp({
      credential,
      projectId: PROJECT_ID
    });
  }

  const auth = getAuth(adminApp);
  const fdb = getFirestore(adminApp, FIRESTORE_DATABASE_ID);

  // 2. Read seed list from local file (ignored by git)
  const localSeedPath = path.join(process.cwd(), 'scripts', 'seed-users.local.json');
  if (!fs.existsSync(localSeedPath)) {
    console.error(`Arquivo local não encontrado em: ${localSeedPath}`);
    console.error('Crie o arquivo scripts/seed-users.local.json com a lista de usuários provisórios para executar o seed.');
    process.exit(1);
  }

  const fileContent = fs.readFileSync(localSeedPath, 'utf-8');
  let usersList: UserSeedEntry[] = [];
  try {
    usersList = JSON.parse(fileContent);
  } catch (err: any) {
    console.error('Erro ao ler JSON de scripts/seed-users.local.json:', err.message);
    process.exit(1);
  }

  console.log(`Total de registros a processar: ${usersList.length}\n`);

  let createdCount = 0;
  let existingCount = 0;
  let errorCount = 0;

  for (const entry of usersList) {
    const rawEmail = entry.email || '';
    const email = rawEmail.toLowerCase().trim();
    const displayName = entry.nome || email.split('@')[0];
    const password = entry.senha;

    if (!email) {
      console.warn(`[PULADO] Registro sem e-mail.`);
      errorCount++;
      continue;
    }

    try {
      let uid: string;
      let isNew = false;

      // 1. Check if user already exists in Firebase Auth
      try {
        const existingUser = await auth.getUserByEmail(email);
        uid = existingUser.uid;
        console.log(`[EXISTENTE] ${email} (UID: ${uid}) - senha não alterada (idempotência).`);
        existingCount++;
      } catch (notFoundErr: any) {
        if (notFoundErr.code === 'auth/user-not-found') {
          // User does not exist, create with temporary password
          const newUser = await auth.createUser({
            email,
            password,
            displayName,
            emailVerified: true,
          });
          uid = newUser.uid;
          isNew = true;
          console.log(`[CRIADO] ${email} (UID: ${uid}) - criado com sucesso.`);
          createdCount++;
        } else {
          throw notFoundErr;
        }
      }

      // 2. Set Custom User Claims: role = 'member', domain = 'afonsofranca.com.br'
      await auth.setCustomUserClaims(uid, {
        role: 'member',
        domain: 'afonsofranca.com.br'
      });

      // 3. Mirror/Update user document in Firestore `users/{uid}`
      const userDocRef = fdb.collection('users').doc(uid);
      const userSnap = await userDocRef.get();

      if (!userSnap.exists) {
        await userDocRef.set({
          uid,
          email,
          displayName,
          role: 'member',
          domain: 'afonsofranca.com.br',
          provider: 'password',
          isActive: true,
          mustChangePassword: true, // Requires password change on first access
          createdAt: new Date().toISOString(),
          lastLoginAt: null,
          passwordChangedAt: null,
        });
      } else {
        // Only update claims/role, preserve existing passwordChangedAt / mustChangePassword
        await userDocRef.update({
          email,
          displayName,
          role: 'member',
          domain: 'afonsofranca.com.br',
          isActive: true,
        });
      }

    } catch (err: any) {
      console.error(`[ERRO] Falha ao processar ${email}:`, err.message);
      errorCount++;
    }
  }

  console.log('\n=========================================');
  console.log('           RELATÓRIO DO SEED             ');
  console.log('=========================================');
  console.log(`Criados:      ${createdCount}`);
  console.log(`Já existentes: ${existingCount}`);
  console.log(`Erros:        ${errorCount}`);
  console.log(`Total:        ${usersList.length}`);
  console.log('=========================================\n');
}

runSeed().catch((err) => {
  console.error('Erro fatal durante o seed:', err);
  process.exit(1);
});

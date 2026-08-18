import fs from 'fs';
import path from 'path';
import { initializeApp, getApps, cert, applicationDefault, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';

dotenv.config();

const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-495e4a2f-bc01-4197-9d3d-8b17577710a2';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT_ID || 'biti9-performevaluationsummary';

async function runMigration() {
  console.log('--- Migração de Propriedade de Atas (Ownership Migration) ---');
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

  const meetingsCol = fdb.collection('meetings');
  const snapshot = await meetingsCol.get();

  console.log(`Total de reuniões encontradas no Firestore: ${snapshot.size}`);

  const unassigned: any[] = [];
  const assigned: any[] = [];

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    if (!data.ownerUid || data.ownerUid === '') {
      unassigned.push({
        id: docSnap.id,
        obraCodigo: data.obraCodigo || '',
        fornecedor: data.fornecedor || '',
        assunto: data.assunto || '',
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : (data.updatedAt || '')
      });
    } else {
      assigned.push({ id: docSnap.id, ownerUid: data.ownerUid });
    }
  });

  console.log(`Reuniões já atribuídas: ${assigned.length}`);
  console.log(`Reuniões sem dono identificado: ${unassigned.length}`);

  if (unassigned.length === 0) {
    console.log('Todas as reuniões já possuem propriedade atribuída.');
    return;
  }

  // Check if a completed CSV mapping exists: `scripts/meetings-atribuidas.csv`
  const mappingCsvPath = path.join(process.cwd(), 'scripts', 'meetings-atribuidas.csv');
  if (fs.existsSync(mappingCsvPath)) {
    console.log(`Lendo arquivo de atribuição de proprietários: ${mappingCsvPath}`);
    const lines = fs.readFileSync(mappingCsvPath, 'utf-8').split('\n').filter(l => l.trim().length > 0);
    // Expected header: id,obraCodigo,fornecedor,assunto,updatedAt,ownerEmail
    let updatedCount = 0;
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      const meetingId = parts[0]?.trim();
      const ownerEmail = parts[5]?.trim()?.toLowerCase();

      if (meetingId && ownerEmail) {
        try {
          const userRecord = await auth.getUserByEmail(ownerEmail);
          await meetingsCol.doc(meetingId).update({
            ownerUid: userRecord.uid,
            ownerEmail: userRecord.email,
            ownerName: userRecord.displayName || userRecord.email?.split('@')[0],
          });
          console.log(`[ATRIBUÍDO] Reunião ${meetingId} atribuída a ${ownerEmail} (${userRecord.uid})`);
          updatedCount++;
        } catch (e: any) {
          console.warn(`[AVISO] Usuário não encontrado para e-mail ${ownerEmail}: ${e.message}`);
        }
      }
    }
    console.log(`Total de reuniões migradas a partir do CSV: ${updatedCount}`);
  } else {
    // Generate CSV for human review
    const csvContent = [
      'id,obraCodigo,fornecedor,assunto,updatedAt,ownerEmail',
      ...unassigned.map(m => `"${m.id}","${m.obraCodigo.replace(/"/g, '""')}","${m.fornecedor.replace(/"/g, '""')}","${m.assunto.replace(/"/g, '""')}","${m.updatedAt}",""`)
    ].join('\n');

    const outputPath = path.join(process.cwd(), 'meetings-sem-dono.csv');
    fs.writeFileSync(outputPath, csvContent, 'utf-8');
    console.log(`\nArquivo CSV gerado para revisão humana: ${outputPath}`);
    console.log('Preencha a coluna "ownerEmail" e salve como "scripts/meetings-atribuidas.csv", ou execute com a flag "--legacy" para marcar as pendentes como legado.\n');
  }

  // Check if --legacy flag was provided to tag all remaining unassigned as '__legacy__'
  if (process.argv.includes('--legacy')) {
    console.log('Marcando reuniões sem dono remanescentes como __legacy__ (acessíveis apenas por Admin)...');
    const batch = fdb.batch();
    unassigned.forEach(m => {
      batch.update(meetingsCol.doc(m.id), {
        ownerUid: '__legacy__',
        ownerEmail: 'legado@afonsofranca.com.br',
        ownerName: 'Acervo Histórico Legado'
      });
    });
    await batch.commit();
    console.log(`${unassigned.length} reuniões marcadas como __legacy__ com sucesso.`);
  }
}

runMigration().catch(err => {
  console.error('Erro na migração de reuniões:', err);
  process.exit(1);
});

import express from 'express';
import multer from 'multer';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { 
  analyzeChecklist, 
  analyzeProposal, 
  generateFinalAta, 
  extractDocumentMetadata,
  extractTextFromUploadedFiles
} from './gemini';
import { parseDocxTemplate } from './docx';
import { renderAtaDocument, RenderValidationError, DocxRenderError } from './render/renderAta';
import {
  getTemplateVersionsFromDb,
  getActiveTemplateFromDb,
  saveTemplateDocumentToDb,
  rollbackTemplateInDb,
  updateTemplateSchemaInDb,
  deleteTemplateFromDb,
  buildDefaultSchema
} from './templateRepository';
import { TemplateSchemaZod } from './types/template';
import { addLog, getLogs, clearLogs } from './logger';
import {
  saveMeetingToStore,
  getMeetingsFromStore,
  getMeetingById,
  deleteMeetingFromStore
} from './meetingStore';
import {
  getActiveModels,
  updateActiveModels,
  getActivePrompts,
  updateActivePrompts
} from './configStore';
import {
  initFirebaseAdmin,
  requireAuth,
  requireAdmin,
  requirePasswordChanged,
} from './auth';

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB per file
    files: 20
  }
});

function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== 'string' || password.length < 10) {
    return { valid: false, error: 'A senha deve ter no mínimo 10 caracteres.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'A senha deve conter ao menos uma letra maiúscula.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'A senha deve conter ao menos uma letra minúscula.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'A senha deve conter ao menos um número.' };
  }
  return { valid: true };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Firebase Admin SDK
  try {
    initFirebaseAdmin();
    console.log('Firebase Admin SDK inicializado com sucesso.');
  } catch (adminErr) {
    console.error('Erro ao inicializar Firebase Admin SDK:', adminErr);
  }

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // ================= AUTHENTICATION & SESSION ROUTES =================

  // Session hydration endpoint: returns identity, role and password status
  app.get('/api/auth/session', requireAuth, (req, res) => {
    const authUser = req.auth!;
    addLog('INFO', 'AUTH', `Sessão ativa verificada para ${authUser.email}`, {
      uid: authUser.uid,
      role: authUser.role,
      domain: authUser.domain,
      mustChangePassword: authUser.mustChangePassword
    }, { uid: authUser.uid, email: authUser.email, role: authUser.role });

    res.json({
      uid: authUser.uid,
      email: authUser.email,
      displayName: authUser.displayName,
      role: authUser.role,
      domain: authUser.domain,
      mustChangePassword: authUser.mustChangePassword
    });
  });

  // Mandatory / voluntary password change endpoint
  app.post('/api/auth/change-password', requireAuth, async (req, res) => {
    try {
      const { newPassword } = req.body;
      const authUser = req.auth!;

      const validation = validatePasswordStrength(newPassword);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const { adminAuth, adminDb } = initFirebaseAdmin();

      // 1. Update password in Firebase Auth
      await adminAuth.updateUser(authUser.uid, {
        password: newPassword
      });

      // 2. Update user profile document in Firestore
      const now = new Date().toISOString();
      await adminDb.collection('users').doc(authUser.uid).update({
        mustChangePassword: false,
        passwordChangedAt: now,
        updatedAt: now
      });

      // 3. Revoke previous refresh tokens
      await adminAuth.revokeRefreshTokens(authUser.uid);

      addLog('INFO', 'AUTH', `Senha alterada com sucesso pelo usuário ${authUser.email}`, {
        uid: authUser.uid,
        email: authUser.email,
      }, { uid: authUser.uid, email: authUser.email, role: authUser.role });

      res.json({ 
        success: true, 
        message: 'Senha alterada com sucesso! Você já pode utilizar o sistema.' 
      });
    } catch (error: any) {
      console.error('Erro ao alterar senha:', error);
      res.status(500).json({ error: error.message || 'Erro ao alterar senha.' });
    }
  });

  // Logout audit logging endpoint
  app.post('/api/auth/logout', requireAuth, (req, res) => {
    const authUser = req.auth!;
    addLog('INFO', 'AUTH', `Logout realizado pelo usuário ${authUser.email}`, {
      uid: authUser.uid,
      email: authUser.email,
    }, { uid: authUser.uid, email: authUser.email, role: authUser.role });
    res.json({ success: true });
  });

  // ================= EXTRACTION & AI PIPELINE =================
  
  app.post('/api/extract-text', requireAuth, requirePasswordChanged, upload.array('files'), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado para extração de texto.' });
      }

      const extractedText = await extractTextFromUploadedFiles(files);
      res.json({ success: true, text: extractedText });
    } catch (error: any) {
      console.error('Error extracting text from files:', error);
      res.status(500).json({ error: error.message || 'Erro ao extrair texto do arquivo.' });
    }
  });

  app.post('/api/extract-metadata', requireAuth, requirePasswordChanged, upload.array('files'), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      const inlineDataFiles = (files || []).map(f => ({
        inlineData: {
          data: f.buffer.toString('base64'),
          mimeType: f.mimetype || 'application/pdf'
        }
      }));

      const metadata = await extractDocumentMetadata(inlineDataFiles);
      res.json({ success: true, metadata: metadata.metadata });
    } catch (error: any) {
      console.error('Error extracting metadata:', error);
      res.status(500).json({ error: error.message || 'Erro ao extrair metadados da obra.' });
    }
  });

  app.post('/api/analyze-checklist', requireAuth, requirePasswordChanged, upload.array('files'), async (req, res) => {
    try {
      // 1. Template existence check
      const activeTemplate = await getActiveTemplateFromDb();
      if (!activeTemplate || !activeTemplate.docxBlobBase64) {
        return res.status(422).json({
          error: 'Nenhum template DOCX ativo disponível no sistema. Faça o upload do template oficial antes de realizar as análises.',
          code: 'TEMPLATE_REQUIRED'
        });
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      }

      const inlineDataFiles = files.map(f => ({
        inlineData: {
          data: f.buffer.toString('base64'),
          mimeType: f.mimetype || 'application/pdf'
        }
      }));
      
      const result = await analyzeChecklist(inlineDataFiles);
      res.json(result);
    } catch (error: any) {
      console.error('Error analyzing checklist:', error);
      res.status(500).json({ error: error.message || 'Erro ao processar arquivos de checklist.' });
    }
  });

  app.post('/api/analyze-proposal', requireAuth, requirePasswordChanged, upload.array('files'), async (req, res) => {
    try {
      // 1. Template existence check
      const activeTemplate = await getActiveTemplateFromDb();
      if (!activeTemplate || !activeTemplate.docxBlobBase64) {
        return res.status(422).json({
          error: 'Nenhum template DOCX ativo disponível no sistema. Faça o upload do template oficial antes de realizar as análises.',
          code: 'TEMPLATE_REQUIRED'
        });
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'Nenhum arquivo de proposta enviado.' });
      }
      
      const checklistStr = req.body.checklist;
      if (!checklistStr) {
        return res.status(400).json({ error: 'Checklist não fornecido.' });
      }
      const checklist = JSON.parse(checklistStr);

      const inlineDataFiles = files.map(f => ({
        inlineData: {
          data: f.buffer.toString('base64'),
          mimeType: f.mimetype || 'application/pdf'
        }
      }));
      
      const result = await analyzeProposal(inlineDataFiles, checklist);
      res.json(result);
    } catch (error: any) {
      console.error('Error analyzing proposal:', error);
      res.status(500).json({ error: error.message || 'Erro ao processar proposta comercial.' });
    }
  });

  app.post('/api/draft-final-ata', requireAuth, requirePasswordChanged, async (req, res) => {
    try {
      // 1. Template existence check
      const activeTemplate = await getActiveTemplateFromDb();
      if (!activeTemplate || !activeTemplate.docxBlobBase64) {
        return res.status(422).json({
          error: 'Nenhum template DOCX ativo disponível no sistema. Faça o upload do template oficial antes de redigir a Ata Final.',
          code: 'TEMPLATE_REQUIRED'
        });
      }

      const { abertura, analysisResult, divergences, transcript } = req.body;
      const ataData = await generateFinalAta(abertura, analysisResult, divergences, transcript);
      res.json(ataData);
    } catch (error: any) {
      console.error('Error drafting final ata:', error);
      res.status(500).json({ error: error.message || 'Erro ao rascunhar Ata Final.' });
    }
  });

  // ================= DETERMINISTIC DOCUMENT GENERATION =================

  app.post('/api/generate-pre-ata', requireAuth, requirePasswordChanged, async (req, res) => {
    try {
      const { abertura, analysisResult, divergences } = req.body;
      const { buffer, report } = await renderAtaDocument(abertura, analysisResult, divergences, null, '', true);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', 'attachment; filename=Pre-Ata.docx');
      res.setHeader('X-Document-Verified', report.isVerified ? 'true' : 'false');
      res.send(buffer);
    } catch (error: any) {
      if (error instanceof RenderValidationError) {
        return res.status(422).json({
          error: error.message,
          missingFields: error.missingFields
        });
      }
      if (error instanceof DocxRenderError) {
        return res.status(500).json({
          error: error.message,
          details: error.details
        });
      }
      console.error('Error generating pre-ata:', error);
      res.status(500).json({ error: error.message || 'Erro ao gerar Pré-Ata.' });
    }
  });

  app.post('/api/generate-final-ata', requireAuth, requirePasswordChanged, async (req, res) => {
    try {
      const { abertura, analysisResult, divergences, transcript, finalAtaData } = req.body;
      
      let ataData = finalAtaData;
      if (!ataData) {
        ataData = await generateFinalAta(abertura, analysisResult, divergences, transcript);
      }

      const { buffer, report } = await renderAtaDocument(abertura, analysisResult, divergences, ataData, transcript, false);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', 'attachment; filename=Ata-Final.docx');
      res.setHeader('X-Document-Verified', report.isVerified ? 'true' : 'false');
      res.send(buffer);
    } catch (error: any) {
      if (error instanceof RenderValidationError) {
        return res.status(422).json({
          error: error.message,
          missingFields: error.missingFields
        });
      }
      if (error instanceof DocxRenderError) {
        return res.status(500).json({
          error: error.message,
          details: error.details
        });
      }
      console.error('Error generating final ata:', error);
      res.status(500).json({ error: error.message || 'Erro ao gerar Ata Final.' });
    }
  });

  // ================= DIAGNOSTIC FIXTURE ROUTE (PARTE 4) =================

  app.post('/api/debug/render-fixture', requireAuth, requireAdmin, async (req, res) => {
    try {
      const template = await getActiveTemplateFromDb();
      if (!template || !template.docxBlobBase64) {
        return res.status(404).json({ error: 'Nenhum template DOCX ativo disponível.' });
      }

      const fixturePayload = {
        abertura: {
          obraCodigo: '590',
          obraNome: 'HOSPITAL SABARA',
          assunto: 'ALINHAMENTO TECNICO E COMERCIAL',
          servico: 'PINTURA MAT E MO',
          fornecedor: 'ALPHA PINTURA',
          rm: 'FIXTURE-RM',
          cot: 'FIXTURE-COT',
          dataReuniao: '18/07/2026',
          horaAbertura: '10h30',
          horaEncerramento: '12h15',
          local: 'Online, Microsoft Teams',
        },
        analysisResult: {
          tipoFornecimento: 'Pintura',
          topics: Array.from({ length: 38 }, (_, i) => ({
            id: `topic-${i + 1}`,
            title: `Titulo ${i + 1}`,
            regraObra: `Regra de obra fixture ${i + 1} com texto longo o bastante para quebrar em duas linhas.`,
            excecaoAdmitida: 'N/A',
            pontoAtencao: i % 5 === 0 ? 'Atenção especial de prazo' : 'Nenhum',
            perguntaFornecedor: 'Confirmar atendimento',
            responsavel: 'Alpha Pintura',
            prazo: '27/07/2026',
          }))
        },
        divergences: [
          { id: 'div-1', description: 'Divergência de teste 1', severity: 'MEDIA', source: 'Proposta' }
        ],
        finalData: {
          agreedItems: Array.from({ length: 38 }, (_, i) => ({
            num: String(i + 1).padStart(2, '0'),
            titulo: `Titulo ${i + 1}`,
            descricao: `FIXTURE item ${i + 1} com texto longo o bastante para quebrar em duas linhas.`,
            responsavel: 'Alpha Pintura',
            prazo: '27/07/2026',
          })),
          pendingItems: [],
          notes: 'FIXTURE RESUMO DA REUNIÃO'
        }
      };

      const isPreAta = req.body?.isPreAta ?? false;
      const { buffer, report, naoResolvidas } = await renderAtaDocument(
        fixturePayload.abertura,
        fixturePayload.analysisResult,
        fixturePayload.divergences,
        fixturePayload.finalData,
        'Transcrição de teste fixture',
        isPreAta
      );

      if (req.query.download === 'true') {
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', 'attachment; filename="fixture-render.docx"');
        return res.send(buffer);
      }

      return res.json({
        success: true,
        templateId: template.id,
        templateVersion: template.version,
        fileSizeBytes: buffer.length,
        isVerified: report.isVerified,
        report,
        naoResolvidas,
        docxBase64Preview: buffer.slice(0, 100).toString('base64')
      });
    } catch (err: any) {
      if (err instanceof RenderValidationError) {
        return res.status(422).json({ error: err.message, missingFields: err.missingFields });
      }
      return res.status(err.statusCode || 500).json({ error: err.message, details: err.details });
    }
  });

  // ================= MEETINGS / HISTÓRICO API =================
  
  app.get('/api/meetings', requireAuth, requirePasswordChanged, (req, res) => {
    try {
      const search = req.query.search as string;
      const authUser = req.auth!;
      const meetings = getMeetingsFromStore(search, { uid: authUser.uid, role: authUser.role });
      res.json({ meetings });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/meetings/:id', requireAuth, requirePasswordChanged, (req, res) => {
    try {
      const authUser = req.auth!;
      const meeting = getMeetingById(req.params.id, { uid: authUser.uid, role: authUser.role });
      if (!meeting) {
        return res.status(404).json({ error: 'Reunião não encontrada no histórico.' });
      }
      res.json({ meeting });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/meetings', requireAuth, requirePasswordChanged, (req, res) => {
    try {
      const authUser = req.auth!;
      const meeting = saveMeetingToStore(req.body, {
        uid: authUser.uid,
        email: authUser.email,
        displayName: authUser.displayName
      });
      res.json({ success: true, id: meeting.id, meeting });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/meetings/:id', requireAuth, requirePasswordChanged, (req, res) => {
    try {
      const authUser = req.auth!;
      const deleted = deleteMeetingFromStore(req.params.id, { uid: authUser.uid, role: authUser.role });
      if (!deleted) {
        return res.status(404).json({ error: 'Reunião não encontrada para exclusão.' });
      }
      res.json({ success: true, message: 'Reunião removida com sucesso.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ================= ADMIN API ENDPOINTS =================

  // 1. Config: Models and Custom Prompts
  app.get('/api/admin/config', requireAuth, requireAdmin, (req, res) => {
    res.json({
      models: getActiveModels(),
      prompts: getActivePrompts()
    });
  });

  app.post('/api/admin/config/models', requireAuth, requireAdmin, (req, res) => {
    try {
      const updated = updateActiveModels(req.body);
      res.json({ success: true, models: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/config/prompts', requireAuth, requireAdmin, (req, res) => {
    try {
      const updated = updateActivePrompts(req.body);
      res.json({ success: true, prompts: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 2. Logs and Audit
  app.get('/api/admin/logs', requireAuth, requireAdmin, (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const level = req.query.level as string;
    const category = req.query.category as string;
    const search = req.query.search as string;
    const logs = getLogs(limit, level, category, search);
    res.json({ logs });
  });

  app.post('/api/admin/logs', requireAuth, requireAdmin, (req, res) => {
    const { level, category, message, details } = req.body;
    const authUser = req.auth;
    const entry = addLog(
      level || 'INFO', 
      category || 'SYSTEM', 
      message, 
      details,
      authUser ? { uid: authUser.uid, email: authUser.email, role: authUser.role } : undefined
    );
    res.json({ success: true, entry });
  });

  app.delete('/api/admin/logs', requireAuth, requireAdmin, (req, res) => {
    clearLogs();
    res.json({ success: true, message: 'Logs limpos com sucesso.' });
  });

  // 3. Firestore Templates & Schemas Management
  app.get('/api/admin/templates', requireAuth, async (req, res) => {
    try {
      const data = await getTemplateVersionsFromDb();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/templates', requireAuth, requireAdmin, upload.single('templateFile'), async (req, res) => {
    try {
      const file = req.file;
      const { name, description, companyName, primaryColor, tableHeaderBg, fontFamily, preAtaIntro, standardClauses, signatures } = req.body;

      if (!name && !file) {
        return res.status(400).json({ error: 'Informe um nome para a versão ou anexe um arquivo de Template DOCX.' });
      }

      let docxBlobBase64: string | undefined;
      let originalFileName: string | undefined;
      let fileSizeBytes: number | undefined;
      let detectedPlaceholders: string[] | undefined;
      let structureSummary: string | undefined;
      let rawTextPreview: string | undefined;
      let tables: any[] | undefined;
      let placeholderMap: Record<string, string> | undefined;

      if (file) {
        const isDocx = file.originalname.toLowerCase().endsWith('.docx') || 
          file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

        if (!isDocx) {
          return res.status(400).json({ error: 'O arquivo enviado deve ser obrigatoriamente um documento do Word (.docx).' });
        }

        docxBlobBase64 = file.buffer.toString('base64');
        originalFileName = file.originalname;
        fileSizeBytes = file.size;

        // Inspect DOCX structure using XML parser and Mammoth
        const inspection = await parseDocxTemplate(file.buffer);
        detectedPlaceholders = inspection.detectedPlaceholders;
        structureSummary = inspection.structureSummary;
        rawTextPreview = inspection.rawTextPreview;
        tables = inspection.tables;
        placeholderMap = inspection.placeholderMap;
      }

      const templateName = name || (originalFileName ? originalFileName.replace(/\.docx$/i, '') : 'Template Personalizado');
      const tempId = `template-${Date.now()}`;
      const generatedSchema = buildDefaultSchema(tempId, detectedPlaceholders || [], tables || []);
      if (placeholderMap) {
        generatedSchema.placeholderMap = placeholderMap;
      }

      const saved = await saveTemplateDocumentToDb({
        name: templateName,
        description: description || (structureSummary ? `Template DOCX: ${structureSummary}` : ''),
        companyName: companyName || 'DEPARTAMENTO DE SUPRIMENTOS',
        primaryColor: primaryColor || '1F3864',
        tableHeaderBg: tableHeaderBg || 'EEEEEE',
        fontFamily: fontFamily || 'Arial',
        preAtaIntro: preAtaIntro || '',
        standardClauses: standardClauses || '',
        signatures: signatures || '',
        docxBlobBase64,
        originalFileName,
        fileSizeBytes,
        detectedPlaceholders,
        structureSummary,
        tables,
        rawTextPreview,
        schema: generatedSchema
      });

      res.json({ success: true, template: saved });
    } catch (error: any) {
      console.error('Error creating template version:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Schema Editor Endpoint
  app.put('/api/admin/templates/:id/schema', requireAuth, requireAdmin, async (req, res) => {
    try {
      const parsedSchema = TemplateSchemaZod.safeParse(req.body.schema);
      if (!parsedSchema.success) {
        return res.status(400).json({
          error: 'Schema inválido',
          details: parsedSchema.error.format()
        });
      }

      const rawSchemaData = parsedSchema.data;
      const schemaToSave: any = {
        ...rawSchemaData,
        createdAt: rawSchemaData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        generatedBy: rawSchemaData.generatedBy || 'admin'
      };

      const updated = await updateTemplateSchemaInDb(req.params.id, schemaToSave);
      res.json({ success: true, template: updated });
    } catch (error: any) {
      console.error('Error updating template schema:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Test Render Endpoint
  app.post('/api/admin/templates/:id/test-render', requireAuth, requireAdmin, async (req, res) => {
    try {
      const dummyAbertura = {
        obraCodigo: '590',
        obraNome: 'HOSPITAL SABARA',
        fornecedor: 'ALPHA PINTURA LTDA',
        assunto: 'Reunião de Alinhamento Técnico',
        servico: 'Pintura Especializada',
        rm: 'RM-001',
        cot: 'COT-001'
      };
      const dummyAnalysis = {
        topics: [
          { title: 'Prazo de Entrega', regraObra: 'Conforme cronograma', pontoAtencao: 'Atenção aos feriados' }
        ]
      };
      const dummyDivergences = [
        { description: 'Condição comercial ajustada em mesa', severity: 'MEDIA', source: 'Proposta' }
      ];
      const dummyFinal = {
        agreedItems: ['Mobilização em 5 dias corridos', 'Apresentação de ART em 48h'],
        pendingItems: ['Envio da lista final de colaboradores'],
        notes: 'Simulação de renderização para validação de schema e tags do template.'
      };

      const { buffer, report } = await renderAtaDocument(dummyAbertura, dummyAnalysis, dummyDivergences, dummyFinal, '', false);

      res.json({
        success: true,
        report,
        fileSizeBytes: buffer.length
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.post('/api/admin/templates/:id/rollback', requireAuth, requireAdmin, async (req, res) => {
    try {
      const template = await rollbackTemplateInDb(req.params.id);
      res.json({ success: true, template });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  });

  app.delete('/api/admin/templates/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await deleteTemplateFromDb(id);
      res.json({ success: true, result });
    } catch (error: any) {
      console.error('Error deleting template:', error);
      res.status(500).json({ error: error.message || 'Erro ao excluir template.' });
    }
  });

  app.get('/api/admin/templates/:id/download', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { versions } = await getTemplateVersionsFromDb();
      const target = versions.find(v => v.id === req.params.id);
      if (!target) {
        return res.status(404).json({ error: 'Template não encontrado.' });
      }

      if (target.docxBlobBase64) {
        const fileBuffer = Buffer.from(target.docxBlobBase64, 'base64');
        const filename = target.originalFileName || `Template-v${target.version}-${target.name.replace(/\s+/g, '_')}.docx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
        return res.send(fileBuffer);
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=template-v${target.version}-${target.name.replace(/\s+/g, '_')}.json`);
      res.send(JSON.stringify(target, null, 2));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Explicit JSON 404 for unmatched API routes
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `Rota de API não encontrada: ${req.method} ${req.path}` });
  });

  // Global error handler for API routes
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api')) {
      console.error('API Error:', err);
      const status = err.status || err.statusCode || 500;
      return res.status(status).json({ 
        error: err.message || 'Erro interno no processamento da API.' 
      });
    }
    next(err);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);

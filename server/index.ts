import express from 'express';
import multer from 'multer';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { 
  analyzeChecklist, 
  analyzeProposal, 
  generateFinalAta, 
  extractTextFromFile, 
  processChat,
  extractMetadataFromDocs,
  analyzeUploadedDocxStructureWithAI
} from './gemini';
import { generatePreAtaDocx, generateFinalAtaDocx, parseDocxTemplate } from './docx';
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
  updateActivePrompts,
  getTemplateVersions,
  createNewTemplateVersion,
  rollbackTemplate,
  getActiveTemplate
} from './configStore';

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB per file
    files: 20
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // API Endpoints
  
  app.post('/api/extract-metadata', upload.array('files'), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      const rawText = req.body.text as string;
      const metadata = await extractMetadataFromDocs(files, rawText);
      res.json({ success: true, metadata });
    } catch (error: any) {
      console.error('Error extracting metadata:', error);
      res.status(500).json({ error: error.message || 'Erro ao extrair metadados da obra.' });
    }
  });

  app.post('/api/analyze-checklist', upload.array('files'), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      }
      
      const customInstructions = req.body.customInstructions;
      const result = await analyzeChecklist(files, customInstructions);
      res.json(result);
    } catch (error: any) {
      console.error('Error analyzing checklist:', error);
      res.status(500).json({ error: error.message || 'Erro ao processar arquivos.' });
    }
  });

  app.post('/api/analyze-proposal', upload.array('files'), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      }
      
      const checklistStr = req.body.checklist;
      if (!checklistStr) {
        return res.status(400).json({ error: 'Checklist não fornecido.' });
      }
      const checklist = JSON.parse(checklistStr);
      const customInstructions = req.body.customInstructions;
      
      const result = await analyzeProposal(files, checklist, customInstructions);
      res.json(result);
    } catch (error: any) {
      console.error('Error analyzing proposal:', error);
      res.status(500).json({ error: error.message || 'Erro ao processar proposta.' });
    }
  });

  app.post('/api/generate-pre-ata', async (req, res) => {
    try {
      const { abertura, analysisResult, divergences } = req.body;
      const buffer = await generatePreAtaDocx(abertura, analysisResult, divergences);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', 'attachment; filename=Pre-Ata.docx');
      res.send(buffer);
    } catch (error: any) {
      console.error('Error generating pre-ata:', error);
      res.status(500).json({ error: error.message || 'Erro ao gerar Pré-Ata.' });
    }
  });

  app.post('/api/draft-final-ata', async (req, res) => {
    try {
      const { abertura, analysisResult, divergences, transcript, customInstructions } = req.body;
      const ataData = await generateFinalAta(abertura, analysisResult, divergences, transcript, customInstructions);
      res.json(ataData);
    } catch (error: any) {
      console.error('Error drafting final ata:', error);
      res.status(500).json({ error: error.message || 'Erro ao rascunhar Ata Final.' });
    }
  });

  app.post('/api/generate-final-ata', async (req, res) => {
    try {
      const { abertura, analysisResult, divergences, transcript, finalAtaData, customInstructions } = req.body;
      
      let ataData = finalAtaData;
      if (!ataData) {
        ataData = await generateFinalAta(abertura, analysisResult, divergences, transcript, customInstructions);
      }

      const buffer = await generateFinalAtaDocx(abertura, analysisResult, divergences, ataData);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', 'attachment; filename=Ata-Final.docx');
      res.send(buffer);
    } catch (error: any) {
      console.error('Error generating final ata:', error);
      res.status(500).json({ error: error.message || 'Erro ao gerar Ata Final.' });
    }
  });

  app.post('/api/extract-text', upload.array('files'), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      }
      
      let combinedText = '';
      for (const file of files) {
        const text = await extractTextFromFile(file);
        combinedText += text + '\n\n';
      }
      
      res.json({ text: combinedText.trim() });
    } catch (error: any) {
      console.error('Error extracting text:', error);
      res.status(500).json({ error: error.message || 'Erro ao extrair texto.' });
    }
  });

  app.post('/api/chat', async (req, res) => {
    res.type('json');
    try {
      const { history, message } = req.body;
      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Mensagem é obrigatória.' });
      }
      const reply = await processChat(history || [], message);
      res.json({ reply: reply || 'Não foi possível gerar uma resposta.' });
    } catch (error: any) {
      console.error('Error processing chat:', error);
      res.status(200).json({ 
        reply: `Desculpe, tive uma dificuldade momentânea para processar a sua pergunta: ${error.message || 'Erro interno'}. Por favor, tente novamente.` 
      });
    }
  });

  // ================= MEETINGS / HISTÓRICO API =================
  app.get('/api/meetings', (req, res) => {
    try {
      const search = req.query.search as string;
      const meetings = getMeetingsFromStore(search);
      res.json({ meetings });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/meetings/:id', (req, res) => {
    try {
      const meeting = getMeetingById(req.params.id);
      if (!meeting) {
        return res.status(404).json({ error: 'Reunião não encontrada no histórico.' });
      }
      res.json({ meeting });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/meetings', (req, res) => {
    try {
      const meeting = saveMeetingToStore(req.body);
      res.json({ success: true, id: meeting.id, meeting });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/meetings/:id', (req, res) => {
    try {
      const deleted = deleteMeetingFromStore(req.params.id);
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
  app.get('/api/admin/config', (req, res) => {
    res.json({
      models: getActiveModels(),
      prompts: getActivePrompts()
    });
  });

  app.post('/api/admin/config/models', (req, res) => {
    try {
      const updated = updateActiveModels(req.body);
      res.json({ success: true, models: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/config/prompts', (req, res) => {
    try {
      const updated = updateActivePrompts(req.body);
      res.json({ success: true, prompts: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 2. Logs and Audit
  app.get('/api/admin/logs', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const level = req.query.level as string;
    const category = req.query.category as string;
    const search = req.query.search as string;
    const logs = getLogs(limit, level, category, search);
    res.json({ logs });
  });

  app.post('/api/admin/logs', (req, res) => {
    const { level, category, message, details } = req.body;
    const entry = addLog(level || 'INFO', category || 'SYSTEM', message, details);
    res.json({ success: true, entry });
  });

  app.delete('/api/admin/logs', (req, res) => {
    clearLogs();
    res.json({ success: true, message: 'Logs limpos com sucesso.' });
  });

  // 3. Templates & Versioning (DOCX Upload, Inspection, Rollback & Download)
  app.get('/api/admin/templates', (req, res) => {
    const data = getTemplateVersions();
    res.json(data);
  });

  app.post('/api/admin/templates', upload.single('templateFile'), async (req, res) => {
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
      let detectedSections: any[] | undefined;
      let tableSchemas: any[] | undefined;
      let templateType: string | undefined;
      let rawTextPreview: string | undefined;

      let inferredCompanyName = companyName || '';
      let inferredPreAtaIntro = preAtaIntro || '';
      let inferredClauses = standardClauses || '';
      let inferredSignatures = signatures || '';

      if (file) {
        const isDocx = file.originalname.toLowerCase().endsWith('.docx') || 
          file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

        if (!isDocx) {
          return res.status(400).json({ error: 'O arquivo enviado deve ser obrigatoriamente um documento do Word (.docx).' });
        }

        docxBlobBase64 = file.buffer.toString('base64');
        originalFileName = file.originalname;
        fileSizeBytes = file.size;

        // 1. Inspect DOCX structure using XML parser and Mammoth
        const inspection = await parseDocxTemplate(file.buffer);
        detectedPlaceholders = inspection.detectedPlaceholders;
        structureSummary = inspection.structureSummary;
        rawTextPreview = inspection.rawTextPreview;

        // 2. Perform deep AI structural analysis of the uploaded document
        try {
          const aiAnalysis = await analyzeUploadedDocxStructureWithAI(
            inspection.rawTextPreview,
            inspection.detectedPlaceholders,
            inspection.tableHeaders,
            inspection.paragraphsCount,
            inspection.tablesCount,
            file.originalname
          );

          if (aiAnalysis) {
            structureSummary = aiAnalysis.structureSummary || structureSummary;
            detectedSections = aiAnalysis.detectedSections || [];
            tableSchemas = aiAnalysis.tableSchemas || [];
            templateType = aiAnalysis.templateType || 'Ata de Reunião';
            if (!inferredCompanyName && aiAnalysis.companyName) {
              inferredCompanyName = aiAnalysis.companyName;
            }
            if (!inferredClauses && aiAnalysis.suggestedClauses) {
              inferredClauses = aiAnalysis.suggestedClauses;
            }
            if (!inferredSignatures && aiAnalysis.suggestedSignatures) {
              inferredSignatures = aiAnalysis.suggestedSignatures;
            }
          }
        } catch (aiErr: any) {
          console.warn('Aviso ao analisar estrutura do template via IA:', aiErr.message);
        }
      }

      const templateName = name || (originalFileName ? originalFileName.replace(/\.docx$/i, '') : 'Template Personalizado');

      const newTemplate = createNewTemplateVersion({
        name: templateName,
        description: description || (structureSummary ? `Template DOCX: ${structureSummary}` : ''),
        companyName: inferredCompanyName || 'DEPARTAMENTO DE SUPRIMENTOS',
        primaryColor: primaryColor || '1F3864',
        tableHeaderBg: tableHeaderBg || 'EEEEEE',
        fontFamily: fontFamily || 'Arial',
        preAtaIntro: inferredPreAtaIntro || '',
        standardClauses: inferredClauses || '',
        signatures: inferredSignatures || '',
        docxBlobBase64,
        originalFileName,
        fileSizeBytes,
        detectedPlaceholders,
        structureSummary,
        detectedSections,
        tableSchemas,
        templateType,
        rawTextPreview
      });

      res.json({ success: true, template: newTemplate });
    } catch (error: any) {
      console.error('Error creating template version:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/admin/templates/:id/rollback', (req, res) => {
    try {
      const template = rollbackTemplate(req.params.id);
      res.json({ success: true, template });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  });

  app.get('/api/admin/templates/:id/download', (req, res) => {
    try {
      const { versions } = getTemplateVersions();
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

      // Default JSON download if no binary docx was uploaded
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

  // Global error handler for API routes (Multer errors, payload errors, etc.)
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

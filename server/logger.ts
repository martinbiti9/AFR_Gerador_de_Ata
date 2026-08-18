export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  category: 'AI' | 'DOCX' | 'CHECKLIST' | 'PROPOSAL' | 'SYSTEM' | 'AUTH' | 'ADMIN';
  message: string;
  details?: any;
}

const memoryLogs: LogEntry[] = [];
const MAX_LOGS = 300;

export function addLog(
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG',
  category: 'AI' | 'DOCX' | 'CHECKLIST' | 'PROPOSAL' | 'SYSTEM' | 'AUTH' | 'ADMIN',
  message: string,
  details?: any
): LogEntry {
  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    details: details ? (typeof details === 'object' ? JSON.parse(JSON.stringify(details)) : details) : undefined
  };

  memoryLogs.unshift(entry);
  if (memoryLogs.length > MAX_LOGS) {
    memoryLogs.pop();
  }

  // Also print to standard stdout
  const prefix = `[${entry.timestamp}] [${entry.level}] [${entry.category}]`;
  if (level === 'ERROR') {
    console.error(prefix, message, details || '');
  } else if (level === 'WARN') {
    console.warn(prefix, message, details || '');
  } else {
    console.log(prefix, message, details || '');
  }

  return entry;
}

export function getLogs(limit: number = 100, level?: string, category?: string, search?: string): LogEntry[] {
  return memoryLogs.filter(log => {
    if (level && level !== 'ALL' && log.level !== level) return false;
    if (category && category !== 'ALL' && log.category !== category) return false;
    if (search && search.trim()) {
      const q = search.toLowerCase();
      const matchMsg = log.message.toLowerCase().includes(q);
      const matchCat = log.category.toLowerCase().includes(q);
      const matchDetails = log.details ? JSON.stringify(log.details).toLowerCase().includes(q) : false;
      return matchMsg || matchCat || matchDetails;
    }
    return true;
  }).slice(0, limit);
}

export function clearLogs(): void {
  memoryLogs.length = 0;
  addLog('INFO', 'SYSTEM', 'Logs limpos pelo administrador.');
}

// Log initial startup
addLog('INFO', 'SYSTEM', 'Sistema de Auditoria e Logs iniciado com sucesso.');

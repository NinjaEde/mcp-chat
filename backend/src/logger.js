import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log-Verzeichnis erstellen falls nicht vorhanden
const logsDir = path.resolve(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log-Level
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL] || LOG_LEVELS.INFO;

class Logger {
  constructor() {
    this.logFile = path.join(logsDir, `app-${new Date().toISOString().split('T')[0]}.log`);
  }

  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] ${message}${metaStr}`;
  }

  writeLog(level, message, meta = {}) {
    const logMessage = this.formatMessage(level, message, meta);
    
    // Console-Ausgabe
    console.log(logMessage);
    
    // Datei-Ausgabe
    try {
      fs.appendFileSync(this.logFile, logMessage + '\n');
    } catch (error) {
      console.error('Fehler beim Schreiben in Log-Datei:', error);
    }
  }

  error(message, meta = {}) {
    if (currentLogLevel >= LOG_LEVELS.ERROR) {
      this.writeLog('ERROR', message, meta);
    }
  }

  warn(message, meta = {}) {
    if (currentLogLevel >= LOG_LEVELS.WARN) {
      this.writeLog('WARN', message, meta);
    }
  }

  info(message, meta = {}) {
    if (currentLogLevel >= LOG_LEVELS.INFO) {
      this.writeLog('INFO', message, meta);
    }
  }

  debug(message, meta = {}) {
    if (currentLogLevel >= LOG_LEVELS.DEBUG) {
      this.writeLog('DEBUG', message, meta);
    }
  }

  // HTTP-Request Logger
  logRequest(req, res, duration) {
    const logData = {
      method: req.method,
      url: req.url,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      user: req.user ? req.user.username : 'anonymous'
    };

    const level = res.statusCode >= 400 ? 'WARN' : 'INFO';
    this.writeLog(level, `HTTP ${req.method} ${req.url}`, logData);
  }

  // Auth-Events Logger
  logAuthEvent(event, username, ip, success = true, details = {}) {
    const logData = {
      event,
      username,
      ip,
      success,
      ...details
    };

    const level = success ? 'INFO' : 'WARN';
    this.writeLog(level, `AUTH ${event}`, logData);
  }

  // Database-Events Logger
  logDatabaseEvent(operation, table, success = true, details = {}) {
    const logData = {
      operation,
      table,
      success,
      ...details
    };

    const level = success ? 'DEBUG' : 'ERROR';
    this.writeLog(level, `DB ${operation}`, logData);
  }

  // Log-Rotation (ältere Logs löschen)
  rotateLogFiles(daysToKeep = 30) {
    try {
      const files = fs.readdirSync(logsDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      files.forEach(file => {
        if (file.startsWith('app-') && file.endsWith('.log')) {
          const filePath = path.join(logsDir, file);
          const stats = fs.statSync(filePath);
          
          if (stats.mtime < cutoffDate) {
            fs.unlinkSync(filePath);
            this.info(`Log-Datei rotiert: ${file}`);
          }
        }
      });
    } catch (error) {
      this.error('Fehler bei Log-Rotation:', { error: error.message });
    }
  }
}

const logger = new Logger();

// Log-Rotation täglich um Mitternacht
const now = new Date();
const tomorrow = new Date(now);
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(0, 0, 0, 0);

const msUntilMidnight = tomorrow.getTime() - now.getTime();
setTimeout(() => {
  logger.rotateLogFiles();
  // Dann täglich wiederholen
  setInterval(() => logger.rotateLogFiles(), 24 * 60 * 60 * 1000);
}, msUntilMidnight);

export default logger;

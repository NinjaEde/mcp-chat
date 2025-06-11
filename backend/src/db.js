import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use test database path in test environment
const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../database/mcpchat.db');
const db = new sqlite3.Database(dbPath);

console.log('[DB] Initialisiere SQLite-DB:', dbPath);

// Database-Initialisierung mit Default-Daten
async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(async () => {
      try {
        // Users Tabelle
        db.run(`CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
          if (err) console.error('[DB] Fehler beim Anlegen der Tabelle users:', err);
          else console.log('[DB] Tabelle users bereit');
        });

        // Sessions Tabelle
        db.run(`CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          token TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME,
          FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // Tools Tabelle
        db.run(`CREATE TABLE IF NOT EXISTS tools (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          description TEXT,
          config TEXT,
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Tool Calls Tabelle für Statistiken
        db.run(`CREATE TABLE IF NOT EXISTS tool_calls (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tool_id INTEGER,
          conversation_id INTEGER,
          status TEXT DEFAULT 'success',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(tool_id) REFERENCES tools(id),
          FOREIGN KEY(conversation_id) REFERENCES conversations(id)
        )`);

        // KI-Verbindungen Tabelle
        db.run(`CREATE TABLE IF NOT EXISTS ai_connections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          provider TEXT NOT NULL,
          description TEXT,
          config TEXT,
          is_active BOOLEAN DEFAULT 1,
          status TEXT DEFAULT 'disconnected',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Konversationen Tabelle
        db.run(`CREATE TABLE IF NOT EXISTS conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          title TEXT,
          ai_connection_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id),
          FOREIGN KEY(ai_connection_id) REFERENCES ai_connections(id)
        )`);

        // Nachrichten Tabelle
        db.run(`CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id INTEGER,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          tool_calls TEXT,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(conversation_id) REFERENCES conversations(id)
        )`);

        // MCP Server Tabelle
        db.run(`CREATE TABLE IF NOT EXISTS mcp_servers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          command TEXT NOT NULL,
          args TEXT,
          env TEXT,
          enabled BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Migration: Add missing columns to existing tables
        db.run(`ALTER TABLE tools ADD COLUMN type TEXT DEFAULT 'mcp'`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.log('[DB] Column type already exists in tools table');
          }
        });
        
        db.run(`ALTER TABLE tools ADD COLUMN is_active BOOLEAN DEFAULT 1`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.log('[DB] Column is_active already exists in tools table');
          }
        });
        
        db.run(`ALTER TABLE tools ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.log('[DB] Column updated_at already exists in tools table');
          }
        });

        db.run(`ALTER TABLE ai_connections ADD COLUMN provider TEXT DEFAULT 'custom'`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.log('[DB] Column provider already exists in ai_connections table');
          }
        });
        
        db.run(`ALTER TABLE ai_connections ADD COLUMN description TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.log('[DB] Column description already exists in ai_connections table');
          }
        });
        
        db.run(`ALTER TABLE ai_connections ADD COLUMN is_active BOOLEAN DEFAULT 1`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.log('[DB] Column is_active already exists in ai_connections table');
          }
        });
        
        db.run(`ALTER TABLE ai_connections ADD COLUMN status TEXT DEFAULT 'disconnected'`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.log('[DB] Column status already exists in ai_connections table');
          }
        });
        
        db.run(`ALTER TABLE ai_connections ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.log('[DB] Column updated_at already exists in ai_connections table');
          }
        });

        db.run(`ALTER TABLE messages ADD COLUMN role TEXT DEFAULT 'user'`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.log('[DB] Column role already exists in messages table');
          }
        });
        
        db.run(`ALTER TABLE messages ADD COLUMN content TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.log('[DB] Column content already exists in messages table');
          }
        });

        // Admin-User erstellen falls nicht vorhanden
        const adminPassword = await bcrypt.hash('admin', 10);
        
        db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, row) => {
          if (err) {
            console.error('[DB] Fehler beim Prüfen des Admin-Users:', err);
            return;
          }
          
          if (!row) {
            db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', 
              ['admin', adminPassword, 'admin'], 
              function(err) {
                if (err) {
                  console.error('[DB] Fehler beim Erstellen des Admin-Users:', err);
                } else {
                  console.log('[DB] Admin-User erstellt (username: admin, password: admin)');
                }
              }
            );
          } else {
            console.log('[DB] Admin-User bereits vorhanden');
          }
        });

        // Default Tools erstellen
        const defaultTools = [
          {
            name: 'Websuche',
            description: 'Durchsuche das Web nach aktuellen Informationen',
            protocol: 'mcp',
            config: JSON.stringify({ endpoint: '/search', method: 'GET' })
          },
          {
            name: 'Rechner',
            description: 'Führe mathematische Berechnungen aus',
            protocol: 'mcp',
            config: JSON.stringify({ endpoint: '/calculate', method: 'POST' })
          },
          {
            name: 'Dateisystem',
            description: 'Lese und schreibe Dateien',
            protocol: 'mcp',
            config: JSON.stringify({ endpoint: '/filesystem', method: 'POST' })
          }
        ];

        db.get('SELECT COUNT(*) as count FROM tools', [], (err, row) => {
          if (!err && row.count === 0) {
            defaultTools.forEach(tool => {
              db.run('INSERT INTO tools (name, description, protocol, config) VALUES (?, ?, ?, ?)',
                [tool.name, tool.description, tool.protocol, tool.config],
                (err) => {
                  if (err) console.error('[DB] Fehler beim Erstellen des Default-Tools:', err);
                }
              );
            });
            console.log('[DB] Default-Tools erstellt');
          }
        });

        // Default AI-Verbindungen erstellen
        const defaultAIConnections = [
          {
            name: 'OpenAI GPT-4',
            type: 'openai',
            url: 'https://api.openai.com/v1/chat/completions',
            config: JSON.stringify({ model: 'gpt-4', temperature: 0.7 })
          },
          {
            name: 'Ollama Local',
            type: 'ollama',
            url: 'http://localhost:11434/api/chat',
            config: JSON.stringify({ model: 'llama3.2:latest', temperature: 0.7 })
          }
        ];

        db.get('SELECT COUNT(*) as count FROM ai_connections', [], (err, row) => {
          if (!err && row.count === 0) {
            defaultAIConnections.forEach(ai => {
              db.run('INSERT INTO ai_connections (name, type, url, config) VALUES (?, ?, ?, ?)',
                [ai.name, ai.type, ai.url, ai.config],
                (err) => {
                  if (err) console.error('[DB] Fehler beim Erstellen der Default-AI-Verbindung:', err);
                }
              );
            });
            console.log('[DB] Default-AI-Verbindungen erstellt');
          }
        });

        console.log('[DB] Datenbank-Initialisierung abgeschlossen');
        resolve();
      } catch (error) {
        console.error('[DB] Fehler bei der Initialisierung:', error);
        reject(error);
      }
    });
  });
}

// Initialisierung starten
initializeDatabase().catch(console.error);

export default db;

const express = require('express');
const cors = require('cors');
const request = require('supertest');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Mock database in-memory for testing
const mockDB = {
  users: [],
  conversations: [],
  tools: [],
  sessions: []
};

// Mock auth functions
const auth = {
  hashPassword: async (password) => {
    return await bcrypt.hash(password, 10);
  },
  
  comparePassword: async (password, hash) => {
    return await bcrypt.compare(password, hash);
  },
  
  generateToken: (user) => {
    return jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      'test-secret-key',
      { expiresIn: '24h' }
    );
  },
  
  verifyToken: (token) => {
    try {
      return jwt.verify(token, 'test-secret-key');
    } catch (error) {
      return null;
    }
  },
  
  saveSession: async (userId, token) => {
    mockDB.sessions.push({ userId, token, createdAt: new Date() });
  },
  
  authenticateToken: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }
    
    const user = auth.verifyToken(token);
    if (!user) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    
    req.user = user;
    next();
  }
};

// Mock database functions
const db = {
  get: (query, params, callback) => {
    if (query.includes('SELECT * FROM users WHERE username = ?')) {
      const user = mockDB.users.find(u => u.username === params[0]);
      return callback(null, user);
    }
    if (query.includes('SELECT * FROM conversations WHERE id = ? AND user_id = ?')) {
      const conversation = mockDB.conversations.find(c => c.id === params[0] && c.user_id === params[1]);
      return callback(null, conversation);
    }
    callback(null, null);
  },
  
  all: (query, params, callback) => {
    if (query.includes('SELECT c.*, COUNT(m.id) as message_count FROM conversations')) {
      const conversations = mockDB.conversations
        .filter(c => c.user_id === params[0])
        .map(c => ({ ...c, message_count: 0 }));
      return callback(null, conversations);
    }
    if (query.includes('SELECT t.*, COUNT(tc.id) as usage_count FROM tools')) {
      const tools = mockDB.tools.map(t => ({ ...t, usage_count: 0 }));
      return callback(null, tools);
    }
    callback(null, []);
  },
  
  run: (query, params, callback) => {
    if (query.includes('INSERT INTO users')) {
      const user = {
        id: mockDB.users.length + 1,
        username: params[0],
        password: params[1],
        role: params[2],
        created_at: new Date().toISOString()
      };
      mockDB.users.push(user);
      return callback.call({ lastID: user.id }, null);
    }
    if (query.includes('INSERT INTO conversations')) {
      const conversation = {
        id: mockDB.conversations.length + 1,
        user_id: params[0],
        title: params[1],
        ai_connection_id: params[2],
        created_at: new Date().toISOString()
      };
      mockDB.conversations.push(conversation);
      return callback.call({ lastID: conversation.id }, null);
    }
    if (query.includes('INSERT INTO tools')) {
      const tool = {
        id: mockDB.tools.length + 1,
        name: params[0],
        type: params[1],
        description: params[2],
        config: params[3],
        is_active: 1,
        created_at: new Date().toISOString()
      };
      mockDB.tools.push(tool);
      return callback.call({ lastID: tool.id }, null);
    }
    if (query.includes('DELETE FROM conversations WHERE id = ?')) {
      const index = mockDB.conversations.findIndex(c => c.id === params[0]);
      if (index > -1) {
        mockDB.conversations.splice(index, 1);
      }
      return callback(null);
    }
    if (query.includes('DELETE FROM messages WHERE conversation_id = ?')) {
      return callback(null);
    }
    callback(null);
  }
};

// Mock logger
const logger = {
  info: (message, data) => console.log(`INFO: ${message}`, data || ''),
  error: (message, data) => console.error(`ERROR: ${message}`, data || ''),
  warn: (message, data) => console.warn(`WARN: ${message}`, data || ''),
  debug: (message, data) => console.debug(`DEBUG: ${message}`, data || '')
};

// Create test app
const createTestApp = () => {
  const app = express();

  // Basic middleware
  app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:3002', 'http://localhost:5174'],
    credentials: true
  }));
  app.use(express.json());

  // Health route
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  });

  // Auth routes
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: 'Username und Passwort erforderlich' });
      }
      
      db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) {
          logger.error('Database error during login', { error: err.message });
          return res.status(500).json({ error: 'Serverfehler' });
        }
        
        if (!user) {
          return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
        }
        
        const valid = await auth.comparePassword(password, user.password);
        if (!valid) {
          return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
        }
        
        const token = auth.generateToken(user);
        await auth.saveSession(user.id, token);
        
        res.json({
          success: true,
          token,
          user: {
            id: user.id,
            username: user.username,
            role: user.role
          }
        });
      });
    } catch (error) {
      logger.error('Login error', { error: error.message });
      res.status(500).json({ error: 'Serverfehler' });
    }
  });

  // Conversation routes
  app.get('/api/conversations', auth.authenticateToken, (req, res) => {
    db.all(`
      SELECT c.*, COUNT(m.id) as message_count 
      FROM conversations c 
      LEFT JOIN messages m ON c.id = m.conversation_id 
      WHERE c.user_id = ? 
      GROUP BY c.id 
      ORDER BY c.created_at DESC
    `, [req.user.id], (err, conversations) => {
      if (err) {
        logger.error('Error fetching conversations', { error: err.message, userId: req.user.id });
        return res.status(500).json({ error: 'Fehler beim Laden der Konversationen' });
      }
      
      res.json({ success: true, conversations });
    });
  });

  app.post('/api/conversations', auth.authenticateToken, (req, res) => {
    const { title, ai_connection_id } = req.body;
    const conversationTitle = title || 'Neue Unterhaltung';
    
    db.run(
      'INSERT INTO conversations (user_id, title, ai_connection_id) VALUES (?, ?, ?)',
      [req.user.id, conversationTitle, ai_connection_id || null],
      function(err) {
        if (err) {
          logger.error('Error creating conversation', { error: err.message });
          return res.status(500).json({ error: 'Fehler beim Erstellen der Konversation' });
        }
        
        const conversation = {
          id: this.lastID,
          title: conversationTitle,
          user_id: req.user.id,
          ai_connection_id: ai_connection_id || null,
          created_at: new Date().toISOString()
        };
        
        res.json({ success: true, conversation });
      }
    );
  });

  app.delete('/api/conversations/:id', auth.authenticateToken, (req, res) => {
    const conversationId = parseInt(req.params.id);
    
    if (!conversationId || isNaN(conversationId)) {
      return res.status(400).json({ error: 'Ungültige Konversations-ID' });
    }

    // First verify the conversation belongs to the user
    db.get('SELECT * FROM conversations WHERE id = ? AND user_id = ?', 
      [conversationId, req.user.id], (err, conversation) => {
      if (err) {
        logger.error('Database error during conversation verification', { error: err.message });
        return res.status(500).json({ error: 'Serverfehler' });
      }
      
      if (!conversation) {
        return res.status(404).json({ error: 'Konversation nicht gefunden' });
      }
      
      // Delete all messages first (foreign key constraint)
      db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId], (err) => {
        if (err) {
          logger.error('Error deleting messages', { error: err.message, conversationId });
          return res.status(500).json({ error: 'Fehler beim Löschen der Nachrichten' });
        }
        
        // Then delete the conversation
        db.run('DELETE FROM conversations WHERE id = ?', [conversationId], function(err) {
          if (err) {
            logger.error('Error deleting conversation', { error: err.message, conversationId });
            return res.status(500).json({ error: 'Fehler beim Löschen der Konversation' });
          }
          
          logger.info('Conversation deleted', { conversationId, userId: req.user.id });
          res.json({ success: true, message: 'Konversation erfolgreich gelöscht' });
        });
      });
    });
  });

  // Tools APIs
  app.get('/api/tools', auth.authenticateToken, (req, res) => {
    db.all(`
      SELECT t.*, COUNT(tc.id) as usage_count 
      FROM tools t 
      LEFT JOIN tool_calls tc ON t.id = tc.tool_id 
      GROUP BY t.id 
      ORDER BY t.created_at DESC
    `, [], (err, tools) => {
      if (err) {
        logger.error('Error fetching tools', { error: err.message });
        return res.status(500).json({ error: 'Fehler beim Laden der Tools' });
      }
      
      const formattedTools = tools.map(tool => ({
        ...tool,
        config: JSON.parse(tool.config || '{}')
      }));
      
      res.json({ success: true, tools: formattedTools });
    });
  });

  app.post('/api/tools', auth.authenticateToken, (req, res) => {
    const { name, type, description, config } = req.body;
    
    if (!name || !type || !config) {
      return res.status(400).json({ error: 'Name, Typ und Konfiguration sind erforderlich' });
    }
    
    const configJson = JSON.stringify(config);
    
    db.run(`
      INSERT INTO tools (name, type, description, config, is_active, created_at) 
      VALUES (?, ?, ?, ?, 1, datetime('now'))
    `, [name, type, description || '', configJson], function(err) {
      if (err) {
        logger.error('Error creating tool', { error: err.message });
        return res.status(500).json({ error: 'Fehler beim Erstellen des Tools' });
      }
      
      db.get('SELECT * FROM tools WHERE id = ?', [this.lastID], (err, tool) => {
        if (err) {
          logger.error('Error fetching created tool', { error: err.message });
          return res.status(500).json({ error: 'Tool erstellt, aber Fehler beim Laden' });
        }
        
        const formattedTool = {
          ...tool,
          config: JSON.parse(tool.config || '{}')
        };
        
        logger.info('Tool created', { tool_id: tool.id, name: tool.name });
        res.json({ success: true, tool: formattedTool });
      });
    });
  });

  return app;
};

// Helper function to create test user and get token
const createTestUserAndToken = async (app) => {
  // Create test user
  const hashedPassword = await auth.hashPassword('testpassword');
  
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
      ['testuser', hashedPassword, 'user'],
      function(err) {
        if (err) {
          reject(err);
          return;
        }
        
        // Login to get token
        request(app)
          .post('/api/auth/login')
          .send({
            username: 'testuser',
            password: 'testpassword'
          })
          .expect(200)
          .end((err, res) => {
            if (err) {
              reject(err);
              return;
            }
            
            resolve({
              userId: this.lastID,
              token: res.body.token,
              user: res.body.user
            });
          });
      }
    );
  });
};

// Reset mock database for testing
const resetMockDB = () => {
  mockDB.users = [];
  mockDB.conversations = [];
  mockDB.tools = [];
  mockDB.sessions = [];
};

module.exports = {
  createTestApp,
  createTestUserAndToken,
  resetMockDB
};

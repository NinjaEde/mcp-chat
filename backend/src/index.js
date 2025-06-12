import express from 'express';
import cors from 'cors';
import db from './db.js';
import logger from './logger.js';
import auth from './auth.js';
import aiService from './aiService.js';

console.log('✓ All imports loaded successfully');

const app = express();

// Global storage for SSE connections
const sseConnections = new Map();

// Dynamic CORS configuration
const getAllowedOrigins = () => {
  const defaultOrigins = [
    'http://localhost:5173',
    'http://localhost:5174', 
    'http://localhost:5175',
    'http://localhost:3002'
  ];
  
  // Environment variables for custom origins
  const customOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()) || [];
  
  // Docker environments
  const dockerOrigins = [
    'http://frontend:5173',
    'http://frontend:80',
    'http://frontend',
    process.env.FRONTEND_URL
  ].filter(Boolean);
  
  return [...defaultOrigins, ...customOrigins, ...dockerOrigins];
};

// Helper function to get CORS origin for headers
const getCorsOrigin = (req) => {
  const allowedOrigins = getAllowedOrigins();
  const requestOrigin = req.headers.origin;
  
  // If no origin header (e.g., same-origin requests), allow
  if (!requestOrigin) return '*';
  
  // Check if origin is in allowed list
  if (allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  
  // For development, allow localhost with any port
  if (process.env.NODE_ENV !== 'production') {
    if (requestOrigin?.match(/^https?:\/\/localhost:\d+$/)) {
      return requestOrigin;
    }
  }
  
  // Default fallback
  return allowedOrigins[0];
};

// Basic middleware
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();
    
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // For development, allow localhost with any port
    if (process.env.NODE_ENV !== 'production') {
      if (origin.match(/^https?:\/\/localhost:\d+$/)) {
        return callback(null, true);
      }
    }
    
    // Log rejected origins for debugging
    logger.warn('CORS: Origin not allowed', { origin, allowedOrigins });
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());

// Middleware für Token aus Query-Parameter
const authenticateTokenFromQuery = (req, res, next) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    console.log('SSE Auth failed: No token provided');
    return res.status(401).json({ error: 'Token required' });
  }
  
  try {
    const user = auth.verifyToken(token);
    console.log('SSE Auth success for user:', user.id);
    req.user = user;
    next();
  } catch (error) {
    console.log('SSE Auth failed: Invalid token', error.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Basic routes
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

app.get('/api/auth/me', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const user = auth.verifyToken(token);
  
  if (!user) {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }
  
  res.json({ user });
});

app.post('/api/auth/logout', auth.authenticateToken, (req, res) => {
  // In JWT-based authentication, logout is typically handled client-side
  // by removing the token. This endpoint can be used for logging purposes
  // or for token blacklisting in more advanced scenarios.
  
  logger.info('User logged out', { userId: req.user.id, username: req.user.username });
  
  res.json({ 
    success: true, 
    message: 'Erfolgreich abgemeldet' 
  });
});

// Conversation routes
app.get('/api/conversations', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const user = auth.verifyToken(token);
  
  if (!user) {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }

  const query = `
    SELECT c.*, COUNT(m.id) as message_count 
    FROM conversations c 
    LEFT JOIN messages m ON c.id = m.conversation_id 
    WHERE c.user_id = ? 
    GROUP BY c.id 
    ORDER BY c.created_at DESC 
    LIMIT 20
  `;
  
  db.all(query, [user.id], (err, rows) => {
    if (err) {
      logger.error('Error fetching conversations', { error: err.message, userId: user.id });
      return res.status(500).json({ error: 'Fehler beim Laden der Konversationen' });
    }
    
    const conversations = rows.map(conv => ({
      ...conv,
      metadata: conv.metadata ? JSON.parse(conv.metadata) : {}
    }));
    
    res.json({ success: true, conversations });
  });
});

app.post('/api/conversations', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const user = auth.verifyToken(token);
  
  if (!user) {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }

  const { title } = req.body;
  const conversationTitle = title || 'Neue Unterhaltung';
  
  db.run(
    'INSERT INTO conversations (user_id, title) VALUES (?, ?)',
    [user.id, conversationTitle],
    function(err) {
      if (err) {
        logger.error('Error creating conversation', { error: err.message, userId: user.id });
        return res.status(500).json({ error: 'Fehler beim Erstellen der Konversation' });
      }
      
      res.status(201).json({
        success: true,
        conversation: {
          id: this.lastID,
          title: conversationTitle,
          user_id: user.id,
          created_at: new Date().toISOString()
        }
      });
    }
  );
});

app.get('/api/conversations/:id', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const user = auth.verifyToken(token);
  
  if (!user) {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }

  const conversationId = parseInt(req.params.id);
  
  db.get('SELECT * FROM conversations WHERE id = ? AND user_id = ?', 
    [conversationId, user.id], (err, conversation) => {
    if (err) {
      logger.error('Database error fetching conversation', { error: err.message });
      return res.status(500).json({ error: 'Serverfehler' });
    }
    
    if (!conversation) {
      return res.status(404).json({ error: 'Konversation nicht gefunden' });
    }
    
    db.all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', 
      [conversationId], (err, messages) => {
      if (err) {
        logger.error('Error fetching messages', { error: err.message });
        return res.status(500).json({ error: 'Fehler beim Laden der Nachrichten' });
      }
      
      const formattedMessages = messages.map(msg => ({
        ...msg,
        role: msg.role || msg.sender || 'user',
        content: msg.content || msg.text || '',
        metadata: msg.metadata ? JSON.parse(msg.metadata) : {}
      }));
      
      res.json({
        success: true,
        conversation: {
          ...conversation,
          metadata: conversation.metadata ? JSON.parse(conversation.metadata) : {},
          messages: formattedMessages
        }
      });
    });
  });
});

// Get messages for a specific conversation
app.get('/api/conversations/:id/messages', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const user = auth.verifyToken(token);
  
  if (!user) {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }

  const conversationId = parseInt(req.params.id);
  
  // First verify the conversation belongs to the user
  db.get('SELECT * FROM conversations WHERE id = ? AND user_id = ?', 
    [conversationId, user.id], (err, conversation) => {
    if (err) {
      logger.error('Database error checking conversation', { error: err.message });
      return res.status(500).json({ error: 'Serverfehler' });
    }
    
    if (!conversation) {
      return res.status(404).json({ error: 'Konversation nicht gefunden' });
    }
    
    // Fetch messages for the conversation
    db.all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', 
      [conversationId], (err, messages) => {
      if (err) {
        logger.error('Error fetching messages', { error: err.message });
        return res.status(500).json({ error: 'Fehler beim Laden der Nachrichten' });
      }
      
      const formattedMessages = messages.map(msg => ({
        ...msg,
        role: msg.role || msg.sender || 'user',
        content: msg.content || msg.text || '',
        metadata: msg.metadata ? JSON.parse(msg.metadata) : {}
      }));
      
      res.json({
        success: true,
        conversation: {
          ...conversation,
          metadata: conversation.metadata ? JSON.parse(conversation.metadata) : {},
          messages: formattedMessages
        }
      });
    });
  });
});

// OPTIONS preflight für SSE endpoint
app.options('/api/conversations/:id/stream', (req, res) => {
  const corsOrigin = getCorsOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Cache-Control, Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.status(200).end();
});

// SSE endpoint for streaming AI responses
app.get('/api/conversations/:id/stream', authenticateTokenFromQuery, (req, res) => {
  const conversationId = parseInt(req.params.id);
  console.log('SSE endpoint called for conversation:', conversationId);
  console.log('User authenticated:', req.user.id);
  
  // Verify conversation belongs to user
  db.get('SELECT * FROM conversations WHERE id = ? AND user_id = ?', 
    [conversationId, req.user.id], (err, conversation) => {
    if (err || !conversation) {
      console.log('Conversation not found or access denied:', { conversationId, userId: req.user.id, err });
      return res.status(404).json({ error: 'Konversation nicht gefunden' });
    }
    
    console.log('Conversation found, setting up SSE for:', conversationId);
    
    // Setup SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    
    const corsOrigin = getCorsOrigin(req);
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Cache-Control, Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    // CRITICAL: Send headers immediately
    res.writeHead(200);
    
    // Send initial padding and connection confirmation immediately
    res.write(': SSE Connection Established\n\n');
    res.write('data: {"type": "connected"}\n\n');
    
    // Force flush immediately
    if (typeof res.flush === 'function') {
      res.flush();
    }

    logger.info('SSE connection established', { conversationId, userId: req.user.id });
    
    // Store connection in map
    if (!sseConnections.has(conversationId)) {
      sseConnections.set(conversationId, []);
    }
    sseConnections.get(conversationId).push(res);
    
    console.log('SSE connections for conversation', conversationId, ':', sseConnections.get(conversationId).length);

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
        if (typeof res.flush === 'function') res.flush();
      } catch (e) {
        console.log('Heartbeat failed, cleaning up connection');
        clearInterval(heartbeat);
      }
    }, 30000); // Every 30 seconds
    
    // Handle client disconnect
    const cleanup = () => {
      clearInterval(heartbeat);
      logger.info('SSE connection closed', { conversationId });
      // Remove from connections map
      const connections = sseConnections.get(conversationId) || [];
      const index = connections.indexOf(res);
      if (index > -1) {
        connections.splice(index, 1);
        console.log('Removed SSE connection. Remaining:', connections.length);
      }
      if (connections.length === 0) {
        sseConnections.delete(conversationId);
      }
    };
    
    req.on('close', cleanup);
    req.on('aborted', cleanup);
    req.on('error', (error) => {
      console.error('SSE connection error:', error.message);
      cleanup();
    });
    
    res.on('error', (error) => {
      console.error('SSE response error:', error.message);
      cleanup();
    });
  });
});

// SINGLE POST ROUTE FOR MESSAGES - KEINE DUPLIKATE!
app.post('/api/conversations/:id/messages', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const user = auth.verifyToken(token);
  
  if (!user) {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }

  const conversationId = parseInt(req.params.id);
  const { content, role = 'user', ai_connection_id, model, stream = true } = req.body;
  
  logger.info('Received message request', { 
    conversationId, 
    role, 
    stream, 
    contentLength: content?.length 
  });
  
  if (!content || content.trim() === '') {
    return res.status(400).json({ error: 'Nachrichteninhalt erforderlich' });
  }
  
  if (!['user', 'assistant', 'system'].includes(role)) {
    return res.status(400).json({ error: 'Ungültige Nachrichtenrolle' });
  }
  
  // Check if conversation belongs to user
  db.get('SELECT * FROM conversations WHERE id = ? AND user_id = ?', 
    [conversationId, user.id], (err, conversation) => {
    if (err) {
      logger.error('Database error checking conversation', { error: err.message });
      return res.status(500).json({ error: 'Serverfehler' });
    }
    
    if (!conversation) {
      return res.status(404).json({ error: 'Konversation nicht gefunden' });
    }
    
    // Save user message
    db.run(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
      [conversationId, role, content],
      function(err) {
        if (err) {
          logger.error('Error saving message', { error: err.message });
          return res.status(500).json({ error: 'Fehler beim Speichern der Nachricht' });
        }
        
        const messageId = this.lastID;
        
        logger.info('Message saved successfully', { 
          messageId, 
          conversationId, 
          role, 
          willStream: stream && role === 'user' 
        });
        
        // Send response immediately
        res.json({
          success: true,
          message: {
            id: messageId,
            conversation_id: conversationId,
            role,
            content,
            created_at: new Date().toISOString()
          },
          streaming: stream && role === 'user'
        });
        
        // For user messages, generate AI response AFTER sending response
        if (role === 'user') {
          logger.info('Starting AI response generation');
          // Wait a bit to ensure SSE connections are established
          setTimeout(() => {
            generateStreamingAIResponse(conversationId, ai_connection_id, model);
          }, 500); // 500ms delay to allow SSE connection to establish
        }
      }
    );
  });
});

// SINGLE FUNCTION DEFINITION - KEINE DUPLIKATE!
async function generateStreamingAIResponse(conversationId, aiConnectionId, model) {
  try {
    logger.info('Starting streaming AI response generation', { conversationId, aiConnectionId, model });
    
    // Check if there are any SSE connections for this conversation
    const connections = sseConnections.get(conversationId) || [];
    logger.info('SSE connections check', { conversationId, connectionCount: connections.length });
    
    if (connections.length === 0) {
      logger.warn('No SSE connections found for conversation - waiting briefly', { conversationId });
      // Wait a bit longer for SSE connection to establish
      await new Promise(resolve => setTimeout(resolve, 2000)); // Increased to 2 seconds
      const connectionsAfterWait = sseConnections.get(conversationId) || [];
      logger.info('SSE connections after wait', { conversationId, connectionCount: connectionsAfterWait.length });
      
      // If still no connections, continue anyway - user might have non-streaming setup
      if (connectionsAfterWait.length === 0) {
        logger.warn('No SSE connections found after wait, continuing with non-streaming fallback', { conversationId });
      }
    }

    // Get AI connection
    let aiConnection;
    if (aiConnectionId) {
      await new Promise((resolve, reject) => {
        db.get('SELECT * FROM ai_connections WHERE id = ? AND is_active = 1', [aiConnectionId], (err, connection) => {
          if (err) reject(err);
          else if (!connection) reject(new Error('AI connection not found or inactive'));
          else {
            aiConnection = connection;
            resolve();
          }
        });
      });
    } else {
      await new Promise((resolve, reject) => {
        db.get('SELECT * FROM ai_connections WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1', [], (err, connection) => {
          if (err) reject(err);
          else if (!connection) {
            // Kein Fallback zu Demo - werfe Fehler
            reject(new Error('No active AI connection found. Please configure an AI connection first.'));
          } else {
            aiConnection = connection;
            resolve();
          }
        });
      });
    }

    logger.info('AI connection found', { provider: aiConnection.provider, name: aiConnection.name });

    // Get conversation history
    const messages = await new Promise((resolve, reject) => {
      db.all('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', 
        [conversationId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    logger.info('Generating response with AI service', { 
      conversationId, 
      provider: aiConnection.provider, 
      messageCount: messages.length 
    });

    // Check again if connections exist before starting generation
    const currentConnections = sseConnections.get(conversationId) || [];
    const useStreaming = currentConnections.length > 0;
    
    logger.info('Starting AI response generation', { 
      conversationId, 
      useStreaming, 
      connectionCount: currentConnections.length,
      provider: aiConnection.provider
    });

    // Generate AI response using the proper aiService
    let fullResponse;
    
    if (useStreaming && typeof aiService.generateStreamingResponse === 'function') {
      try {
        logger.info('Using streaming generation', { provider: aiConnection.provider });
        fullResponse = await aiService.generateStreamingResponse(
          aiConnection, 
          messages, 
          model, 
          (chunk) => {
            logger.debug('Broadcasting chunk', { conversationId, chunkLength: chunk.length });
            broadcastSSEChunk(conversationId, chunk);
          }
        );
      } catch (error) {
        logger.error('Streaming generation failed, falling back to regular generation', { 
          error: error.message, 
          conversationId 
        });
        
        // Fallback to regular generation if streaming fails
        if (typeof aiService.generateResponse === 'function') {
          fullResponse = await aiService.generateResponse(aiConnection, messages, model);
          
          // Send the full response as one chunk if we have connections
          if (fullResponse && currentConnections.length > 0) {
            broadcastSSEChunk(conversationId, fullResponse);
          }
        } else {
          throw new Error('No AI response generation method available');
        }
      }
    } else {
      // Regular generation without streaming
      logger.info('Using regular generation', { 
        provider: aiConnection.provider,
        reason: useStreaming ? 'no_streaming_support' : 'no_connections'
      });
      
      if (typeof aiService.generateResponse === 'function') {
        fullResponse = await aiService.generateResponse(aiConnection, messages, model);
        
        // Simulate streaming by sending the full response as chunks if we have connections
        if (fullResponse && currentConnections.length > 0) {
          // Split response into chunks for better UX
          const chunkSize = 50;
          for (let i = 0; i < fullResponse.length; i += chunkSize) {
            const chunk = fullResponse.slice(i, i + chunkSize);
            broadcastSSEChunk(conversationId, chunk);
            // Small delay between chunks to simulate streaming
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
      } else {
        throw new Error('AI service generateResponse method not available');
      }
    }
    
    logger.info('AI response generation completed', { 
      conversationId, 
      responseLength: fullResponse?.length || 0,
      provider: aiConnection.provider
    });
    
    // Validate response
    if (!fullResponse || fullResponse.trim() === '') {
      throw new Error('Empty response from AI service');
    }
    
    // Save complete AI response
    db.run(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
      [conversationId, 'assistant', fullResponse],
      function(err) {
        if (err) {
          logger.error('Error saving AI response', { error: err.message, conversationId });
          broadcastSSEError(conversationId, 'Fehler beim Speichern der Antwort');
        } else {
          logger.info('AI response saved', { 
            conversationId, 
            provider: aiConnection.provider,
            response_length: fullResponse.length,
            message_id: this.lastID
          });
          
          // Send completion event
          broadcastSSEComplete(conversationId, this.lastID);
        }
      }
    );

  } catch (error) {
    logger.error('Error generating AI response', { 
      error: error.message, 
      stack: error.stack,
      conversationId,
      aiConnectionId 
    });
    
    const errorMessage = `Entschuldigung, ich konnte keine Antwort generieren: ${error.message}`;
    
    // Send error via SSE
    broadcastSSEError(conversationId, errorMessage);
    
    // Save error message
    db.run(
      'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
      [conversationId, 'assistant', errorMessage],
      (err) => {
        if (err) {
          logger.error('Error saving error message', { error: err.message });
        }
      }
    );
  }
}

// Broadcast functions for SSE
function broadcastSSEChunk(conversationId, content) {
  const connections = sseConnections.get(conversationId) || [];
  logger.info('Broadcasting chunk to connections', { conversationId, connectionCount: connections.length, chunkLength: content.length });
  
  if (connections.length === 0) {
    logger.warn('No SSE connections found for conversation', { conversationId });
    return;
  }
  
  const data = JSON.stringify({
    type: 'chunk',
    content,
    conversation_id: conversationId
  });
  
  connections.forEach((res, index) => {
    try {
      res.write(`data: ${data}\n\n`);
      if (typeof res.flush === 'function') res.flush();
      logger.debug('Chunk sent to connection', { conversationId, connectionIndex: index });
    } catch (error) {
      logger.error('Error broadcasting SSE chunk', { error: error.message, conversationId, connectionIndex: index });
      // Remove broken connection
      connections.splice(index, 1);
    }
  });
}

function broadcastSSEComplete(conversationId, messageId) {
  const connections = sseConnections.get(conversationId) || [];
  logger.info('Broadcasting completion to connections', { conversationId, connectionCount: connections.length, messageId });
  
  const data = JSON.stringify({
    type: 'complete',
    conversation_id: conversationId,
    message_id: messageId
  });
  
  connections.forEach((res, index) => {
    try {
      res.write(`data: ${data}\n\n`);
      if (typeof res.flush === 'function') res.flush();
    } catch (error) {
      logger.error('Error broadcasting SSE complete', { error: error.message, conversationId, connectionIndex: index });
      // Remove broken connection
      connections.splice(index, 1);
    }
  });
  
  // Don't auto-close connections - let the frontend decide when to disconnect
  logger.info('Completion broadcast sent, connections remain open', { conversationId, connectionCount: connections.length });
}

function broadcastSSEError(conversationId, errorMessage) {
  const connections = sseConnections.get(conversationId) || [];
  logger.info('Broadcasting error to connections', { conversationId, connectionCount: connections.length });
  
  const data = JSON.stringify({
    type: 'error',
    content: errorMessage,
    conversation_id: conversationId
  });
  
  connections.forEach((res, index) => {
    try {
      res.write(`data: ${data}\n\n`);
    } catch (error) {
      logger.error('Error broadcasting SSE error', { error: error.message, conversationId, connectionIndex: index });
      // Remove broken connection
      connections.splice(index, 1);
    }
  });
}

// Delete conversation endpoint
console.log('🚀 REGISTERING DELETE ENDPOINT 🚀');
app.delete('/api/conversations/:id', auth.authenticateToken, (req, res) => {
  console.log('DELETE conversation endpoint called:', req.params.id);
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
    
    // Parse config JSON
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
    
    // Get the created tool
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

app.put('/api/tools/:id', auth.authenticateToken, (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  // Build dynamic update query
  const fields = [];
  const values = [];
  
  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.type !== undefined) {
    fields.push('type = ?');
    values.push(updates.type);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.config !== undefined) {
    fields.push('config = ?');
    values.push(JSON.stringify(updates.config));
  }
  if (updates.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(updates.is_active ? 1 : 0);
  }
  
  if (fields.length === 0) {
    return res.status(400).json({ error: 'Keine Felder zum Aktualisieren' });
  }
  
  fields.push('updated_at = datetime(\'now\')');
  values.push(id);
  
  db.run(`UPDATE tools SET ${fields.join(', ')} WHERE id = ?`, values, function(err) {
    if (err) {
      logger.error('Error updating tool', { error: err.message, tool_id: id });
      return res.status(500).json({ error: 'Fehler beim Aktualisieren des Tools' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Tool nicht gefunden' });
    }
    
    logger.info('Tool updated', { tool_id: id });
    res.json({ success: true });
  });
});

app.delete('/api/tools/:id', auth.authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM tools WHERE id = ?', [id], function(err) {
    if (err) {
      logger.error('Error deleting tool', { error: err.message, tool_id: id });
      return res.status(500).json({ error: 'Fehler beim Löschen des Tools' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Tool nicht gefunden' });
    }
    
    logger.info('Tool deleted', { tool_id: id });
    res.json({ success: true });
  });
});

// AI Connections APIs
app.get('/api/ai-connections', auth.authenticateToken, (req, res) => {
  db.all(`
    SELECT ac.*, COUNT(c.id) as conversation_count 
    FROM ai_connections ac 
    LEFT JOIN conversations c ON ac.id = c.ai_connection_id 
    GROUP BY ac.id 
    ORDER BY ac.created_at DESC
  `, [], (err, connections) => {
    if (err) {
      logger.error('Error fetching AI connections', { error: err.message });
      return res.status(500).json({ error: 'Fehler beim Laden der KI-Verbindungen' });
    }
    
    // Parse config JSON and remove sensitive data
    const formattedConnections = connections.map(conn => {
      const config = JSON.parse(conn.config || '{}');
      // Don't send API keys to frontend
      if (config.apiKey) {
        config.apiKey = '***';
      }
      
      return {
        ...conn,
        config
      };
    });
    
    res.json({ success: true, ai_connections: formattedConnections });
  });
});

app.post('/api/ai-connections', auth.authenticateToken, (req, res) => {
  const { name, provider, description, config } = req.body;
  
  if (!name || !provider || !config) {
    return res.status(400).json({ error: 'Name, Anbieter und Konfiguration sind erforderlich' });
  }
  
  const configJson = JSON.stringify(config);
  
  db.run(`
    INSERT INTO ai_connections (name, provider, description, config, is_active, created_at) 
    VALUES (?, ?, ?, ?, 1, datetime('now'))
  `, [name, provider, description || '', configJson], function(err) {
    if (err) {
      logger.error('Error creating AI connection', { error: err.message });
      return res.status(500).json({ error: 'Fehler beim Erstellen der KI-Verbindung' });
    }
    
    // Get the created connection
    db.get('SELECT * FROM ai_connections WHERE id = ?', [this.lastID], (err, connection) => {
      if (err) {
        logger.error('Error fetching created AI connection', { error: err.message });
        return res.status(500).json({ error: 'KI-Verbindung erstellt, aber Fehler beim Laden' });
      }
      
      const config = JSON.parse(connection.config || '{}');
      if (config.apiKey) {
        config.apiKey = '***';
      }
      
      const formattedConnection = {
        ...connection,
        config
      };
      
      logger.info('AI connection created', { connection_id: connection.id, name: connection.name });
      res.json({ success: true, ai_connection: formattedConnection });
    });
  });
});

app.post('/api/ai-connections/:id/test', auth.authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM ai_connections WHERE id = ?', [id], async (err, connection) => {
    if (err) {
      logger.error('Error fetching AI connection for test', { error: err.message });
      return res.status(500).json({ error: 'Fehler beim Laden der Verbindung' });
    }
    
    if (!connection) {
      return res.status(404).json({ error: 'Verbindung nicht gefunden' });
    }
    
    try {
      const config = JSON.parse(connection.config || '{}');
      let connected = false;
      
      // Simple connection test based on provider
      if (connection.provider === 'ollama') {
        // Test Ollama connection
        try {
          const response = await fetch(`${config.endpoint || 'http://localhost:11434'}/api/tags`);
          connected = response.ok;
        } catch (error) {
          connected = false;
        }
      } else if (connection.provider === 'openai') {
        // Test OpenAI connection
        try {
          const response = await fetch('https://api.openai.com/v1/models', {
            headers: {
              'Authorization': `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json'
            }
          });
          connected = response.ok;
        } catch (error) {
          connected = false;
        }
      } else {
        // For other providers, just check if endpoint is reachable
        try {
          const response = await fetch(config.endpoint || '');
          connected = response.ok || response.status < 500;
        } catch (error) {
          connected = false;
        }
      }
      
      // Update connection status
      db.run('UPDATE ai_connections SET status = ? WHERE id = ?', [connected ? 'connected' : 'error', id]);
      
      logger.info('AI connection tested', { connection_id: id, connected });
      res.json({ success: true, connected });
      
    } catch (error) {
      logger.error('Error testing AI connection', { error: error.message, connection_id: id });
      res.json({ success: true, connected: false });
    }
  });
});

app.get('/api/ai-connections/:id/models', auth.authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM ai_connections WHERE id = ?', [id], async (err, connection) => {
    if (err) {
      logger.error('Error fetching AI connection for models', { error: err.message });
      return res.status(500).json({ error: 'Fehler beim Laden der Verbindung' });
    }
    
    if (!connection) {
      return res.status(404).json({ error: 'Verbindung nicht gefunden' });
    }
    
    try {
      const config = JSON.parse(connection.config || '{}');
      let models = [];
      
      if (connection.provider === 'ollama') {
        try {
          const response = await fetch(`${config.endpoint || 'http://localhost:11434'}/api/tags`);
          if (response.ok) {
            const data = await response.json();
            models = data.models?.map(m => m.name) || [];
          }
        } catch (error) {
          logger.error('Error fetching Ollama models', { error: error.message });
        }
      } else if (connection.provider === 'openai') {
        try {
          const response = await fetch('https://api.openai.com/v1/models', {
            headers: {
              'Authorization': `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json'
            }
          });
          if (response.ok) {
            const data = await response.json();
            models = data.data?.map(m => m.id) || [];
          }
        } catch (error) {
          logger.error('Error fetching OpenAI models', { error: error.message });
        }
      } else {
        // Default models for other providers
        models = [config.model || 'default'];
      }
      
      logger.info('Models fetched for AI connection', { connection_id: id, model_count: models.length });
      res.json({ success: true, models });
      
    } catch (error) {
      logger.error('Error fetching models', { error: error.message, connection_id: id });
      res.status(500).json({ error: 'Fehler beim Laden der Modelle' });
    }
  });
});

app.put('/api/ai-connections/:id', auth.authenticateToken, (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  // Build dynamic update query
  const fields = [];
  const values = [];
  
  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.provider !== undefined) {
    fields.push('provider = ?');
    values.push(updates.provider);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.config !== undefined) {
    fields.push('config = ?');
    values.push(JSON.stringify(updates.config));
  }
  if (updates.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(updates.is_active ? 1 : 0);
  }
  
  if (fields.length === 0) {
    return res.status(400).json({ error: 'Keine Felder zum Aktualisieren' });
  }
  
  // Check if updated_at column exists before trying to use it
  db.all("PRAGMA table_info(ai_connections)", (err, columns) => {
    if (err) {
      logger.error('Error checking table schema', { error: err.message, connection_id: id });
      return res.status(500).json({ error: 'Fehler beim Prüfen der Tabellenstruktur' });
    }
    
    const hasUpdatedAt = columns.some(col => col.name === 'updated_at');
    if (hasUpdatedAt) {
      fields.push('updated_at = datetime(\'now\')');
    }
    
    values.push(id);
    
    db.run(`UPDATE ai_connections SET ${fields.join(', ')} WHERE id = ?`, values, function(err) {
      if (err) {
        logger.error('Error updating AI connection', { error: err.message, connection_id: id });
        return res.status(500).json({ error: 'Fehler beim Aktualisieren der KI-Verbindung' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'KI-Verbindung nicht gefunden' });
      }
      
      logger.info('AI connection updated', { connection_id: id });
      res.json({ success: true });
    });
  });
});

app.delete('/api/ai-connections/:id', auth.authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM ai_connections WHERE id = ?', [id], function(err) {
    if (err) {
      logger.error('Error deleting AI connection', { error: err.message, connection_id: id });
      return res.status(500).json({ error: 'Fehler beim Löschen der KI-Verbindung' });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'KI-Verbindung nicht gefunden' });
    }
    
    logger.info('AI connection deleted', { connection_id: id });
    res.json({ success: true, message: 'KI-Verbindung erfolgreich gelöscht' });
  });
});

// MCP Server APIs
console.log('🔧 Registering MCP Server APIs...');

app.get('/api/mcp/servers', auth.authenticateToken, (req, res) => {
  console.log('📡 GET /api/mcp/servers called by user:', req.user?.id);
  
  // Ensure table exists first
  createMCPServersTable(() => {
    db.all(`
      SELECT * FROM mcp_servers 
      ORDER BY created_at DESC
    `, [], (err, servers) => {
      if (err) {
        console.error('❌ Error fetching MCP servers:', err.message);
        logger.error('Error fetching MCP servers', { error: err.message });
        return res.status(500).json({ error: 'Fehler beim Laden der MCP Server' });
      }
      
      console.log(`✅ Found ${servers.length} MCP servers`);
      
      // Parse config JSON and format response
      const formattedServers = servers.map(server => ({
        id: server.id,
        name: server.name,
        type: server.type,
        status: server.status || 'disconnected',
        config: JSON.parse(server.config || '{}'),
        capabilities: server.capabilities ? JSON.parse(server.capabilities) : {},
        created_at: server.created_at
      }));
      
      res.json({ success: true, servers: formattedServers });
    });
  });
});

app.post('/api/mcp/servers', auth.authenticateToken, (req, res) => {
  console.log('📡 POST /api/mcp/servers called by user:', req.user?.id);
  console.log('📦 Request body:', JSON.stringify(req.body, null, 2));
  
  const { name, type, config } = req.body;
  
  if (!name || !type || !config) {
    console.log('❌ Missing required fields:', { name: !!name, type: !!type, config: !!config });
    return res.status(400).json({ error: 'Name, Typ und Konfiguration sind erforderlich' });
  }

  // Validate config based on type
  if (type === 'stdio') {
    if (!config.command || !Array.isArray(config.command) || config.command.length === 0) {
      console.log('❌ Invalid STDIO config - missing or empty command:', config);
      return res.status(400).json({ error: 'STDIO Server benötigt ein nicht-leeres command Array' });
    }
  }
  
  if ((type === 'sse' || type === 'http-stream')) {
    if (!config.endpoint || config.endpoint.trim() === '') {
      console.log('❌ Invalid SSE/HTTP-stream config - missing endpoint:', config);
      return res.status(400).json({ error: `${type} Server benötigt eine endpoint URL` });
    }
  }
  
  // Ensure table exists first
  createMCPServersTable((err) => {
    if (err) {
      console.error('❌ Table creation failed before insert:', err.message);
      return res.status(500).json({ error: 'Fehler bei der Datenbankinitialisierung' });
    }
    
    const configJson = JSON.stringify(config);
    console.log('💾 Saving MCP server to database...');
    console.log('📋 Final config JSON:', configJson);
    console.log('📋 Values to insert:', { name, type, configJson });
    
    db.run(`
      INSERT INTO mcp_servers (name, type, config, status, created_at) 
      VALUES (?, ?, ?, 'disconnected', datetime('now'))
    `, [name, type, configJson], function(err) {
      if (err) {
        console.error('❌ Database error creating MCP server:', err.message);
        console.error('❌ Error code:', err.code);
        console.error('❌ SQL state:', err.errno);
        console.error('❌ Full error object:', err);
        logger.error('Error creating MCP server', { 
          error: err.message, 
          code: err.code,
          errno: err.errno,
          stack: err.stack,
          name, 
          type, 
          config 
        });
        return res.status(500).json({ 
          error: 'Fehler beim Erstellen des MCP Servers',
          details: `Database error: ${err.message}`,
          code: err.code
        });
      }
      
      console.log('✅ MCP server created with ID:', this.lastID);
      
      // Get the created server
      db.get('SELECT * FROM mcp_servers WHERE id = ?', [this.lastID], (err, server) => {
        if (err) {
          console.error('❌ Error fetching created MCP server:', err.message);
          logger.error('Error fetching created MCP server', { error: err.message });
          return res.status(500).json({ error: 'MCP Server erstellt, aber Fehler beim Laden' });
        }
        
        if (!server) {
          console.error('❌ Server not found after creation with ID:', this.lastID);
          return res.status(500).json({ error: 'Server nach Erstellung nicht gefunden' });
        }
        
        const formattedServer = {
          id: server.id,
          name: server.name,
          type: server.type,
          status: server.status || 'disconnected',
          config: JSON.parse(server.config || '{}'),
          capabilities: server.capabilities ? JSON.parse(server.capabilities) : {},
          created_at: server.created_at
        };
        
        console.log('📤 Sending response:', JSON.stringify(formattedServer, null, 2));
        logger.info('MCP server created', { server_id: server.id, name: server.name });
        res.json({ success: true, server: formattedServer });
      });
    });
  });
});

app.post('/api/mcp/servers/:id/connect', auth.authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  console.log(`🔌 Backend: Connecting to MCP server ${id}`);
  
  db.get('SELECT * FROM mcp_servers WHERE id = ?', [id], async (err, server) => {
    if (err) {
      console.error('❌ Database error during MCP server connection:', err.message);
      logger.error('Error fetching MCP server for connection', { error: err.message });
      return res.status(500).json({ error: 'Fehler beim Laden des Servers' });
    }
    
    if (!server) {
      console.log(`❌ MCP server ${id} not found`);
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }
    
    console.log(`📋 Found MCP server: ${server.name} (type: ${server.type})`);
    
    try {
      const config = JSON.parse(server.config || '{}');
      let connected = false;
      let capabilities = {};
      let error_message = null;
      
      console.log(`🔄 Testing connection for ${server.type} server...`);
      
      // Test connection based on server type
      if (server.type === 'stdio') {
        console.log(`🖥️ STDIO server - validating command: ${JSON.stringify(config.command)}`);
        
        // For STDIO servers, validate the command exists
        if (!config.command || !Array.isArray(config.command) || config.command.length === 0) {
          error_message = 'Invalid STDIO configuration: command array is required';
          connected = false;
        } else {
          // TODO: Could test if command exists, but for now assume it's valid
          connected = true;
          capabilities = { 
            tools: { listChanged: false }, 
            resources: { listChanged: false }, 
            prompts: { listChanged: false } 
          };
          console.log(`✅ STDIO server configuration valid`);
        }
        
      } else if (server.type === 'sse' || server.type === 'http-stream') {
        console.log(`🌐 HTTP-based server - testing endpoint: ${config.endpoint}`);
        
        if (!config.endpoint) {
          error_message = `${server.type.toUpperCase()} server requires an endpoint URL`;
          connected = false;
        } else {
          // Test HTTP-based connections
          try {
            console.log(`📡 Testing connection to ${config.endpoint}...`);
            
            // Try capabilities endpoint first
            let response = null;
            try {
              response = await fetch(`${config.endpoint}/capabilities`, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json'
                },
                // Add timeout
                signal: AbortSignal.timeout(10000) // 10 second timeout
              });
              
              if (response.ok) {
                capabilities = await response.json();
                connected = true;
                console.log(`✅ Got capabilities from ${config.endpoint}/capabilities`);
              } else {
                console.log(`⚠️ Capabilities endpoint returned ${response.status}, trying basic endpoint...`);
                throw new Error(`Capabilities endpoint returned ${response.status}`);
              }
            } catch (capError) {
              console.log(`⚠️ Capabilities endpoint failed, trying basic connection test:`, capError.message);
              
              // If capabilities endpoint doesn't work, try basic connection test
              try {
                response = await fetch(config.endpoint, {
                  method: 'GET',
                  // Add timeout
                  signal: AbortSignal.timeout(5000) // 5 second timeout
                });
                
                if (response.ok || response.status < 500) {
                  connected = true;
                  capabilities = { 
                    tools: { listChanged: false }, 
                    resources: { listChanged: false } 
                  };
                  console.log(`✅ Basic connection test successful (${response.status})`);
                } else {
                  throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
              } catch (basicError) {
                console.log(`❌ Basic connection test failed:`, basicError.message);
                throw basicError;
              }
            }
            
          } catch (error) {
            console.error(`❌ Connection test failed for ${config.endpoint}:`, error.message);
            connected = false;
            error_message = `Connection failed: ${error.message}`;
            
            // Provide helpful error messages
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
              error_message = `Cannot reach endpoint ${config.endpoint}. Check if the server is running and the URL is correct.`;
            } else if (error.name === 'AbortError') {
              error_message = `Connection timeout to ${config.endpoint}. Server may be slow or unreachable.`;
            }
          }
        }
      } else {
        console.log(`❌ Unknown server type: ${server.type}`);
        error_message = `Unknown server type: ${server.type}`;
        connected = false;
      }
      
      // Update server status in database
      const status = connected ? 'connected' : 'error';
      const capabilitiesJson = JSON.stringify(capabilities);
      
      console.log(`💾 Updating server status: ${status}`);
      
      db.run('UPDATE mcp_servers SET status = ?, capabilities = ? WHERE id = ?', 
        [status, capabilitiesJson, id], (err) => {
        if (err) {
          console.error('❌ Error updating server status:', err.message);
          logger.error('Error updating server status', { error: err.message });
        } else {
          console.log(`✅ Server status updated: ${status}`);
        }
      });
      
      logger.info('MCP server connection tested', { 
        server_id: id, 
        server_name: server.name,
        connected, 
        type: server.type,
        error: error_message 
      });
      
      const result = { 
        success: true, 
        connected, 
        capabilities,
        server_type: server.type,
        server_name: server.name
      };
      
      if (error_message) {
        result.error = error_message;
      }
      
      console.log(`📤 Sending connection result:`, result);
      res.json(result);
      
    } catch (error) {
      console.error('❌ Unexpected error testing MCP server connection:', error.message);
      logger.error('Error testing MCP server connection', { error: error.message, server_id: id });
      res.json({ 
        success: true, 
        connected: false, 
        capabilities: {},
        error: `Connection test failed: ${error.message}`
      });
    }
  });
});

app.post('/api/mcp/servers/:id/disconnect', auth.authenticateToken, (req, res) => {
  const { id } = req.params;
  
  console.log(`🔌 Backend: Disconnecting MCP server ${id}`);
  
  db.get('SELECT * FROM mcp_servers WHERE id = ?', [id], (err, server) => {
    if (err) {
      console.error('❌ Database error during MCP server disconnection:', err.message);
      logger.error('Error fetching MCP server for disconnection', { error: err.message });
      return res.status(500).json({ error: 'Fehler beim Laden des Servers' });
    }
    
    if (!server) {
      console.log(`❌ MCP server ${id} not found`);
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }
    
    console.log(`📋 Found MCP server: ${server.name} (type: ${server.type})`);
    
    // Update server status to disconnected
    db.run('UPDATE mcp_servers SET status = ? WHERE id = ?', ['disconnected', id], function(err) {
      if (err) {
        console.error('❌ Error updating server status to disconnected:', err.message);
        logger.error('Error updating server status', { error: err.message });
        return res.status(500).json({ error: 'Fehler beim Trennen des Servers' });
      }
      
      if (this.changes === 0) {
        console.log(`❌ No changes made when disconnecting server ${id}`);
        return res.status(404).json({ error: 'Server nicht gefunden' });
      }
      
      console.log(`✅ MCP server ${server.name} disconnected successfully`);
      logger.info('MCP server disconnected', { server_id: id, server_name: server.name });
      
      res.json({ 
        success: true, 
        message: `Server ${server.name} erfolgreich getrennt`,
        server_id: id,
        server_name: server.name
      });
    });
  });
});

app.get('/api/mcp/servers/:id/tools', auth.authenticateToken, (req, res) => {
  const { id } = req.params;
  
  console.log(`🔧 Backend: Getting tools for MCP server ${id}`);
  
  db.get('SELECT * FROM mcp_servers WHERE id = ?', [id], (err, server) => {
    if (err) {
      console.error('❌ Database error fetching MCP server for tools:', err.message);
      logger.error('Error fetching MCP server for tools', { error: err.message });
      return res.status(500).json({ error: 'Fehler beim Laden des Servers' });
    }
    
    if (!server) {
      console.log(`❌ MCP server ${id} not found`);
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }
    
    console.log(`📋 Found MCP server: ${server.name} (type: ${server.type}, status: ${server.status})`);
    
    try {
      const capabilities = JSON.parse(server.capabilities || '{}');
      const tools = capabilities.tools || [];
      
      console.log(`🔧 Returning ${Array.isArray(tools) ? tools.length : 0} tools for server ${server.name}`);
      logger.info('Tools fetched for MCP server', { server_id: id, tool_count: Array.isArray(tools) ? tools.length : 0 });
      
      res.json({ 
        success: true, 
        tools: Array.isArray(tools) ? tools : [],
        server_name: server.name,
        server_status: server.status
      });
      
    } catch (error) {
      console.error('❌ Error parsing server capabilities:', error.message);
      logger.error('Error parsing server capabilities', { error: error.message, server_id: id });
      
      res.json({ 
        success: true, 
        tools: [],
        server_name: server.name,
        server_status: server.status,
        error: 'Failed to parse server capabilities'
      });
    }
  });
});

app.post('/api/mcp/servers/:id/tools/:toolName/call', auth.authenticateToken, async (req, res) => {
  const { id, toolName } = req.params;
  const { arguments: toolArgs } = req.body;
  
  console.log(`🔧 Backend: Calling tool ${toolName} on MCP server ${id}`);
  console.log(`📋 Tool arguments:`, toolArgs);
  
  db.get('SELECT * FROM mcp_servers WHERE id = ?', [id], async (err, server) => {
    if (err) {
      console.error('❌ Database error fetching MCP server for tool call:', err.message);
      logger.error('Error fetching MCP server for tool call', { error: err.message });
      return res.status(500).json({ error: 'Fehler beim Laden des Servers' });
    }
    
    if (!server) {
      console.log(`❌ MCP server ${id} not found`);
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }
    
    console.log(`📋 Found MCP server: ${server.name} (type: ${server.type}, status: ${server.status})`);
    
    if (server.status !== 'connected') {
      console.log(`❌ MCP server ${server.name} is not connected (status: ${server.status})`);
      return res.status(400).json({ error: `Server ${server.name} ist nicht verbunden` });
    }
    
    try {
      const config = JSON.parse(server.config || '{}');
      let result = null;
      
      if (server.type === 'sse' || server.type === 'http-stream') {
        console.log(`🌐 Calling tool via HTTP on ${config.endpoint}`);
        
        // Call tool via HTTP
        const response = await fetch(`${config.endpoint}/tools/${toolName}/call`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ arguments: toolArgs || {} }),
          signal: AbortSignal.timeout(30000) // 30 second timeout
        });
        
        if (response.ok) {
          result = await response.json();
          console.log(`✅ Tool ${toolName} executed successfully on ${server.name}`);
        } else {
          const errorText = await response.text();
          throw new Error(`Tool call failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
      } else if (server.type === 'stdio') {
        console.log(`🖥️ STDIO tool calls not yet implemented for ${server.name}`);
        throw new Error('STDIO tool calls not yet implemented');
      } else {
        throw new Error(`Unknown server type: ${server.type}`);
      }
      
      // Log tool call
      db.run(`
        INSERT INTO tool_calls (tool_name, server_id, arguments, result, created_at) 
        VALUES (?, ?, ?, ?, datetime('now'))
      `, [toolName, id, JSON.stringify(toolArgs || {}), JSON.stringify(result)], (err) => {
        if (err) {
          console.error('❌ Error logging tool call:', err.message);
          logger.error('Error logging tool call', { error: err.message });
        } else {
          console.log(`📝 Tool call logged: ${toolName} on ${server.name}`);
        }
      });
      
      logger.info('MCP tool called successfully', { 
        server_id: id, 
        server_name: server.name,
        tool_name: toolName 
      });
      
      res.json({ 
        success: true, 
        result,
        tool_name: toolName,
        server_name: server.name
      });
      
    } catch (error) {
      console.error(`❌ Error calling tool ${toolName} on ${server.name}:`, error.message);
      logger.error('Error calling MCP tool', { 
        error: error.message, 
        server_id: id, 
        server_name: server.name,
        tool_name: toolName 
      });
      
      res.status(500).json({ 
        error: `Fehler beim Aufrufen des Tools: ${error.message}`,
        tool_name: toolName,
        server_name: server.name
      });
    }
  });
});

app.delete('/api/mcp/servers/:id', auth.authenticateToken, (req, res) => {
  const { id } = req.params;
  
  console.log(`🗑️ Backend: Deleting MCP server ${id}`);
  
  db.get('SELECT * FROM mcp_servers WHERE id = ?', [id], (err, server) => {
    if (err) {
      console.error('❌ Database error fetching MCP server for deletion:', err.message);
      logger.error('Error fetching MCP server for deletion', { error: err.message });
      return res.status(500).json({ error: 'Fehler beim Laden des Servers' });
    }
    
    if (!server) {
      console.log(`❌ MCP server ${id} not found`);
      return res.status(404).json({ error: 'Server nicht gefunden' });
    }
    
    console.log(`📋 Found MCP server for deletion: ${server.name} (type: ${server.type})`);
    
    // First delete any related tool calls
    db.run('DELETE FROM tool_calls WHERE server_id = ?', [id], (err) => {
      if (err) {
        console.error('❌ Error deleting tool calls for server:', err.message);
        logger.error('Error deleting tool calls', { error: err.message, server_id: id });
        return res.status(500).json({ error: 'Fehler beim Löschen der Tool-Aufrufe' });
      }
      
      console.log(`🗑️ Deleted tool calls for server ${server.name}`);
      
      // Then delete the server itself
      db.run('DELETE FROM mcp_servers WHERE id = ?', [id], function(err) {
        if (err) {
          console.error('❌ Error deleting MCP server:', err.message);
          logger.error('Error deleting MCP server', { error: err.message, server_id: id });
          return res.status(500).json({ error: 'Fehler beim Löschen des Servers' });
        }
        
        if (this.changes === 0) {
          console.log(`❌ No changes made when deleting server ${id}`);
          return res.status(404).json({ error: 'Server nicht gefunden' });
        }
        
        console.log(`✅ MCP server ${server.name} deleted successfully`);
        logger.info('MCP server deleted', { 
          server_id: id, 
          server_name: server.name,
          server_type: server.type
        });
        
        res.json({ 
          success: true, 
          message: `Server ${server.name} erfolgreich gelöscht`,
          server_id: id,
          server_name: server.name
        });
      });
    });
  });
});

// Helper function to create MCP servers table
function createMCPServersTable(callback) {
  console.log('🔧 Creating/checking MCP servers table...');
  
  // First, check if table exists and get its structure
  db.all("PRAGMA table_info(mcp_servers)", (err, columns) => {
    if (err) {
      console.error('❌ Error checking table info:', err.message);
      if (callback) callback(err);
      return;
    }
    
    console.log('📋 Current mcp_servers table columns:', columns.map(col => col.name));
    
    // Check if type column exists
    const hasTypeColumn = columns.some(col => col.name === 'type');
    
    if (columns.length > 0 && !hasTypeColumn) {
      console.log('⚠️ Table exists but missing type column. Recreating table...');
      
      // Drop the old table and recreate it
      db.run('DROP TABLE IF EXISTS mcp_servers', (err) => {
        if (err) {
          console.error('❌ Error dropping old table:', err.message);
          if (callback) callback(err);
          return;
        }
        console.log('🗑️ Old mcp_servers table dropped');
        createTableWithCorrectSchema(callback);
      });
    } else {
      // Table doesn't exist or has correct structure
      createTableWithCorrectSchema(callback);
    }
  });
}

function createTableWithCorrectSchema(callback) {
  console.log('🏗️ Creating mcp_servers table with correct schema...');
  
  db.run(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config TEXT NOT NULL,
      status TEXT DEFAULT 'disconnected',
      capabilities TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating mcp_servers table:', err.message);
      console.error('❌ Full table creation error:', err);
      logger.error('Error creating mcp_servers table', { error: err.message });
      if (callback) callback(err);
      return;
    } else {
      console.log('✅ MCP servers table created or verified with correct schema');
      logger.info('MCP servers table created or already exists');
      
      // Test if table works by running a simple query
      db.get("SELECT COUNT(*) as count FROM mcp_servers", (err, result) => {
        if (err) {
          console.error('❌ Error testing mcp_servers table:', err.message);
          if (callback) callback(err);
          return;
        }
        console.log('✅ MCP servers table test successful, current count:', result.count);
        
        // Verify the schema is correct
        db.all("PRAGMA table_info(mcp_servers)", (err, columns) => {
          if (err) {
            console.error('❌ Error verifying table schema:', err.message);
            if (callback) callback(err);
            return;
          }
          console.log('✅ Verified table schema:', columns.map(col => `${col.name}(${col.type})`).join(', '));
        });
      });
    }
    
    // Also create tool_calls table if it doesn't exist
    db.run(`
      CREATE TABLE IF NOT EXISTS tool_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool_name TEXT NOT NULL,
        server_id INTEGER,
        arguments TEXT,
        result TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id) REFERENCES mcp_servers (id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) {
        console.error('❌ Error creating tool_calls table:', err.message);
        logger.error('Error creating tool_calls table', { error: err.message });
      } else {
        console.log('✅ Tool calls table created or verified');
        logger.info('Tool calls table created or already exists');
      }
      if (callback) callback(err);
    });
  });
}

// Initialize MCP tables on startup
console.log('🚀 Initializing MCP tables on startup...');
createMCPServersTable((err) => {
  if (err) {
    console.error('❌ Failed to initialize MCP tables:', err.message);
  } else {
    console.log('✅ MCP tables initialized successfully');
  }
});

// Error handling
app.use((req, res, next) => {
  // Check if this is an API route that should exist
  if (req.path.startsWith('/api/')) {
    console.log(`❌ Unhandled API route: ${req.method} ${req.path}`);
  }
  res.status(404).json({ error: 'Endpunkt nicht gefunden' });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Interner Serverfehler' });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 MCP Chat Backend (Simplified) started on port ${PORT}`);
  console.log('📡 Available MCP endpoints:');
  console.log('   GET    /api/mcp/servers');
  console.log('   POST   /api/mcp/servers');
  console.log('   POST   /api/mcp/servers/:id/connect');
  console.log('   POST   /api/mcp/servers/:id/disconnect');
  console.log('   DELETE /api/mcp/servers/:id');
  logger.info('MCP Chat Backend gestartet', { port: PORT });
});

export default app;

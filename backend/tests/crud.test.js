const request = require('supertest');
const express = require('express');

describe('CRUD Operations Tests', () => {
  let app;
  let conversationId = 0;
  let mockConversations = [];
  let mockTools = [];
  let mockAIConnections = [];

  // Simple auth middleware mock
  const mockAuthMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token || token !== 'valid-test-token') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = { id: 1, username: 'testuser', role: 'user' };
    next();
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Reset mock data
    conversationId = 0;
    mockConversations = [];
    mockTools = [];
    mockAIConnections = [];

    // Conversations CRUD endpoints
    app.get('/api/conversations', mockAuthMiddleware, (req, res) => {
      const userConversations = mockConversations.filter(c => c.user_id === req.user.id);
      res.json({ success: true, conversations: userConversations });
    });

    app.post('/api/conversations', mockAuthMiddleware, (req, res) => {
      const { title } = req.body;
      const conversation = {
        id: ++conversationId,
        user_id: req.user.id,
        title: title || 'Neue Unterhaltung',
        created_at: new Date().toISOString(),
        message_count: 0
      };
      
      mockConversations.push(conversation);
      res.json({ success: true, conversation });
    });

    app.delete('/api/conversations/:id', mockAuthMiddleware, (req, res) => {
      const id = parseInt(req.params.id);
      const conversationIndex = mockConversations.findIndex(
        c => c.id === id && c.user_id === req.user.id
      );
      
      if (conversationIndex === -1) {
        return res.status(404).json({ error: 'Konversation nicht gefunden' });
      }
      
      mockConversations.splice(conversationIndex, 1);
      res.json({ success: true, message: 'Konversation erfolgreich gelöscht' });
    });

    // Tools CRUD endpoints
    app.get('/api/tools', mockAuthMiddleware, (req, res) => {
      res.json({ success: true, tools: mockTools });
    });

    app.post('/api/tools', mockAuthMiddleware, (req, res) => {
      const { name, type, description, config } = req.body;
      
      if (!name || !type || !config) {
        return res.status(400).json({ error: 'Name, Typ und Konfiguration sind erforderlich' });
      }
      
      const tool = {
        id: mockTools.length + 1,
        name,
        type,
        description: description || '',
        config,
        is_active: 1,
        created_at: new Date().toISOString(),
        usage_count: 0
      };
      
      mockTools.push(tool);
      res.json({ success: true, tool });
    });

    app.put('/api/tools/:id', mockAuthMiddleware, (req, res) => {
      const id = parseInt(req.params.id);
      const toolIndex = mockTools.findIndex(t => t.id === id);
      
      if (toolIndex === -1) {
        return res.status(404).json({ error: 'Tool nicht gefunden' });
      }
      
      mockTools[toolIndex] = { ...mockTools[toolIndex], ...req.body };
      res.json({ success: true });
    });

    app.delete('/api/tools/:id', mockAuthMiddleware, (req, res) => {
      const id = parseInt(req.params.id);
      const toolIndex = mockTools.findIndex(t => t.id === id);
      
      if (toolIndex === -1) {
        return res.status(404).json({ error: 'Tool nicht gefunden' });
      }
      
      mockTools.splice(toolIndex, 1);
      res.json({ success: true });
    });

    // AI Connections CRUD endpoints
    app.get('/api/ai-connections', mockAuthMiddleware, (req, res) => {
      res.json({ success: true, ai_connections: mockAIConnections });
    });

    app.post('/api/ai-connections', mockAuthMiddleware, (req, res) => {
      const { name, provider, description, config } = req.body;
      
      if (!name || !provider || !config) {
        return res.status(400).json({ error: 'Name, Anbieter und Konfiguration sind erforderlich' });
      }
      
      const aiConnection = {
        id: mockAIConnections.length + 1,
        name,
        provider,
        description: description || '',
        config,
        is_active: 1,
        created_at: new Date().toISOString()
      };
      
      mockAIConnections.push(aiConnection);
      res.json({ success: true, ai_connection: aiConnection });
    });

    app.put('/api/ai-connections/:id', mockAuthMiddleware, (req, res) => {
      const id = parseInt(req.params.id);
      const connectionIndex = mockAIConnections.findIndex(c => c.id === id);
      
      if (connectionIndex === -1) {
        return res.status(404).json({ error: 'KI-Verbindung nicht gefunden' });
      }
      
      mockAIConnections[connectionIndex] = { ...mockAIConnections[connectionIndex], ...req.body };
      res.json({ success: true });
    });

    app.delete('/api/ai-connections/:id', mockAuthMiddleware, (req, res) => {
      const id = parseInt(req.params.id);
      const connectionIndex = mockAIConnections.findIndex(c => c.id === id);
      
      if (connectionIndex === -1) {
        return res.status(404).json({ error: 'KI-Verbindung nicht gefunden' });
      }
      
      mockAIConnections.splice(connectionIndex, 1);
      res.json({ success: true });
    });
  });

  describe('Conversations CRUD', () => {
    test('should get empty conversations list for new user', async () => {
      const response = await request(app)
        .get('/api/conversations')
        .set('Authorization', 'Bearer valid-test-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.conversations).toEqual([]);
    });

    test('should create new conversation', async () => {
      const conversationData = {
        title: 'Test Conversation'
      };

      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', 'Bearer valid-test-token')
        .send(conversationData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.conversation).toMatchObject({
        title: 'Test Conversation',
        user_id: 1,
        message_count: 0
      });
      expect(response.body.conversation.id).toBeDefined();
    });

    test('should create conversation with default title', async () => {
      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', 'Bearer valid-test-token')
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.conversation.title).toBe('Neue Unterhaltung');
    });

    test('should delete existing conversation', async () => {
      // First create a conversation
      const createResponse = await request(app)
        .post('/api/conversations')
        .set('Authorization', 'Bearer valid-test-token')
        .send({ title: 'Conversation to Delete' });

      const conversationId = createResponse.body.conversation.id;

      // Then delete it
      const deleteResponse = await request(app)
        .delete(`/api/conversations/${conversationId}`)
        .set('Authorization', 'Bearer valid-test-token')
        .expect(200);

      expect(deleteResponse.body.success).toBe(true);
      expect(deleteResponse.body.message).toBe('Konversation erfolgreich gelöscht');

      // Verify it's deleted
      const getResponse = await request(app)
        .get('/api/conversations')
        .set('Authorization', 'Bearer valid-test-token')
        .expect(200);

      expect(getResponse.body.conversations).toHaveLength(0);
    });

    test('should reject unauthorized requests', async () => {
      await request(app)
        .get('/api/conversations')
        .expect(401);

      await request(app)
        .post('/api/conversations')
        .send({ title: 'Test' })
        .expect(401);

      await request(app)
        .delete('/api/conversations/1')
        .expect(401);
    });
  });

  describe('Tools CRUD', () => {
    test('should get empty tools list initially', async () => {
      const response = await request(app)
        .get('/api/tools')
        .set('Authorization', 'Bearer valid-test-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.tools).toEqual([]);
    });

    test('should create new tool', async () => {
      const toolData = {
        name: 'Test Tool',
        type: 'utility',
        description: 'A test tool',
        config: {
          apiKey: 'test-key',
          endpoint: 'https://api.example.com'
        }
      };

      const response = await request(app)
        .post('/api/tools')
        .set('Authorization', 'Bearer valid-test-token')
        .send(toolData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.tool).toMatchObject({
        name: 'Test Tool',
        type: 'utility',
        description: 'A test tool',
        is_active: 1
      });
      expect(response.body.tool.config).toEqual(toolData.config);
    });

    test('should reject tool without required fields', async () => {
      const incompleteToolData = {
        name: 'Incomplete Tool'
        // missing type and config
      };

      const response = await request(app)
        .post('/api/tools')
        .set('Authorization', 'Bearer valid-test-token')
        .send(incompleteToolData)
        .expect(400);

      expect(response.body.error).toBe('Name, Typ und Konfiguration sind erforderlich');
    });

    test('should update existing tool', async () => {
      // First create a tool
      const createResponse = await request(app)
        .post('/api/tools')
        .set('Authorization', 'Bearer valid-test-token')
        .send({
          name: 'Original Tool',
          type: 'utility',
          description: 'Original description',
          config: { key: 'value' }
        });

      const toolId = createResponse.body.tool.id;

      // Update the tool
      const updateResponse = await request(app)
        .put(`/api/tools/${toolId}`)
        .set('Authorization', 'Bearer valid-test-token')
        .send({
          name: 'Updated Tool',
          description: 'Updated description'
        })
        .expect(200);

      expect(updateResponse.body.success).toBe(true);

      // Verify the tool was updated
      const listResponse = await request(app)
        .get('/api/tools')
        .set('Authorization', 'Bearer valid-test-token')
        .expect(200);

      const updatedTool = listResponse.body.tools.find(t => t.id === toolId);
      expect(updatedTool.name).toBe('Updated Tool');
      expect(updatedTool.description).toBe('Updated description');
    });

    test('should delete existing tool', async () => {
      // First create a tool
      const createResponse = await request(app)
        .post('/api/tools')
        .set('Authorization', 'Bearer valid-test-token')
        .send({
          name: 'Tool to Delete',
          type: 'utility',
          config: { key: 'value' }
        });

      const toolId = createResponse.body.tool.id;

      // Delete the tool
      const deleteResponse = await request(app)
        .delete(`/api/tools/${toolId}`)
        .set('Authorization', 'Bearer valid-test-token')
        .expect(200);

      expect(deleteResponse.body.success).toBe(true);

      // Verify the tool was deleted
      const listResponse = await request(app)
        .get('/api/tools')
        .set('Authorization', 'Bearer valid-test-token')
        .expect(200);

      expect(listResponse.body.tools).toHaveLength(0);
    });

    // AI Connections CRUD
    test('should get empty AI connections list initially', async () => {
      const response = await request(app)
        .get('/api/ai-connections')
        .set('Authorization', 'Bearer valid-test-token')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.ai_connections).toEqual([]);
    });

    test('should create new AI connection', async () => {
      const aiConnectionData = {
        name: 'Test AI Connection',
        provider: 'openai',
        description: 'A test AI connection',
        config: {
          apiKey: 'test-ai-key',
          model: 'gpt-3.5-turbo'
        }
      };

      const response = await request(app)
        .post('/api/ai-connections')
        .set('Authorization', 'Bearer valid-test-token')
        .send(aiConnectionData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.ai_connection).toMatchObject({
        name: 'Test AI Connection',
        provider: 'openai',
        description: 'A test AI connection',
        is_active: 1
      });
      expect(response.body.ai_connection.config).toEqual(aiConnectionData.config);
    });

    test('should reject AI connection without required fields', async () => {
      const incompleteAIConnectionData = {
        name: 'Incomplete AI Connection'
        // missing provider and config
      };

      const response = await request(app)
        .post('/api/ai-connections')
        .set('Authorization', 'Bearer valid-test-token')
        .send(incompleteAIConnectionData)
        .expect(400);

      expect(response.body.error).toBe('Name, Anbieter und Konfiguration sind erforderlich');
    });

    test('should update existing AI connection', async () => {
      // First create an AI connection
      const createResponse = await request(app)
        .post('/api/ai-connections')
        .set('Authorization', 'Bearer valid-test-token')
        .send({
          name: 'Original AI Connection',
          provider: 'openai',
          description: 'Original description',
          config: { model: 'gpt-3.5-turbo' }
        });

      const connectionId = createResponse.body.ai_connection.id;

      // Update the AI connection
      const updateResponse = await request(app)
        .put(`/api/ai-connections/${connectionId}`)
        .set('Authorization', 'Bearer valid-test-token')
        .send({
          name: 'Updated AI Connection',
          provider: 'openai',
          description: 'Updated description',
          config: { model: 'gpt-4' }
        })
        .expect(200);

      expect(updateResponse.body.success).toBe(true);

      // Verify the AI connection was updated
      const listResponse = await request(app)
        .get('/api/ai-connections')
        .set('Authorization', 'Bearer valid-test-token')
        .expect(200);

      const updatedConnection = listResponse.body.ai_connections.find(c => c.id === connectionId);
      expect(updatedConnection.name).toBe('Updated AI Connection');
      expect(updatedConnection.description).toBe('Updated description');
      expect(updatedConnection.config.model).toBe('gpt-4');
    });

    test('should delete existing AI connection', async () => {
      // First create an AI connection
      const createResponse = await request(app)
        .post('/api/ai-connections')
        .set('Authorization', 'Bearer valid-test-token')
        .send({
          name: 'AI Connection to Delete',
          provider: 'anthropic',
          config: { model: 'claude-2' }
        });

      const connectionId = createResponse.body.ai_connection.id;

      // Delete the AI connection
      const deleteResponse = await request(app)
        .delete(`/api/ai-connections/${connectionId}`)
        .set('Authorization', 'Bearer valid-test-token')
        .expect(200);

      expect(deleteResponse.body.success).toBe(true);

      // Verify the AI connection was deleted
      const listResponse = await request(app)
        .get('/api/ai-connections')
        .set('Authorization', 'Bearer valid-test-token')
        .expect(200);

      expect(listResponse.body.ai_connections).toHaveLength(0);
    });

    describe('Integration Flow', () => {
      test('should create multiple conversations and tools, then manage them', async () => {
        const authHeader = { 'Authorization': 'Bearer valid-test-token' };

        // Create multiple conversations
        const conv1 = await request(app)
          .post('/api/conversations')
          .set(authHeader)
          .send({ title: 'First Conversation' })
          .expect(200);

        const conv2 = await request(app)
          .post('/api/conversations')
          .set(authHeader)
          .send({ title: 'Second Conversation' })
          .expect(200);

        // Create multiple tools
        const tool1 = await request(app)
          .post('/api/tools')
          .set(authHeader)
          .send({
            name: 'Tool One',
            type: 'analyzer',
            config: { mode: 'analyze' }
          })
          .expect(200);

        const tool2 = await request(app)
          .post('/api/tools')
          .set(authHeader)
          .send({
            name: 'Tool Two',
            type: 'generator',
            config: { mode: 'generate' }
          })
          .expect(200);

        // Create multiple AI connections
        const aiConn1 = await request(app)
          .post('/api/ai-connections')
          .set(authHeader)
          .send({
            name: 'AI Connection One',
            provider: 'openai',
            config: { model: 'gpt-3.5-turbo' }
          })
          .expect(200);

        const aiConn2 = await request(app)
          .post('/api/ai-connections')
          .set(authHeader)
          .send({
            name: 'AI Connection Two',
            provider: 'cohere',
            config: { model: 'command-xlarge-2021-11-10' }
          })
          .expect(200);

        // List all conversations
        const convListResponse = await request(app)
          .get('/api/conversations')
          .set(authHeader)
          .expect(200);

        expect(convListResponse.body.conversations).toHaveLength(2);

        // List all tools
        const toolListResponse = await request(app)
          .get('/api/tools')
          .set(authHeader)
          .expect(200);

        expect(toolListResponse.body.tools).toHaveLength(2);

        // List all AI connections
        const aiConnListResponse = await request(app)
          .get('/api/ai-connections')
          .set(authHeader)
          .expect(200);

        expect(aiConnListResponse.body.ai_connections).toHaveLength(2);

        // Delete one conversation
        await request(app)
          .delete(`/api/conversations/${conv1.body.conversation.id}`)
          .set(authHeader)
          .expect(200);

        // Verify only one conversation remains
        const finalConvListResponse = await request(app)
          .get('/api/conversations')
          .set(authHeader)
          .expect(200);

        expect(finalConvListResponse.body.conversations).toHaveLength(1);
        expect(finalConvListResponse.body.conversations[0].title).toBe('Second Conversation');
      });
    });
  });
});

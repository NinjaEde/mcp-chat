const request = require('supertest');
const { createTestApp, createTestUserAndToken } = require('./helpers/testApp.js');

describe('Conversations API', () => {
  let app;
  let userToken;
  let userId;

  beforeEach(async () => {
    app = createTestApp();
    
    // Wait for database initialization
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Create test user and get token
    try {
      const testData = await createTestUserAndToken(app);
      userToken = testData.token;
      userId = testData.userId;
    } catch (error) {
      console.error('Setup error:', error);
      throw error;
    }
  });

  describe('GET /api/conversations', () => {
    test('should get empty conversations list for new user', async () => {
      const response = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.conversations).toEqual([]);
    });

    test('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/conversations')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/conversations', () => {
    test('should create new conversation', async () => {
      const conversationData = {
        title: 'Test Conversation',
        ai_connection_id: null
      };

      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .send(conversationData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.conversation).toMatchObject({
        title: 'Test Conversation',
        user_id: userId
      });
      expect(response.body.conversation.id).toBeDefined();
    });

    test('should create conversation with default title', async () => {
      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.conversation.title).toBe('Neue Unterhaltung');
    });

    test('should reject request without token', async () => {
      const response = await request(app)
        .post('/api/conversations')
        .send({ title: 'Test' })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('DELETE /api/conversations/:id', () => {
    let conversationId;

    beforeEach(async () => {
      // Create a conversation to delete
      const response = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Conversation to Delete' });
      
      conversationId = response.body.conversation.id;
    });

    test('should delete existing conversation', async () => {
      const response = await request(app)
        .delete(`/api/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Konversation erfolgreich gelöscht');

      // Verify conversation is deleted
      const getResponse = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(getResponse.body.conversations).toHaveLength(0);
    });

    test('should reject invalid conversation ID', async () => {
      const response = await request(app)
        .delete('/api/conversations/invalid')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);

      expect(response.body.error).toBe('Ungültige Konversations-ID');
    });

    test('should reject non-existent conversation ID', async () => {
      const response = await request(app)
        .delete('/api/conversations/99999')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);

      expect(response.body.error).toBe('Konversation nicht gefunden');
    });

    test('should reject request without token', async () => {
      const response = await request(app)
        .delete(`/api/conversations/${conversationId}`)
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Conversation Integration Flow', () => {
    test('should create, list, and delete conversation', async () => {
      // 1. Create conversation
      const createResponse = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ title: 'Integration Test Conversation' })
        .expect(200);

      const conversationId = createResponse.body.conversation.id;

      // Small delay to ensure DB operations are completed
      await new Promise(resolve => setTimeout(resolve, 100));

      // 2. List conversations
      const listResponse = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(listResponse.body.conversations).toHaveLength(1);
      expect(listResponse.body.conversations[0].title).toBe('Integration Test Conversation');

      // 3. Delete conversation
      await request(app)
        .delete(`/api/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      // 4. Verify deletion
      const finalListResponse = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(finalListResponse.body.conversations).toHaveLength(0);
    });
  });
});

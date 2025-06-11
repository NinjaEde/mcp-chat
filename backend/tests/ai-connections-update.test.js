const request = require('supertest');
const app = require('../tests/helpers/testApp');
const db = require('../src/db');

describe('AI Connections Update API', () => {
  let testConnectionId;

  beforeEach(async () => {
    // Create a test AI connection
    const response = await request(app)
      .post('/api/ai-connections')
      .set('Authorization', 'Bearer valid-test-token')
      .send({
        name: 'Test AI Connection for Update',
        provider: 'openai',
        description: 'Test description',
        config: {
          apiKey: 'test-key',
          endpoint: 'https://api.openai.com/v1',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 2048
        }
      });
    
    testConnectionId = response.body.ai_connection.id;
  });

  afterEach(() => {
    // Clean up test connections
    if (testConnectionId) {
      db.run('DELETE FROM ai_connections WHERE id = ?', [testConnectionId]);
    }
  });

  describe('PUT /api/ai-connections/:id', () => {
    test('should update AI connection successfully', async () => {
      const updateData = {
        name: 'Updated AI Connection',
        provider: 'anthropic',
        description: 'Updated description',
        config: {
          apiKey: 'updated-key',
          endpoint: 'https://api.anthropic.com',
          model: 'claude-3',
          temperature: 0.5,
          maxTokens: 1024
        }
      };

      const response = await request(app)
        .put(`/api/ai-connections/${testConnectionId}`)
        .set('Authorization', 'Bearer valid-test-token')
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify the update by fetching the connection
      const getResponse = await request(app)
        .get('/api/ai-connections')
        .set('Authorization', 'Bearer valid-test-token')
        .expect(200);

      const updatedConnection = getResponse.body.ai_connections.find(c => c.id === testConnectionId);
      expect(updatedConnection.name).toBe('Updated AI Connection');
      expect(updatedConnection.provider).toBe('anthropic');
      expect(updatedConnection.description).toBe('Updated description');
      expect(updatedConnection.config.model).toBe('claude-3');
      expect(updatedConnection.config.temperature).toBe(0.5);
      expect(updatedConnection.config.maxTokens).toBe(1024);
    });

    test('should handle partial updates', async () => {
      const partialUpdate = {
        name: 'Partially Updated Connection'
      };

      const response = await request(app)
        .put(`/api/ai-connections/${testConnectionId}`)
        .set('Authorization', 'Bearer valid-test-token')
        .send(partialUpdate)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify only the name was updated
      const getResponse = await request(app)
        .get('/api/ai-connections')
        .set('Authorization', 'Bearer valid-test-token')
        .expect(200);

      const updatedConnection = getResponse.body.ai_connections.find(c => c.id === testConnectionId);
      expect(updatedConnection.name).toBe('Partially Updated Connection');
      expect(updatedConnection.provider).toBe('openai'); // Should remain unchanged
      expect(updatedConnection.description).toBe('Test description'); // Should remain unchanged
    });

    test('should handle config updates correctly', async () => {
      const configUpdate = {
        config: {
          apiKey: 'new-api-key',
          model: 'gpt-4-turbo',
          temperature: 0.3
        }
      };

      const response = await request(app)
        .put(`/api/ai-connections/${testConnectionId}`)
        .set('Authorization', 'Bearer valid-test-token')
        .send(configUpdate)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify config was updated
      const getResponse = await request(app)
        .get('/api/ai-connections')
        .set('Authorization', 'Bearer valid-test-token')
        .expect(200);

      const updatedConnection = getResponse.body.ai_connections.find(c => c.id === testConnectionId);
      expect(updatedConnection.config.model).toBe('gpt-4-turbo');
      expect(updatedConnection.config.temperature).toBe(0.3);
      // API key should be masked
      expect(updatedConnection.config.apiKey).toBe('***');
    });

    test('should handle is_active status updates', async () => {
      const statusUpdate = {
        is_active: false
      };

      const response = await request(app)
        .put(`/api/ai-connections/${testConnectionId}`)
        .set('Authorization', 'Bearer valid-test-token')
        .send(statusUpdate)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify status was updated
      const getResponse = await request(app)
        .get('/api/ai-connections')
        .set('Authorization', 'Bearer valid-test-token')
        .expect(200);

      const updatedConnection = getResponse.body.ai_connections.find(c => c.id === testConnectionId);
      expect(updatedConnection.is_active).toBe(0); // SQLite returns 0 for false
    });

    test('should return 400 for empty update', async () => {
      const response = await request(app)
        .put(`/api/ai-connections/${testConnectionId}`)
        .set('Authorization', 'Bearer valid-test-token')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Keine Felder zum Aktualisieren');
    });

    test('should return 404 for non-existent connection', async () => {
      const response = await request(app)
        .put('/api/ai-connections/99999')
        .set('Authorization', 'Bearer valid-test-token')
        .send({ name: 'Non-existent Connection' })
        .expect(404);

      expect(response.body.error).toBe('KI-Verbindung nicht gefunden');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .put(`/api/ai-connections/${testConnectionId}`)
        .send({ name: 'Updated Connection' })
        .expect(401);

      expect(response.body.error).toBe('Nicht autorisiert');
    });

    test('should handle database schema gracefully', async () => {
      // This test verifies that the route works even if updated_at column doesn't exist
      const updateData = {
        name: 'Schema Test Connection',
        description: 'Testing schema compatibility'
      };

      const response = await request(app)
        .put(`/api/ai-connections/${testConnectionId}`)
        .set('Authorization', 'Bearer valid-test-token')
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should preserve null values correctly', async () => {
      // Test that null description is handled properly
      const updateData = {
        description: null
      };

      const response = await request(app)
        .put(`/api/ai-connections/${testConnectionId}`)
        .set('Authorization', 'Bearer valid-test-token')
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify the update
      const getResponse = await request(app)
        .get('/api/ai-connections')
        .set('Authorization', 'Bearer valid-test-token')
        .expect(200);

      const updatedConnection = getResponse.body.ai_connections.find(c => c.id === testConnectionId);
      expect(updatedConnection.description).toBe(null);
    });
  });
});

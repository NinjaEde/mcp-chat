const request = require('supertest');
const { createTestApp, createTestUserAndToken } = require('./helpers/testApp.js');

describe('Tools API', () => {
  let app;
  let userToken;
  let userId;

  beforeEach(async () => {
    app = createTestApp();
    
    try {
      const testData = await createTestUserAndToken(app);
      userToken = testData.token;
      userId = testData.userId;
    } catch (error) {
      console.error('Setup error:', error);
      throw error;
    }
  });

  describe('GET /api/tools', () => {
    test('should get empty tools list initially', async () => {
      const response = await request(app)
        .get('/api/tools')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.tools).toEqual([]);
    });

    test('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/tools')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/tools', () => {
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
        .set('Authorization', `Bearer ${userToken}`)
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
      expect(response.body.tool.id).toBeDefined();
    });

    test('should reject tool without required fields', async () => {
      const incompleteToolData = {
        name: 'Incomplete Tool'
        // missing type and config
      };

      const response = await request(app)
        .post('/api/tools')
        .set('Authorization', `Bearer ${userToken}`)
        .send(incompleteToolData)
        .expect(400);

      expect(response.body.error).toBe('Name, Typ und Konfiguration sind erforderlich');
    });

    test('should create tool with minimal data', async () => {
      const minimalToolData = {
        name: 'Minimal Tool',
        type: 'basic',
        config: { setting: 'value' }
      };

      const response = await request(app)
        .post('/api/tools')
        .set('Authorization', `Bearer ${userToken}`)
        .send(minimalToolData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.tool.description).toBe('');
    });

    test('should reject request without token', async () => {
      const response = await request(app)
        .post('/api/tools')
        .send({
          name: 'Test Tool',
          type: 'utility',
          config: {}
        })
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Tools Integration Flow', () => {
    test('should create and list tools', async () => {
      // 1. Create first tool
      const tool1Data = {
        name: 'Tool One',
        type: 'analyzer',
        description: 'First test tool',
        config: { mode: 'analyze' }
      };

      const createResponse1 = await request(app)
        .post('/api/tools')
        .set('Authorization', `Bearer ${userToken}`)
        .send(tool1Data)
        .expect(200);

      // 2. Create second tool
      const tool2Data = {
        name: 'Tool Two',
        type: 'generator',
        description: 'Second test tool',
        config: { mode: 'generate' }
      };

      const createResponse2 = await request(app)
        .post('/api/tools')
        .set('Authorization', `Bearer ${userToken}`)
        .send(tool2Data)
        .expect(200);

      // 3. List all tools
      const listResponse = await request(app)
        .get('/api/tools')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(listResponse.body.success).toBe(true);
      expect(listResponse.body.tools).toHaveLength(2);
      
      // Verify tools are ordered by creation date (newest first)
      const tools = listResponse.body.tools;
      expect(tools[0].name).toBe('Tool Two'); // Created second, should be first
      expect(tools[1].name).toBe('Tool One'); // Created first, should be second
      
      // Verify all fields are present
      tools.forEach(tool => {
        expect(tool.id).toBeDefined();
        expect(tool.name).toBeDefined();
        expect(tool.type).toBeDefined();
        expect(tool.config).toBeDefined();
        expect(tool.is_active).toBe(1);
        expect(tool.usage_count).toBe(0);
      });
    });

    test('should handle complex tool configurations', async () => {
      const complexToolData = {
        name: 'Complex Tool',
        type: 'api-client',
        description: 'A tool with complex configuration',
        config: {
          apiKey: 'secret-key-123',
          endpoints: {
            primary: 'https://api.example.com/v1',
            fallback: 'https://backup.example.com/v1'
          },
          retryConfig: {
            maxRetries: 3,
            backoffMultiplier: 2,
            initialDelay: 1000
          },
          features: ['auth', 'caching', 'retry'],
          metadata: {
            version: '1.0.0',
            author: 'Test Author'
          }
        }
      };

      const response = await request(app)
        .post('/api/tools')
        .set('Authorization', `Bearer ${userToken}`)
        .send(complexToolData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.tool.config).toEqual(complexToolData.config);
      
      // Verify the tool can be retrieved
      const listResponse = await request(app)
        .get('/api/tools')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const createdTool = listResponse.body.tools.find(t => t.name === 'Complex Tool');
      expect(createdTool).toBeDefined();
      expect(createdTool.config).toEqual(complexToolData.config);
    });
  });
});

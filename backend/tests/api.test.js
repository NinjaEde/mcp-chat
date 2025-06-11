const request = require('supertest');
const { createTestApp } = require('./helpers/testApp.js');

describe('General API', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('Health Check', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeDefined();
      expect(response.body.uptime).toBeDefined();
      expect(response.body.memory).toBeDefined();
      expect(response.body.memory.rss).toBeDefined();
      expect(response.body.memory.heapTotal).toBeDefined();
      expect(response.body.memory.heapUsed).toBeDefined();
    });
  });

  describe('CORS Headers', () => {
    test('should include CORS headers', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    test('should handle preflight OPTIONS request', async () => {
      const response = await request(app)
        .options('/api/health')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Error Handling', () => {
    test('should handle non-existent routes', async () => {
      const response = await request(app)
        .get('/api/non-existent-route')
        .expect(404);
    });

    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });
  });

  describe('Request Validation', () => {
    test('should accept valid JSON in request body', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'test',
          password: 'test'
        });

      // Should not be a JSON parsing error (400), but auth error (401)
      expect(response.status).not.toBe(400);
    });

    test('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send();

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Username und Passwort erforderlich');
    });
  });

  describe('Content-Type Handling', () => {
    test('should handle application/json content type', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({
          username: 'test',
          password: 'test'
        }));

      expect(response.status).not.toBe(415); // Not Unsupported Media Type
    });
  });
});

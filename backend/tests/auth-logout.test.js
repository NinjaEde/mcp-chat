const request = require('supertest');
const app = require('../src/index.js').default;

describe('Auth Logout API', () => {
  let authToken;
  
  beforeAll(async () => {
    // Login to get a token for testing
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'admin',
        password: 'admin123'
      });
    
    if (loginResponse.status === 200) {
      authToken = loginResponse.body.token;
    }
  });

  describe('POST /api/auth/logout', () => {
    it('should successfully logout with valid token', async () => {
      if (!authToken) {
        console.log('Skipping logout test - no auth token available');
        return;
      }

      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Erfolgreich abgemeldet');
    });

    it('should return 401 without token', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('autorisiert');
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('autorisiert');
    });

    it('should return 401 with malformed authorization header', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'InvalidFormat token');

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('autorisiert');
    });
  });
});

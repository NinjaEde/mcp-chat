const request = require('supertest');
const { createTestApp, createTestUserAndToken } = require('./helpers/testApp.js');
const auth = require('../src/auth.js');

describe('Authentication API', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('POST /api/auth/login', () => {
    test('should login with valid credentials', async () => {
      // Create a test user first
      const hashedPassword = await auth.hashPassword('testpassword');
      
      await new Promise((resolve, reject) => {
        const db = require('../../src/db.js').default;
        db.run(
          'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
          ['testuser', hashedPassword, 'user'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'testpassword'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toMatchObject({
        username: 'testuser',
        role: 'user'
      });
    });

    test('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body.error).toBe('Ungültige Anmeldedaten');
    });

    test('should reject missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Username und Passwort erforderlich');
    });
  });

  describe('JWT Token Validation', () => {
    test('should validate valid JWT token', () => {
      const testUser = { id: 1, username: 'testuser', role: 'user' };
      const token = auth.generateToken(testUser);
      
      const decoded = auth.verifyToken(token);
      expect(decoded).toMatchObject(testUser);
    });

    test('should reject invalid JWT token', () => {
      const invalidToken = 'invalid.token.here';
      const decoded = auth.verifyToken(invalidToken);
      
      expect(decoded).toBeNull();
    });
  });

  describe('Password Hashing', () => {
    test('should hash and verify password correctly', async () => {
      const password = 'testpassword123';
      const hashedPassword = await auth.hashPassword(password);
      
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(50);
      
      const isValid = await auth.comparePassword(password, hashedPassword);
      expect(isValid).toBe(true);
      
      const isInvalid = await auth.comparePassword('wrongpassword', hashedPassword);
      expect(isInvalid).toBe(false);
    });
  });
});

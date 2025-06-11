const request = require('supertest');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Simple auth simulation for testing
const mockAuth = {
  hashPassword: async (password) => {
    return await bcrypt.hash(password, 10);
  },
  
  comparePassword: async (password, hash) => {
    return await bcrypt.compare(password, hash);
  },
  
  generateToken: (user) => {
    return jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role 
      },
      'test-secret',
      { expiresIn: '12h' }
    );
  },
  
  verifyToken: (token) => {
    try {
      return jwt.verify(token, 'test-secret');
    } catch (error) {
      return null;
    }
  }
};

describe('Authentication Functions', () => {
  describe('Password Hashing', () => {
    test('should hash password correctly', async () => {
      const password = 'testpassword123';
      const hashedPassword = await mockAuth.hashPassword(password);
      
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(50);
      
      const isValid = await mockAuth.comparePassword(password, hashedPassword);
      expect(isValid).toBe(true);
      
      const isInvalid = await mockAuth.comparePassword('wrongpassword', hashedPassword);
      expect(isInvalid).toBe(false);
    });
  });

  describe('JWT Token Management', () => {
    test('should generate and verify valid JWT token', () => {
      const testUser = { id: 1, username: 'testuser', role: 'user' };
      const token = mockAuth.generateToken(testUser);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      
      const decoded = mockAuth.verifyToken(token);
      expect(decoded).toMatchObject({
        id: testUser.id,
        username: testUser.username,
        role: testUser.role
      });
    });

    test('should reject invalid JWT token', () => {
      const invalidToken = 'invalid.token.here';
      const decoded = mockAuth.verifyToken(invalidToken);
      
      expect(decoded).toBeNull();
    });
  });
});

describe('Authentication API Simulation', () => {
  let app;
  const mockUsers = [
    { id: 1, username: 'admin', password: '$2b$10$mockhashedpassword', role: 'admin' },
    { id: 2, username: 'user', password: '$2b$10$mockhashedpassword', role: 'user' }
  ];

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Mock login endpoint
    app.post('/api/auth/login', async (req, res) => {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: 'Username und Passwort erforderlich' });
      }
      
      const user = mockUsers.find(u => u.username === username);
      if (!user) {
        return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
      }
      
      // For testing, we'll use a simple password check
      if (password !== 'testpassword') {
        return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
      }
      
      const token = mockAuth.generateToken(user);
      
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

    // Mock protected endpoint
    app.get('/api/profile', (req, res) => {
      const token = req.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return res.status(401).json({ error: 'Token erforderlich' });
      }
      
      const decoded = mockAuth.verifyToken(token);
      if (!decoded) {
        return res.status(401).json({ error: 'Ungültiger Token' });
      }
      
      res.json({
        success: true,
        user: decoded
      });
    });
  });

  describe('POST /api/auth/login', () => {
    test('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
          password: 'testpassword'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toMatchObject({
        username: 'admin',
        role: 'admin'
      });
    });

    test('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'admin',
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

  describe('Protected Routes', () => {
    test('should access protected route with valid token', async () => {
      // First login to get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'user',
          password: 'testpassword'
        })
        .expect(200);

      const token = loginResponse.body.token;

      // Then access protected route
      const response = await request(app)
        .get('/api/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.username).toBe('user');
    });

    test('should reject access without token', async () => {
      const response = await request(app)
        .get('/api/profile')
        .expect(401);

      expect(response.body.error).toBe('Token erforderlich');
    });

    test('should reject access with invalid token', async () => {
      const response = await request(app)
        .get('/api/profile')
        .set('Authorization', 'Bearer invalid.token')
        .expect(401);

      expect(response.body.error).toBe('Ungültiger Token');
    });
  });
});

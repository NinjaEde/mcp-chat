const fs = require('fs');
const path = require('path');
const { resetMockDB } = require('./helpers/testApp.js');

// Setup test database
const testDbPath = path.join(process.cwd(), 'database', 'test.db');

beforeAll(() => {
  // Remove test database if it exists
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  
  // Set environment variables for testing
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = testDbPath;
  process.env.JWT_SECRET = 'test-secret';
});

beforeEach(async () => {
  // Reset mock database before each test
  resetMockDB();
});

afterAll(() => {
  // Clean up test database after all tests
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

// Global test timeout
jest.setTimeout(10000);

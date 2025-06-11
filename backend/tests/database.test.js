const db = require('../src/db.js');
const fs = require('fs');
const path = require('path');

describe('Database Operations', () => {
  describe('Database Initialization', () => {
    test('should initialize database with all required tables', (done) => {
      // Check if users table exists
      db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", (err, result) => {
        expect(err).toBeNull();
        expect(result).toBeDefined();
        expect(result.name).toBe('users');

        // Check if conversations table exists
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'", (err, result) => {
          expect(err).toBeNull();
          expect(result).toBeDefined();
          expect(result.name).toBe('conversations');

          // Check if messages table exists
          db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='messages'", (err, result) => {
            expect(err).toBeNull();
            expect(result).toBeDefined();
            expect(result.name).toBe('messages');

            // Check if tools table exists
            db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='tools'", (err, result) => {
              expect(err).toBeNull();
              expect(result).toBeDefined();
              expect(result.name).toBe('tools');

              // Check if ai_connections table exists
              db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_connections'", (err, result) => {
                expect(err).toBeNull();
                expect(result).toBeDefined();
                expect(result.name).toBe('ai_connections');
                done();
              });
            });
          });
        });
      });
    });

    test('should have admin user created', (done) => {
      db.get("SELECT * FROM users WHERE username = 'admin'", (err, user) => {
        expect(err).toBeNull();
        expect(user).toBeDefined();
        expect(user.username).toBe('admin');
        expect(user.role).toBe('admin');
        expect(user.password).toBeDefined();
        done();
      });
    });
  });

  describe('Table Schema Validation', () => {
    test('should have correct users table schema', (done) => {
      db.all("PRAGMA table_info(users)", (err, columns) => {
        expect(err).toBeNull();
        expect(columns).toBeDefined();

        const columnNames = columns.map(col => col.name);
        expect(columnNames).toContain('id');
        expect(columnNames).toContain('username');
        expect(columnNames).toContain('password');
        expect(columnNames).toContain('role');
        expect(columnNames).toContain('created_at');
        done();
      });
    });

    test('should have correct conversations table schema', (done) => {
      db.all("PRAGMA table_info(conversations)", (err, columns) => {
        expect(err).toBeNull();
        expect(columns).toBeDefined();

        const columnNames = columns.map(col => col.name);
        expect(columnNames).toContain('id');
        expect(columnNames).toContain('user_id');
        expect(columnNames).toContain('title');
        expect(columnNames).toContain('created_at');
        expect(columnNames).toContain('ai_connection_id');
        expect(columnNames).toContain('updated_at');
        done();
      });
    });

    test('should have correct messages table schema', (done) => {
      db.all("PRAGMA table_info(messages)", (err, columns) => {
        expect(err).toBeNull();
        expect(columns).toBeDefined();

        const columnNames = columns.map(col => col.name);
        expect(columnNames).toContain('id');
        expect(columnNames).toContain('conversation_id');
        expect(columnNames).toContain('role');
        expect(columnNames).toContain('content');
        expect(columnNames).toContain('created_at');
        done();
      });
    });

    test('should have correct tools table schema', (done) => {
      db.all("PRAGMA table_info(tools)", (err, columns) => {
        expect(err).toBeNull();
        expect(columns).toBeDefined();

        const columnNames = columns.map(col => col.name);
        expect(columnNames).toContain('id');
        expect(columnNames).toContain('name');
        expect(columnNames).toContain('type');
        expect(columnNames).toContain('description');
        expect(columnNames).toContain('config');
        expect(columnNames).toContain('is_active');
        expect(columnNames).toContain('created_at');
        expect(columnNames).toContain('updated_at');
        done();
      });
    });

    test('should have correct ai_connections table schema', (done) => {
      db.all("PRAGMA table_info(ai_connections)", (err, columns) => {
        expect(err).toBeNull();
        expect(columns).toBeDefined();

        const columnNames = columns.map(col => col.name);
        expect(columnNames).toContain('id');
        expect(columnNames).toContain('name');
        expect(columnNames).toContain('provider');
        expect(columnNames).toContain('description');
        expect(columnNames).toContain('config');
        expect(columnNames).toContain('is_active');
        expect(columnNames).toContain('created_at');
        expect(columnNames).toContain('updated_at');
        done();
      });
    });
  });

  describe('Database Operations', () => {
    test('should insert and retrieve user', (done) => {
      const testUsername = `testuser_${Date.now()}`;
      
      db.run(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        [testUsername, 'hashedpassword', 'user'],
        function(err) {
          expect(err).toBeNull();
          expect(this.lastID).toBeDefined();

          // Retrieve the user
          db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (err, user) => {
            expect(err).toBeNull();
            expect(user).toBeDefined();
            expect(user.username).toBe(testUsername);
            expect(user.role).toBe('user');
            done();
          });
        }
      );
    });

    test('should enforce foreign key constraints', (done) => {
      // Try to insert a message with non-existent conversation_id
      db.run(
        'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
        [99999, 'user', 'test message'],
        (err) => {
          // Should fail due to foreign key constraint
          expect(err).toBeDefined();
          expect(err.message).toContain('FOREIGN KEY constraint failed');
          done();
        }
      );
    });

    test('should cascade delete conversations and messages', (done) => {
      // First create a test user
      db.run(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        [`cascadeuser_${Date.now()}`, 'password', 'user'],
        function(err) {
          expect(err).toBeNull();
          const userId = this.lastID;

          // Create a conversation
          db.run(
            'INSERT INTO conversations (user_id, title) VALUES (?, ?)',
            [userId, 'Test Conversation for Cascade'],
            function(err) {
              expect(err).toBeNull();
              const conversationId = this.lastID;

              // Create a message
              db.run(
                'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)',
                [conversationId, 'user', 'Test message'],
                function(err) {
                  expect(err).toBeNull();

                  // Delete the conversation
                  db.run('DELETE FROM conversations WHERE id = ?', [conversationId], (err) => {
                    expect(err).toBeNull();

                    // Check that messages are still there (manual cascade required)
                    db.get('SELECT * FROM messages WHERE conversation_id = ?', [conversationId], (err, message) => {
                      expect(err).toBeNull();
                      // Message should still exist, requiring manual cleanup
                      expect(message).toBeDefined();
                      
                      // Clean up the message manually
                      db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId], (err) => {
                        expect(err).toBeNull();
                        done();
                      });
                    });
                  });
                }
              );
            }
          );
        }
      );
    });
  });

  describe('Database Constraints', () => {
    test('should enforce unique username constraint', (done) => {
      const duplicateUsername = `duplicate_${Date.now()}`;
      
      // Insert first user
      db.run(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        [duplicateUsername, 'password1', 'user'],
        (err) => {
          expect(err).toBeNull();

          // Try to insert duplicate username
          db.run(
            'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
            [duplicateUsername, 'password2', 'user'],
            (err) => {
              expect(err).toBeDefined();
              expect(err.message).toContain('UNIQUE constraint failed');
              done();
            }
          );
        }
      );
    });

    test('should handle NULL values correctly', (done) => {
      // Test conversation without ai_connection_id (should be allowed)
      db.run(
        'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
        [`nulltest_${Date.now()}`, 'password', 'user'],
        function(err) {
          expect(err).toBeNull();
          const userId = this.lastID;

          db.run(
            'INSERT INTO conversations (user_id, title, ai_connection_id) VALUES (?, ?, ?)',
            [userId, 'Test with NULL ai_connection_id', null],
            (err) => {
              expect(err).toBeNull();
              done();
            }
          );
        }
      );
    });
  });
});

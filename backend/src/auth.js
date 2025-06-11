import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import db from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

// Passwort hashen
async function hashPassword(password) {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

// Passwort vergleichen
async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// JWT Token generieren
function generateToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    iat: Math.floor(Date.now() / 1000)
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// JWT Token verifizieren
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
}

// Middleware für Token-Authentifizierung
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Session in DB speichern
function saveSession(userId, token) {
  return new Promise((resolve, reject) => {
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 Stunden
    db.run(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
      [userId, token, expiresAt.toISOString()],
      function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

// Session aus DB entfernen
function removeSession(token) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM sessions WHERE token = ?', [token], function(err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

// Abgelaufene Sessions bereinigen
function cleanExpiredSessions() {
  db.run('DELETE FROM sessions WHERE expires_at < datetime("now")', function(err) {
    if (err) {
      console.error('[AUTH] Fehler beim Bereinigen abgelaufener Sessions:', err);
    } else if (this.changes > 0) {
      console.log(`[AUTH] ${this.changes} abgelaufene Sessions entfernt`);
    }
  });
}

// Session-Bereinigung alle 6 Stunden
setInterval(cleanExpiredSessions, 6 * 60 * 60 * 1000);

// User-Validierung
function validateUser(userData) {
  const errors = [];
  
  if (!userData.username || userData.username.length < 3) {
    errors.push('Benutzername muss mindestens 3 Zeichen lang sein');
  }
  
  if (!userData.password || userData.password.length < 6) {
    errors.push('Passwort muss mindestens 6 Zeichen lang sein');
  }
  
  if (userData.username && !/^[a-zA-Z0-9_-]+$/.test(userData.username)) {
    errors.push('Benutzername darf nur Buchstaben, Zahlen, Unterstriche und Bindestriche enthalten');
  }
  
  return errors;
}

// User-Berechtigungen prüfen
function hasPermission(user, requiredRole) {
  const roleHierarchy = {
    'user': 1,
    'moderator': 2,
    'admin': 3
  };
  
  const userLevel = roleHierarchy[user.role] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;
  
  return userLevel >= requiredLevel;
}

// Rate Limiting für Auth-Endpunkte
const authAttempts = new Map();

function checkRateLimit(identifier, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const attempts = authAttempts.get(identifier) || [];
  
  // Alte Versuche entfernen
  const validAttempts = attempts.filter(time => now - time < windowMs);
  
  if (validAttempts.length >= maxAttempts) {
    return false;
  }
  
  validAttempts.push(now);
  authAttempts.set(identifier, validAttempts);
  return true;
}

function clearRateLimit(identifier) {
  authAttempts.delete(identifier);
}

export default {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  saveSession,
  removeSession,
  cleanExpiredSessions,
  validateUser,
  hasPermission,
  checkRateLimit,
  clearRateLimit,
  authenticateToken
};

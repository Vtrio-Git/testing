const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'rpc-monitor-secret-change-in-production';

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, username, role, active FROM users WHERE id = ?').get(decoded.id);
    if (!user || !user.active) return res.status(401).json({ error: 'Invalid or inactive user' });
    req.user = user;
    next();
  } catch(e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: `Access denied. Required role: ${roles.join(' or ')}` });
    }
    next();
  };
}

function logActivity(user, action, detail, ip) {
  try {
    db.prepare('INSERT INTO activity_log (user, action, detail, ip) VALUES (?, ?, ?, ?)').run(user, action, detail, ip || '');
  } catch(e) {}
}

module.exports = { authMiddleware, requireRole, logActivity, JWT_SECRET };

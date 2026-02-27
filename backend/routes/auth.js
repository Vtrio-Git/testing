const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authMiddleware, requireRole, logActivity, JWT_SECRET } = require('../auth');

// Check if first-time setup needed
router.get('/setup-status', (req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  res.json({ needsSetup: userCount === 0 });
});

// First-time setup — create superadmin
router.post('/setup', (req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount > 0) return res.status(400).json({ error: 'Setup already complete' });

  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const hash = bcrypt.hashSync(password, 12);
  db.prepare('INSERT INTO users (username, password_hash, role, created_by) VALUES (?, ?, ?, ?)').run(username, hash, 'superadmin', 'setup');
  db.prepare("UPDATE settings SET value='1' WHERE key='setup_complete'").run();

  const token = jwt.sign({ id: db.prepare('SELECT id FROM users WHERE username=?').get(username).id }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ success: true, token, username, role: 'superadmin' });
});

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  db.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').run(user.id);
  logActivity(username, 'LOGIN', `Logged in`, req.ip);

  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, username: user.username, role: user.role });
});

// Get current user info
router.get('/me', authMiddleware, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role });
});

// ── User Management (superadmin only) ────────────────────────────────────────

// List users
router.get('/users', authMiddleware, requireRole('superadmin'), (req, res) => {
  const users = db.prepare('SELECT id, username, role, active, last_login, created_at, created_by FROM users ORDER BY created_at').all();
  res.json(users);
});

// Create user
router.post('/users', authMiddleware, requireRole('superadmin'), (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (!['superadmin', 'admin', 'user'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const hash = bcrypt.hashSync(password, 12);
    const result = db.prepare('INSERT INTO users (username, password_hash, role, created_by) VALUES (?, ?, ?, ?)').run(username, hash, role, req.user.username);
    logActivity(req.user.username, 'CREATE_USER', `Created user: ${username} (${role})`, req.ip);
    res.json({ id: result.lastInsertRowid, username, role });
  } catch(e) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

// Update user
router.put('/users/:id', authMiddleware, requireRole('superadmin'), (req, res) => {
  const { password, role, active } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Prevent superadmin from demoting themselves
  if (user.id === req.user.id && role && role !== 'superadmin') {
    return res.status(400).json({ error: 'Cannot change your own role' });
  }

  if (password) {
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const hash = bcrypt.hashSync(password, 12);
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, req.params.id);
  }
  if (role) db.prepare('UPDATE users SET role=? WHERE id=?').run(role, req.params.id);
  if (active !== undefined) db.prepare('UPDATE users SET active=? WHERE id=?').run(active ? 1 : 0, req.params.id);

  logActivity(req.user.username, 'UPDATE_USER', `Updated user: ${user.username}`, req.ip);
  res.json({ success: true });
});

// Delete user
router.delete('/users/:id', authMiddleware, requireRole('superadmin'), (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });

  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  logActivity(req.user.username, 'DELETE_USER', `Deleted user: ${user.username}`, req.ip);
  res.json({ success: true });
});

// Activity log
router.get('/activity', authMiddleware, requireRole('superadmin', 'admin'), (req, res) => {
  const logs = db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 200').all();
  res.json(logs);
});

module.exports = router;

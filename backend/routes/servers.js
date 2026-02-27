const router = require('express').Router();
const db = require('../db');
const { authMiddleware, requireRole, logActivity } = require('../auth');
const { testSSHConnection } = require('../ssh');

router.get('/', authMiddleware, (req, res) => {
  const { endpoint_id } = req.query;
  let query = 'SELECT id, endpoint_id, label, host, port, ssh_user, created_at FROM servers';
  const params = [];
  if (endpoint_id) { query += ' WHERE endpoint_id = ?'; params.push(endpoint_id); }
  res.json(db.prepare(query).all(...params));
});

router.post('/', authMiddleware, requireRole('superadmin', 'admin'), (req, res) => {
  const { endpoint_id, label, host, port, ssh_user, ssh_key } = req.body;
  if (!endpoint_id || !host) return res.status(400).json({ error: 'endpoint_id and host required' });
  const result = db.prepare('INSERT INTO servers (endpoint_id, label, host, port, ssh_user, ssh_key) VALUES (?, ?, ?, ?, ?, ?)').run(endpoint_id, label || host, host, port || 22, ssh_user || 'ubuntu', ssh_key || null);
  logActivity(req.user.username, 'ADD_SERVER', `Added server: ${host} to endpoint ${endpoint_id}`, req.ip);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', authMiddleware, requireRole('superadmin', 'admin'), (req, res) => {
  const { label, host, port, ssh_user, ssh_key } = req.body;
  const current = db.prepare('SELECT * FROM servers WHERE id=?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Not found' });
  const keyToSave = ssh_key !== undefined && ssh_key !== '' ? ssh_key : current.ssh_key;
  db.prepare('UPDATE servers SET label=?, host=?, port=?, ssh_user=?, ssh_key=? WHERE id=?').run(label || host, host, port || 22, ssh_user || 'ubuntu', keyToSave, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', authMiddleware, requireRole('superadmin', 'admin'), (req, res) => {
  const s = db.prepare('SELECT host FROM servers WHERE id=?').get(req.params.id);
  db.prepare('DELETE FROM servers WHERE id=?').run(req.params.id);
  logActivity(req.user.username, 'DELETE_SERVER', `Deleted server: ${s?.host}`, req.ip);
  res.json({ success: true });
});

router.post('/:id/test', authMiddleware, requireRole('superadmin', 'admin'), async (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id=?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const result = await testSSHConnection(server);
  logActivity(req.user.username, 'TEST_SSH', `Tested SSH to ${server.host}: ${result.success ? 'OK' : result.error}`, req.ip);
  res.json(result);
});

module.exports = router;

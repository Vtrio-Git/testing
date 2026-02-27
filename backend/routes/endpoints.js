const router = require('express').Router();
const db = require('../db');
const { authMiddleware, requireRole, logActivity } = require('../auth');

router.get('/', authMiddleware, (req, res) => {
  const endpoints = db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM servers s WHERE s.endpoint_id = e.id) as server_count,
      (SELECT COUNT(*) FROM alerts a WHERE a.endpoint_id = e.id AND a.acknowledged = 0) as active_alerts
    FROM endpoints e ORDER BY e.name
  `).all();
  res.json(endpoints);
});

router.post('/', authMiddleware, requireRole('superadmin', 'admin'), (req, res) => {
  const { name, wss_url, network } = req.body;
  if (!name || !wss_url) return res.status(400).json({ error: 'name and wss_url required' });
  try {
    const result = db.prepare('INSERT INTO endpoints (name, wss_url, network) VALUES (?, ?, ?)').run(name, wss_url, network || '');
    logActivity(req.user.username, 'ADD_ENDPOINT', `Added endpoint: ${name} (${wss_url})`, req.ip);
    res.json({ id: result.lastInsertRowid, name, wss_url, network });
  } catch(e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', authMiddleware, requireRole('superadmin', 'admin'), (req, res) => {
  const { name, wss_url, network, enabled } = req.body;
  db.prepare('UPDATE endpoints SET name=?, wss_url=?, network=?, enabled=? WHERE id=?').run(name, wss_url, network, enabled !== undefined ? enabled : 1, req.params.id);
  logActivity(req.user.username, 'EDIT_ENDPOINT', `Edited endpoint: ${name}`, req.ip);
  res.json({ success: true });
});

router.delete('/:id', authMiddleware, requireRole('superadmin', 'admin'), (req, res) => {
  const ep = db.prepare('SELECT name FROM endpoints WHERE id=?').get(req.params.id);
  db.prepare('DELETE FROM endpoints WHERE id=?').run(req.params.id);
  logActivity(req.user.username, 'DELETE_ENDPOINT', `Deleted endpoint: ${ep?.name}`, req.ip);
  res.json({ success: true });
});

module.exports = router;

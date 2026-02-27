const router = require('express').Router();
const db = require('../db');
const { authMiddleware, requireRole, logActivity } = require('../auth');

router.get('/', authMiddleware, (req, res) => {
  const { acknowledged, limit = 100 } = req.query;
  let query = 'SELECT a.*, e.name as endpoint_name FROM alerts a LEFT JOIN endpoints e ON a.endpoint_id = e.id';
  const params = [];
  if (acknowledged !== undefined) {
    query += ' WHERE a.acknowledged = ?';
    params.push(parseInt(acknowledged));
  }
  query += ' ORDER BY a.created_at DESC LIMIT ?';
  params.push(parseInt(limit));
  res.json(db.prepare(query).all(...params));
});

router.post('/:id/acknowledge', authMiddleware, requireRole('superadmin', 'admin'), (req, res) => {
  db.prepare('UPDATE alerts SET acknowledged=1, acknowledged_by=?, acknowledged_at=datetime("now") WHERE id=?').run(req.user.username, req.params.id);
  const alert = db.prepare('SELECT wss_url FROM alerts WHERE id=?').get(req.params.id);
  logActivity(req.user.username, 'ACK_ALERT', `Acknowledged alert for ${alert?.wss_url}`, req.ip);
  res.json({ success: true });
});

router.post('/acknowledge-all', authMiddleware, requireRole('superadmin', 'admin'), (req, res) => {
  db.prepare('UPDATE alerts SET acknowledged=1, acknowledged_by=?, acknowledged_at=datetime("now") WHERE acknowledged=0').run(req.user.username);
  logActivity(req.user.username, 'ACK_ALL_ALERTS', 'Acknowledged all alerts', req.ip);
  res.json({ success: true });
});

router.delete('/:id', authMiddleware, requireRole('superadmin'), (req, res) => {
  db.prepare('DELETE FROM alerts WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// Check Now — all roles allowed, streams live output via SSE
router.post('/check-now', authMiddleware, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  logActivity(req.user.username, 'CHECK_NOW', 'Manual check triggered', req.ip);

  const { runHealthChecks } = require('../healthcheck');
  await runHealthChecks(send);

  send({ type: 'done' });
  res.end();
});

module.exports = router;

const router = require('express').Router();
const db = require('../db');
const { authMiddleware, requireRole, logActivity } = require('../auth');
const { restartServicesOnServer } = require('../ssh');

router.post('/endpoint/:endpointId', authMiddleware, requireRole('superadmin', 'admin'), async (req, res) => {
  const servers = db.prepare('SELECT * FROM servers WHERE endpoint_id=?').all(req.params.endpointId);
  const ep = db.prepare('SELECT name FROM endpoints WHERE id=?').get(req.params.endpointId);
  if (!servers.length) return res.status(400).json({ error: 'No servers configured' });

  logActivity(req.user.username, 'RESTART_SERVICES', `Restarted nginx+health_check on ALL servers for endpoint: ${ep?.name}`, req.ip);

  const results = await Promise.all(servers.map(async server => {
    const result = await restartServicesOnServer(server);
    db.prepare('INSERT INTO restart_log (server_id, host, services, status, output, triggered_by, triggered_by_user) VALUES (?,?,?,?,?,?,?)').run(
      server.id, server.host, 'nginx, health_check',
      result.success ? 'success' : 'failed',
      result.success ? JSON.stringify(result.results) : result.error,
      'manual', req.user.username
    );
    return { server: { id: server.id, label: server.label, host: server.host }, ...result };
  }));

  res.json({ results });
});

router.post('/server/:serverId', authMiddleware, requireRole('superadmin', 'admin'), async (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id=?').get(req.params.serverId);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const ep = db.prepare('SELECT name FROM endpoints WHERE id=?').get(server.endpoint_id);

  logActivity(req.user.username, 'RESTART_SERVICES', `Restarted nginx+health_check on ${server.host} (${ep?.name})`, req.ip);

  const result = await restartServicesOnServer(server);
  db.prepare('INSERT INTO restart_log (server_id, host, services, status, output, triggered_by, triggered_by_user) VALUES (?,?,?,?,?,?,?)').run(
    server.id, server.host, 'nginx, health_check',
    result.success ? 'success' : 'failed',
    result.success ? JSON.stringify(result.results) : result.error,
    'manual', req.user.username
  );

  res.json({ server: { id: server.id, label: server.label, host: server.host }, ...result });
});

router.get('/history', authMiddleware, (req, res) => {
  const history = db.prepare('SELECT * FROM restart_log ORDER BY created_at DESC LIMIT 100').all();
  res.json(history);
});

module.exports = router;

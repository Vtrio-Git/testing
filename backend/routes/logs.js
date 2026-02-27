const router = require('express').Router();
const db = require('../db');
const { authMiddleware, logActivity } = require('../auth');
const { fetchLogsFromServer } = require('../ssh');
const fs = require('fs');
const path = require('path');

const SNAPSHOT_DIR = path.join(__dirname, '..', 'log-snapshots');
if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

function saveSnapshot(endpointName, serverHost, logFile, content, fetchedBy) {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const safeName = (endpointName || 'unknown').replace(/[^a-z0-9]/gi, '_');
    const safeHost = serverHost.replace(/[^a-z0-9.]/gi, '_');
    const safeLog = path.basename(logFile);
    const filename = `${ts}_${safeName}_${safeHost}_${safeLog}`;
    fs.writeFileSync(path.join(SNAPSHOT_DIR, filename), content || '(empty)');

    // Also save to DB
    db.prepare(`INSERT INTO log_snapshots (endpoint_name, server_host, log_file, content, fetched_by) VALUES (?,?,?,?,?)`)
      .run(endpointName, serverHost, logFile, content?.slice(0, 50000), fetchedBy);
  } catch(e) {
    console.error('[Snapshot] Failed to save:', e.message);
  }
}

// Rotate snapshots older than 7 days
function rotateSnapshots() {
  try {
    const files = fs.readdirSync(SNAPSHOT_DIR);
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let deleted = 0;
    for (const f of files) {
      const fpath = path.join(SNAPSHOT_DIR, f);
      const stat = fs.statSync(fpath);
      if (stat.mtimeMs < cutoff) { fs.unlinkSync(fpath); deleted++; }
    }
    // Also clean DB
    db.prepare(`DELETE FROM log_snapshots WHERE created_at < datetime('now', '-7 days')`).run();
    if (deleted > 0) console.log(`[LogRotate] Deleted ${deleted} old snapshots`);
  } catch(e) {}
}

// Run rotation daily
const cron = require('node-cron');
cron.schedule('0 2 * * *', rotateSnapshots);

// Fetch logs for all servers of an endpoint
router.get('/endpoint/:endpointId', authMiddleware, async (req, res) => {
  const ep = db.prepare('SELECT * FROM endpoints WHERE id=?').get(req.params.endpointId);
  const servers = db.prepare('SELECT * FROM servers WHERE endpoint_id = ?').all(req.params.endpointId);
  if (!servers.length) return res.json({ servers: [], message: 'No servers configured' });

  logActivity(req.user.username, 'FETCH_LOGS', `Fetched logs for endpoint: ${ep?.name}`, req.ip);

  const results = await Promise.all(servers.map(async server => {
    const logResult = await fetchLogsFromServer(server);
    // Save snapshots
    if (logResult.success) {
      for (const [logFile, content] of Object.entries(logResult.logs)) {
        saveSnapshot(ep?.name, server.host, logFile, content, req.user.username);
      }
    }
    return { server: { id: server.id, label: server.label, host: server.host }, ...logResult };
  }));

  res.json({ servers: results });
});

// Fetch logs for specific server
router.get('/server/:serverId', authMiddleware, async (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id=?').get(req.params.serverId);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  const ep = db.prepare('SELECT name FROM endpoints WHERE id=?').get(server.endpoint_id);

  const result = await fetchLogsFromServer(server);
  if (result.success) {
    for (const [logFile, content] of Object.entries(result.logs)) {
      saveSnapshot(ep?.name, server.host, logFile, content, req.user.username);
    }
  }
  logActivity(req.user.username, 'FETCH_LOGS', `Fetched logs for server: ${server.host}`, req.ip);
  res.json({ server: { id: server.id, label: server.label, host: server.host }, ...result });
});

// List snapshots
router.get('/snapshots', authMiddleware, (req, res) => {
  const snaps = db.prepare('SELECT id, endpoint_name, server_host, log_file, fetched_by, created_at FROM log_snapshots ORDER BY created_at DESC LIMIT 200').all();
  res.json(snaps);
});

// View snapshot content
router.get('/snapshots/:id', authMiddleware, (req, res) => {
  const snap = db.prepare('SELECT * FROM log_snapshots WHERE id=?').get(req.params.id);
  if (!snap) return res.status(404).json({ error: 'Not found' });
  res.json(snap);
});

module.exports = router;

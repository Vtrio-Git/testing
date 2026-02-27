require('dotenv').config();
const express = require('express');
const cors = require('cors');
const expressWs = require('express-ws');
const cron = require('node-cron');
const path = require('path');
const db = require('./db');
const { runHealthChecks } = require('./healthcheck');

const app = express();
expressWs(app);
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/endpoints', require('./routes/endpoints'));
app.use('/api/servers', require('./routes/servers'));
app.use('/api/logs', require('./routes/logs'));
app.use('/api/alerts', require('./routes/alerts'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/restart', require('./routes/restart'));

// WebSocket
const wsClients = new Set();
app.ws('/ws', (ws, req) => {
  wsClients.add(ws);
  try {
    const activeAlerts = db.prepare('SELECT * FROM alerts WHERE acknowledged=0 ORDER BY created_at DESC LIMIT 50').all();
    ws.send(JSON.stringify({ type: 'initial_state', activeAlerts }));
  } catch(e) {}
  ws.on('close', () => wsClients.delete(ws));
});

global.broadcast = function(data) {
  const msg = JSON.stringify(data);
  wsClients.forEach(ws => { try { if (ws.readyState === 1) ws.send(msg); } catch(e) {} });
};

// Serve built React frontend
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.get('*', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

// Scheduler
let checkJob = null;
function scheduleChecks() {
  if (checkJob) checkJob.destroy();
  const mins = db.prepare("SELECT value FROM settings WHERE key='check_interval_minutes'").get()?.value || '1';
  const expr = mins === '1' ? '* * * * *' : `*/${mins} * * * *`;
  console.log(`[CRON] Health checks every ${mins} min`);
  checkJob = cron.schedule(expr, () => runHealthChecks());
}
global.rescheduleChecks = scheduleChecks;
scheduleChecks();

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ RPC Monitor running at http://0.0.0.0:${PORT}\n`);
  setTimeout(runHealthChecks, 3000);
});

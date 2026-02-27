const router = require('express').Router();
const db = require('../db');
const { authMiddleware, requireRole, logActivity } = require('../auth');

router.get('/', authMiddleware, (req, res) => {
  const settings = db.prepare('SELECT key, value FROM settings').all();
  const obj = {};
  settings.forEach(s => { obj[s.key] = s.value; });
  res.json(obj);
});

router.post('/', authMiddleware, requireRole('superadmin'), (req, res) => {
  const { slack_webhook, prometheus_url, check_interval_minutes, alert_cooldown_minutes } = req.body;
  const updates = { slack_webhook, prometheus_url, check_interval_minutes, alert_cooldown_minutes };
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').run(key, value);
  }
  if (check_interval_minutes && global.rescheduleChecks) global.rescheduleChecks();
  logActivity(req.user.username, 'UPDATE_SETTINGS', 'Updated system settings', req.ip);
  res.json({ success: true });
});

router.post('/test-slack', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const { sendSlackAlert } = require('../slack');
  try {
    await sendSlackAlert({ wss: 'wss://test.radiumblock.co/ws', errorType: 'connect', zone: 'us-east', network: 'test', message: 'Test alert from RPC Monitor' });
    res.json({ success: true, message: 'Test alert sent to Slack' });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;

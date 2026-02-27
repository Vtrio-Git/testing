const fetch = require('node-fetch');
const db = require('./db');
const { sendSlackAlert } = require('./slack');

const PROMETHEUS_URLS = [
  'http://mon-us-east.rpc-providers.net/',
  'http://mon-eu-central.rpc-providers.net/'
];

function parsePrometheusText(text) {
  const metrics = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const match = line.match(/^(\w+)\{([^}]*)\}\s+([\d.eE+\-NaN]+)/);
    if (!match) continue;
    const labels = {};
    for (const lm of match[2].matchAll(/(\w+)="([^"]*)"/g)) labels[lm[1]] = lm[2];
    metrics.push({ name: match[1], labels, value: parseFloat(match[3]) });
  }
  return metrics;
}

function isInCooldown(wssUrl, errorType) {
  const cooldown = parseInt(db.prepare("SELECT value FROM settings WHERE key='alert_cooldown_minutes'").get()?.value || '15');
  const recent = db.prepare(`SELECT id FROM alerts WHERE wss_url=? AND error_type=? AND slack_sent=1 AND created_at > datetime('now','-${cooldown} minutes') LIMIT 1`).get(wssUrl, errorType);
  return !!recent;
}

async function scrapePrometheus(url, send) {
  try {
    send && send({ type: 'log', msg: `🔍 Scraping ${url}...` });
    const res = await fetch(url, { timeout: 15000 });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const metrics = parsePrometheusText(text);
    send && send({ type: 'log', msg: `✅ Got ${metrics.length} metrics from ${url}` });
    return metrics;
  } catch(err) {
    send && send({ type: 'log', msg: `❌ Failed to scrape ${url}: ${err.message}`, level: 'error' });
    return [];
  }
}

async function runHealthChecks(send) {
  const noop = () => {};
  const emit = send || noop;

  const prometheusUrl = db.prepare("SELECT value FROM settings WHERE key='prometheus_url'").get()?.value || PROMETHEUS_URLS[0];
  emit({ type: 'log', msg: `⏱ Starting health check at ${new Date().toUTCString()}` });

  const metrics = await scrapePrometheus(prometheusUrl, emit);
  if (!metrics.length) {
    emit({ type: 'log', msg: '⚠️ No metrics received — check Prometheus URL in settings', level: 'warn' });
    return;
  }

  // All radiumblock wss endpoints seen in metrics
  const allWss = [...new Set(metrics.filter(m => m.labels.wss?.includes('radiumblock')).map(m => m.labels.wss))];
  emit({ type: 'log', msg: `📡 Found ${allWss.length} radiumblock endpoints in metrics:` });
  for (const w of allWss) emit({ type: 'log', msg: `   → ${w}` });

  // Filter active errors
  const errorMetrics = metrics.filter(m =>
    m.name === 'rpc_error' &&
    m.labels.wss?.includes('radiumblock') &&
    m.value === 1
  );

  if (errorMetrics.length === 0) {
    emit({ type: 'log', msg: '✅ No active errors found for any radiumblock endpoint', level: 'ok' });
  } else {
    emit({ type: 'log', msg: `🚨 Found ${errorMetrics.length} active error(s):`, level: 'error' });
  }

  const endpoints = db.prepare('SELECT * FROM endpoints WHERE enabled=1').all();
  const newAlerts = [];

  for (const metric of errorMetrics) {
    const { wss, error, zone, network } = metric.labels;
    const errorType = error || 'unknown';
    emit({ type: 'log', msg: `   ⚠️  ${wss} — error: ${errorType} | zone: ${zone} | network: ${network}`, level: 'error' });

    const endpoint = endpoints.find(e => e.wss_url === wss);

    if (isInCooldown(wss, errorType)) {
      emit({ type: 'log', msg: `   ⏳ Skipping Slack alert for ${wss} (${errorType}) — in cooldown period`, level: 'warn' });
      continue;
    }

    const message = `Error: ${errorType} | Zone: ${zone} | Network: ${network}`;
    const result = db.prepare('INSERT INTO alerts (endpoint_id, wss_url, error_type, message, slack_sent) VALUES (?,?,?,?,0)').run(endpoint?.id || null, wss, errorType, message);
    newAlerts.push({ alertId: result.lastInsertRowid, wss, errorType, zone, network, message });
  }

  for (const alert of newAlerts) {
    try {
      emit({ type: 'log', msg: `📨 Sending Slack alert for ${alert.wss} (${alert.errorType})...` });
      await sendSlackAlert(alert);
      db.prepare('UPDATE alerts SET slack_sent=1 WHERE id=?').run(alert.alertId);
      emit({ type: 'log', msg: `✅ Slack alert sent`, level: 'ok' });
    } catch(err) {
      emit({ type: 'log', msg: `❌ Slack alert failed: ${err.message}`, level: 'error' });
    }
  }

  emit({ type: 'log', msg: `✔ Check complete. ${newAlerts.length} new alert(s) created.`, level: newAlerts.length > 0 ? 'error' : 'ok' });
  emit({ type: 'summary', newAlerts: newAlerts.length, totalErrors: errorMetrics.length });

  if (global.broadcast) {
    const activeAlerts = db.prepare('SELECT * FROM alerts WHERE acknowledged=0 ORDER BY created_at DESC LIMIT 50').all();
    global.broadcast({ type: 'health_update', timestamp: new Date().toISOString(), newAlerts: newAlerts.length, activeAlerts });
  }
}

module.exports = { runHealthChecks };

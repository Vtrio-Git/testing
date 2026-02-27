const fetch = require('node-fetch');
const db = require('./db');
const { sendSlackAlert } = require('./slack');
const { fetchLogsFromServer } = require('./ssh');
const fs = require('fs');
const path = require('path');

const ALERT_LOGS_DIR = path.join(__dirname, 'alert-logs');
if (!fs.existsSync(ALERT_LOGS_DIR)) fs.mkdirSync(ALERT_LOGS_DIR, { recursive: true });

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

// Auto-fetch logs from all servers for an endpoint and save to alert-logs dir
async function autoFetchLogs(alertId, endpoint, servers) {
  if (!servers.length) return;

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const safeName = (endpoint?.name || 'unknown').replace(/[^a-z0-9]/gi, '_');
  const alertDir = path.join(ALERT_LOGS_DIR, `${ts}_alert${alertId}_${safeName}`);
  fs.mkdirSync(alertDir, { recursive: true });

  console.log(`[AutoLogs] Fetching logs for alert ${alertId} — ${endpoint?.name}`);

  for (const server of servers) {
    try {
      const result = await fetchLogsFromServer(server);
      const safeHost = server.host.replace(/[^a-z0-9.]/gi, '_');
      const serverDir = path.join(alertDir, safeHost);
      fs.mkdirSync(serverDir, { recursive: true });

      if (result.success) {
        for (const [logFile, content] of Object.entries(result.logs)) {
          const logName = path.basename(logFile);
          fs.writeFileSync(path.join(serverDir, logName), content || '(empty)');

          // Also save to DB snapshots table for UI access
          db.prepare(`INSERT INTO log_snapshots (endpoint_id, endpoint_name, server_host, log_file, content, fetched_by, created_at) VALUES (?,?,?,?,?,?,datetime('now'))`)
            .run(endpoint?.id || null, endpoint?.name || '', server.host, logFile, content?.slice(0, 50000), 'auto-alert');
        }
        console.log(`[AutoLogs] ✅ Saved logs from ${server.host}`);
      } else {
        fs.writeFileSync(path.join(serverDir, 'error.txt'), `SSH Error: ${result.error}`);
        console.log(`[AutoLogs] ❌ Failed to fetch from ${server.host}: ${result.error}`);
      }
    } catch(e) {
      console.log(`[AutoLogs] ❌ Error fetching from ${server.host}: ${e.message}`);
    }
  }

  // Save alert_id reference in DB for UI to know logs are pre-fetched
  db.prepare('UPDATE alerts SET logs_fetched=1, logs_dir=? WHERE id=?').run(alertDir, alertId);
  console.log(`[AutoLogs] Logs saved to ${alertDir}`);
}

async function runHealthChecks(send) {
  const emit = send || (() => {});

  const prometheusUrl = db.prepare("SELECT value FROM settings WHERE key='prometheus_url'").get()?.value || 'http://mon-us-east.rpc-providers.net/';
  emit({ type: 'log', msg: `⏱ Starting health check at ${new Date().toUTCString()}` });

  const metrics = await scrapePrometheus(prometheusUrl, emit);
  if (!metrics.length) {
    emit({ type: 'log', msg: '⚠️ No metrics received — check Prometheus URL in settings', level: 'warn' });
    return;
  }

  const allWss = [...new Set(metrics.filter(m => m.labels.wss?.includes('radiumblock')).map(m => m.labels.wss))];
  emit({ type: 'log', msg: `📡 Found ${allWss.length} radiumblock endpoints in metrics:` });
  for (const w of allWss) emit({ type: 'log', msg: `   → ${w}` });

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
      emit({ type: 'log', msg: `   ⏳ Skipping alert for ${wss} (${errorType}) — in cooldown`, level: 'warn' });
      continue;
    }

    const message = `Error: ${errorType} | Zone: ${zone} | Network: ${network}`;
    const result = db.prepare('INSERT INTO alerts (endpoint_id, wss_url, error_type, message, slack_sent, logs_fetched) VALUES (?,?,?,?,0,0)').run(
      endpoint?.id || null, wss, errorType, message
    );
    newAlerts.push({ alertId: result.lastInsertRowid, wss, errorType, zone, network, message, endpoint });
  }

  // Send Slack alerts
  for (const alert of newAlerts) {
    try {
      emit({ type: 'log', msg: `📨 Sending Slack alert for ${alert.wss} (${alert.errorType})...` });
      await sendSlackAlert(alert);
      db.prepare('UPDATE alerts SET slack_sent=1 WHERE id=?').run(alert.alertId);
      emit({ type: 'log', msg: `✅ Slack alert sent`, level: 'ok' });
    } catch(err) {
      emit({ type: 'log', msg: `❌ Slack alert failed: ${err.message}`, level: 'error' });
    }

    // Auto-fetch logs in background (don't await — don't block the health check)
    if (alert.endpoint) {
      const servers = db.prepare('SELECT * FROM servers WHERE endpoint_id=?').all(alert.endpoint.id);
      if (servers.length) {
        emit({ type: 'log', msg: `📋 Auto-fetching logs from ${servers.length} server(s) for ${alert.endpoint.name}...` });
        autoFetchLogs(alert.alertId, alert.endpoint, servers).catch(e => {
          console.error('[AutoLogs] Error:', e.message);
        });
      } else {
        emit({ type: 'log', msg: `⚠️ No servers configured for ${alert.wss} — skipping log fetch`, level: 'warn' });
      }
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

const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, 'monitor.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS endpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    wss_url TEXT NOT NULL UNIQUE,
    network TEXT,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint_id INTEGER NOT NULL,
    label TEXT,
    host TEXT NOT NULL,
    port INTEGER DEFAULT 22,
    ssh_user TEXT NOT NULL DEFAULT 'ubuntu',
    ssh_key TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint_id INTEGER,
    wss_url TEXT NOT NULL,
    error_type TEXT NOT NULL,
    message TEXT,
    slack_sent INTEGER DEFAULT 0,
    acknowledged INTEGER DEFAULT 0,
    acknowledged_by TEXT,
    acknowledged_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (endpoint_id) REFERENCES endpoints(id)
  );

  CREATE TABLE IF NOT EXISTS restart_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER,
    host TEXT NOT NULL,
    services TEXT NOT NULL,
    status TEXT NOT NULL,
    output TEXT,
    triggered_by TEXT DEFAULT 'manual',
    triggered_by_user TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT,
    ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS log_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint_id INTEGER,
    endpoint_name TEXT,
    server_host TEXT,
    log_file TEXT,
    content TEXT,
    fetched_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_by TEXT,
    last_login DATETIME,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES
    ('slack_webhook', ''),
    ('prometheus_url', 'http://mon-us-east.rpc-providers.net/'),
    ('check_interval_minutes', '1'),
    ('alert_cooldown_minutes', '15'),
    ('setup_complete', '0');
`);

// Create default superadmin if no users exist
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (userCount === 0) {
  console.log('[DB] No users found — first run, awaiting setup via UI');
}

module.exports = db;

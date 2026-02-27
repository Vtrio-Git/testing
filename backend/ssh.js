const { Client } = require('ssh2');

const LOG_FILES = [
  '/var/log/nginx/error.log',
  '/var/log/nginx/access.log',
  '/var/log/nginx/http_error.log',
  '/var/log/nginx/wss_error.log',
  '/var/log/rbhealthcheck/health.log'
];

function sshConnect(server) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const connectConfig = {
      host: server.host,
      port: server.port || 22,
      username: server.ssh_user || 'ubuntu',
      readyTimeout: 15000,
    };

    if (server.ssh_key) {
      connectConfig.privateKey = server.ssh_key;
    }

    conn.on('ready', () => resolve(conn));
    conn.on('error', (err) => reject(err));
    conn.connect(connectConfig);
  });
}

function execCommand(conn, command) {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('data', d => stdout += d.toString());
      stream.stderr.on('data', d => stderr += d.toString());
      stream.on('close', () => resolve({ stdout, stderr }));
    });
  });
}

async function fetchLogsFromServer(server) {
  let conn;
  const results = {};
  
  try {
    conn = await sshConnect(server);
    
    for (const logFile of LOG_FILES) {
      try {
        // Get last 5 minutes of logs using awk on timestamp, fallback to tail 200
        const cmd = `
          LOG_FILE="${logFile}"
          if [ -f "$LOG_FILE" ]; then
            SINCE=$(date -d '5 minutes ago' '+%Y/%m/%d %H:%M' 2>/dev/null || date -v-5M '+%Y/%m/%d %H:%M' 2>/dev/null)
            # Try to get lines from last 5 min, fallback to last 200 lines
            LINES=$(tail -500 "$LOG_FILE" | grep -E "$(date -d '5 minutes ago' '+%d/%b/%Y:%H:%M|%Y/%m/%d %H:%M' 2>/dev/null | head -1)" 2>/dev/null)
            if [ -z "$LINES" ]; then
              tail -200 "$LOG_FILE"
            else
              echo "$LINES"
            fi
          else
            echo "FILE_NOT_FOUND: $LOG_FILE"
          fi
        `;
        const { stdout } = await execCommand(conn, cmd);
        results[logFile] = stdout || '(empty)';
      } catch (err) {
        results[logFile] = `ERROR: ${err.message}`;
      }
    }
    
    return { success: true, logs: results };
  } catch (err) {
    return { success: false, error: err.message, logs: {} };
  } finally {
    if (conn) conn.end();
  }
}

async function restartServicesOnServer(server) {
  let conn;
  try {
    conn = await sshConnect(server);
    
    const commands = [
      { name: 'nginx', cmd: 'sudo systemctl restart nginx && echo "nginx:OK" || echo "nginx:FAIL"' },
      { name: 'health_check', cmd: 'sudo systemctl restart health_check && echo "health_check:OK" || echo "health_check:FAIL"' }
    ];

    const results = [];
    for (const { name, cmd } of commands) {
      const { stdout, stderr } = await execCommand(conn, cmd);
      results.push({
        service: name,
        output: stdout.trim(),
        error: stderr.trim(),
        success: stdout.includes(':OK')
      });
    }

    // Also get service status after restart
    const { stdout: statusOut } = await execCommand(conn, 
      'sudo systemctl status nginx --no-pager -l | tail -5; echo "---"; sudo systemctl status health_check --no-pager -l | tail -5'
    );

    return { success: true, results, statusAfter: statusOut };
  } catch (err) {
    return { success: false, error: err.message, results: [] };
  } finally {
    if (conn) conn.end();
  }
}

async function testSSHConnection(server) {
  let conn;
  try {
    conn = await sshConnect(server);
    const { stdout } = await execCommand(conn, 'hostname && uptime');
    return { success: true, output: stdout.trim() };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    if (conn) conn.end();
  }
}

module.exports = { fetchLogsFromServer, restartServicesOnServer, testSSHConnection };

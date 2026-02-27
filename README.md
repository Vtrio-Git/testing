# RPC Monitor — Radiumblock Production Dashboard

A self-hosted monitoring interface that:
- **Scrapes** `http://mon-us-east.rpc-providers.net/` every minute for Prometheus `rpc_error` metrics
- **Alerts** you on Slack when any radiumblock endpoint has a `connect`, `blockzero`, or `version` error
- **Shows logs** from backend servers via SSH (last 5 min of nginx + health_check logs)
- **Restarts** nginx and health_check services with one click, with confirmation

---

## Requirements

- Node.js 18+ on the jump/Terraform server
- SSH access from the jump server to all radiumblock backend servers (passwordless sudo)
- Slack webhook URL

---

## Installation

### 1. Upload this folder to your jump server

```bash
scp -r rpc-monitor/ user@YOUR_JUMP_SERVER:/opt/rpc-monitor
ssh user@YOUR_JUMP_SERVER
cd /opt/rpc-monitor
```

### 2. Install and build

```bash
chmod +x setup.sh
./setup.sh
```

### 3. Start the server

**Option A — Direct (for testing):**
```bash
cd backend
node server.js
```

**Option B — PM2 (recommended for production):**
```bash
npm install -g pm2
cd /opt/rpc-monitor/backend
pm2 start server.js --name rpc-monitor
pm2 save
pm2 startup   # follow the output command to enable on boot
```

### 4. Open the interface

```
http://YOUR_JUMP_SERVER_IP:3001
```

---

## First-Time Setup in the Interface

### Step 1: Settings tab
- Paste your **Slack webhook URL**
- Confirm Prometheus URL is `http://mon-us-east.rpc-providers.net/`
- Click **Test** to verify Slack works
- Save settings

### Step 2: Endpoints tab — Add your radiumblock endpoints
Click **+ Add Endpoint** for each one:

| Name | WSS URL | Network |
|------|---------|---------|
| Westend | wss://westend.public.curie.radiumblock.co/ws | westend |
| Statemint | wss://statemint.public.curie.radiumblock.co/ws | polkadot-assethub |
| Statemine | wss://statemine.public.curie.radiumblock.co/ws | kusama-assethub |
| Polkadot | wss://polkadot.public.curie.radiumblock.co/ws | polkadot |
| People Polkadot | wss://people-polkadot.public.curie.radiumblock.co/ws | polkadot-people |
| People Kusama | wss://people-kusama.public.curie.radiumblock.co/ws | kusama-people |
| Coretime Polkadot | wss://coretime-polkadot.public.curie.radiumblock.co/ws | polkadot-coretime |
| Collectives | wss://collectives.public.curie.radiumblock.co/ws | polkadot-collectives |
| Bridgehub Polkadot | wss://bridgehub-polkadot.public.curie.radiumblock.co/ws | polkadot-bridgehub |
| Bridgehub Kusama | wss://bridgehub-kusama.public.curie.radiumblock.co/ws | kusama-bridgehub |

### Step 3: Add backend servers to each endpoint
After saving an endpoint, click **Edit** on it:
- Add each backend server's IP/hostname
- Set SSH user (e.g., `ubuntu`)
- Paste the SSH private key (contents of `~/.ssh/id_rsa` from the jump server)
- Click **Test SSH** to verify connectivity

---

## How It Works

```
Every 1 minute:
  → Scrape http://mon-us-east.rpc-providers.net/
  → Parse Prometheus metrics
  → Find rpc_error{wss=~".*radiumblock.*"} == 1
  → If new error (not in cooldown):
      → Create alert in DB
      → Send Slack notification
      → Push live update to browser via WebSocket

You:
  → See alert in browser (live, no refresh needed)
  → Click "View Logs" on the alert
  → System SSHes into ALL backend servers for that endpoint
  → Shows last 5 min of:
      /var/log/nginx/error.log
      /var/log/nginx/access.log
      /var/log/nginx/http_error.log
      /var/log/nginx/wss_error.log
      /var/log/rbhealthcheck/health.log
  → Review logs
  → Click "Restart This Server" or "Restart All Servers"
  → Confirm → runs: sudo systemctl restart nginx && sudo systemctl restart health_check
  → See result immediately
```

---

## Optional: Run on port 80 (without root)

Use nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name monitor.yourcompany.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## Logs

```bash
# If using PM2:
pm2 logs rpc-monitor

# Direct:
cd backend && node server.js
```

---

## Database

SQLite at `backend/monitor.db` — stores endpoints, servers, alerts, restart history, settings.
To reset: `rm backend/monitor.db` and restart.

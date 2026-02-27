import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── API helpers ─────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem('rpc_token'); }
function setToken(t) { localStorage.setItem('rpc_token', t); }
function clearToken() { localStorage.removeItem('rpc_token'); localStorage.removeItem('rpc_user'); }
function getUser() { try { return JSON.parse(localStorage.getItem('rpc_user') || 'null'); } catch(e) { return null; } }
function setUser(u) { localStorage.setItem('rpc_user', JSON.stringify(u)); }

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (res.status === 401) { clearToken(); window.location.reload(); }
  return res.json();
}
const post = (p, b) => api(p, { method: 'POST', body: b });
const put  = (p, b) => api(p, { method: 'PUT', body: b });
const del  = (p)    => api(p, { method: 'DELETE' });

function timeAgo(d) {
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
  const h = Math.floor(m/60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}

const ROLE_LEVEL = { superadmin: 3, admin: 2, user: 1 };
const can = (user, minRole) => (ROLE_LEVEL[user?.role] || 0) >= (ROLE_LEVEL[minRole] || 0);

const ERR_COLOR = { connect:'#ef4444', blockzero:'#f97316', version:'#eab308', unknown:'#94a3b8' };

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#07070e;--surface:#0f0f1a;--surface2:#15151f;--border:#1e1e2e;--border2:#272738;
  --text:#e2e2f0;--muted:#52527a;--accent:#7c6af7;--accent2:#a78bfa;
  --green:#22c55e;--red:#ef4444;--orange:#f97316;--yellow:#eab308;
  --mono:'JetBrains Mono',monospace;--display:'Syne',sans-serif;
}
body{background:var(--bg);color:var(--text);font-family:var(--mono);font-size:13px;min-height:100vh}
.app{display:flex;flex-direction:column;height:100vh;overflow:hidden}

/* Auth */
.auth-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg)}
.auth-box{background:var(--surface);border:1px solid var(--border2);border-radius:12px;padding:40px;width:100%;max-width:420px}
.auth-logo{font-family:var(--display);font-size:24px;font-weight:800;color:var(--accent2);text-align:center;margin-bottom:8px}
.auth-sub{color:var(--muted);font-size:12px;text-align:center;margin-bottom:32px}
.auth-error{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);color:var(--red);border-radius:6px;padding:10px 14px;font-size:12px;margin-bottom:16px}

/* Header */
.header{display:flex;align-items:center;gap:16px;padding:0 24px;height:56px;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0}
.logo{font-family:var(--display);font-size:18px;font-weight:800;color:var(--accent2);letter-spacing:-.5px}
.logo span{color:var(--muted);font-weight:400}
.badge{padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:1px}
.badge-alert{background:rgba(239,68,68,.15);color:var(--red);border:1px solid rgba(239,68,68,.3)}
.badge-ok{background:rgba(34,197,94,.1);color:var(--green);border:1px solid rgba(34,197,94,.3)}
.badge-role{background:rgba(124,106,247,.15);color:var(--accent2);border:1px solid rgba(124,106,247,.3)}
.header-right{margin-left:auto;display:flex;align-items:center;gap:12px}
.live-dot{width:6px;height:6px;border-radius:50%;display:inline-block;margin-right:6px;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

/* Nav */
.nav{display:flex;gap:2px;padding:0 24px;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0}
.nav-btn{padding:10px 16px;background:none;border:none;border-bottom:2px solid transparent;color:var(--muted);font-family:var(--mono);font-size:12px;cursor:pointer;transition:all .15s;letter-spacing:.5px}
.nav-btn:hover{color:var(--text)}
.nav-btn.active{color:var(--accent2);border-bottom-color:var(--accent)}
.nav-badge{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:var(--red);color:#fff;font-size:9px;font-weight:700;margin-left:6px;vertical-align:middle}

/* Main */
.main{flex:1;overflow-y:auto;padding:24px}

/* Cards */
.card{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:20px;margin-bottom:16px}
.card-title{font-family:var(--display);font-size:14px;font-weight:700;color:var(--text);margin-bottom:16px;display:flex;align-items:center;gap:8px}

/* Alert cards */
.alert-card{background:var(--surface2);border:1px solid var(--border2);border-left:3px solid var(--red);border-radius:6px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:flex-start;gap:12px;animation:slideIn .2s ease}
.alert-card.ack{border-left-color:var(--muted);opacity:.5}
@keyframes slideIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.alert-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:4px}
.alert-wss{font-size:12px;color:var(--accent2);font-weight:500}
.alert-meta{font-size:11px;color:var(--muted);margin-top:4px}

/* Buttons */
.btn{padding:6px 14px;border-radius:5px;border:1px solid var(--border2);background:var(--surface2);color:var(--text);font-family:var(--mono);font-size:11px;cursor:pointer;transition:all .15s;font-weight:500}
.btn:hover{background:var(--border2);border-color:var(--accent)}
.btn-primary{background:var(--accent);border-color:var(--accent);color:#fff}
.btn-primary:hover{background:#8b7bf8}
.btn-danger{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.4);color:var(--red)}
.btn-danger:hover{background:rgba(239,68,68,.25)}
.btn-warn{background:rgba(249,115,22,.15);border-color:rgba(249,115,22,.4);color:var(--orange)}
.btn-warn:hover{background:rgba(249,115,22,.25)}
.btn-green{background:rgba(34,197,94,.15);border-color:rgba(34,197,94,.4);color:var(--green)}
.btn-green:hover{background:rgba(34,197,94,.25)}
.btn-sm{padding:4px 10px;font-size:10px}
.btn:disabled{opacity:.4;cursor:not-allowed}

/* Endpoint grid */
.ep-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.ep-card{background:var(--surface2);border:1px solid var(--border2);border-left:3px solid var(--green);border-radius:8px;padding:16px;cursor:pointer;transition:border-color .15s,transform .1s;position:relative}
.ep-card:hover{border-color:var(--accent);transform:translateY(-1px)}
.ep-card.has-alerts{border-left-color:var(--red)}
.ep-name{font-family:var(--display);font-size:13px;font-weight:700}
.ep-wss{font-size:10px;color:var(--muted);margin-top:4px;word-break:break-all}
.ep-footer{display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap}
.ep-tag{padding:2px 8px;border-radius:3px;font-size:10px;font-weight:600;background:var(--border2);color:var(--muted)}
.ep-alert-badge{background:rgba(239,68,68,.15);color:var(--red);border:1px solid rgba(239,68,68,.3);padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700}

/* Log viewer */
.log-tabs{display:flex;gap:4px;margin-bottom:12px;flex-wrap:wrap}
.log-tab{padding:4px 12px;border-radius:4px;font-size:11px;cursor:pointer;background:var(--surface2);border:1px solid var(--border2);color:var(--muted);transition:all .15s}
.log-tab.active{background:var(--border2);border-color:var(--accent);color:var(--accent2)}
.log-area{background:#040408;border:1px solid var(--border);border-radius:6px;padding:16px;font-size:11px;line-height:1.7;max-height:380px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;color:#9090b0;font-family:var(--mono)}
.log-area .err{color:var(--red)}
.log-area .wrn{color:var(--orange)}

/* Check Now log */
.check-log{background:#040408;border:1px solid var(--border);border-radius:6px;padding:16px;font-size:11px;line-height:1.8;max-height:420px;overflow-y:auto;font-family:var(--mono)}
.check-log .ok{color:var(--green)}
.check-log .error{color:var(--red)}
.check-log .warn{color:var(--orange)}
.check-log .info{color:var(--text)}

/* Forms */
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.form-group{display:flex;flex-direction:column;gap:6px}
.form-group.full{grid-column:1/-1}
.form-label{font-size:11px;color:var(--muted);letter-spacing:.5px;text-transform:uppercase}
.form-input{background:var(--surface2);border:1px solid var(--border2);color:var(--text);font-family:var(--mono);font-size:12px;padding:8px 12px;border-radius:5px;outline:none;transition:border-color .15s;width:100%}
.form-input:focus{border-color:var(--accent)}
.form-input::placeholder{color:var(--muted)}
textarea.form-input{resize:vertical;min-height:90px}
select.form-input{cursor:pointer}

/* Table */
.table{width:100%;border-collapse:collapse}
.table th{text-align:left;padding:8px 12px;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border2)}
.table td{padding:10px 12px;border-bottom:1px solid var(--border);font-size:12px}
.table tr:hover td{background:var(--surface2)}

/* Status */
.dot{width:7px;height:7px;border-radius:50%;display:inline-block}
.dot-ok{background:var(--green);box-shadow:0 0 6px var(--green)}
.dot-err{background:var(--red);box-shadow:0 0 6px var(--red);animation:pulse 1.5s infinite}

/* Modal */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;z-index:100;overflow-y:auto;animation:fadeIn .15s ease}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.modal{background:var(--surface);border:1px solid var(--border2);border-radius:10px;padding:24px;width:100%;max-width:820px;position:relative}
.modal-title{font-family:var(--display);font-size:16px;font-weight:800;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between}
.modal-close{background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;line-height:1;padding:4px}
.modal-close:hover{color:var(--text)}

/* Restart section */
.restart-box{background:rgba(249,115,22,.07);border:1px solid rgba(249,115,22,.3);border-radius:8px;padding:16px;margin-top:16px}
.restart-result{background:#040408;border-radius:6px;padding:12px;font-size:11px;line-height:1.7;margin-top:12px;max-height:180px;overflow-y:auto;white-space:pre-wrap}
.restart-result .ok{color:var(--green)}
.restart-result .fail{color:var(--red)}

/* Toast */
.toast-wrap{position:fixed;bottom:24px;right:24px;z-index:200;display:flex;flex-direction:column;gap:8px}
.toast{padding:10px 16px;border-radius:6px;font-size:12px;font-weight:500;background:var(--surface2);border:1px solid var(--border2);color:var(--text);animation:slideUp .2s ease;max-width:320px}
.toast.success{border-color:rgba(34,197,94,.5);color:var(--green)}
.toast.error{border-color:rgba(239,68,68,.5);color:var(--red)}
@keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

/* User table role badges */
.role-badge{padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;text-transform:uppercase}
.role-superadmin{background:rgba(124,106,247,.2);color:var(--accent2);border:1px solid rgba(124,106,247,.4)}
.role-admin{background:rgba(34,197,94,.1);color:var(--green);border:1px solid rgba(34,197,94,.3)}
.role-user{background:rgba(82,82,122,.2);color:var(--muted);border:1px solid rgba(82,82,122,.4)}

/* Misc */
.divider{height:1px;background:var(--border);margin:16px 0}
.empty{text-align:center;padding:48px;color:var(--muted)}
.empty-icon{font-size:32px;margin-bottom:12px}
.empty-text{font-family:var(--display);font-size:14px}
.empty-sub{font-size:11px;margin-top:6px}
.flex{display:flex}.gap-8{gap:8px}.gap-12{gap:12px}.items-center{align-items:center}.justify-between{justify-content:space-between}
.mt-12{margin-top:12px}.mt-16{margin-top:16px}.mb-8{margin-bottom:8px}
.color-muted{color:var(--muted)}.color-green{color:var(--green)}.color-red{color:var(--red)}.color-accent{color:var(--accent2)}
::-webkit-scrollbar{width:5px;height:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border2);border-radius:3px}
`;

// ─── Toast ────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((msg, type = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  return { toasts, show };
}

// ─── Setup Page ───────────────────────────────────────────────────────────────
function SetupPage({ onDone }) {
  const [form, setForm] = useState({ username: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    if (!form.username || !form.password) return setError('All fields required');
    if (form.password !== form.confirm) return setError('Passwords do not match');
    if (form.password.length < 8) return setError('Password must be at least 8 characters');
    setLoading(true);
    const res = await post('/auth/setup', { username: form.username, password: form.password });
    setLoading(false);
    if (res.error) return setError(res.error);
    setToken(res.token);
    setUser({ username: res.username, role: res.role });
    onDone();
  };

  return (
    <div className="auth-wrap">
      <div className="auth-box">
        <div className="auth-logo">RPC<span style={{color:'var(--muted)',fontWeight:400}}>Monitor</span></div>
        <div className="auth-sub">First-time setup — create your Super Admin account</div>
        {error && <div className="auth-error">{error}</div>}
        <div className="form-group" style={{marginBottom:12}}>
          <label className="form-label">Username</label>
          <input className="form-input" placeholder="admin" value={form.username}
            onChange={e => setForm(f=>({...f,username:e.target.value}))} />
        </div>
        <div className="form-group" style={{marginBottom:12}}>
          <label className="form-label">Password (min 8 characters)</label>
          <input className="form-input" type="password" value={form.password}
            onChange={e => setForm(f=>({...f,password:e.target.value}))} />
        </div>
        <div className="form-group" style={{marginBottom:20}}>
          <label className="form-label">Confirm Password</label>
          <input className="form-input" type="password" value={form.confirm}
            onChange={e => setForm(f=>({...f,confirm:e.target.value}))}
            onKeyDown={e => e.key==='Enter' && submit()} />
        </div>
        <button className="btn btn-primary" style={{width:'100%',padding:'10px'}} onClick={submit} disabled={loading}>
          {loading ? 'Creating...' : 'Create Super Admin Account'}
        </button>
      </div>
    </div>
  );
}

// ─── Login Page ───────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    if (!form.username || !form.password) return setError('Enter username and password');
    setLoading(true);
    const res = await post('/auth/login', form);
    setLoading(false);
    if (res.error) return setError(res.error);
    setToken(res.token);
    setUser({ username: res.username, role: res.role });
    onLogin({ username: res.username, role: res.role });
  };

  return (
    <div className="auth-wrap">
      <div className="auth-box">
        <div className="auth-logo">RPC<span style={{color:'var(--muted)',fontWeight:400}}>Monitor</span></div>
        <div className="auth-sub">Radiumblock Infrastructure Monitor</div>
        {error && <div className="auth-error">{error}</div>}
        <div className="form-group" style={{marginBottom:12}}>
          <label className="form-label">Username</label>
          <input className="form-input" placeholder="username" value={form.username}
            onChange={e => setForm(f=>({...f,username:e.target.value}))} />
        </div>
        <div className="form-group" style={{marginBottom:20}}>
          <label className="form-label">Password</label>
          <input className="form-input" type="password" value={form.password}
            onChange={e => setForm(f=>({...f,password:e.target.value}))}
            onKeyDown={e => e.key==='Enter' && submit()} />
        </div>
        <button className="btn btn-primary" style={{width:'100%',padding:'10px'}} onClick={submit} disabled={loading}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </div>
    </div>
  );
}

// ─── Check Now Modal ──────────────────────────────────────────────────────────
function CheckNowModal({ onClose }) {
  const [lines, setLines] = useState([]);
  const [done, setDone] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/alerts/check-now', {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
          signal: ctrl.signal
        });
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        while (true) {
          const { done: d, value } = await reader.read();
          if (d) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop();
          for (const part of parts) {
            if (part.startsWith('data: ')) {
              try {
                const msg = JSON.parse(part.slice(6));
                if (msg.type === 'log') setLines(l => [...l, msg]);
                if (msg.type === 'done' || msg.type === 'summary') setDone(true);
              } catch(e) {}
            }
          }
        }
      } catch(e) {}
      setDone(true);
    })();
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  return (
    <div className="overlay" onClick={e => e.target===e.currentTarget && done && onClose()}>
      <div className="modal">
        <div className="modal-title">
          <span>🔍 Check Now — Live Output</span>
          {done && <button className="modal-close" onClick={onClose}>✕</button>}
        </div>
        <div className="check-log" ref={logRef}>
          {lines.length === 0 && <span className="color-muted">Starting check...</span>}
          {lines.map((l, i) => (
            <div key={i} className={l.level || 'info'}>
              {l.msg}
            </div>
          ))}
          {!done && <div className="color-muted" style={{marginTop:8}}>⏳ Running...</div>}
          {done && <div className="ok" style={{marginTop:8}}>— Check complete. Click ✕ to close —</div>}
        </div>
        {!done && (
          <div style={{marginTop:12,fontSize:11,color:'var(--muted)'}}>
            This will close automatically when done. Do not navigate away.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Log Viewer Modal ─────────────────────────────────────────────────────────
function LogViewer({ endpoint, user, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selServer, setSelServer] = useState(0);
  const [selLog, setSelLog] = useState(null);
  const [restartConfirm, setRestartConfirm] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartResult, setRestartResult] = useState(null);

  useEffect(() => {
    api(`/logs/endpoint/${endpoint.id}`).then(d => {
      setData(d);
      setLoading(false);
      if (d.servers?.length) {
        const keys = Object.keys(d.servers[0]?.logs || {});
        if (keys.length) setSelLog(keys[0]);
      }
    });
  }, [endpoint.id]);

  const doRestart = async (serverId) => {
    setRestarting(true); setRestartResult(null);
    const r = await post(`/restart/server/${serverId}`);
    setRestartResult(r); setRestarting(false); setRestartConfirm(false);
  };
  const doRestartAll = async () => {
    setRestarting(true); setRestartResult(null);
    const r = await post(`/restart/endpoint/${endpoint.id}`);
    setRestartResult(r); setRestarting(false); setRestartConfirm(false);
  };

  const renderLog = (content) => {
    if (!content) return <span className="color-muted">No content</span>;
    return content.split('\n').map((line, i) => {
      const cls = /error|crit|emerg/i.test(line) ? 'err' : /warn|notice/i.test(line) ? 'wrn' : '';
      return <div key={i} className={cls}>{line || '\u00a0'}</div>;
    });
  };

  const servers = data?.servers || [];
  const cur = servers[selServer];
  const canRestart = can(user, 'admin');

  return (
    <div className="overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal" style={{maxWidth:940}}>
        <div className="modal-title">
          <span>📋 Logs — {endpoint.name}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {loading ? (
          <div className="empty"><div className="empty-text">Fetching logs via SSH...</div></div>
        ) : !servers.length ? (
          <div className="empty"><div className="empty-icon">🔌</div><div className="empty-text">No servers configured</div></div>
        ) : (
          <>
            <div className="log-tabs">
              {servers.map((s,i) => (
                <button key={i} className={`log-tab ${selServer===i?'active':''}`} onClick={()=>setSelServer(i)}>
                  {s.server.label || s.server.host}
                  {!s.success && <span style={{color:'var(--red)',marginLeft:4}}>⚠</span>}
                </button>
              ))}
            </div>

            {cur && !cur.success ? (
              <div style={{color:'var(--red)',padding:16,background:'rgba(239,68,68,.08)',borderRadius:6}}>
                SSH Error: {cur.error}
              </div>
            ) : cur ? (
              <>
                <div className="log-tabs" style={{marginBottom:8}}>
                  {Object.keys(cur.logs||{}).map(f => (
                    <button key={f} className={`log-tab ${selLog===f?'active':''}`} onClick={()=>setSelLog(f)} style={{fontSize:10}}>
                      {f.split('/').pop()}
                    </button>
                  ))}
                </div>
                <div className="log-area">{selLog ? renderLog(cur.logs[selLog]) : <span className="color-muted">Select a log</span>}</div>

                {canRestart && (
                  <div className="restart-box">
                    <div style={{color:'var(--orange)',fontFamily:'var(--display)',fontWeight:700,marginBottom:8}}>
                      ⚡ Restart Services (nginx + health_check)
                    </div>
                    <div style={{fontSize:11,color:'var(--muted)',marginBottom:12}}>
                      This will run <code>sudo systemctl restart nginx</code> and <code>sudo systemctl restart health_check</code> on the selected server. Review logs above before proceeding.
                    </div>
                    {!restartConfirm ? (
                      <div className="flex gap-8">
                        <button className="btn btn-warn" onClick={()=>setRestartConfirm('one')}>Restart Services on This Server</button>
                        <button className="btn btn-danger" onClick={()=>setRestartConfirm('all')}>Restart Services on All Servers</button>
                      </div>
                    ) : (
                      <div className="flex gap-8 items-center">
                        <span style={{color:'var(--red)',fontSize:12}}>
                          ⚠ Confirm restart services on {restartConfirm==='all'?'ALL servers':cur.server.label}?
                        </span>
                        <button className="btn btn-danger" disabled={restarting}
                          onClick={()=>restartConfirm==='all'?doRestartAll():doRestart(cur.server.id)}>
                          {restarting?'Restarting...':'YES — Restart Now'}
                        </button>
                        <button className="btn" onClick={()=>setRestartConfirm(false)}>Cancel</button>
                      </div>
                    )}
                    {restartResult && (
                      <div className="restart-result">
                        {restartResult.results?.map((r,i)=>(
                          <div key={i} className={r.success?'ok':'fail'}>[{r.service}] {r.output||r.error}</div>
                        ))}
                        {!restartResult.success && <div className="fail">❌ {restartResult.error}</div>}
                        {restartResult.statusAfter && <div style={{color:'var(--muted)',marginTop:8}}>{restartResult.statusAfter}</div>}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Alerts Tab ───────────────────────────────────────────────────────────────
function AlertsTab({ endpoints, user, onViewLogs }) {
  const [alerts, setAlerts] = useState([]);
  const [showAck, setShowAck] = useState(false);
  const [checkNow, setCheckNow] = useState(false);

  const load = useCallback(() => {
    api(`/alerts?acknowledged=${showAck?1:0}&limit=100`).then(setAlerts);
  }, [showAck]);

  useEffect(()=>{ load(); }, [load]);

  const ack = async id => { await post(`/alerts/${id}/acknowledge`); load(); };
  const ackAll = async () => { await post('/alerts/acknowledge-all'); load(); };
  const findEp = wss => endpoints.find(e => e.wss_url === wss);

  return (
    <div>
      <div className="flex items-center justify-between" style={{marginBottom:16}}>
        <div className="flex gap-8">
          <button className={`btn btn-sm ${!showAck?'btn-primary':''}`} onClick={()=>setShowAck(false)}>Active</button>
          <button className={`btn btn-sm ${showAck?'btn-primary':''}`} onClick={()=>setShowAck(true)}>Acknowledged</button>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-sm btn-green" onClick={()=>setCheckNow(true)}>🔍 Check Now</button>
          {!showAck && can(user,'admin') && <button className="btn btn-sm" onClick={ackAll}>Acknowledge All</button>}
        </div>
      </div>

      {alerts.length===0 ? (
        <div className="empty">
          <div className="empty-icon">{showAck?'📁':'✅'}</div>
          <div className="empty-text">{showAck?'No acknowledged alerts':'No active alerts'}</div>
          <div className="empty-sub">All radiumblock endpoints are healthy</div>
        </div>
      ) : alerts.map(a => {
        const ep = findEp(a.wss_url);
        return (
          <div key={a.id} className={`alert-card ${a.acknowledged?'ack':''}`}>
            <div className="alert-dot" style={{background:ERR_COLOR[a.error_type]||'#94a3b8'}} />
            <div style={{flex:1}}>
              <div className="alert-wss">{a.wss_url}</div>
              <div className="alert-meta">
                <span style={{color:ERR_COLOR[a.error_type],fontWeight:600}}>{a.error_type.toUpperCase()}</span>
                {' · '}{a.message}
                {a.slack_sent?<span className="color-green" style={{marginLeft:8}}>✓ Slack</span>:''}
                {a.acknowledged_by && <span style={{marginLeft:8,color:'var(--muted)'}}>· Acked by {a.acknowledged_by}</span>}
              </div>
            </div>
            <div style={{fontSize:11,color:'var(--muted)',whiteSpace:'nowrap',marginRight:8}}>{timeAgo(a.created_at)}</div>
            <div className="flex gap-8">
              {ep && <button className="btn btn-sm btn-warn" onClick={()=>onViewLogs(ep)}>View Logs</button>}
              {!a.acknowledged && can(user,'admin') && <button className="btn btn-sm" onClick={()=>ack(a.id)}>Ack</button>}
            </div>
          </div>
        );
      })}

      {checkNow && <CheckNowModal onClose={()=>{ setCheckNow(false); load(); }} />}
    </div>
  );
}

// ─── Endpoints Tab ────────────────────────────────────────────────────────────
function EndpointsTab({ endpoints, user, onRefresh, onViewLogs }) {
  const [modal, setModal] = useState(null);

  const del_ = async id => {
    if (!window.confirm('Delete this endpoint?')) return;
    await del(`/endpoints/${id}`); onRefresh();
  };

  return (
    <div>
      {can(user,'admin') && (
        <div className="flex justify-between" style={{marginBottom:16}}>
          <div/>
          <button className="btn btn-primary" onClick={()=>setModal({})}>+ Add Endpoint</button>
        </div>
      )}
      {endpoints.length===0 ? (
        <div className="empty"><div className="empty-icon">🔌</div><div className="empty-text">No endpoints configured</div></div>
      ) : (
        <div className="ep-grid">
          {endpoints.map(ep => (
            <div key={ep.id} className={`ep-card ${ep.active_alerts>0?'has-alerts':''}`} onClick={()=>onViewLogs(ep)}>
              <div className="flex items-center gap-8">
                <span className={`dot ${ep.active_alerts>0?'dot-err':'dot-ok'}`} />
                <span className="ep-name">{ep.name}</span>
              </div>
              <div className="ep-wss">{ep.wss_url}</div>
              <div className="ep-footer">
                {ep.network&&<span className="ep-tag">{ep.network}</span>}
                <span className="ep-tag">🖥 {ep.server_count} server{ep.server_count!==1?'s':''}</span>
                {ep.active_alerts>0&&<span className="ep-alert-badge">⚠ {ep.active_alerts}</span>}
                {can(user,'admin') && (
                  <div style={{marginLeft:'auto',display:'flex',gap:6}} onClick={e=>e.stopPropagation()}>
                    <button className="btn btn-sm" onClick={()=>setModal(ep)}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={()=>del_(ep.id)}>Del</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {modal!==null && <EndpointModal endpoint={modal?.id?modal:null} onSave={()=>{setModal(null);onRefresh();}} onClose={()=>setModal(null)} />}
    </div>
  );
}

// ─── Endpoint Modal ───────────────────────────────────────────────────────────
function EndpointModal({ endpoint, onSave, onClose }) {
  const [form, setForm] = useState({name:'',wss_url:'',network:'',...endpoint});
  const [servers, setServers] = useState([]);
  const [sf, setSf] = useState({label:'',host:'',port:22,ssh_user:'ubuntu',ssh_key:''});
  const [testing, setTesting] = useState(null);
  const [testRes, setTestRes] = useState({});

  useEffect(()=>{ if(endpoint?.id) api(`/servers?endpoint_id=${endpoint.id}`).then(setServers); }, [endpoint?.id]);

  const save = async () => {
    if (!form.name||!form.wss_url) return;
    if (endpoint?.id) { await put(`/endpoints/${endpoint.id}`,form); }
    else { const r=await post('/endpoints',form); form.id=r.id; }
    onSave();
  };

  const addServer = async () => {
    if (!sf.host||!form.id) return;
    await post('/servers',{...sf,endpoint_id:form.id});
    api(`/servers?endpoint_id=${form.id}`).then(setServers);
    setSf({label:'',host:'',port:22,ssh_user:'ubuntu',ssh_key:''});
  };

  const delServer = async id => { await del(`/servers/${id}`); setServers(s=>s.filter(x=>x.id!==id)); };

  const testSSH = async id => {
    setTesting(id);
    const r = await post(`/servers/${id}/test`);
    setTestRes(t=>({...t,[id]:r})); setTesting(null);
  };

  return (
    <div className="overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal">
        <div className="modal-title">
          <span>{endpoint?.id?'✏️ Edit Endpoint':'➕ Add Endpoint'}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Name</label>
            <input className="form-input" placeholder="Statemine" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Network</label>
            <input className="form-input" placeholder="kusama-assethub" value={form.network} onChange={e=>setForm(f=>({...f,network:e.target.value}))} />
          </div>
          <div className="form-group full">
            <label className="form-label">WSS URL</label>
            <input className="form-input" placeholder="wss://statemine.public.curie.radiumblock.co/ws" value={form.wss_url} onChange={e=>setForm(f=>({...f,wss_url:e.target.value}))} />
          </div>
        </div>
        <div className="flex gap-8 mt-16" style={{justifyContent:'flex-end'}}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>Save Endpoint</button>
        </div>

        {form.id && (
          <>
            <div className="divider"/>
            <div className="card-title" style={{marginBottom:12}}>🖥 Backend Servers</div>
            {servers.length>0 && (
              <table className="table" style={{marginBottom:16}}>
                <thead><tr><th>Label</th><th>Host</th><th>Port</th><th>User</th><th>SSH Key</th><th></th></tr></thead>
                <tbody>
                  {servers.map(s=>(
                    <tr key={s.id}>
                      <td>{s.label}</td>
                      <td className="color-accent">{s.host}</td>
                      <td>{s.port}</td>
                      <td>{s.ssh_user}</td>
                      <td>{s.ssh_key?<span className="color-green">✓ Set</span>:<span className="color-muted">—</span>}</td>
                      <td>
                        <div className="flex gap-8">
                          <button className="btn btn-sm" disabled={testing===s.id} onClick={()=>testSSH(s.id)}>{testing===s.id?'...':'Test SSH'}</button>
                          <button className="btn btn-sm btn-danger" onClick={()=>delServer(s.id)}>Remove</button>
                        </div>
                        {testRes[s.id] && (
                          <div style={{fontSize:10,marginTop:4,padding:'4px 8px',borderRadius:4,background:testRes[s.id].success?'rgba(34,197,94,.1)':'rgba(239,68,68,.1)',color:testRes[s.id].success?'var(--green)':'var(--red)'}}>
                            {testRes[s.id].success?`✓ ${testRes[s.id].output}`:`✗ ${testRes[s.id].error}`}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{background:'var(--bg)',border:'1px dashed var(--border2)',borderRadius:6,padding:16}}>
              <div className="form-label mb-8">Add Server</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 2fr 80px 100px',gap:8,marginBottom:8}}>
                <div className="form-group"><label className="form-label">Label</label><input className="form-input" placeholder="server-1" value={sf.label} onChange={e=>setSf(f=>({...f,label:e.target.value}))} /></div>
                <div className="form-group"><label className="form-label">Host / IP</label><input className="form-input" placeholder="10.0.0.1" value={sf.host} onChange={e=>setSf(f=>({...f,host:e.target.value}))} /></div>
                <div className="form-group"><label className="form-label">Port</label><input className="form-input" type="number" value={sf.port} onChange={e=>setSf(f=>({...f,port:parseInt(e.target.value)}))} /></div>
                <div className="form-group"><label className="form-label">SSH User</label><input className="form-input" value={sf.ssh_user} onChange={e=>setSf(f=>({...f,ssh_user:e.target.value}))} /></div>
              </div>
              <div className="form-group" style={{marginBottom:8}}>
                <label className="form-label">SSH Private Key (paste full contents of ~/.ssh/id_rpc)</label>
                <textarea className="form-input" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;..." value={sf.ssh_key} onChange={e=>setSf(f=>({...f,ssh_key:e.target.value}))} style={{fontSize:10,minHeight:80}} />
              </div>
              <button className="btn btn-primary" onClick={addServer}>+ Add Server</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Users Tab (superadmin only) ──────────────────────────────────────────────
function UsersTab({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({username:'',password:'',role:'user'});
  const [error, setError] = useState('');
  const { show } = useToast();

  const load = () => api('/auth/users').then(setUsers);
  useEffect(()=>{ load(); },[]);

  const create = async () => {
    setError('');
    if (!form.username||!form.password) return setError('All fields required');
    if (form.password.length<8) return setError('Password min 8 chars');
    const r = await post('/auth/users',form);
    if (r.error) return setError(r.error);
    setShowForm(false); setForm({username:'',password:'',role:'user'}); load();
    show('User created','success');
  };

  const toggle = async (u) => {
    await put(`/auth/users/${u.id}`,{active:u.active?0:1});
    load(); show(u.active?'User deactivated':'User activated');
  };

  const del_ = async u => {
    if (!window.confirm(`Delete user ${u.username}?`)) return;
    await del(`/auth/users/${u.id}`); load(); show('User deleted');
  };

  return (
    <div>
      <div className="flex justify-between" style={{marginBottom:16}}>
        <div className="card-title" style={{margin:0}}>👥 User Management</div>
        <button className="btn btn-primary" onClick={()=>setShowForm(s=>!s)}>
          {showForm?'Cancel':'+ Add User'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{marginBottom:16}}>
          {error && <div className="auth-error" style={{marginBottom:12}}>{error}</div>}
          <div className="form-grid" style={{gridTemplateColumns:'1fr 1fr 1fr'}}>
            <div className="form-group"><label className="form-label">Username</label><input className="form-input" value={form.username} onChange={e=>setForm(f=>({...f,username:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Password</label><input className="form-input" type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} /></div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select className="form-input" value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
                <option value="user">User — View only</option>
                <option value="admin">Admin — View + Restart</option>
                <option value="superadmin">Super Admin — Full access</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary mt-12" onClick={create}>Create User</button>
        </div>
      )}

      <table className="table">
        <thead><tr><th>Username</th><th>Role</th><th>Last Login</th><th>Created</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {users.map(u=>(
            <tr key={u.id}>
              <td style={{fontWeight:600}}>{u.username}{u.id===currentUser.id&&<span style={{color:'var(--muted)',marginLeft:6,fontSize:10}}>(you)</span>}</td>
              <td><span className={`role-badge role-${u.role}`}>{u.role}</span></td>
              <td className="color-muted">{u.last_login?timeAgo(u.last_login):'Never'}</td>
              <td className="color-muted">{new Date(u.created_at).toLocaleDateString()}</td>
              <td><span style={{color:u.active?'var(--green)':'var(--red)'}}>{u.active?'Active':'Inactive'}</span></td>
              <td>
                {u.id!==currentUser.id && (
                  <div className="flex gap-8">
                    <button className="btn btn-sm" onClick={()=>toggle(u)}>{u.active?'Deactivate':'Activate'}</button>
                    <button className="btn btn-sm btn-danger" onClick={()=>del_(u)}>Delete</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Activity Tab ─────────────────────────────────────────────────────────────
function ActivityTab() {
  const [logs, setLogs] = useState([]);
  useEffect(()=>{ api('/auth/activity').then(setLogs); },[]);

  const ACTION_COLOR = {
    LOGIN:'var(--muted)', RESTART_SERVICES:'var(--orange)',
    ACK_ALERT:'var(--green)', CHECK_NOW:'var(--accent2)',
    CREATE_USER:'var(--green)', DELETE_USER:'var(--red)',
    FETCH_LOGS:'var(--text)', UPDATE_SETTINGS:'var(--yellow)'
  };

  return (
    <div>
      <div className="card-title" style={{marginBottom:16}}>📜 Activity Log</div>
      {logs.length===0 ? <div className="empty"><div className="empty-text">No activity yet</div></div> : (
        <table className="table">
          <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>
            {logs.map(l=>(
              <tr key={l.id}>
                <td className="color-muted" style={{whiteSpace:'nowrap'}}>{timeAgo(l.created_at)}</td>
                <td style={{fontWeight:600,color:'var(--accent2)'}}>{l.user}</td>
                <td><span style={{color:ACTION_COLOR[l.action]||'var(--text)',fontWeight:600,fontSize:10}}>{l.action}</span></td>
                <td className="color-muted" style={{fontSize:11}}>{l.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────
function HistoryTab() {
  const [history, setHistory] = useState([]);
  useEffect(()=>{ api('/restart/history').then(setHistory); },[]);

  return (
    <div>
      <div className="card-title" style={{marginBottom:16}}>⚡ Service Restart History</div>
      {history.length===0 ? <div className="empty"><div className="empty-text">No restarts recorded</div></div> : (
        <table className="table">
          <thead><tr><th>Time</th><th>By</th><th>Host</th><th>Services</th><th>Status</th><th>Output</th></tr></thead>
          <tbody>
            {history.map(h=>(
              <tr key={h.id}>
                <td className="color-muted" style={{whiteSpace:'nowrap'}}>{timeAgo(h.created_at)}</td>
                <td style={{color:'var(--accent2)',fontWeight:600}}>{h.triggered_by_user||'system'}</td>
                <td className="color-accent">{h.host}</td>
                <td>{h.services}</td>
                <td><span style={{color:h.status==='success'?'var(--green)':'var(--red)'}}>{h.status==='success'?'✓ OK':'✗ FAIL'}</span></td>
                <td style={{maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'var(--muted)',fontSize:11}}>{h.output}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab({ show }) {
  const [form, setForm] = useState({slack_webhook:'',prometheus_url:'http://mon-us-east.rpc-providers.net/',check_interval_minutes:'1',alert_cooldown_minutes:'15'});
  useEffect(()=>{ api('/settings').then(s=>setForm(f=>({...f,...s}))); },[]);

  const save = async () => { await post('/settings',form); show('Settings saved','success'); };
  const testSlack = async () => { const r=await post('/settings/test-slack'); show(r.message||r.error,r.success?'success':'error'); };

  return (
    <div className="card">
      <div className="card-title">⚙️ Configuration</div>
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        <div className="form-group">
          <label className="form-label">Slack Webhook URL</label>
          <div className="flex gap-8">
            <input className="form-input" style={{flex:1}} placeholder="https://hooks.slack.com/services/..." value={form.slack_webhook} onChange={e=>setForm(f=>({...f,slack_webhook:e.target.value}))} />
            <button className="btn" onClick={testSlack}>Test</button>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Prometheus Scrape URL</label>
          <input className="form-input" value={form.prometheus_url} onChange={e=>setForm(f=>({...f,prometheus_url:e.target.value}))} />
          <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>Options: http://mon-us-east.rpc-providers.net/ · http://mon-eu-central.rpc-providers.net/</div>
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Check Interval (minutes)</label>
            <input className="form-input" type="number" min="1" max="60" value={form.check_interval_minutes} onChange={e=>setForm(f=>({...f,check_interval_minutes:e.target.value}))} />
          </div>
          <div className="form-group">
            <label className="form-label">Slack Alert Cooldown (minutes)</label>
            <input className="form-input" type="number" min="1" value={form.alert_cooldown_minutes} onChange={e=>setForm(f=>({...f,alert_cooldown_minutes:e.target.value}))} />
            <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>Min time between repeated alerts for same endpoint+error</div>
          </div>
        </div>
        <button className="btn btn-primary" style={{alignSelf:'flex-start'}} onClick={save}>Save Settings</button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authState, setAuthState] = useState('loading'); // loading | setup | login | authed
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('alerts');
  const [endpoints, setEndpoints] = useState([]);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [logModal, setLogModal] = useState(null);
  const [lastCheck, setLastCheck] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const { toasts, show } = useToast();
  const wsRef = useRef(null);

  // Check auth state on load
  useEffect(()=>{
    (async () => {
      const status = await fetch('/api/auth/setup-status').then(r=>r.json()).catch(()=>({needsSetup:false}));
      if (status.needsSetup) return setAuthState('setup');
      const stored = getUser();
      const tok = getToken();
      if (stored && tok) {
        const me = await api('/auth/me').catch(()=>null);
        if (me && !me.error) { setUser(me); setAuthState('authed'); }
        else { clearToken(); setAuthState('login'); }
      } else {
        setAuthState('login');
      }
    })();
  },[]);

  const handleLogin = (u) => { setUser(u); setAuthState('authed'); };
  const handleSetupDone = () => { const u=getUser(); setUser(u); setAuthState('authed'); };
  const logout = () => { clearToken(); setUser(null); setAuthState('login'); };

  const loadEndpoints = useCallback(()=>{ api('/endpoints').then(setEndpoints); },[]);
  const loadAlerts = useCallback(()=>{ api('/alerts?acknowledged=0&limit=100').then(setActiveAlerts); },[]);

  useEffect(()=>{
    if (authState==='authed') { loadEndpoints(); loadAlerts(); }
  },[authState, loadEndpoints, loadAlerts]);

  // WebSocket
  useEffect(()=>{
    if (authState!=='authed') return;
    const connect = () => {
      const proto = window.location.protocol==='https:'?'wss:':'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;
      ws.onopen = ()=>setWsConnected(true);
      ws.onclose = ()=>{ setWsConnected(false); setTimeout(connect,5000); };
      ws.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type==='health_update'||msg.type==='initial_state') {
            setActiveAlerts(msg.activeAlerts||[]);
            setLastCheck(new Date());
            loadEndpoints();
            if (msg.type==='health_update'&&msg.newAlerts>0) show(`🚨 ${msg.newAlerts} new alert(s)!`,'error');
          }
        } catch(e) {}
      };
    };
    connect();
    return ()=>wsRef.current?.close();
  },[authState, loadEndpoints, show]);

  if (authState==='loading') return (
    <><style>{CSS}</style>
    <div className="auth-wrap"><div style={{color:'var(--muted)',fontFamily:'var(--mono)'}}>Loading...</div></div></>
  );
  if (authState==='setup') return <><style>{CSS}</style><SetupPage onDone={handleSetupDone}/></>;
  if (authState==='login') return <><style>{CSS}</style><LoginPage onLogin={handleLogin}/></>;

  const tabs = [
    {id:'alerts',label:'Alerts',badge:activeAlerts.length},
    {id:'endpoints',label:'Endpoints'},
    ...(can(user,'admin')?[{id:'history',label:'Restart History'}]:[]),
    ...(can(user,'admin')?[{id:'activity',label:'Activity Log'}]:[]),
    ...(can(user,'superadmin')?[{id:'users',label:'Users'}]:[]),
    ...(can(user,'superadmin')?[{id:'settings',label:'Settings'}]:[]),
  ];

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <header className="header">
          <div className="logo">RPC<span>Monitor</span></div>
          <span className="badge" style={{background:'rgba(124,106,247,.15)',color:'var(--accent2)',border:'1px solid rgba(124,106,247,.3)'}}>RADIUMBLOCK</span>
          {activeAlerts.length>0
            ? <span className="badge badge-alert">⚠ {activeAlerts.length} ALERT{activeAlerts.length!==1?'S':''}</span>
            : <span className="badge badge-ok">✓ ALL OK</span>
          }
          <div className="header-right">
            <span className="badge badge-role">{user?.role?.toUpperCase()} · {user?.username}</span>
            <span style={{fontSize:11,color:'var(--muted)'}}>
              <span className="live-dot" style={{background:wsConnected?'var(--green)':'var(--red)'}}/>
              {wsConnected?'Live':'Reconnecting'}
              {lastCheck&&` · ${timeAgo(lastCheck)}`}
            </span>
            <button className="btn btn-sm" onClick={logout}>Sign Out</button>
          </div>
        </header>

        <nav className="nav">
          {tabs.map(t=>(
            <button key={t.id} className={`nav-btn ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>
              {t.label}
              {t.badge>0&&<span className="nav-badge">{t.badge}</span>}
            </button>
          ))}
        </nav>

        <main className="main">
          {tab==='alerts'   && <AlertsTab endpoints={endpoints} user={user} onViewLogs={setLogModal}/>}
          {tab==='endpoints'&& <EndpointsTab endpoints={endpoints} user={user} onRefresh={loadEndpoints} onViewLogs={setLogModal}/>}
          {tab==='history'  && <HistoryTab/>}
          {tab==='activity' && <ActivityTab/>}
          {tab==='users'    && <UsersTab currentUser={user}/>}
          {tab==='settings' && <SettingsTab show={show}/>}
        </main>
      </div>

      {logModal && <LogViewer endpoint={logModal} user={user} onClose={()=>setLogModal(null)}/>}

      <div className="toast-wrap">
        {toasts.map(t=><div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}
      </div>
    </>
  );
}

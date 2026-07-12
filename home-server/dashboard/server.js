const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3000;

const PIHOLE_HOST = process.env.PIHOLE_HOST || '127.0.0.1';
const PIHOLE_PORT = process.env.PIHOLE_PORT || '8080';
const PIHOLE_PASSWORD = process.env.PIHOLE_PASSWORD || '';
const PIHOLE_BASE = `http://${PIHOLE_HOST}:${PIHOLE_PORT}`;

// Only these containers can be restarted/stopped/started via the API.
// The docker.sock mount is read-write for this feature to work, which
// hands the container real control over the host — keep this list exact.
const CONTROLLABLE = ['home-dashboard', 'nginx-proxy-manager', 'portainer', 'pihole'];

const HOSTS = [
  { id: 'ubuntu', name: 'Ubuntu-Home-Server', ip: '192.168.0.186' },
  { id: 'ha', name: 'Home-Assistant-OS', ip: '192.168.0.121', port: 8123, https: true },
  { id: 'imac', name: "iMac (UTM host)", ip: '192.168.0.89' },
  { id: 'npm', name: 'Nginx Proxy Manager', ip: '192.168.0.186', port: 81, https: false },
  { id: 'pihole', name: 'Pi-hole', ip: '192.168.0.186', port: 8080, https: false },
  { id: 'portainer', name: 'Portainer', ip: '192.168.0.186', port: 9000, https: false },
  { id: 'homepage', name: 'Homepage', ip: '192.168.0.186', port: 3001, https: false },
  { id: 'memos', name: 'Memos', ip: '192.168.0.186', port: 5230, https: false },
];

// ---------- system telemetry ----------

let cpuSample = { pct: 0 };
function sampleCpu() {
  const start = os.cpus();
  setTimeout(() => {
    const end = os.cpus();
    let idleDelta = 0, totalDelta = 0;
    for (let i = 0; i < start.length; i++) {
      const s = start[i].times, e = end[i].times;
      const idle = e.idle - s.idle;
      const total = (e.user - s.user) + (e.nice - s.nice) + (e.sys - s.sys) + idle + (e.irq - s.irq);
      idleDelta += idle;
      totalDelta += total;
    }
    cpuSample.pct = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 1000) / 10 : 0;
  }, 300);
}
sampleCpu();
setInterval(sampleCpu, 3000);

function getSystemStats() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return {
    cpuPct: cpuSample.pct,
    ramPct: Math.round(((totalMem - freeMem) / totalMem) * 1000) / 10,
    uptimeSec: os.uptime(),
    loadavg: os.loadavg(),
  };
}

// ---------- ping / http checks ----------

function pingHost(ip) {
  return new Promise((resolve) => {
    exec(`ping -c 1 -W 1 ${ip}`, (err, stdout) => {
      if (err) return resolve({ up: false, ms: null });
      const match = stdout.match(/time[=<]([\d.]+)\s*ms/);
      resolve({ up: true, ms: match ? parseFloat(match[1]) : null });
    });
  });
}

function checkHttp(ip, port, useHttps) {
  return new Promise((resolve) => {
    const mod = useHttps ? https : http;
    const opts = { hostname: ip, port, path: '/', method: 'GET', timeout: 3000, rejectUnauthorized: false };
    const start = Date.now();
    const req = mod.request(opts, (res) => {
      resolve({ up: true, status: res.statusCode, ms: Date.now() - start });
      res.resume();
    });
    req.on('error', () => resolve({ up: false, status: null, ms: null }));
    req.on('timeout', () => { req.destroy(); resolve({ up: false, status: null, ms: null }); });
    req.end();
  });
}

// ---------- docker ----------

function dockerRequest(method, dockerPath) {
  return new Promise((resolve, reject) => {
    const opts = { socketPath: '/var/run/docker.sock', path: dockerPath, method, timeout: 5000 };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('docker socket request timed out')); });
    req.end();
  });
}

async function getDockerStatus() {
  try {
    const { body } = await dockerRequest('GET', '/containers/json?all=true');
    const containers = JSON.parse(body);
    return containers.map((c) => {
      const name = (c.Names[0] || '').replace(/^\//, '');
      return {
        name,
        state: c.State,
        status: c.Status,
        controllable: CONTROLLABLE.includes(name),
        ports: (c.Ports || []).map((p) => p.PublicPort ? `${p.PublicPort}->${p.PrivatePort}` : `${p.PrivatePort}`).join(', '),
      };
    });
  } catch {
    return [];
  }
}

async function dockerAction(name, action) {
  if (!CONTROLLABLE.includes(name)) {
    return { ok: false, error: 'container not in allowlist' };
  }
  if (!['restart', 'stop', 'start'].includes(action)) {
    return { ok: false, error: 'unknown action' };
  }
  try {
    const { status } = await dockerRequest('POST', `/containers/${encodeURIComponent(name)}/${action}`);
    return { ok: status >= 200 && status < 300, status };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// docker log stream demuxer: each frame is an 8-byte header
// [stream(1), 0,0,0, size(4 BE)] followed by `size` bytes of payload.
function demuxDockerStream(onLine) {
  let buf = Buffer.alloc(0);
  let pending = '';
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 8) {
      const size = buf.readUInt32BE(4);
      if (buf.length < 8 + size) break;
      const payload = buf.slice(8, 8 + size).toString('utf8');
      buf = buf.slice(8 + size);
      pending += payload;
      let idx;
      while ((idx = pending.indexOf('\n')) !== -1) {
        onLine(pending.slice(0, idx));
        pending = pending.slice(idx + 1);
      }
    }
  };
}

function streamContainerLogs(name, res) {
  const opts = {
    socketPath: '/var/run/docker.sock',
    path: `/containers/${encodeURIComponent(name)}/logs?stdout=1&stderr=1&follow=1&tail=20`,
    method: 'GET',
  };
  const req = http.request(opts, (dockerRes) => {
    const feed = demuxDockerStream((line) => {
      res.write(`data: ${line.replace(/\r/g, '')}\n\n`);
    });
    dockerRes.on('data', feed);
    dockerRes.on('end', () => res.end());
  });
  req.on('error', () => res.end());
  req.end();
  return req;
}

// ---------- pi-hole v6 API ----------

let piholeSid = null;
let piholeSidExpiry = 0;

const PIHOLE_TIMEOUT_MS = 3000;

async function piholeAuth() {
  if (piholeSid && Date.now() < piholeSidExpiry) return piholeSid;
  const res = await fetch(`${PIHOLE_BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PIHOLE_PASSWORD }),
    signal: AbortSignal.timeout(PIHOLE_TIMEOUT_MS),
  });
  const data = await res.json();
  if (!data.session || !data.session.valid) throw new Error('pihole auth failed');
  piholeSid = data.session.sid;
  piholeSidExpiry = Date.now() + (data.session.validity - 60) * 1000;
  return piholeSid;
}

async function piholeGetBlocking() {
  const sid = await piholeAuth();
  const res = await fetch(`${PIHOLE_BASE}/api/dns/blocking`, {
    headers: { sid },
    signal: AbortSignal.timeout(PIHOLE_TIMEOUT_MS),
  });
  return res.json();
}

async function piholeSetBlocking(blocking, timerSeconds) {
  const sid = await piholeAuth();
  const body = { blocking };
  if (timerSeconds) body.timer = timerSeconds;
  const res = await fetch(`${PIHOLE_BASE}/api/dns/blocking`, {
    method: 'POST',
    headers: { sid, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PIHOLE_TIMEOUT_MS),
  });
  return res.json();
}

// ---------- aggregate status ----------

async function getStatus() {
  const results = {};
  await Promise.all(HOSTS.map(async (h) => {
    // Run concurrently, not sequentially — when a host is actually down,
    // waiting on the ping timeout before even starting the HTTP check
    // doubled how long a single dead host could hold up the whole response.
    const [ping, httpCheck] = await Promise.all([
      pingHost(h.ip),
      h.port ? checkHttp(h.ip, h.port, h.https) : Promise.resolve(null),
    ]);
    results[h.id] = { ...h, ping, http: httpCheck };
  }));
  results.containers = await getDockerStatus();
  results.system = getSystemStats();
  try {
    results.piholeBlocking = await piholeGetBlocking();
  } catch {
    results.piholeBlocking = { blocking: null, error: 'unreachable' };
  }
  results.timestamp = new Date().toISOString();
  return results;
}

// ---------- tiny body reader ----------

function readJsonBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => data += c);
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
  });
}

// ---------- server ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(await getStatus()));
    return;
  }

  if (url.pathname.startsWith('/api/docker/') && req.method === 'POST') {
    const parts = url.pathname.split('/'); // '', api, docker, action, name
    const action = parts[3];
    const name = decodeURIComponent(parts[4] || '');
    const result = await dockerAction(name, action);
    res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }

  if (url.pathname === '/api/logs/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(': connected\n\n');
    const dockerReq = streamContainerLogs('home-dashboard', res);
    req.on('close', () => dockerReq.destroy());
    return;
  }

  if (url.pathname === '/api/pihole/pause' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const minutes = Number(body.minutes) || 5;
    try {
      const data = await piholeSetBlocking(false, minutes * 60);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  if (url.pathname === '/api/pihole/resume' && req.method === 'POST') {
    try {
      const data = await piholeSetBlocking(true);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e) }));
    }
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    // No validators (ETag/Last-Modified) were being sent, so some browsers
    // could serve a stale cached copy of the page after a deploy instead of
    // refetching — same reasoning /api/status already applies below.
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')));
    return;
  }

  const filePath = path.join(__dirname, 'public', url.pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const types = { '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(fs.readFileSync(filePath));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => console.log(`Dashboard running on port ${PORT}`));

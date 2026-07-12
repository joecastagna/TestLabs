const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 3000;

const HOSTS = [
  { id: 'ubuntu', name: 'Ubuntu-Home-Server', ip: '192.168.0.186' },
  { id: 'ha', name: 'Home-Assistant-OS', ip: '192.168.0.121', port: 8123, https: true },
  { id: 'imac', name: "Stephanie's iMac", ip: '192.168.0.89' },
];

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
    const mod = useHttps ? require('https') : require('http');
    const opts = {
      hostname: ip, port, path: '/', method: 'GET', timeout: 3000,
      rejectUnauthorized: false,
    };
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

function getDockerStatus() {
  return new Promise((resolve) => {
    const opts = { socketPath: '/var/run/docker.sock', path: '/containers/json?all=false', method: 'GET' };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const containers = JSON.parse(data);
          resolve(containers.map(c => ({
            name: (c.Names[0] || '').replace(/^\//, ''),
            status: c.Status || c.State,
            ports: (c.Ports || []).map(p => p.PublicPort ? `${p.PublicPort}->${p.PrivatePort}` : `${p.PrivatePort}`).join(', '),
          })));
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.end();
  });
}

async function getStatus() {
  const results = {};
  await Promise.all(HOSTS.map(async (h) => {
    const ping = await pingHost(h.ip);
    const httpCheck = h.port ? await checkHttp(h.ip, h.port, h.https) : null;
    results[h.id] = { ...h, ping, http: httpCheck };
  }));
  results.containers = await getDockerStatus();
  results.timestamp = new Date().toISOString();
  return results;
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    res.end(JSON.stringify(await getStatus()));
  } else if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')));
  } else {
    const filePath = path.join(__dirname, 'public', req.url);
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath);
      const types = { '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`Dashboard running on port ${PORT}`));

const http = require('http');
const fs = require('fs');
const path = require('path');

const appRoot = path.join(__dirname, '..');
const dataDir = path.join(appRoot, 'data');
const dataFile = path.join(dataDir, 'warranty-service-data.json');
const bakFile = path.join(dataDir, 'warranty-service-data.previous.json');
const snapDir = path.join(dataDir, 'daily');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(snapDir)) fs.mkdirSync(snapDir, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.7z': 'application/x-7z-compressed'
};

function send(res, statusCode, body, contentType = 'application/json; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(body);
}

function handleRequest(req, res, port) {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(reqUrl.pathname || '/');

  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // API Ping
  if (pathname === '/api/ping') {
    return send(res, 200, JSON.stringify({ ok: true, app: 'delta-warranty', port }));
  }

  // API Data
  if (pathname === '/api/data') {
    if (req.method === 'GET') {
      let data = {};
      let saved = '';
      if (fs.existsSync(dataFile)) {
        try {
          const raw = fs.readFileSync(dataFile, 'utf8');
          data = JSON.parse(raw);
          saved = fs.statSync(dataFile).mtime.toISOString();
        } catch (e) {
          data = {};
        }
      }
      return send(res, 200, JSON.stringify({
        ok: true,
        file: dataFile,
        saved,
        data
      }));
    }

    if (req.method === 'POST') {
      let chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw || !raw.trim()) {
          return send(res, 400, JSON.stringify({ ok: false, error: 'empty body' }));
        }

        try {
          if (fs.existsSync(dataFile)) {
            try { fs.copyFileSync(dataFile, bakFile); } catch (e) {}
            const todayStr = new Date().toISOString().slice(0, 10);
            const snapFile = path.join(snapDir, `warranty-service-data-${todayStr}.json`);
            if (!fs.existsSync(snapFile)) {
              try { fs.copyFileSync(dataFile, snapFile); } catch (e) {}
            }
          }
          const tmp = dataFile + '.tmp';
          fs.writeFileSync(tmp, raw, 'utf8');
          fs.renameSync(tmp, dataFile);

          const saved = new Date().toISOString();
          console.log(`  ${saved} saved ${(raw.length / 1024).toFixed(1)} KB`);
          return send(res, 200, JSON.stringify({ ok: true, saved, file: dataFile }));
        } catch (e) {
          return send(res, 500, JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }

    return send(res, 405, JSON.stringify({ ok: false, error: 'method not allowed' }));
  }

  // Root redirect
  if (pathname === '/' || pathname === '') {
    res.writeHead(302, { Location: '/app/index.html' });
    return res.end();
  }

  // Static files
  const rel = pathname.replace(/^\/+/, '');
  const filePath = path.normalize(path.join(appRoot, rel));

  if (!filePath.startsWith(appRoot)) {
    return send(res, 403, 'Forbidden', 'text/plain');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    return send(res, 200, content, type);
  }

  return send(res, 404, 'Not Found', 'text/plain');
}

function startServer(port = 8700) {
  if (port > 8720) {
    console.error('Could not find an open port between 8700 and 8720.');
    process.exit(1);
  }

  const server = http.createServer((req, res) => handleRequest(req, res, port));

  server.once('error', err => {
    if (err.code === 'EADDRINUSE') {
      startServer(port + 1);
    } else {
      console.error(err);
      process.exit(1);
    }
  });

  server.once('listening', () => {
    const url = `http://localhost:${port}/app/index.html`;
    console.log('');
    console.log('  Delta Warranty + Service - SOLARTIVE TECHNO INDUSTRIES PVT LTD');
    console.log('  ---------------------------------------------------------------');
    console.log(`  Application : ${url}`);
    console.log(`  Data file   : ${dataFile}`);
    console.log('  ---------------------------------------------------------------');
    console.log('  Server running. Press Ctrl+C to stop.');
    console.log('');
  });

  server.listen(port);
}

startServer();

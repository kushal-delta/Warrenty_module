const fs = require('fs');
const path = require('path');
require('dotenv').config();

const appRoot = __dirname;

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

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(reqUrl.pathname || '/');

  // Root redirect
  if (pathname === '/' || pathname === '' || pathname === '/app') {
    res.writeHead(302, { Location: '/app/index.html' });
    return res.end();
  }

  // API Ping
  if (pathname === '/api/ping') {
    try {
      const pingHandler = require('./api/ping.js');
      return pingHandler(req, res);
    } catch (e) {
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, app: 'delta-warranty', error: e.message }));
    }
  }

  // API Data
  if (pathname === '/api/data') {
    try {
      const dataHandler = require('./api/data.js');
      return dataHandler(req, res).catch(e => {
        res.statusCode = 500;
        return res.end(JSON.stringify({ ok: false, error: e.message }));
      });
    } catch (e) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ ok: false, error: e.message }));
    }
  }

  // Static files
  const rel = pathname.replace(/^\/+/, '');
  const filePath = path.normalize(path.join(appRoot, rel));

  if (!filePath.startsWith(appRoot)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    const content = fs.readFileSync(filePath);
    return res.end(content);
  }

  // Fallback to app/index.html
  const appIndex = path.join(appRoot, 'app', 'index.html');
  if (fs.existsSync(appIndex)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(fs.readFileSync(appIndex));
  }

  res.statusCode = 404;
  return res.end('Not Found');
};

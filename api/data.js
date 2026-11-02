const fs = require('fs');
const path = require('path');
const os = require('os');

let inMemoryCache = null;
let inMemorySaved = null;

const TMP_FILE = path.join(os.tmpdir(), 'warranty-service-data.json');

function loadSeedData() {
  try {
    return require('../data/warranty-service-data.json');
  } catch (err) {
    try {
      const filePath = path.join(process.cwd(), 'data', 'warranty-service-data.json');
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Could not load seed data:', e);
    }
  }
  return null;
}

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    let data = inMemoryCache;
    let saved = inMemorySaved;

    if (!data && fs.existsSync(TMP_FILE)) {
      try {
        const raw = fs.readFileSync(TMP_FILE, 'utf8');
        data = JSON.parse(raw);
        saved = fs.statSync(TMP_FILE).mtime.toISOString();
      } catch (e) {
        data = null;
      }
    }

    if (!data) {
      data = loadSeedData();
      saved = saved || (data && data.built) || new Date().toISOString();
    }

    return res.status(200).json({
      ok: true,
      file: 'Vercel Cloud Data Store',
      saved: saved || new Date().toISOString(),
      data: data || null
    });
  }

  if (req.method === 'POST') {
    let body = req.body;

    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ ok: false, error: 'Invalid JSON body: ' + e.message });
      }
    }

    if (!body || typeof body !== 'object') {
      return res.status(400).json({ ok: false, error: 'Empty or invalid JSON body' });
    }

    inMemoryCache = body;
    inMemorySaved = new Date().toISOString();

    try {
      fs.writeFileSync(TMP_FILE, JSON.stringify(body), 'utf8');
    } catch (e) {
      // non-fatal in restricted serverless environments
    }

    return res.status(200).json({
      ok: true,
      saved: inMemorySaved,
      file: 'Vercel Cloud Data Store'
    });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};

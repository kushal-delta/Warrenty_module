const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

let pgData = null;
try {
  pgData = require('../server/pg_data.js');
} catch (e) {
  console.warn('PostgreSQL data layer not loaded:', e.message);
}

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

module.exports = async function handler(req, res) {
  // Polyfill status and json for vanilla node http response
  if (!res.status) {
    res.status = function (code) {
      this.statusCode = code;
      return this;
    };
  }
  if (!res.json) {
    res.json = function (obj) {
      this.setHeader('Content-Type', 'application/json; charset=utf-8');
      return this.end(JSON.stringify(obj));
    };
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET /api/data
  if (req.method === 'GET') {
    // 1. Try PostgreSQL if DATABASE_URL is configured
    if (process.env.DATABASE_URL && pgData) {
      try {
        const dbResult = await pgData.getDbData();
        return res.status(200).json({
          ok: true,
          source: 'postgresql',
          database: 'Solarative_Warrenty_ModuleDemo',
          hasData: dbResult.hasData,
          totalRows: dbResult.totalRows,
          saved: new Date().toISOString(),
          data: dbResult.data
        });
      } catch (dbErr) {
        console.error('PostgreSQL query error in /api/data:', dbErr.message);
        // Fall back to local file / cache if DB error occurs
      }
    }

    // 2. Fallback to memory / file cache
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
      source: 'fallback',
      file: 'Local Data Store',
      saved: saved || new Date().toISOString(),
      data: data || null
    });
  }

  // POST /api/data
  if (req.method === 'POST') {
    let body = req.body;

    // Read body stream if not pre-parsed
    if (!body && typeof req.on === 'function') {
      try {
        body = await new Promise((resolve, reject) => {
          const chunks = [];
          req.on('data', chunk => chunks.push(chunk));
          req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            try {
              resolve(raw ? JSON.parse(raw) : null);
            } catch (e) {
              reject(e);
            }
          });
          req.on('error', reject);
        });
      } catch (parseErr) {
        return res.status(400).json({ ok: false, error: 'Invalid JSON stream: ' + parseErr.message });
      }
    }

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
    } catch (e) {}

    // Save directly to PostgreSQL if DATABASE_URL is configured
    if (process.env.DATABASE_URL && pgData) {
      try {
        const dbRes = await pgData.saveDbData(body);
        return res.status(200).json({
          ok: true,
          source: 'postgresql',
          database: 'Solarative_Warrenty_ModuleDemo',
          saved: dbRes.saved
        });
      } catch (dbErr) {
        console.error('PostgreSQL save error in /api/data:', dbErr);
        return res.status(500).json({
          ok: false,
          error: 'PostgreSQL save failed: ' + dbErr.message
        });
      }
    }

    return res.status(200).json({
      ok: true,
      source: 'fallback',
      saved: inMemorySaved,
      file: 'Local Data Store'
    });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};

const { Pool, types } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const SCHEMA = require('../app/schema.js');

// Parse NUMERIC / DECIMAL as numbers
types.setTypeParser(1700, val => (val === null ? null : parseFloat(val)));

const dbUrl = process.env.DATABASE_URL;
let pool = null;

function getPool() {
  if (!pool) {
    if (!dbUrl) {
      throw new Error('DATABASE_URL environment variable is not defined');
    }
    const isLocalhost = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
    pool = new Pool({
      connectionString: dbUrl,
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
  }
  return pool;
}

/* Same type mapping as server/generate_postgres_sql.js */
function pgType(t) {
  if (t === 'pk') return 'SERIAL PRIMARY KEY';
  if (t === 'int') return 'INTEGER';
  if (t === 'bit') return 'SMALLINT';
  if (t === 'txt') return 'TEXT';
  if (t === 'date') return 'DATE';
  if (t === 'dt') return 'TIMESTAMP';
  if (t === 'dec') return 'NUMERIC(18,2)';
  if (t.startsWith('s')) return `VARCHAR(${t.slice(1)})`;
  if (t.startsWith('d')) {
    const parts = t.slice(1).split(',');
    return `NUMERIC(${parts[0]},${parts[1]})`;
  }
  return 'TEXT';
}

function colDefault(c) {
  if (c.def === null || c.def === undefined) return '';
  return /^-?\d+(\.\d+)?$/.test(c.def) ? ` DEFAULT ${c.def}` : ` DEFAULT '${String(c.def).replace(/'/g, "''")}'`;
}

/*
 * Creates any table / column that app/schema.js has and the database does not (e.g. a new release deployed to
 * Vercel before `npm run db:migrate` was run on its database). Only adds — never drops or alters existing columns.
 * New columns on existing tables are added nullable (NOT NULL only when they carry a default), so rows already
 * there stay valid. Runs once per server process.
 */
let schemaReady = null;
function ensureSchema(client) {
  if (!schemaReady) {
    schemaReady = (async () => {
      const res = await client.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`);
      const have = new Map();
      for (const r of res.rows) {
        if (!have.has(r.table_name)) have.set(r.table_name, new Set());
        have.get(r.table_name).add(r.column_name);
      }
      const created = [];
      for (const t of SCHEMA.tables) {
        const cols = have.get(t.name);
        if (!cols) {
          const lines = t.cols.map(c => {
            let line = `"${c.n}" ${pgType(c.t)}`;
            if (c.t !== 'pk') {
              line += colDefault(c);
              if (c.req) line += ' NOT NULL';
              if (c.uq) line += ` CONSTRAINT uq_${t.name}_${c.n} UNIQUE`;
            }
            return line;
          });
          await client.query(`CREATE TABLE IF NOT EXISTS "${t.name}" (${lines.join(', ')})`);
          created.push(t.name);
        } else {
          for (const c of t.cols) {
            if (cols.has(c.n)) continue;
            const notNull = c.req && colDefault(c) ? ' NOT NULL' : '';
            await client.query(`ALTER TABLE "${t.name}" ADD COLUMN IF NOT EXISTS "${c.n}" ${c.t === 'pk' ? 'INTEGER' : pgType(c.t)}${colDefault(c)}${notNull}`);
            created.push(`${t.name}.${c.n}`);
          }
        }
      }
      if (created.length) console.log('PostgreSQL schema: added ' + created.join(', '));
    })().catch(err => { schemaReady = null; throw err; });
  }
  return schemaReady;
}

function formatRowForClient(row, tableDef) {
  if (!row) return row;
  const out = {};
  for (const col of tableDef.cols) {
    let val = row[col.n];
    if (val === undefined) val = null;

    if (val instanceof Date) {
      if (col.t === 'date') {
        val = val.toISOString().slice(0, 10);
      } else {
        val = val.toISOString();
      }
    }
    out[col.n] = val;
  }
  return out;
}

function sanitizeValForDb(val, col) {
  if (val === undefined || val === null || val === '') {
    // If column has a default value defined, use it!
    if (col.def !== null && col.def !== undefined && col.def !== '') {
      if (col.t === 'bit' || col.t === 'int') {
        return Number(col.def);
      }
      if (col.t.startsWith('dec') || col.t.startsWith('dP')) {
        return parseFloat(col.def);
      }
      return col.def;
    }

    // If column is required (NOT NULL) but has no explicit default
    if (col.req) {
      if (col.t === 'int') return 0;
      if (col.t.startsWith('dec') || col.t.startsWith('dP')) return 0;
      if (col.t === 'bit') return 0;
      if (col.t === 'date') return new Date().toISOString().slice(0, 10);
      if (col.t === 'dt') return new Date().toISOString();
      return '';
    }

    // Otherwise nullable
    return null;
  }

  if (col.t === 'pk') {
    const n = Number(val);
    return (!isNaN(n) && n > 0) ? n : null;
  }
  if (col.t === 'int') {
    const n = parseInt(val, 10);
    return isNaN(n) ? (col.req ? (col.def != null ? Number(col.def) : 0) : null) : n;
  }
  if (col.t.startsWith('dec') || col.t.startsWith('dP')) {
    const n = parseFloat(val);
    return isNaN(n) ? (col.req ? (col.def != null ? parseFloat(col.def) : 0) : null) : n;
  }
  if (col.t === 'bit') {
    return (val === 1 || val === '1' || val === true) ? 1 : 0;
  }
  if (col.t === 'date' && val) {
    if (typeof val === 'string' && val.length >= 10) {
      return val.slice(0, 10);
    }
  }
  return val;
}

async function getDbData() {
  const p = getPool();
  const client = await p.connect();
  try {
    await ensureSchema(client);
    const data = { v: 1, t: {}, seq: {} };
    let totalRows = 0;

    for (const tableDef of SCHEMA.tables) {
      const tableName = tableDef.name;
      const pk = tableDef.pk;
      const res = await client.query(`SELECT * FROM "${tableName}" ORDER BY "${pk}" ASC`);
      const rows = res.rows.map(r => formatRowForClient(r, tableDef));
      data.t[tableName] = rows;
      totalRows += rows.length;

      let maxPk = 0;
      for (const r of rows) {
        const id = Number(r[pk]);
        if (!isNaN(id) && id > maxPk) maxPk = id;
      }
      data.seq[tableName] = maxPk;
    }

    return {
      hasData: totalRows > 0,
      totalRows,
      data
    };
  } finally {
    client.release();
  }
}

async function saveDbData(payload) {
  if (!payload || !payload.t || typeof payload.t !== 'object') {
    throw new Error('Invalid payload: expected object with table data (payload.t)');
  }

  const p = getPool();
  const client = await p.connect();
  try {
    await ensureSchema(client);
    await client.query('BEGIN');
    await client.query("SET session_replication_role = 'replica'");

    for (const tableDef of SCHEMA.tables) {
      const tableName = tableDef.name;
      const pk = tableDef.pk;
      const rows = Array.isArray(payload.t[tableName]) ? payload.t[tableName] : [];

      // Find unique column if any (e.g. serial_no, username, batch_no, etc.)
      const uniqueCol = tableDef.cols.find(c => c.uq && c.n !== pk);

      // Determine current maximum PK from both payload and DB
      let maxPk = 0;
      for (const r of rows) {
        const id = Number(r[pk]);
        if (!isNaN(id) && id > maxPk) maxPk = id;
      }
      try {
        const dbMax = await client.query(`SELECT COALESCE(MAX("${pk}"), 0) AS max_id FROM "${tableName}"`);
        const dbMaxId = Number(dbMax.rows[0].max_id);
        if (!isNaN(dbMaxId) && dbMaxId > maxPk) maxPk = dbMaxId;
      } catch (e) {}

      // Fetch existing rows if table has a unique column to reconcile primary keys
      const existingByKey = new Map();
      if (uniqueCol) {
        try {
          const exRes = await client.query(`SELECT "${pk}", "${uniqueCol.n}" FROM "${tableName}"`);
          for (const er of exRes.rows) {
            const keyVal = er[uniqueCol.n];
            if (keyVal !== null && keyVal !== undefined) {
              existingByKey.set(String(keyVal).trim().toLowerCase(), Number(er[pk]));
            }
          }
        } catch (e) {}
      }

      // Ensure every incoming row has a valid, non-null, unique primary key
      for (const r of rows) {
        let currentPk = Number(r[pk]);
        if (isNaN(currentPk) || currentPk <= 0 || r[pk] === null || r[pk] === undefined || r[pk] === '') {
          // Check if it matches an existing record by unique key
          if (uniqueCol && r[uniqueCol.n]) {
            const matchVal = String(r[uniqueCol.n]).trim().toLowerCase();
            if (existingByKey.has(matchVal)) {
              currentPk = existingByKey.get(matchVal);
            }
          }
          if (isNaN(currentPk) || currentPk <= 0) {
            maxPk++;
            currentPk = maxPk;
          }
          r[pk] = currentPk;
        }
      }

      // 1. Delete rows in DB that are no longer present in incoming payload
      if (rows.length === 0) {
        await client.query(`DELETE FROM "${tableName}"`);
      } else {
        const pks = rows.map(r => Number(r[pk])).filter(v => !isNaN(v) && v > 0);
        if (pks.length > 0) {
          const placeholders = pks.map((_, i) => `$${i + 1}`).join(',');
          await client.query(`DELETE FROM "${tableName}" WHERE "${pk}" NOT IN (${placeholders})`, pks);
        }
      }

      // 2. Upsert each row
      for (const r of rows) {
        const colsToInsert = [];
        const valsToInsert = [];

        for (const col of tableDef.cols) {
          let rawVal = r[col.n];
          if (col.n === pk) {
            rawVal = Number(r[pk]);
          }
          const sanitized = sanitizeValForDb(rawVal, col);
          colsToInsert.push(col.n);
          valsToInsert.push(sanitized);
        }

        const colList = colsToInsert.map(c => `"${c}"`).join(', ');
        const valPlaceholders = colsToInsert.map((_, i) => `$${i + 1}`).join(', ');
        const updateList = colsToInsert
          .filter(c => c !== pk)
          .map(c => `"${c}" = EXCLUDED."${c}"`)
          .join(', ');

        const sql = updateList.length > 0
          ? `INSERT INTO "${tableName}" (${colList}) VALUES (${valPlaceholders}) ON CONFLICT ("${pk}") DO UPDATE SET ${updateList}`
          : `INSERT INTO "${tableName}" (${colList}) VALUES (${valPlaceholders}) ON CONFLICT ("${pk}") DO NOTHING`;

        await client.query(sql, valsToInsert);
      }

      // 3. Update serial sequence in PostgreSQL
      try {
        await client.query(`
          SELECT setval(
            pg_get_serial_sequence('${tableName}', '${pk}'),
            COALESCE((SELECT MAX("${pk}") FROM "${tableName}"), 1),
            true
          )
        `);
      } catch (e) {
        // Ignore if table has no serial sequence
      }
    }

    await client.query("SET session_replication_role = 'origin'");
    await client.query('COMMIT');

    return {
      ok: true,
      source: 'postgresql',
      database: 'Solarative_Warrenty_ModuleDemo',
      saved: new Date().toISOString()
    };
  } catch (err) {
    await client.query("SET session_replication_role = 'origin'").catch(() => {});
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  getPool,
  getDbData,
  saveDbData
};

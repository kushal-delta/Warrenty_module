require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('Error: DATABASE_URL is not set in .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
});

async function runMigration() {
  console.log('Connecting to PostgreSQL using DATABASE_URL...');
  const client = await pool.connect();
  try {
    const resDb = await client.query('SELECT current_database(), current_user;');
    console.log(`Connected to database "${resDb.rows[0].current_database}" as user "${resDb.rows[0].current_user}".`);

    const sqlPath = path.join(__dirname, '../database/01_create_tables_postgres.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`Migration file not found at ${sqlPath}`);
    }

    console.log(`Applying schema and tables from database/01_create_tables_postgres.sql...`);
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await client.query(sql);
    console.log('Successfully executed PostgreSQL schema script!');

    // Upgrade scripts for an existing database (new columns etc.), in file-name order: 03_..._postgres.sql, 04_...
    const upgrades = fs.readdirSync(path.join(__dirname, '../database'))
      .filter(f => /^\d+_.*_postgres\.sql$/.test(f) && f !== '01_create_tables_postgres.sql')
      .sort();
    for (const f of upgrades) {
      console.log(`Applying upgrade database/${f}...`);
      await client.query(fs.readFileSync(path.join(__dirname, '../database', f), 'utf8'));
    }

    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log('');
    console.log(`Tables in public schema (${tablesRes.rows.length}):`);
    tablesRes.rows.forEach(r => console.log(`  - ${r.table_name}`));
    console.log('');
    console.log('All schemas, tables, constraints, and indexes are in place.');
    console.log('Note: No demo data was seeded (tables are ready for live data).');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();

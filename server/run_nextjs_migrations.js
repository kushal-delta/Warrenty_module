const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function run() {
  const dbUrl = 'postgresql://postgres:Delta%401010@localhost:5432/Warrenty_Module_Nextjs';
  console.log('Connecting to database:', dbUrl);

  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  console.log('Connected!');

  const sqlFile = path.join(__dirname, '..', 'database', '02_create_tables_nextjs_drizzle.sql');
  console.log('Reading migration script:', sqlFile);
  const sql = fs.readFileSync(sqlFile, 'utf8');

  console.log('Executing DDL migration script...');
  await client.query(sql);
  console.log('Migration script executed successfully!');

  // Verify created tables
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name
  `);
  console.log('\nVerified tables created in Warrenty_Module_Nextjs:');
  res.rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.table_name}`));

  await client.end();
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

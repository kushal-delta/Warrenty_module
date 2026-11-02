const { Client } = require('pg');

async function seed() {
  const dbUrl = 'postgresql://postgres:Delta%401010@localhost:5432/Warrenty_Module_Nextjs';
  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const check = await client.query("SELECT * FROM \"Users\" WHERE \"Username\" = 'admin'");
  if (check.rows.length === 0) {
    console.log('Creating initial Super Admin user...');
    const insertRes = await client.query(`
      INSERT INTO "Users" (
        "Username", "Password", "FirstName", "LastName", "Email", "Role", "IsActive", "IsAdmin"
      ) VALUES (
        'admin', 'delta@2026', 'Delta', 'Administrator', 'admin@delta.local', 'SUPER', true, true
      ) RETURNING "UserId"
    `);
    const adminId = insertRes.rows[0].UserId;
    await client.query(`
      UPDATE "Users" 
      SET "InsertedByUserId" = $1, "LastUpdatedByUserId" = $1 
      WHERE "UserId" = $1
    `, [adminId]);
    console.log('Super Admin user created with ID:', adminId);
  } else {
    console.log('Super Admin user already exists with ID:', check.rows[0].UserId);
  }

  await client.end();
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});

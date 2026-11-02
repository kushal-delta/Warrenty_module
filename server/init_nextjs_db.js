const { Client } = require('pg');

async function main() {
  const adminClient = new Client({
    connectionString: 'postgresql://postgres:Delta%401010@localhost:5432/postgres'
  });
  await adminClient.connect();
  const res = await adminClient.query(
    "SELECT datname FROM pg_database WHERE datname = 'Warrenty_Module_Nextjs'"
  );
  if (res.rows.length === 0) {
    console.log('Creating database Warrenty_Module_Nextjs...');
    await adminClient.query('CREATE DATABASE "Warrenty_Module_Nextjs"');
    console.log('Database Warrenty_Module_Nextjs created successfully!');
  } else {
    console.log('Database Warrenty_Module_Nextjs already exists.');
  }
  await adminClient.end();

  // Test connection to the new database
  const targetClient = new Client({
    connectionString: 'postgresql://postgres:Delta%401010@localhost:5432/Warrenty_Module_Nextjs'
  });
  await targetClient.connect();
  console.log('Connected to Warrenty_Module_Nextjs successfully!');
  await targetClient.end();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

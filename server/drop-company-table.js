const sql = require("mssql");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function run() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not found in .env");
    process.exit(1);
  }

  const clean = url.replace(/#.*$/, "").trim();
  const values = {};
  clean.split(";").forEach((part) => {
    const trimmed = part.trim();
    if (!trimmed) return;
    const index = trimmed.indexOf("=");
    if (index >= 0) {
      values[trimmed.slice(0, index).trim().toLowerCase()] = trimmed.slice(index + 1).trim();
    }
  });

  const serverValue = values.server || "";
  let server = serverValue;
  let instanceName = undefined;
  let port = values.port ? parseInt(values.port, 10) : undefined;

  if (server.includes(",")) {
    const [srv, prt] = server.split(",");
    server = srv.trim();
    port = parseInt(prt.trim(), 10) || port;
  } else if (server.includes("\\")) {
    const [srv, inst] = server.split("\\");
    server = srv.trim();
    instanceName = inst.trim();
  }

  const config = {
    user: values["user id"] || values.user || values.uid,
    password: values.password || values.pwd,
    database: values.database || values.db,
    server,
    ...(port ? { port } : {}),
    options: {
      encrypt: values.encrypt ? /^true$/i.test(values.encrypt) : false,
      trustServerCertificate: true,
      ...(instanceName ? { instanceName } : {}),
    },
    connectionTimeout: 15000,
  };

  console.log(`Connecting to ${config.server} -> ${config.database}...`);
  const pool = await sql.connect(config);

  const dropSql = `
    IF OBJECT_ID('dbo.Companies', 'U') IS NOT NULL
    BEGIN
      DROP TABLE dbo.Companies;
      SELECT 'Dropped dbo.Companies' AS Result;
    END
    ELSE IF OBJECT_ID('dbo.Company', 'U') IS NOT NULL
    BEGIN
      DROP TABLE dbo.Company;
      SELECT 'Dropped dbo.Company' AS Result;
    END
    ELSE
    BEGIN
      SELECT 'No Companies or Company table existed in ' + DB_NAME() AS Result;
    END
  `;

  const result = await pool.request().query(dropSql);
  console.log("Result:", result.recordset);
  await pool.close();
}

run().catch((err) => {
  console.error("Error dropping table:", err.message);
  process.exit(1);
});

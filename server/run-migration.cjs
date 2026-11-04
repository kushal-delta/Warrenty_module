/**
 * Runs a .sql migration against the warranty database (DATABASE_URL in .env).
 * Statements are executed one by one (split on lines starting with IF / ALTER / CREATE after a blank line is not
 * required — the file is sent as a single batch, so it must not contain GO).
 *
 *   node server/run-migration.cjs server/migrations/<file>.sql
 */
const fs = require("fs");
const path = require("path");
const sql = require("mssql");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function configFrom(raw) {
  const values = {};
  raw.replace(/#.*$/, "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) values[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  });
  let server = values.server || "", port = values.port ? Number(values.port) : undefined, instanceName;
  if (server.includes(",")) { const [s, p] = server.split(","); server = s.trim(); port = Number(p) || port; }
  else if (server.includes("\\")) { const [s, inst] = server.split("\\"); server = s.trim(); instanceName = inst.trim(); }
  return {
    server, port, user: values["user id"] || values.user || values.uid, password: values.password || values.pwd, database: values.database || values.db,
    options: { encrypt: /^true$/i.test(values.encrypt || ""), trustServerCertificate: true, ...(instanceName ? { instanceName } : {}) },
  };
}

(async () => {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: node server/run-migration.cjs <file.sql>");
  const statement = fs.readFileSync(path.resolve(file), "utf8");
  if (/^\s*GO\s*$/im.test(statement)) throw new Error("Remove GO separators — the file runs as one batch");
  const raw = process.env.MSSQL_DATABASE_URL || process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set in .env");
  const pool = await sql.connect(configFrom(raw));
  try {
    await pool.request().batch(statement);
    console.log(`Applied ${path.basename(file)}`);
  } finally {
    await pool.close();
  }
})().catch((err) => { console.error("Migration failed:", err.message); process.exit(1); });

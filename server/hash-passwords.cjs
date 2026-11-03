/**
 * One-time migration: replaces every plain-text Users.Password with a scrypt hash.
 * Same format as src/lib/auth/password.ts:  scrypt$N$r$p$<salt base64>$<hash base64>
 * Safe to run more than once — rows that are already hashed are skipped.
 *
 *   node server/hash-passwords.cjs
 */
const path = require("path");
const crypto = require("crypto");
const sql = require("mssql");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const N = 16384, R = 8, P = 1, KEY_LENGTH = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password.normalize("NFKC"), salt, KEY_LENGTH, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** Same connection-string parsing as src/lib/sqlserver.ts. */
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
    server, port, user: values["user id"] || values.user || values.uid, password: values.password || values.pwd,
    database: values.database || values.db,
    options: { encrypt: /^true$/i.test(values.encrypt || ""), trustServerCertificate: true, ...(instanceName ? { instanceName } : {}) },
  };
}

(async () => {
  const raw = process.env.MSSQL_DATABASE_URL || process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set in .env");
  const pool = await sql.connect(configFrom(raw));
  try {
    const rows = (await pool.request().query("SELECT [UserId], [Username], [Password] FROM dbo.[Users] WHERE [Password] NOT LIKE 'scrypt$%'")).recordset;
    for (const row of rows) {
      await pool.request()
        .input("hash", sql.NVarChar(255), hashPassword(String(row.Password).trim()))
        .input("id", sql.UniqueIdentifier, row.UserId)
        .query("UPDATE dbo.[Users] SET [Password] = @hash, [LastUpdatedOn] = SYSUTCDATETIME() WHERE [UserId] = @id");
      console.log(`hashed password for ${row.Username}`);
    }
    console.log(`${rows.length} password(s) hashed; already-hashed rows were left as they are.`);
  } finally {
    await pool.close();
  }
})().catch((err) => { console.error("Password migration failed:", err.message); process.exit(1); });

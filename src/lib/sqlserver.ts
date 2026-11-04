import sql from "mssql";

/**
 * Parses connection values from an MSSQL connection string.
 */
function parseConfigFromUrl(rawValue: string, defaultName = "DATABASE_URL"): sql.config {
  const cleanValue = rawValue.replace(/#.*$/, "").trim();

  const values: Record<string, string> = {};
  cleanValue.split(";").forEach((part) => {
    const trimmed = part.trim();
    if (!trimmed) return;
    const index = trimmed.indexOf("=");
    if (index >= 0) {
      const key = trimmed.slice(0, index).trim().toLowerCase();
      const val = trimmed.slice(index + 1).trim();
      values[key] = val;
    }
  });

  const serverValue = values.server || "";
  let server = serverValue;
  let instanceName: string | undefined = undefined;
  let port: number | undefined = values.port ? parseInt(values.port, 10) : undefined;

  if (server.includes(",")) {
    const [srv, prt] = server.split(",");
    server = srv.trim();
    port = parseInt(prt.trim(), 10) || port;
  } else if (server.includes("\\")) {
    const [srv, inst] = server.split("\\");
    server = srv.trim();
    instanceName = inst.trim();
  }

  const user = values["user id"] || values.user || values.uid;
  const password = values.password || values.pwd;
  const database = values.database || values.db;

  if (!server || !database || !user || !password) {
    throw new Error(`${defaultName} is missing required SQL Server connection values (Server, Database, User Id, Password).`);
  }

  const isEncrypt = values.encrypt ? /^true$/i.test(values.encrypt) : false;

  return {
    user,
    password,
    database,
    server,
    ...(port ? { port } : {}),
    options: {
      encrypt: isEncrypt,
      trustServerCertificate: true,
      ...(instanceName ? { instanceName } : {}),
    },
    pool: { max: 15, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 15000,
    requestTimeout: 30000,
  };
}

function warrantyConnectionConfig(): sql.config {
  const rawValue = process.env.MSSQL_DATABASE_URL || process.env.DATABASE_URL;
  if (!rawValue) throw new Error("A SQL Server DATABASE_URL is required.");
  return parseConfigFromUrl(rawValue, "DATABASE_URL");
}

function ierpConnectionConfig(): sql.config {
  const rawValue = process.env.IERP_DATABASE_URL || process.env.ERP_SQL_CONNECTION || process.env.DATABASE_URL;
  if (!rawValue) throw new Error("A SQL Server IERP_DATABASE_URL is required.");
  return parseConfigFromUrl(rawValue, "IERP_DATABASE_URL");
}

const globalForSql = globalThis as typeof globalThis & {
  warrantySqlPool?: sql.ConnectionPool;
  ierpSqlPool?: sql.ConnectionPool;
};

/* ---------- self-healing pools ----------
 * A pool whose connection drops (SQL restart, network blip, idle kill) is thrown away and rebuilt on the next call.
 * Requests that fail BEFORE reaching the server (connection closed / not open) are retried once on a fresh pool;
 * other errors are never retried, so a write can't run twice.
 */
const RETRYABLE = new Set(["ECONNCLOSED", "ENOTOPEN", "ENOCONN"]);
export function isRetryableConnectionError(err: any) {
  return RETRYABLE.has(err?.code) || /connection is closed|not connected|no connection/i.test(String(err?.message || ""));
}
export function resetSqlPool(which: "warranty" | "ierp") {
  const key = which === "warranty" ? "warrantySqlPool" : "ierpSqlPool";
  const pool = globalForSql[key];
  globalForSql[key] = undefined;
  if (pool) pool.close().catch(() => undefined);
}
function watchPool(pool: sql.ConnectionPool, which: "warranty" | "ierp") {
  pool.on("error", (err: any) => {
    console.error(`[${which === "warranty" ? "Warranty" : "iERP"} SQL Server] pool error — reconnecting on next request:`, err?.message || err);
    if ((which === "warranty" ? globalForSql.warrantySqlPool : globalForSql.ierpSqlPool) === pool) resetSqlPool(which);
  });
}
async function withReconnect<T>(which: "warranty" | "ierp", work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (!isRetryableConnectionError(err)) throw err;
    console.warn(`[${which} SQL Server] connection was closed — retrying once on a new connection`);
    resetSqlPool(which);
    return work();
  }
}

/** Starts a transaction on the connected warranty pool (always use this — never `new sql.Transaction(getSqlPool())`, which is a Promise, not a pool). */
export async function beginTransaction(): Promise<sql.Transaction> {
  return withReconnect("warranty", async () => {
    const transaction = new sql.Transaction(await getSqlPool());
    await transaction.begin();
    return transaction;
  });
}

/** Same as beginTransaction, on the iERP (SolarativeiERP) database. */
export async function beginIerpTransaction(): Promise<sql.Transaction> {
  return withReconnect("ierp", async () => {
    const transaction = new sql.Transaction(await getIerpSqlPool());
    await transaction.begin();
    return transaction;
  });
}

let activeWarrantyPromise: Promise<sql.ConnectionPool> | null = null;
let activeIerpPromise: Promise<sql.ConnectionPool> | null = null;

export async function getSqlPool(): Promise<sql.ConnectionPool> {
  if (globalForSql.warrantySqlPool?.connected) {
    return globalForSql.warrantySqlPool;
  }
  if (globalForSql.warrantySqlPool) resetSqlPool("warranty"); // a pool that lost its connection is replaced, never reused
  if (activeWarrantyPromise) {
    return activeWarrantyPromise;
  }

  const config = warrantyConnectionConfig();
  const targetDesc = `${config.server}${config.options?.instanceName ? "\\" + config.options.instanceName : ""}`;
  console.log(`[Warranty SQL Server] Connecting to ${targetDesc} (Database: ${config.database}, User: ${config.user})...`);

  const pool = new sql.ConnectionPool(config);

  activeWarrantyPromise = pool
    .connect()
    .then((connectedPool) => {
      console.log(`[Warranty SQL Server] Successfully connected to ${config.database} on ${targetDesc}!`);
      watchPool(connectedPool, "warranty");
      globalForSql.warrantySqlPool = connectedPool;
      activeWarrantyPromise = null;
      return connectedPool;
    })
    .catch((err) => {
      console.error(`[Warranty SQL Server] Connection FAILED to ${targetDesc}:`, err.message || err);
      globalForSql.warrantySqlPool = undefined;
      activeWarrantyPromise = null;
      throw err;
    });

  return activeWarrantyPromise;
}

export async function getIerpSqlPool(): Promise<sql.ConnectionPool> {
  if (globalForSql.ierpSqlPool?.connected) {
    return globalForSql.ierpSqlPool;
  }
  if (globalForSql.ierpSqlPool) resetSqlPool("ierp");
  if (activeIerpPromise) {
    return activeIerpPromise;
  }

  const config = ierpConnectionConfig();
  const targetDesc = `${config.server}${config.options?.instanceName ? "\\" + config.options.instanceName : ""}`;
  console.log(`[iERP SQL Server] Connecting to ${targetDesc} (Database: ${config.database}, User: ${config.user})...`);

  const pool = new sql.ConnectionPool(config);

  activeIerpPromise = pool
    .connect()
    .then((connectedPool) => {
      console.log(`[iERP SQL Server] Successfully connected to ${config.database} on ${targetDesc}!`);
      watchPool(connectedPool, "ierp");
      globalForSql.ierpSqlPool = connectedPool;
      activeIerpPromise = null;
      return connectedPool;
    })
    .catch((err) => {
      console.error(`[iERP SQL Server] Connection FAILED to ${targetDesc}:`, err.message || err);
      globalForSql.ierpSqlPool = undefined;
      activeIerpPromise = null;
      throw err;
    });

  return activeIerpPromise;
}

export async function query<T = Record<string, unknown>>(
  statement: string,
  parameters: unknown[] = []
): Promise<T[]> {
  try {
    const result = await withReconnect("warranty", async () => {
      const request = (await getSqlPool()).request();
      parameters.forEach((value, index) => request.input(`p${index}`, value as any));
      return request.query<T>(statement);
    });
    return result.recordset;
  } catch (err: any) {
    console.error("Warranty SQL Server Query Error:", {
      message: err.message,
      code: err.code,
      statement: statement.slice(0, 120),
    });
    throw err;
  }
}

export async function execute(statement: string, parameters: unknown[] = []): Promise<number> {
  try {
    const result = await withReconnect("warranty", async () => {
      const request = (await getSqlPool()).request();
      parameters.forEach((value, index) => request.input(`p${index}`, value as any));
      return request.query(statement);
    });
    return result.rowsAffected[0] || 0;
  } catch (err: any) {
    console.error("Warranty SQL Server Execute Error:", {
      message: err.message,
      code: err.code,
      statement: statement.slice(0, 120),
    });
    throw err;
  }
}

export async function ierpQuery<T = Record<string, unknown>>(
  statement: string,
  parameters: unknown[] = []
): Promise<T[]> {
  try {
    const result = await withReconnect("ierp", async () => {
      const request = (await getIerpSqlPool()).request();
      parameters.forEach((value, index) => request.input(`p${index}`, value as any));
      return request.query<T>(statement);
    });
    return result.recordset;
  } catch (err: any) {
    console.error("iERP SQL Server Query Error:", {
      message: err.message,
      code: err.code,
      statement: statement.slice(0, 120),
    });
    throw err;
  }
}

export { sql };

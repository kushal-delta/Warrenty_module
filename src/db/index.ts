import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Global cache for connection pool in development to prevent exhaustion during Next.js HMR
const globalForDb = globalThis as unknown as {
  conn: Pool | undefined;
};

const pool =
  globalForDb.conn ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://postgres:Delta%401010@localhost:5432/Warrenty_Module_Nextjs",
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.conn = pool;
}

export const db = drizzle(pool, { schema });
export { pool };
export default db;

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSqlPool, sql } from "@/lib/sqlserver";
import { sessionFromRequest, type AuthSessionUser } from "@/lib/auth/jwt";

/** Thrown for user-correctable problems; answered as 400 with the message shown to the user. */
export class InputError extends Error {}

export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export type Run = <T = any>(statement: string, values?: Record<string, unknown>) => Promise<T[]>;

/** Named-parameter query outside a transaction (same shape as the transaction `run`). */
export const runQuery: Run = async (statement, values = {}) => {
  const dbRequest = (await getSqlPool()).request();
  Object.entries(values).forEach(([key, value]) => dbRequest.input(key, value as any));
  return ((await dbRequest.query(statement)).recordset || []) as any[];
};

/** Runs the work inside one SQL Server transaction; rolls back on any error. */
export async function inTransaction<T>(work: (run: Run) => Promise<T>): Promise<T> {
  const transaction = new sql.Transaction(await getSqlPool());
  await transaction.begin();
  const run: Run = async (statement, values = {}) => {
    const dbRequest = new sql.Request(transaction);
    Object.entries(values).forEach(([key, value]) => dbRequest.input(key, value as any));
    return ((await dbRequest.query(statement)).recordset || []) as any[];
  };
  try {
    const result = await work(run);
    await transaction.commit();
    return result;
  } catch (err) {
    await transaction.rollback().catch(() => undefined);
    throw err;
  }
}

/** Indian financial year label, e.g. "26-27" for any date between Apr 2026 and Mar 2027. */
export function financialYear(date = new Date()) {
  const year = date.getFullYear() % 100, start = date.getMonth() >= 3 ? year : year - 1;
  return `${String(start).padStart(2, "0")}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Next document number from DocSequences, e.g. JC/26-27/0001. Must run inside a transaction. */
export async function nextDocNo(run: Run, seqKey: string, prefix: string, userId?: string) {
  const fy = financialYear();
  const updated = await run<{ LastNo: number }>(
    `UPDATE dbo.[DocSequences] WITH (UPDLOCK, HOLDLOCK) SET [LastNo] = [LastNo] + 1, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @userId OUTPUT INSERTED.[LastNo] WHERE [SeqKey] = @seqKey AND [Fy] = @fy`,
    { seqKey, fy, userId: userId || null }
  );
  let lastNo = updated[0]?.LastNo;
  if (!lastNo) {
    lastNo = 1;
    await run(
      `INSERT INTO dbo.[DocSequences] ([DocSequenceId],[SeqKey],[Prefix],[Fy],[LastNo],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) VALUES (NEWID(),@seqKey,@prefix,@fy,1,@userId,@userId,SYSUTCDATETIME(),SYSUTCDATETIME())`,
      { seqKey, prefix, fy, userId: userId || null }
    );
  }
  return `${prefix}/${fy}/${String(lastNo).padStart(4, "0")}`;
}

export async function requireUser(request: NextRequest): Promise<AuthSessionUser | null> {
  return sessionFromRequest(request);
}

export const isHeadOffice = (user: AuthSessionUser) => user.IsAdmin || user.Role === "SUPER" || user.Role === "HO";

/** Maps known SQL Server and input errors to friendly responses. */
export function handleApiError(err: any, fallback: string) {
  if (err instanceof InputError) return fail(err.message, 400);
  if (["2627", "2601"].includes(String(err?.number))) return fail("A record with the same number or code already exists.", 409);
  if (String(err?.number) === "547") return fail("This record is linked to other data. Remove those links first.", 409);
  console.error(fallback, err);
  return fail(fallback, 500);
}

export const text = (value: unknown, max?: number) => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return max ? trimmed.slice(0, max) : trimmed;
};

export function dateValue(value: unknown, label: string, required = false): Date | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new InputError(`${label} is required`);
    return null;
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new InputError(`${label} is invalid`);
  return date;
}

export function numberValue(value: unknown, label: string, { required = false, integer = false, min = 0 } = {}): number | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new InputError(`${label} is required`);
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || (integer && !Number.isInteger(number))) throw new InputError(`${label} is invalid`);
  return number;
}

export const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };

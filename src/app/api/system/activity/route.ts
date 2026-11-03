import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { fail, handleApiError, isHeadOffice, requireUser } from "@/lib/services/apiHelpers";

/** Audit trail of every create / update / delete / approval, newest first (head office only). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    if (!isHeadOffice(user)) return fail("Only head office users can view the activity log", 403);
    const { search, tableName, limit = 500 } = await request.json().catch(() => ({}));
    const where: string[] = [], params: unknown[] = [];
    if (tableName) { where.push(`[TableName] = @p${params.length}`); params.push(tableName); }
    if (search) { where.push(`([UserName] LIKE @p${params.length} OR [Action] LIKE @p${params.length} OR [RecordId] LIKE @p${params.length} OR [Details] LIKE @p${params.length})`); params.push(`%${search}%`); }
    params.push(Math.min(Number(limit) || 500, 2000));
    const logs = await query(`SELECT TOP (@p${params.length - 1}) * FROM dbo.[AuditLogs]${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY [LogOn] DESC`, params);
    return NextResponse.json({ success: true, logs });
  } catch (err) {
    return handleApiError(err, "Failed to load activity log");
  }
}

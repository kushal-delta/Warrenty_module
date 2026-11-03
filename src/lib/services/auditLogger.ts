import { query } from "@/lib/sqlserver";
import { randomUUID } from "crypto";

export interface SaveAuditLogParams {
  userId?: string | null;
  userName?: string | null;
  action: string;
  tableName: string;
  recordId?: string | null;
  details?: any;
}

/**
 * RULES §6: Logging - all audit logs funnel through saveAuditLog
 */
export async function saveAuditLog({
  userId,
  userName,
  action,
  tableName,
  recordId,
  details,
}: SaveAuditLogParams): Promise<void> {
  try {
    const detailsStr =
      typeof details === "string" ? details : details ? JSON.stringify(details) : null;

    await query(
      `INSERT INTO dbo.[AuditLogs] ([AuditLogId], [UserId], [UserName], [Action], [TableName], [RecordId], [Details], [LogOn])
       VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, SYSUTCDATETIME())`,
      [randomUUID(), userId || null, userName || null, action, tableName, recordId ? String(recordId) : null, detailsStr]
    );
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

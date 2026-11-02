import { db } from "@/db";
import { AuditLogs } from "@/db/schema";

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

    await db.insert(AuditLogs).values({
      UserId: userId || null,
      UserName: userName || null,
      Action: action,
      TableName: tableName,
      RecordId: recordId ? String(recordId) : null,
      Details: detailsStr,
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

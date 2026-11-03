import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { fail, handleApiError, requireUser } from "@/lib/services/apiHelpers";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { ComplaintReminderId } = await request.json().catch(() => ({}));
    if (!ComplaintReminderId) return fail("ComplaintReminderId is required");
    const deleted = await query(`DELETE FROM dbo.[ComplaintReminders] OUTPUT DELETED.[ComplaintReminderId] WHERE [ComplaintReminderId] = @p0`, [ComplaintReminderId]);
    if (!deleted.length) return fail("Reminder not found", 404);
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "DELETE", tableName: "ComplaintReminders", recordId: ComplaintReminderId });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete reminder");
  }
}

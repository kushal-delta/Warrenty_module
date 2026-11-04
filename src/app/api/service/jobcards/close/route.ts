import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { fail, handleApiError, requireUser, text } from "@/lib/services/apiHelpers";
import { query } from "@/lib/sqlserver";
import { ownEntriesOnly } from "@/lib/auth/scope";

/** Closes an approved job card once the repair is complete; optionally resolves its service call too. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    if (user.Role === "ENGINEER") return fail("Engineers cannot close job cards", 403);
    const { JobCardId, remarks, resolveCall } = await request.json().catch(() => ({}));
    if (!JobCardId) return fail("JobCardId is required");
    const updated = await query<any>(`UPDATE dbo.[JobCards] SET [Status] = 'Closed', [ClosedOn] = SYSUTCDATETIME(), [Remarks] = COALESCE(@p0, [Remarks]), [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @p1 OUTPUT INSERTED.[JobCardNo], INSERTED.[ComplaintId] WHERE [JobCardId] = @p2 AND [Status] = 'Approved'${ownEntriesOnly(user.Role) ? " AND [InsertedByUserId] = @p3" : ""}`, [text(remarks), user.UserId, JobCardId, user.UserId]);
    if (!updated.length) return fail("Only an approved job card can be closed", 409);
    if (resolveCall) {
      await query(`UPDATE dbo.[Complaints] SET [Status] = 'Resolved', [Resolution] = COALESCE([Resolution], @p0), [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @p1 WHERE [ComplaintId] = @p2 AND [Status] NOT IN ('Closed','Cancelled')`, [text(remarks) || `Repaired under ${updated[0].JobCardNo}`, user.UserId, updated[0].ComplaintId]);
    }
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "CLOSE", tableName: "JobCards", recordId: JobCardId, details: { JobCardNo: updated[0].JobCardNo } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to close job card");
  }
}

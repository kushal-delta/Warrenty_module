import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { fail, handleApiError, isHeadOffice, requireUser, text } from "@/lib/services/apiHelpers";

/**
 * Dealer approval: Pending sign-ups are Approved or Blocked (an approved dealer can later be Blocked, a blocked one re-approved).
 * Records who decided and when. Head office only.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    if (!isHeadOffice(user)) return fail("Only head office users can approve or block dealers", 403);
    const { DealerId, decision, remarks } = await request.json().catch(() => ({}));
    if (!DealerId) return fail("DealerId is required");
    if (!["Approved", "Blocked"].includes(decision)) return fail("Decision must be Approved or Blocked");
    const note = text(remarks, 300);
    if (decision === "Blocked" && !note) return fail("Enter the reason for blocking the dealer");
    const updated = await query<any>(
      `UPDATE dbo.[Dealers] SET [Status] = @p0, [ApprovedBy] = @p1, [ApprovedOn] = SYSUTCDATETIME(), [Remarks] = COALESCE(@p2, [Remarks]), [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @p3 OUTPUT INSERTED.* WHERE [DealerId] = @p4`,
      [decision, user.Username, note, user.UserId, DealerId]
    );
    if (!updated.length) return fail("Dealer not found", 404);
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: decision === "Approved" ? "APPROVED" : "BLOCKED", tableName: "Dealers", recordId: DealerId, details: { FirmName: updated[0].FirmName, remarks: note } });
    return NextResponse.json({ success: true, dealer: updated[0] });
  } catch (err) {
    return handleApiError(err, "Failed to update the dealer status");
  }
}

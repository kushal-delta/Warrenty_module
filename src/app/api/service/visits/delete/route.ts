import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { fail, handleApiError, requireUser } from "@/lib/services/apiHelpers";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    if (user.Role === "ENGINEER") return fail("Engineers cannot delete visit reports", 403);
    const { VisitReportId } = await request.json().catch(() => ({}));
    if (!VisitReportId) return fail("VisitReportId is required");
    const deleted = await query<any>(`DELETE FROM dbo.[VisitReports] OUTPUT DELETED.[VisitNo] WHERE [VisitReportId] = @p0`, [VisitReportId]);
    if (!deleted.length) return fail("Visit report not found", 404);
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "DELETE", tableName: "VisitReports", recordId: VisitReportId, details: { VisitNo: deleted[0].VisitNo } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete visit report");
  }
}

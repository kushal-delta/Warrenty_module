import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { OUT_OF_SCOPE, callVisible, getScope } from "@/lib/auth/scope";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await sessionFromRequest(request);
    const body = await request.json();
    const { ComplaintId, EngineerUserId, ServiceCenterId } = body;

    if (!ComplaintId || !EngineerUserId) {
      return NextResponse.json(
        { error: "ComplaintId and EngineerUserId are required" },
        { status: 400 }
      );
    }

    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const currentUserId = sessionUser.UserId;
    if (sessionUser.Role === "DEALER" || sessionUser.Role === "CUSTOMER") return NextResponse.json({ error: "Only service staff can assign engineers" }, { status: 403 });
    if (!(await callVisible(await getScope(sessionUser), ComplaintId))) return NextResponse.json({ error: OUT_OF_SCOPE }, { status: 403 });
    const updated = await query<any>(`UPDATE dbo.[Complaints] SET [EngineerUserId] = @p0, [ServiceCenterId] = COALESCE(@p1, [ServiceCenterId]), [Status] = 'Assigned', [AssignedOn] = SYSUTCDATETIME(), [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @p2 OUTPUT INSERTED.* WHERE [ComplaintId] = @p3`, [EngineerUserId, ServiceCenterId || null, currentUserId, ComplaintId]);

    if (updated.length === 0) {
      return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    }

    await saveAuditLog({
      userId: currentUserId,
      userName: sessionUser?.Username,
      action: "ASSIGN",
      tableName: "Complaints",
      recordId: ComplaintId,
      details: { EngineerUserId, Status: "Assigned" },
    });

    return NextResponse.json({ success: true, complaint: updated[0] });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to assign complaint" }, { status: 500 });
  }
}

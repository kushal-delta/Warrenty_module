import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await sessionFromRequest(request);
    const body = await request.json();
    const { DealerId } = body;

    if (!DealerId) {
      return NextResponse.json({ error: "DealerId is required in request body" }, { status: 400 });
    }

    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const currentUserId = sessionUser.UserId;
    const deleted = await query<any>(`DELETE FROM dbo.[Dealers] OUTPUT DELETED.* WHERE [DealerId] = @p0`, [DealerId]);

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Dealer not found" }, { status: 404 });
    }

    await saveAuditLog({
      userId: currentUserId,
      userName: sessionUser?.Username,
      action: "DELETE",
      tableName: "Dealers",
      recordId: DealerId,
      details: { FirmName: deleted[0].FirmName },
    });

    return NextResponse.json({
      success: true,
      message: `Dealer ${deleted[0].FirmName} deleted successfully`,
    });
  } catch (err: any) {
    if (String(err.number) === "547") {
      return NextResponse.json(
        {
          error:
            "Cannot delete this dealer because installations, warranties, or complaints are registered under it. Please remove or reassign linked records first.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to delete dealer" }, { status: 500 });
  }
}

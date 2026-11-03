import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await sessionFromRequest(request);
    const body = await request.json();
    const { StickerId } = body;

    if (!StickerId) {
      return NextResponse.json({ error: "StickerId is required in request body" }, { status: 400 });
    }

    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const currentUserId = sessionUser.UserId;
    const deleted = await query<any>(`DELETE FROM dbo.[Stickers] OUTPUT DELETED.* WHERE [StickerId] = @p0`, [StickerId]);

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Sticker record not found" }, { status: 404 });
    }

    await saveAuditLog({
      userId: currentUserId,
      userName: sessionUser?.Username,
      action: "DELETE",
      tableName: "Stickers",
      recordId: StickerId,
      details: { SerialNo: deleted[0].SerialNo },
    });

    return NextResponse.json({
      success: true,
      message: `Serial ${deleted[0].SerialNo} deleted successfully`,
    });
  } catch (err: any) {
    if (String(err.number) === "547") {
      return NextResponse.json(
        {
          error:
            "Cannot delete this serial because an active warranty or complaint is registered against it. Please void or delete the linked warranty first.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to delete sticker record" }, { status: 500 });
  }
}

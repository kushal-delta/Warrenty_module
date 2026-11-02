import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { Stickers } from "@/db/schema";
import { eq } from "drizzle-orm";
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

    const currentUserId = sessionUser?.UserId || "242b2d94-7e53-4b78-8ee0-f31c9ddb7056";

    const deleted = await db
      .delete(Stickers)
      .where(eq(Stickers.StickerId, StickerId))
      .returning();

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
    if (err.code === "23503") {
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

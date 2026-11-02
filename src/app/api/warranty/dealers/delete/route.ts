import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { Dealers } from "@/db/schema";
import { eq } from "drizzle-orm";
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

    const currentUserId = sessionUser?.UserId || "242b2d94-7e53-4b78-8ee0-f31c9ddb7056";

    const deleted = await db
      .delete(Dealers)
      .where(eq(Dealers.DealerId, DealerId))
      .returning();

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
    if (err.code === "23503") {
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

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
    const { DealerId, ...fields } = body;

    if (!DealerId) {
      return NextResponse.json({ error: "DealerId is required" }, { status: 400 });
    }

    const currentUserId = sessionUser?.UserId || "242b2d94-7e53-4b78-8ee0-f31c9ddb7056";

    const updated = await db
      .update(Dealers)
      .set({
        ...fields,
        WarrantyMonths: fields.WarrantyMonths ? Number(fields.WarrantyMonths) : null,
        LastUpdatedOn: new Date(),
        LastUpdatedByUserId: currentUserId,
      })
      .where(eq(Dealers.DealerId, DealerId))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: "Dealer not found" }, { status: 404 });
    }

    await saveAuditLog({
      userId: currentUserId,
      userName: sessionUser?.Username,
      action: "UPDATE",
      tableName: "Dealers",
      recordId: DealerId,
      details: fields,
    });

    return NextResponse.json({ success: true, dealer: updated[0] });
  } catch (err: any) {
    if (err.code === "23505") {
      return NextResponse.json({ error: "Dealer code already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update dealer" }, { status: 500 });
  }
}

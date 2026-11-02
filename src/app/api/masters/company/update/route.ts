import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { Companies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await sessionFromRequest(request);
    const body = await request.json();
    const { CompanyId, ...updateFields } = body;

    if (!CompanyId) {
      return NextResponse.json({ error: "CompanyId is required" }, { status: 400 });
    }

    const updated = await db
      .update(Companies)
      .set({
        ...updateFields,
        LastUpdatedOn: new Date(),
        LastUpdatedByUserId: sessionUser?.UserId || null,
      })
      .where(eq(Companies.CompanyId, CompanyId))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    await saveAuditLog({
      userId: sessionUser?.UserId,
      userName: sessionUser?.Username,
      action: "UPDATE",
      tableName: "Companies",
      recordId: CompanyId,
      details: updateFields,
    });

    return NextResponse.json({ success: true, company: updated[0] });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to update company profile" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { Complaints } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await sessionFromRequest(request);
    const body = await request.json();
    const { ComplaintId, Resolution, Status = "Closed" } = body;

    if (!ComplaintId || !Resolution) {
      return NextResponse.json(
        { error: "ComplaintId and resolution remarks are required to close complaint" },
        { status: 400 }
      );
    }

    const currentUserId = sessionUser?.UserId || "242b2d94-7e53-4b78-8ee0-f31c9ddb7056";

    const updated = await db
      .update(Complaints)
      .set({
        Status,
        Resolution: Resolution.trim(),
        ClosedOn: new Date(),
        LastUpdatedOn: new Date(),
        LastUpdatedByUserId: currentUserId,
      })
      .where(eq(Complaints.ComplaintId, ComplaintId))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: "Complaint not found" }, { status: 404 });
    }

    await saveAuditLog({
      userId: currentUserId,
      userName: sessionUser?.Username,
      action: "CLOSE",
      tableName: "Complaints",
      recordId: ComplaintId,
      details: { Status, Resolution },
    });

    return NextResponse.json({ success: true, complaint: updated[0] });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to close complaint" }, { status: 500 });
  }
}

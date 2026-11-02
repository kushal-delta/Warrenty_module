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
    const { ComplaintId, EngineerUserId, ServiceCenterId } = body;

    if (!ComplaintId || !EngineerUserId) {
      return NextResponse.json(
        { error: "ComplaintId and EngineerUserId are required" },
        { status: 400 }
      );
    }

    const currentUserId = sessionUser?.UserId || "242b2d94-7e53-4b78-8ee0-f31c9ddb7056";

    const updated = await db
      .update(Complaints)
      .set({
        EngineerUserId,
        ServiceCenterId: ServiceCenterId || undefined,
        Status: "Assigned",
        AssignedOn: new Date(),
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

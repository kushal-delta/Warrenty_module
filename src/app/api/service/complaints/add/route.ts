import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db, pool } from "@/db";
import { Complaints } from "@/db/schema";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await sessionFromRequest(request);
    const body = await request.json();
    const {
      callDate,
      callTypeId,
      projectId,
      priority = "Medium",
      source = "Portal",
      installationId,
      customerId,
      customerName,
      mobile,
      address,
      village,
      district,
      stateId,
      pincode,
      dealerId,
      warrantyStatus,
      complaintText,
      serviceCenterId,
      engineerUserId,
      dueDate,
    } = body;

    if (!customerName || !mobile || !complaintText || !callTypeId) {
      return NextResponse.json(
        { error: "Customer name, mobile number, call type, and complaint description are required" },
        { status: 400 }
      );
    }

    const currentUserId = sessionUser?.UserId || "242b2d94-7e53-4b78-8ee0-f31c9ddb7056";

    // Generate unique ComplaintNo
    const countRes = await pool.query(`SELECT COUNT(*) as count FROM "Complaints"`);
    const nextSeq = parseInt(countRes.rows[0].count, 10) + 1;
    const complaintNo = `CMP/26-27/${String(nextSeq).padStart(4, "0")}`;

    const isAssigned = Boolean(engineerUserId);
    const status = isAssigned ? "Assigned" : "New";

    const inserted = await db
      .insert(Complaints)
      .values({
        ComplaintNo: complaintNo,
        CallDate: callDate ? new Date(callDate) : new Date(),
        CallTypeId: callTypeId,
        ProjectId: projectId || null,
        Priority: priority,
        Source: source,
        Status: status,
        InstallationId: installationId || null,
        CustomerId: customerId || null,
        CustomerName: customerName.trim(),
        Mobile: mobile.trim(),
        Address: address?.trim() || null,
        Village: village?.trim() || null,
        District: district?.trim() || null,
        StateId: stateId || null,
        Pincode: pincode?.trim() || null,
        DealerId: dealerId || null,
        WarrantyStatus: warrantyStatus || null,
        ComplaintText: complaintText.trim(),
        ServiceCenterId: serviceCenterId || null,
        EngineerUserId: engineerUserId || null,
        AssignedOn: isAssigned ? new Date() : null,
        DueDate: dueDate ? new Date(dueDate) : null,
        CreatedBy: sessionUser?.Username || "Portal User",
        InsertedByUserId: currentUserId,
        LastUpdatedByUserId: currentUserId,
      })
      .returning();

    const newComplaint = inserted[0];

    await saveAuditLog({
      userId: currentUserId,
      userName: sessionUser?.Username,
      action: "CREATE",
      tableName: "Complaints",
      recordId: newComplaint.ComplaintId,
      details: {
        ComplaintNo: newComplaint.ComplaintNo,
        Customer: newComplaint.CustomerName,
        Status: newComplaint.Status,
      },
    });

    return NextResponse.json({ success: true, complaint: newComplaint });
  } catch (err: any) {
    console.error("Complaint add error:", err);
    return NextResponse.json({ error: "Failed to register complaint" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
import { randomUUID } from "crypto";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { OUT_OF_SCOPE, getScope, inGeoScope } from "@/lib/auth/scope";

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

    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const currentUserId = sessionUser.UserId;
    const scope = await getScope(sessionUser);
    if (scope.portal && !(scope.dealerId || scope.customerId)) return NextResponse.json({ error: "Your login is not linked to a dealer / customer record. Ask the administrator to link it in User Management." }, { status: 403 });
    // Portal logins book calls only on their own pumps.
    if (scope.portal && installationId) {
      const own = await query(`SELECT TOP 1 1 AS [ok] FROM dbo.[Installations] WHERE [InstallationId] = @p0 AND (([DealerId] = @p1) OR ([CustomerId] = @p2))`, [installationId, scope.dealerId, scope.customerId]);
      if (!own.length) return NextResponse.json({ error: OUT_OF_SCOPE }, { status: 403 });
    }
    if (!inGeoScope(scope, stateId, district)) {
      return NextResponse.json({ error: `${OUT_OF_SCOPE}. Choose a state and district you have rights to.` }, { status: 403 });
    }

    // Generate unique ComplaintNo
    const countRes = await query<any>(`SELECT COUNT(*) AS [count] FROM dbo.[Complaints]`);
    const nextSeq = Number(countRes[0].count) + 1;
    const complaintNo = `CMP/26-27/${String(nextSeq).padStart(4, "0")}`;

    const isAssigned = Boolean(engineerUserId) && !scope.portal;
    const status = isAssigned ? "Assigned" : "New";

    const newComplaint = (await query<any>(`INSERT INTO dbo.[Complaints] ([ComplaintId],[ComplaintNo],[CallDate],[CallTypeId],[ProjectId],[Priority],[Source],[Status],[InstallationId],[CustomerId],[CustomerName],[Mobile],[Address],[Village],[District],[StateId],[Pincode],[DealerId],[WarrantyStatus],[ComplaintText],[ServiceCenterId],[EngineerUserId],[AssignedOn],[DueDate],[CreatedBy],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) OUTPUT INSERTED.* VALUES (@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8,@p9,@p10,@p11,@p12,@p13,@p14,@p15,@p16,@p17,@p18,@p19,@p20,@p21,@p22,@p23,@p24,@p25,@p25,SYSUTCDATETIME(),SYSUTCDATETIME())`, [randomUUID(), complaintNo, callDate ? new Date(callDate) : new Date(), callTypeId, projectId || null, priority, source, status, installationId || null, (scope.portal === "CUSTOMER" ? scope.customerId : customerId) || null, customerName.trim(), (scope.portal === "CUSTOMER" ? scope.customerMobile || mobile : mobile).trim(), address?.trim() || null, village?.trim() || null, district?.trim() || null, stateId || null, pincode?.trim() || null, (scope.portal === "DEALER" ? scope.dealerId : dealerId) || null, warrantyStatus || null, complaintText.trim(), serviceCenterId || null, scope.portal ? null : engineerUserId || null, isAssigned && !scope.portal ? new Date() : null, dueDate ? new Date(dueDate) : null, sessionUser.Username, currentUserId]))[0];

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

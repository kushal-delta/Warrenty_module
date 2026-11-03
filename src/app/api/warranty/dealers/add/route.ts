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
      DealerCode,
      FirmName,
      ContactPerson,
      Mobile,
      Email,
      Address,
      City,
      District,
      StateId,
      Pincode,
      Gstin,
      WarrantyMonths,
      Status,
      Remarks,
    } = body;

    if (!FirmName || !Mobile) {
      return NextResponse.json({ error: "Firm name and mobile number are required" }, { status: 400 });
    }

    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const currentUserId = sessionUser.UserId;
    if (!inGeoScope(await getScope(sessionUser), StateId, District)) return NextResponse.json({ error: `${OUT_OF_SCOPE}. Choose a state and district you have rights to.` }, { status: 403 });
    const newDealer = (await query<any>(`INSERT INTO dbo.[Dealers] ([DealerId],[DealerCode],[FirmName],[ContactPerson],[Mobile],[Email],[Address],[City],[District],[StateId],[Pincode],[Gstin],[WarrantyMonths],[Status],[SignupOn],[ApprovedBy],[ApprovedOn],[Remarks],[InsertedByUserId],[LastUpdatedByUserId],[InsertedOn],[LastUpdatedOn]) OUTPUT INSERTED.* VALUES (@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8,@p9,@p10,@p11,@p12,@p13,SYSUTCDATETIME(),@p14,SYSUTCDATETIME(),@p15,@p16,@p16,SYSUTCDATETIME(),SYSUTCDATETIME())`, [randomUUID(), DealerCode?.trim() || null, FirmName.trim(), ContactPerson?.trim() || null, Mobile.trim(), Email?.trim() || null, Address?.trim() || null, City?.trim() || null, District?.trim() || null, StateId || null, Pincode?.trim() || null, Gstin?.trim() || null, WarrantyMonths ? Number(WarrantyMonths) : null, Status || "Approved", sessionUser.Username, Remarks?.trim() || null, currentUserId]))[0];

    await saveAuditLog({
      userId: currentUserId,
      userName: sessionUser?.Username,
      action: "CREATE",
      tableName: "Dealers",
      recordId: newDealer.DealerId,
      details: { FirmName: newDealer.FirmName, Mobile: newDealer.Mobile },
    });

    return NextResponse.json({ success: true, dealer: newDealer });
  } catch (err: any) {
    if (String(err.number) === "2627" || String(err.number) === "2601") {
      return NextResponse.json({ error: "Dealer code already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create dealer" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { Dealers } from "@/db/schema";
import { sessionFromRequest } from "@/lib/auth/jwt";
import { saveAuditLog } from "@/lib/services/auditLogger";

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

    const currentUserId = sessionUser?.UserId || "242b2d94-7e53-4b78-8ee0-f31c9ddb7056";

    const inserted = await db
      .insert(Dealers)
      .values({
        DealerCode: DealerCode?.trim() || null,
        FirmName: FirmName.trim(),
        ContactPerson: ContactPerson?.trim() || null,
        Mobile: Mobile.trim(),
        Email: Email?.trim() || null,
        Address: Address?.trim() || null,
        City: City?.trim() || null,
        District: District?.trim() || null,
        StateId: StateId || null,
        Pincode: Pincode?.trim() || null,
        Gstin: Gstin?.trim() || null,
        WarrantyMonths: WarrantyMonths ? Number(WarrantyMonths) : null,
        Status: Status || "Approved",
        SignupOn: new Date(),
        ApprovedBy: sessionUser?.Username || "Delta Administrator",
        ApprovedOn: new Date(),
        Remarks: Remarks?.trim() || null,
        InsertedByUserId: currentUserId,
        LastUpdatedByUserId: currentUserId,
      })
      .returning();

    const newDealer = inserted[0];

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
    if (err.code === "23505") {
      return NextResponse.json({ error: "Dealer code already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create dealer" }, { status: 500 });
  }
}

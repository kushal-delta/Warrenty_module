import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { Dealers, States } from "@/db/schema";
import { asc, desc, eq, and, ilike } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { status, stateId, search } = body;

    const rows = await db
      .select({
        DealerId: Dealers.DealerId,
        DealerCode: Dealers.DealerCode,
        FirmName: Dealers.FirmName,
        ContactPerson: Dealers.ContactPerson,
        Mobile: Dealers.Mobile,
        Email: Dealers.Email,
        Address: Dealers.Address,
        City: Dealers.City,
        District: Dealers.District,
        StateId: Dealers.StateId,
        StateName: States.StateName,
        Pincode: Dealers.Pincode,
        Gstin: Dealers.Gstin,
        WarrantyMonths: Dealers.WarrantyMonths,
        Status: Dealers.Status,
        SignupOn: Dealers.SignupOn,
        ApprovedBy: Dealers.ApprovedBy,
        ApprovedOn: Dealers.ApprovedOn,
        Remarks: Dealers.Remarks,
        InsertedOn: Dealers.InsertedOn,
        LastUpdatedOn: Dealers.LastUpdatedOn,
      })
      .from(Dealers)
      .leftJoin(States, eq(Dealers.StateId, States.StateId))
      .orderBy(asc(Dealers.FirmName));

    let filtered = rows;
    if (status) {
      filtered = filtered.filter((d) => d.Status === status);
    }
    if (stateId) {
      filtered = filtered.filter((d) => d.StateId === stateId);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.FirmName.toLowerCase().includes(q) ||
          d.Mobile.includes(q) ||
          (d.DealerCode && d.DealerCode.toLowerCase().includes(q)) ||
          (d.City && d.City.toLowerCase().includes(q))
      );
    }

    return NextResponse.json({ success: true, dealers: filtered });
  } catch (err: any) {
    console.error("Dealers get error:", err);
    return NextResponse.json({ error: "Failed to fetch dealers" }, { status: 500 });
  }
}

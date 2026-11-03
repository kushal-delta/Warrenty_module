import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { query } from "@/lib/sqlserver";
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

    if (!sessionUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const currentUserId = sessionUser.UserId, allowed = ["DealerCode","FirmName","ContactPerson","Mobile","Email","Address","City","District","StateId","Pincode","Gstin","WarrantyMonths","Status","Remarks"];
    const edits = Object.entries(fields).filter(([key]) => allowed.includes(key)).map(([key, value]) => [key, key === "WarrantyMonths" ? (value ? Number(value) : null) : value] as const);
    const updated = await query<any>(`UPDATE dbo.[Dealers] SET ${edits.map(([key], index) => `[${key}] = @p${index}`).join(", ")}, [LastUpdatedOn] = SYSUTCDATETIME(), [LastUpdatedByUserId] = @p${edits.length} OUTPUT INSERTED.* WHERE [DealerId] = @p${edits.length + 1}`, [...edits.map(([, value]) => value), currentUserId, DealerId]);

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
    if (String(err.number) === "2627" || String(err.number) === "2601") {
      return NextResponse.json({ error: "Dealer code already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update dealer" }, { status: 500 });
  }
}

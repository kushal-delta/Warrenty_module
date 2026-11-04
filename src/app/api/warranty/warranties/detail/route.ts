import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";
import { visibleWarranty } from "@/lib/services/warrantyAccess";

/** One warranty with its customer and site — for the edit form of the Active Warranty List. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { WarrantyId } = await request.json().catch(() => ({}));
    if (!WarrantyId) return fail("WarrantyId is required");
    const warranty = await visibleWarranty(runQuery, user, WarrantyId);
    if (!warranty) return fail(OUT_OF_SCOPE, 404);
    const calls = (await runQuery<any>(`SELECT COUNT(*) AS [n] FROM dbo.[ComplaintItemLns] WHERE [SerialNo] = @serial`, { serial: warranty.SerialNo }))[0]?.n || 0;
    return NextResponse.json({ success: true, warranty: { ...warranty, ServiceCallLines: Number(calls) } });
  } catch (err) {
    return handleApiError(err, "Failed to load warranty");
  }
}

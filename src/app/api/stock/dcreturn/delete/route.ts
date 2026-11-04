import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, isHeadOffice, requireUser } from "@/lib/services/apiHelpers";
import { challanScope } from "@/lib/services/challans";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";

/** Deletes a defective / fresh receipt (all its lines); the quantities become pending on the challan again. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { ChallanReturnId } = await request.json().catch(() => ({}));
    if (!ChallanReturnId) return fail("ChallanReturnId is required");
    const values: Record<string, unknown> = {};
    const scope = challanScope(user, "d", values);
    const removed = await inTransaction(async (run) => {
      const r = (await run<any>(`SELECT r.[ReturnNo], r.[InsertedByUserId], d.[ChallanNo] FROM dbo.[ChallanReturns] r WITH (UPDLOCK) JOIN dbo.[DeliveryChallans] d ON d.[DeliveryChallanId] = r.[DeliveryChallanId]
        WHERE r.[ChallanReturnId] = @id${scope ? ` AND ${scope}` : ""}`, { ...values, id: ChallanReturnId }))[0];
      if (!r) throw new InputError(OUT_OF_SCOPE);
      if (!isHeadOffice(user) && String(r.InsertedByUserId || "").toLowerCase() !== user.UserId.toLowerCase()) throw new InputError("Only head office or the user who entered it can delete this receipt");
      await run(`DELETE FROM dbo.[ChallanReturnItemLns] WHERE [ChallanReturnId] = @id`, { id: ChallanReturnId });
      await run(`DELETE FROM dbo.[ChallanReturns] WHERE [ChallanReturnId] = @id`, { id: ChallanReturnId });
      return r;
    });
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "DELETE", tableName: "ChallanReturns", recordId: ChallanReturnId, details: { ReturnNo: removed.ReturnNo, ChallanNo: removed.ChallanNo } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete the receipt");
  }
}

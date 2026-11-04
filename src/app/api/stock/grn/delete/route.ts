import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, isHeadOffice, requireUser } from "@/lib/services/apiHelpers";
import { challanScope } from "@/lib/services/challans";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";

/** Deletes a goods receipt (its quantities become pending on the challan again). Head office or the user who entered it. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { ChallanReceiptId } = await request.json().catch(() => ({}));
    if (!ChallanReceiptId) return fail("ChallanReceiptId is required");
    const values: Record<string, unknown> = {};
    const scope = challanScope(user, "d", values);
    const removed = await inTransaction(async (run) => {
      const r = (await run<any>(`SELECT r.[ReceiptNo], r.[InsertedByUserId], d.[ChallanNo] FROM dbo.[ChallanReceipts] r WITH (UPDLOCK) JOIN dbo.[DeliveryChallans] d ON d.[DeliveryChallanId] = r.[DeliveryChallanId]
        WHERE r.[ChallanReceiptId] = @id${scope ? ` AND ${scope}` : ""}`, { ...values, id: ChallanReceiptId }))[0];
      if (!r) throw new InputError(OUT_OF_SCOPE);
      if (!isHeadOffice(user) && String(r.InsertedByUserId || "").toLowerCase() !== user.UserId.toLowerCase()) throw new InputError("Only head office or the user who entered it can delete this goods receipt");
      await run(`DELETE FROM dbo.[ChallanReceiptItemLns] WHERE [ChallanReceiptId] = @id`, { id: ChallanReceiptId });
      await run(`DELETE FROM dbo.[ChallanReceipts] WHERE [ChallanReceiptId] = @id`, { id: ChallanReceiptId });
      return r;
    });
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "DELETE", tableName: "ChallanReceipts", recordId: ChallanReceiptId, details: { ReceiptNo: removed.ReceiptNo, ChallanNo: removed.ChallanNo } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete goods receipt");
  }
}

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { saveAuditLog } from "@/lib/services/auditLogger";
import { InputError, fail, handleApiError, inTransaction, requireUser } from "@/lib/services/apiHelpers";
import { challanHasReceipts, challanScope, loadChallan } from "@/lib/services/challans";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";

/** Deletes a dispatched delivery challan with its items (frees its material request for a new challan). */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { DeliveryChallanId } = await request.json().catch(() => ({}));
    if (!DeliveryChallanId) return fail("DeliveryChallanId is required");
    const values: Record<string, unknown> = {};
    const scope = challanScope(user, "d", values);
    const removed = await inTransaction(async (run) => {
      const current = await loadChallan(run, DeliveryChallanId, true);
      if (!current) throw new InputError("Delivery challan not found");
      if (scope && !(await run(`SELECT TOP 1 1 AS [ok] FROM dbo.[DeliveryChallans] d WHERE d.[DeliveryChallanId] = @id AND ${scope}`, { ...values, id: DeliveryChallanId })).length) throw new InputError(OUT_OF_SCOPE);
      if (current.Status !== "Dispatched") throw new InputError(`A challan that is ${String(current.Status).toLowerCase()} cannot be deleted`);
      if (await challanHasReceipts(run, DeliveryChallanId)) throw new InputError("Goods have already been received against this challan — delete the goods receipt first");
      await run(`DELETE FROM dbo.[DeliveryChallanItemLns] WHERE [DeliveryChallanId] = @id`, { id: DeliveryChallanId });
      await run(`DELETE FROM dbo.[DeliveryChallans] WHERE [DeliveryChallanId] = @id`, { id: DeliveryChallanId });
      return current;
    });
    await saveAuditLog({ userId: user.UserId, userName: user.Username, action: "DELETE", tableName: "DeliveryChallans", recordId: DeliveryChallanId, details: { ChallanNo: removed.ChallanNo } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err, "Failed to delete delivery challan");
  }
}

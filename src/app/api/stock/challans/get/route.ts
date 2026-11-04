import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { JOB_WORKER_COLS, JOB_WORKER_JOINS, challanScope, loadChallan } from "@/lib/services/challans";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";

/** Lists delivery challans in the user's scope, or one challan with its items when `DeliveryChallanId` is sent. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { DeliveryChallanId } = await request.json().catch(() => ({}));
    const values: Record<string, unknown> = {};
    const scope = challanScope(user, "d", values);

    if (DeliveryChallanId) {
      const head = await loadChallan(runQuery, DeliveryChallanId);
      if (!head) return fail("Delivery challan not found", 404);
      if (scope && !(await runQuery(`SELECT TOP 1 1 AS [ok] FROM dbo.[DeliveryChallans] d WHERE d.[DeliveryChallanId] = @id AND ${scope}`, { ...values, id: DeliveryChallanId })).length) return fail(OUT_OF_SCOPE, 403);
      const items = await runQuery(`SELECT * FROM dbo.[DeliveryChallanItemLns] WHERE [DeliveryChallanId] = @id ORDER BY [LineNo]`, { id: DeliveryChallanId });
      return NextResponse.json({ success: true, challan: head, items });
    }

    const challans = await runQuery(`SELECT d.*, sc.[ServiceCenterName], sc.[ServiceCenterCode], ${JOB_WORKER_COLS}, mr.[RequestNo],
        (SELECT COUNT(*) FROM dbo.[ChallanReceipts] cr WHERE cr.[DeliveryChallanId] = d.[DeliveryChallanId]) + (SELECT COUNT(*) FROM dbo.[ChallanReturns] cn WHERE cn.[DeliveryChallanId] = d.[DeliveryChallanId]) AS [ReceiptCount],
        (SELECT COUNT(*) FROM dbo.[DeliveryChallanItemLns] l WHERE l.[DeliveryChallanId] = d.[DeliveryChallanId]) AS [ItemCount],
        (SELECT COALESCE(SUM(l.[Qty]), 0) FROM dbo.[DeliveryChallanItemLns] l WHERE l.[DeliveryChallanId] = d.[DeliveryChallanId]) AS [TotalQty]
      FROM dbo.[DeliveryChallans] d ${JOB_WORKER_JOINS} LEFT JOIN dbo.[MaterialRequests] mr ON d.[MaterialRequestId] = mr.[MaterialRequestId]
      ${scope ? `WHERE ${scope}` : ""} ORDER BY d.[ChallanDate] DESC, d.[InsertedOn] DESC`, values);
    return NextResponse.json({ success: true, challans });
  } catch (err) {
    return handleApiError(err, "Could not load delivery challans");
  }
}

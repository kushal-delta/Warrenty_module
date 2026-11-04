import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { JOB_WORKER_COLS, JOB_WORKER_JOINS, challanScope, loadChallan } from "@/lib/services/challans";
import { PENDING_QTY, challanLines } from "@/lib/services/challanReceipts";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";

/**
 * Goods receipt step 1 / 2:
 *  - no body: delivery challans (in the user's scope) that still have quantity to receive
 *  - `DeliveryChallanId`: that challan with its lines — dispatched, already received and pending
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) return fail("Unauthorized", 401);
    const { DeliveryChallanId } = await request.json().catch(() => ({}));
    const values: Record<string, unknown> = {};
    const scope = challanScope(user, "d", values);

    if (DeliveryChallanId) {
      const challan = await loadChallan(runQuery, DeliveryChallanId);
      if (!challan) return fail("Delivery challan not found", 404);
      if (scope && !(await runQuery(`SELECT TOP 1 1 AS [ok] FROM dbo.[DeliveryChallans] d WHERE d.[DeliveryChallanId] = @id AND ${scope}`, { ...values, id: DeliveryChallanId })).length) return fail(OUT_OF_SCOPE, 403);
      return NextResponse.json({ success: true, challan, lines: await challanLines(runQuery, DeliveryChallanId) });
    }

    const challans = await runQuery(`SELECT * FROM (
        SELECT d.[DeliveryChallanId], d.[ChallanNo], d.[ChallanDate], d.[ChallanType], d.[Purpose], d.[DispatchLocName], ${JOB_WORKER_COLS}, ${PENDING_QTY} AS [PendingQty]
        FROM dbo.[DeliveryChallans] d ${JOB_WORKER_JOINS}
        WHERE d.[Status] <> 'Cancelled'${scope ? ` AND ${scope}` : ""}
      ) x WHERE x.[PendingQty] > 0 ORDER BY x.[ChallanDate], x.[ChallanNo]`, values);
    return NextResponse.json({ success: true, challans });
  } catch (err) {
    return handleApiError(err, "Could not load delivery challans to receive");
  }
}

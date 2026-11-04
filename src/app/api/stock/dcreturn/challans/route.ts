import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fail, handleApiError, requireUser, runQuery } from "@/lib/services/apiHelpers";
import { JOB_WORKER_COLS, JOB_WORKER_JOINS, challanScope, loadChallan } from "@/lib/services/challans";
import { RETURN_PENDING_QTY, returnLines } from "@/lib/services/challanReturns";
import { OUT_OF_SCOPE } from "@/lib/auth/scope";

/**
 * Defective / fresh receipt step 1 / 2:
 *  - no body: returnable delivery challans (in the user's scope) with quantity still to come back
 *  - `DeliveryChallanId`: that challan with its lines — issued, fresh, defective and pending
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
      if (challan.ChallanType !== "Returnable") return fail("Only a returnable delivery challan can be received back");
      if (scope && !(await runQuery(`SELECT TOP 1 1 AS [ok] FROM dbo.[DeliveryChallans] d WHERE d.[DeliveryChallanId] = @id AND ${scope}`, { ...values, id: DeliveryChallanId })).length) return fail(OUT_OF_SCOPE, 403);
      return NextResponse.json({ success: true, challan, lines: await returnLines(runQuery, DeliveryChallanId) });
    }

    const challans = await runQuery(`SELECT * FROM (
        SELECT d.[DeliveryChallanId], d.[ChallanNo], d.[ChallanDate], d.[ExpectedBackBy], d.[Purpose], ${JOB_WORKER_COLS}, ${RETURN_PENDING_QTY} AS [PendingQty]
        FROM dbo.[DeliveryChallans] d ${JOB_WORKER_JOINS}
        WHERE d.[ChallanType] = 'Returnable' AND d.[Status] <> 'Cancelled'${scope ? ` AND ${scope}` : ""}
      ) x WHERE x.[PendingQty] > 0 ORDER BY x.[ChallanDate], x.[ChallanNo]`, values);
    return NextResponse.json({ success: true, challans });
  } catch (err) {
    return handleApiError(err, "Could not load returnable challans");
  }
}
